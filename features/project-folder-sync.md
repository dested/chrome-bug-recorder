# Project Folder Sync

> Status: **done** · Last updated: 2026-07-26

## What / Why

There is **one gripe folder**. Point the extension at it once and every note lands there as real
files — no downloads, no moving things around, so the path you paste to your coding agent already
exists on its filesystem. Chrome remembers the folder across restarts, which is the whole reason
this beats a zip download.

One folder, deliberately: 0.5 shipped a per-project list and it was reverted the same day for being
more bookkeeping than the switching it saved (decisions.md, 2026-07-26). The folder can be a repo or
one central directory for everything — the report prints its absolute path either way.

## Behavior spec

- When the user clicks **Choose folder**, `showDirectoryPicker({ mode: 'readwrite' })` opens and the
  chosen handle is stored in IndexedDB under `kv.projectDir`. The panel then asks for its absolute
  path, once.
- When the picker is cancelled, nothing changes and no error is shown.
- When the panel opens, the stored handle is reloaded and its permission state is queried; the dot on
  the folder line shows grey (nothing connected), accent (connected, permission not granted), green
  (writing).
- When permission is `prompt` after a browser restart, **Reconnect** appears; clicking it (a user
  gesture, which the API requires) re-requests and turns the dot green.
- When the browser refuses the directory picker inside the side panel — some Chrome builds do — the
  panel catches it, shows "picker blocked here" and swaps the button for **Open in tab →**, which
  loads `sidepanel.html` as a normal tab. That tab shares the same IndexedDB, so picking there
  connects the extension everywhere.
- When the File System Access API is missing entirely, the line reads "folder writing unavailable —
  use .zip".
- When nothing is connected the line reads "no folder yet — nothing lands on disk". Capturing still
  works; everything is held in IndexedDB until a folder exists or the user exports a .zip.
- When any note in the active session has `written: false` and the folder is connected and granted,
  the panel writes the **entire** session folder: `gripes/<slug>/report.md`, `notes.json`, and the
  PNGs for the unwritten notes. Then those notes are marked written.
- Writes are guarded by a re-entrancy flag, so a burst of notes produces one flush, not several.
- When a write throws, the panel flashes `write failed: …` and re-checks permission (a revoked handle
  is the usual cause); the notes stay `written: false` and retry on the next state change.
- When a note's text is edited in the panel, it is marked unwritten so the report is regenerated.
- Notes recorded while the panel is closed are written the next time it opens.
- The header shows `N notes · M on disk` whenever a folder is connected.
- When the user clicks `✕` on the folder line, the handle and the path are forgotten. Files on disk
  are untouched.
- **Nothing outside `gripes/` is ever read or written.**

### The absolute path

- Asked once, the moment the folder is chosen — `path?` on the folder line reopens the input.
- Setting or changing it marks the active session unwritten so the report's first line catches up.
- Empty is a supported state: the report falls back to `<folder name>/gripes/<slug>`.

## Touchpoints

| Part | File |
| --- | --- |
| Picker, handle persistence, permissions, `writeSession` | `src/lib/fs.ts` |
| Folder line, path input, flush helpers | `src/sidepanel/App.tsx` |
| `note:written` handler | `src/background/index.ts` |
| Report/JSON generation | `src/lib/markdown.ts` |

## Data

`kv.projectDir` holds a live `FileSystemDirectoryHandle` — IndexedDB structured-clones it, which is
what makes the folder survive a browser restart. `kv.projectPath` holds the absolute path the user
typed. `REPORT_DIR = 'gripes'` and the picker id `'bug-recorder-project'` are in `src/lib/fs.ts`; the
picker id is frozen (changing it makes Chrome forget every user's folder).

Written layout:

```
<connected folder>/gripes/<YYYY-MM-DD-HHMM-slug>/
  report.md      notes.json      01-full.png      01-target.png      02-full.png …
```

**0.5 reclaim.** 0.5 moved handles to `kv.projectHandles` + `kv.projects` + `kv.activeProjectId`.
`loadProjectDir()` falls back to those keys, adopts whichever project was active as *the* folder
(with its path), and deletes all three — so a profile that ran 0.5 for an afternoon doesn't have to
re-pick anything.

## Edge cases

- **Permission revoked mid-session** → the first write throws, the dot goes accent, Reconnect fixes it
  and the backlog flushes.
- **Folder deleted or renamed on disk** → `getDirectoryHandle` throws; the flash reports it and the
  notes stay pending.
- **Connecting a folder after recording** → all existing notes are `written: false`, so the first
  flush writes the whole session at once.
- **The same session written twice** — images are simply overwritten with identical bytes; the
  markdown is regenerated from scratch every time.
- **Two panels open** (side panel + the tab fallback) → both can flush; writes are idempotent, so the
  worst case is duplicated work.
- **Whisper finishing after the gripe is closed** → the flush effects only watch the active session,
  so `runWhisper` writes that session by id itself.
- **`.gitignore`** — `gripes/` is the user's call to commit or ignore; the extension never touches it.

## Open questions

- [ ] No conflict handling if the user edits `report.md` by hand — the next note overwrites it.
- [ ] `deleteSessionFolder()` exists but is never called; deleting a session leaves its folder behind.
- [ ] No indicator of *which* notes failed to write beyond the transient flash.

## How to verify

See `verify.md` flow **5** [medium]. The restart step is the one that matters — a handle that doesn't
survive a browser restart defeats the whole feature.
