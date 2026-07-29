# Project Folder Sync

> Status: **done** · Last updated: 2026-07-29

## What / Why

There is **one gripe folder** — the inbox. Point the extension at it once and every gripe lands there
as real files, so the path you paste to your coding agent already exists on its filesystem. Chrome
remembers the folder across restarts, which is the whole reason this beats a zip download.

One folder, deliberately: 0.5 shipped a per-project list and it was reverted the same day for being
more bookkeeping than the switching it saved. 0.7 stopped framing it as "the repo you're in" — it is a
**global inbox**, and every prompt carries its absolute path so an agent running in any repo can read
from it (decisions.md, 2026-07-26 and 2026-07-28).

## Behavior spec

- When the user clicks **Choose folder**, `showDirectoryPicker({ mode: 'readwrite' })` opens and the
  chosen handle is stored in IndexedDB under `kv.projectDir`. The panel then asks for its absolute
  path, once — the moment they know it by heart.
- When the picker is cancelled, nothing changes and no error is shown.
- When the panel opens, the stored handle is reloaded and its permission state is queried; the dot on
  the inbox line shows grey (nothing connected), accent (connected, permission not granted), green
  (writing).
- When permission is `prompt` after a browser restart, a single accent-soft **reconnect** button
  appears beside the line and nothing else; clicking it (a user gesture, which the API requires)
  re-requests and turns the dot green. The strip's bar carries the same button.
- When the browser refuses the directory picker inside the side panel — some Chrome builds do — the
  panel catches it, shows "picker blocked here" and swaps the button for **Open in tab →**, which loads
  `sidepanel.html` as a normal tab. That tab shares the same IndexedDB, so picking there connects the
  extension everywhere.
- When the File System Access API is missing entirely, the line reads "folder writing unavailable —
  use .zip".
- When nothing is connected, the line is replaced by the setup card — `gripes need somewhere to land`,
  the **Choose folder** button, and one faint sub-line, `pick or create one folder — every project's
  gripes go there`. Recording still works; everything is held in IndexedDB until a folder exists or the
  user exports a `.zip` (that button exists **only** in this state).
- When any `done` take in the active gripe has `meta.written === false` and the folder is connected and
  granted, the panel writes that take's `rec-NN/` tree and rewrites the gripe's `report.md` and
  `MANIFEST.txt`. Pending takes are flushed **serially** — they all rewrite the same two files — behind
  a re-entrancy ref, so a burst produces one pass, not several.
- The writer re-reads the gripe's other takes from IndexedDB rather than trusting the list it was
  rendered with, because it runs from paths that outlive a render (a late Whisper pass, `done`).
- **Marking written is rev-guarded.** `recording:written` carries the `meta.rev` the flush started
  from; if anything mutated meanwhile the mark is refused and the effect runs again, so the disk is
  never called current when it isn't.
- Any timeline edit — move, delete, a line rewritten, a transcript replaced, `reviewed` — bumps `rev`
  and flips `written: false`, so the folder catches up automatically.
- When a write throws, the panel flashes `write failed: …` and re-checks permission (a revoked handle
  is the usual cause); the take stays unwritten and retries on the next state change.
- The header shows `m:ss recorded · on disk`, or `N/M on disk` while some takes are still pending.
- When the user clicks **forget this folder** — inside the detail row that a click on the inbox line
  opens — the handle and the path are forgotten. Files on disk are untouched.
- **Nothing outside `gripes/` is ever read or written**, with one exception: `writeSummaries` deletes a
  leftover `notes.json` from any gripe folder it rewrites, because the screenshot feature is dead and a
  stale one goes on describing it to the reading agent.

### The absolute path

- Asked once, the moment the folder is chosen. Clicking the inbox line reopens the input (plus the
  why-line and `forget this folder`); an accent `path?` chip marks that it is still missing.
- Setting or changing it fires `session:rewrite`, which marks every take in the active gripe unwritten
  so the report's first line catches up.
