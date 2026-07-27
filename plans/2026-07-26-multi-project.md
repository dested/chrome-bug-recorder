# Per-project folders + closing a gripe

> Status: **done** · 2026-07-26 · shipped as 0.5.0

## The problem

A gripe is per project, but the extension has exactly one folder: `kv.projectDir` (a handle) plus
`kv.projectPath` (the absolute path the user typed). Finishing a bundle for repo A and starting one
for repo B costs: `✕` to forget the folder → **Connect folder** → the OS picker → re-typing the
absolute path — every single switch. And there is no "this one is done" gesture at all: the session
stays active, so the next note lands in the bundle you already handed off.

## Option considered and rejected: one central gripes directory

Sal's second idea: stop writing into the repo, write everything into a generic directory
(`~/gripes/…`) and hand the agent a long absolute path.

Rejected. The whole value is that the bundle lands **inside the repo the agent is already running
in** — Claude Code reads `gripes/<slug>/report.md` as a relative path in its own working directory
and never asks permission. A central directory makes every single handoff a cross-directory read
the agent has to be granted. It solves the switching cost by giving up the reason the tool exists.

Note the implemented design is a superset: a project is just "a folder you connected", so anyone who
wants the central-directory behavior can connect one folder and never add a second.

## What ships

**Projects.** A remembered list of folders instead of one. Switching is one click in the folder
strip — no picker, no re-typing the path, permission usually still granted from last time.

- `Project { id, name, path, addedAt, lastUsedAt }` — plain metadata, owned by the worker in
  `kv.projects`, active one in `kv.activeProjectId`, shipped to the panel in `state:get`.
- The `FileSystemDirectoryHandle`s live in `kv.projectHandles` (`Record<id, handle>`), written only
  by the panel. They *have* to be split out: `chrome.runtime.sendMessage` JSON-serializes, so a
  handle can never travel in a message, but IndexedDB structured-clones it fine.
- `Session.projectId` is stamped at creation. **Write-through follows the session's project, not the
  active one** — a session always writes home, even after you switch away.
- Migration: the legacy `projectDir` + `projectPath` become project #1 and every pre-existing session
  is stamped with its id (`project:add … adopt: true`), then the legacy keys are deleted.

**Closing a gripe.** `done` in the footer: flush everything to disk → copy the agent prompt → mark
the session `closed` → clear the active session. The next capture starts a fresh session in whatever
project is active then. It replaces `+` — "close this one and start the next" was what `+` was
actually for.

- Activating a closed session reopens it (`closed` cleared) — no separate reopen affordance.
- Switching project activates that project's newest *open* session, or none. Without `closed`,
  coming back to a project would silently resume the bundle you already handed off.

**Session list** is scoped to the active project, with the others behind one row.

## Ordering / gotchas hit

- `done` must not close before the write lands: the flush bodies are extracted from the two effects
  into `flushNotes` / `flushRecording`, `done` waits for the in-flight flush then runs its own. The
  flush effects only ever run for the *active* session, so anything pending at close time would
  otherwise never be written.
- Same trap for Whisper: it finishes after the session may already be closed, so `runWhisper` flushes
  the session by id itself instead of relying on the effect.
