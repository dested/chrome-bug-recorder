# Project Folder Sync

> Status: **done** · Last updated: 2026-07-26

## What / Why

Connect the extension to your repo once and every note lands as real files inside it — no downloads,
no moving things around, so the path you paste to your coding agent already exists on its filesystem.
Chrome remembers the folder across restarts, which is the whole reason this beats a zip download.

## Behavior spec

- When the user clicks **Connect folder**, `showDirectoryPicker({ mode: 'readwrite' })` opens and the
  chosen handle is stored in IndexedDB under `kv.projectDir`.
- When the picker is cancelled, nothing changes and no error is shown.
- When the panel opens, the stored handle is reloaded and its permission state is queried; the strip
  shows a dot — grey (nothing connected), accent (connected, permission not granted), green (writing).
- When permission is `prompt` after a browser restart, **Reconnect** appears; clicking it (a user
  gesture, which the API requires) re-requests and turns the dot green.
- When the browser refuses the directory picker inside the side panel — some Chrome builds do — the
  panel catches it, shows "picker blocked here" and an **Open in tab →** button that loads
  `sidepanel.html` as a normal tab. That tab shares the same IndexedDB, so picking there connects the
  extension everywhere.
- When the File System Access API is missing entirely, the strip reads "folder writing unavailable —
  use Export .zip".
- When any note in the active session has `written: false` and a folder is connected and granted, the
  panel writes the **entire** session folder: `gripes/<slug>/report.md`, `notes.json`, and the PNGs
  for the unwritten notes. Then those notes are marked written.
- Writes are guarded by a re-entrancy flag, so a burst of notes produces one flush, not several.
- When a write throws, the panel flashes `write failed: …` and re-checks permission (a revoked
  handle is the usual cause); the notes stay `written: false` and retry on the next state change.
- When a note's text is edited in the panel, it is marked unwritten so the report is regenerated.
- Notes recorded while the panel is closed are written the next time it opens.
- The header shows `N notes · M on disk` whenever a folder is connected.
- When the user clicks `✕` on the folder strip, the handle is forgotten. Files on disk are untouched.
- **Nothing outside `gripes/` is ever read or written.**

## Touchpoints

| Part | File |
| --- | --- |
| Picker, handle persistence, permissions, `writeSession` | `src/lib/fs.ts` |
| Connect/Reconnect/disconnect UI, status dot, flush effect | `src/sidepanel/App.tsx` |
| `note:written` handler | `src/background/index.ts` |
| Report/JSON generation | `src/lib/markdown.ts` |

## Data

`kv.projectDir` holds a live `FileSystemDirectoryHandle` — IndexedDB structured-clones it, which is
what makes the folder survive a browser restart. `REPORT_DIR = 'gripes'` and the picker id
`'bug-recorder-project'` are in `src/lib/fs.ts`; the picker id is frozen (changing it makes Chrome
forget every user's folder).

Written layout:

```
<connected folder>/gripes/<YYYY-MM-DD-HHMM-slug>/
  report.md      notes.json      01-full.png      01-target.png      02-full.png …
```

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
- **`.gitignore`** — `gripes/` is the user's call to commit or ignore; the extension never touches it.

## Open questions

- [ ] No conflict handling if the user edits `report.md` by hand — the next note overwrites it.
- [ ] `deleteSessionFolder()` exists but is never called; deleting a session leaves its folder behind.
- [ ] No indicator of *which* notes failed to write beyond the transient flash.

## How to verify

See `verify.md` flow **5** [medium]. The restart step is the one that matters — a handle that doesn't
survive a browser restart defeats the whole feature.