- Empty is a supported state: the report falls back to `<folder name>/gripes/<slug>` and tells the
  agent to search for that directory name if it doesn't resolve.

### The `gripes/gripes` rule

Point the inbox at a folder already called `gripes` and the `gripes/` level is skipped:
`G:\code\gripes` writes `G:\code\gripes\<slug>`. The rule lives in `needsReportDir()` and **every**
path builder and writer applies it — `sessionDir`, `reportsDir`, `deleteSessionFolder`, and
`sessionFolder` (which compares the *last segment* of the typed path, since that's all it has). Change
one and the printed path lies.

## Touchpoints

| Part | File |
| --- | --- |
| Picker, handle persistence, permissions, `writeRecording` | `src/lib/fs.ts` |
| Inbox line, path input, flush helpers, `.zip` | `src/sidepanel/App.tsx` |
| `recording:written` (rev-guarded) and `session:rewrite` | `src/background/index.ts` |
| Report / manifest / json generation | `src/lib/markdown.ts` |
| Contact sheets written beside the frames | `src/sidepanel/grids.ts` |

## Data

`kv.projectDir` holds a live `FileSystemDirectoryHandle` — IndexedDB structured-clones it, which is
what makes the folder survive a browser restart, and it is also why only the panel can hold one (a
handle cannot travel in a `chrome.runtime` message). `kv.projectPath` holds the absolute path the user
typed. `REPORT_DIR = 'gripes'` and the picker id `'bug-recorder-project'` are in `src/lib/fs.ts`; the
picker id is **frozen** — changing it makes Chrome forget every user's folder.

Written layout:

```
<inbox>/gripes/<YYYY-MM-DD-HHMM-slug>/
  report.md        the whole gripe on one timeline — the file to hand over
  MANIFEST.txt     stats + every take's transcript inline
  rec-01/          frames/  grids/  transcript.txt  recording.json  walkthrough.webm
  rec-02/          …
```

**0.5 reclaim.** 0.5 moved handles to `kv.projectHandles` + `kv.projects` + `kv.activeProjectId`.
`loadProjectDir()` falls back to those keys, adopts whichever project was active as *the* folder (with
its path), and deletes all three — so a profile that ran 0.5 for an afternoon doesn't have to re-pick.

## Edge cases

- **Permission revoked mid-gripe** → the first write throws, the dot goes accent, `reconnect` fixes it
  and the backlog flushes.
- **Folder deleted or renamed on disk** → `getDirectoryHandle` throws; the flash reports it and the
  takes stay pending.
- **Connecting a folder after recording** → every take is `written: false`, so the first flush writes
  the whole gripe at once.
- **The same gripe written twice** — images are overwritten with identical bytes; the markdown is
  regenerated from scratch every time.
- **Two surfaces open** (side panel + the strip, or the tab fallback) → both can flush; writes are
  idempotent, so the worst case is duplicated work.
- **Whisper finishing after the gripe is closed** → the flush effect only watches the active gripe, so
  `runWhisper` writes that take by id itself.
- **A flush racing an edit** → the rev guard refuses to mark written, and the next state change
  rewrites. This is why `rev` exists.
- **`.gitignore`** — `gripes/` is the user's call to commit or ignore; the extension never touches it.

## Open questions

- [ ] No conflict handling if the user edits `report.md` by hand — the next flush overwrites it.
- [ ] `deleteSessionFolder()` exists but is never called; deleting a gripe leaves its folder behind.
- [ ] No indicator of *which* take failed to write beyond the transient flash.
- [ ] Old `rec-NN/` folders for takes deleted from a gripe are never cleaned up on disk.

## How to verify

See `verify.md` flow **5** [medium]. The restart step is the one that matters — a handle that doesn't
survive a browser restart defeats the whole feature. After that, the rev guard is worth one check:
delete a stretch on the timeline and confirm `report.md` loses it within a second, without touching
anything else.
