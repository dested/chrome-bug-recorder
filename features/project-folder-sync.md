# Project Folder Sync

> Status: **done** · Last updated: 2026-07-26

## What / Why

Connect the extension to your repo and every note lands as real files inside it — no downloads, no
moving things around, so the path you paste to your coding agent already exists on its filesystem.
Chrome remembers the folders across restarts, which is the whole reason this beats a zip download.

Folders are a **list**, not a setting. A gripe is per project and the next one is usually a different
repo, so switching is one click in the folder strip: no picker, no re-typing the absolute path, and
the permission is normally still granted from last time.

## Behavior spec

### Connecting

- When the user clicks **Connect folder** (or `+ connect another folder` in the project list),
  `showDirectoryPicker({ mode: 'readwrite' })` opens; the chosen folder becomes a `Project` and the
  active one, and the panel immediately asks for its absolute path.
- When the picker is cancelled, nothing changes and no error is shown.
- The picker id `'bug-recorder-project'` is shared by every project on purpose — Chrome reopens the
  picker where you last were, which is usually the parent of the next repo.
- When the panel opens, the stored handles are reloaded and each project's permission state is
  queried. The strip's dot reflects the **session's** project — grey (nothing connected), accent
  (connected, permission not granted), green (writing).
- When permission is `prompt` after a browser restart, **Reconnect** appears; clicking it (a user
  gesture, which the API requires) re-requests and turns the dot green.
- When a project exists but its handle doesn't (cleared storage, a half-finished migration),
  **Repick** appears and re-attaches a folder to that same project id — every session stays pointed
  at it.
- When the browser refuses the directory picker inside the side panel — some Chrome builds do — the
  panel catches it, shows "picker blocked here" and an **Open in tab →** button that loads
  `sidepanel.html` as a normal tab. That tab shares the same IndexedDB, so picking there connects the
  extension everywhere.
- When the File System Access API is missing entirely, the strip reads "folder writing unavailable —
  use Export .zip".

### Switching

- `▾` on the folder strip opens the project list: one row per project with its dot, name and
  absolute path, the active one railed in accent.
- Clicking a row makes it active and resumes that project's newest **open** session — or none, if
  every gripe there is closed. Notes captured next open a fresh session in that project.
- `×` on a row forgets the folder and its handle. Files on disk are untouched, and sessions keep
  their `projectId` — the history stays, only the connection is gone.
- Forgetting the active project falls back to the most recently used remaining one.

### Writing

- **A session writes into the project it was started in, forever.** Switching the active project
  never redirects a bundle that is already half on disk.
- When any note in the active session has `written: false` and that session's project is connected
  and granted, the panel writes the **entire** session folder: `gripes/<slug>/report.md`,
  `notes.json`, and the PNGs for the unwritten notes. Then those notes are marked written.
- Writes are guarded by a re-entrancy flag, so a burst of notes produces one flush, not several.
- When a write throws, the panel flashes `write failed: …` and re-checks that project's permission
  (a revoked handle is the usual cause); the notes stay `written: false` and retry on the next state
  change.
- When a note's text is edited in the panel, it is marked unwritten so the report is regenerated.
- Notes recorded while the panel is closed are written the next time it opens.
- The header shows `N notes · M on disk` whenever the session's folder is connected.
- **Nothing outside `gripes/` is ever read or written.**

### The absolute path

- Asked once per project, the moment it is connected — `path?` on the strip reopens the input, and
  every project row shows its path or `path not set`.
- Setting or changing it marks the active session unwritten so the report's first line catches up.
- Empty is a supported state: the report falls back to `<project name>/gripes/<slug>`.

## Touchpoints

| Part | File |
| --- | --- |
| Picker, handle storage, permissions, `writeSession` | `src/lib/fs.ts` |
| Project metadata, active project, session stamping | `src/background/index.ts` |
| Folder strip, project list, flush effects, migration | `src/sidepanel/App.tsx` |
| `Project` type | `src/lib/types.ts` |
| Report/JSON generation | `src/lib/markdown.ts` |

## Data

Split in two, because `chrome.runtime.sendMessage` JSON-serializes and a `FileSystemDirectoryHandle`
cannot survive that trip:

| Key | Owner | Holds |
| --- | --- | --- |
| `kv.projects` | background worker | `Project[]` — id, name, path, addedAt, lastUsedAt |
| `kv.activeProjectId` | background worker | Which project new sessions are stamped with |
| `kv.projectHandles` | side panel | `Record<projectId, FileSystemDirectoryHandle>` |

IndexedDB structured-clones the handles, which is what makes "remember my project folders" work
across restarts. `Session.projectId` binds a gripe to its folder. `REPORT_DIR = 'gripes'` and the
picker id `'bug-recorder-project'` are in `src/lib/fs.ts`; the picker id is frozen (changing it makes
Chrome forget every user's folder).

Written layout:

```
<connected folder>/gripes/<YYYY-MM-DD-HHMM-slug>/
  report.md      notes.json      01-full.png      01-target.png      02-full.png …
```

### Migration from 0.4

The old single folder lived at `kv.projectDir` + `kv.projectPath`. On first run of 0.5 the panel
turns it into project #1, stamps every existing session with its id (`project:add … adopt: true`),
and deletes both legacy keys. It re-reads state first, so the side panel and the tab fallback can't
both migrate.

## Edge cases

- **Permission revoked mid-session** → the first write throws, the dot goes accent, Reconnect fixes it
  and the backlog flushes.
- **Folder deleted or renamed on disk** → `getDirectoryHandle` throws; the flash reports it, the
  permission re-check comes back `granted`, and the notes stay pending.
- **Connecting a folder after recording** → all existing notes are `written: false`, so the first
  flush writes the whole session at once.
- **A session whose project was forgotten** → the strip falls back to the active project for display
  but nothing is written; reconnect the folder and it flushes.
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
- [ ] Renaming a project isn't possible; the folder's own name is the label.

## How to verify

See `verify.md` flows **5** [medium] and **10** [medium]. The restart step is the one that matters —
handles that don't survive a browser restart defeat the whole feature.
