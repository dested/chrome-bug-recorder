# Sessions

> Status: **done** · Last updated: 2026-07-26

## What / Why

A session is one recording run — a named bucket of notes that maps 1:1 to one folder on disk and one
`report.md`. It exists so a click-through of the checkout flow produces one artifact to hand to an
agent, rather than 12 loose screenshots, and so you can come back to an old run and append to it.

## Behavior spec

- When the first note of a run is saved and no session is active, one is created automatically, named
  from the page title (falling back to the page origin).
- A session's `slug` is `YYYY-MM-DD-HHMM-<slugified name>`, deduplicated with a `-2`, `-3` suffix
  against existing slugs. **The slug is frozen at creation** — it is the folder name.
- When the user renames a session, the display name changes and `report.md`'s title changes on the
  next write; the folder does **not** move.
- When the user clicks `+`, a new session is created from the active tab's title and becomes active;
  the note list empties and the toolbar badge clears.
- When the user clicks `▾`, the session list opens showing every session newest-first with its note
  count and creation time; the active one is marked with an accent left rail.
- When the user clicks a session in that list, it becomes active, its notes load, and the list closes.
- When notes are added to a reactivated session, they continue its numbering and the whole
  `report.md` is rewritten in place.
- When the user clicks `×` on a session row, the session, its notes, and its image blobs are deleted
  from IndexedDB; **files already on disk are kept** (the tooltip says so). The first remaining
  session becomes active.
- The toolbar badge shows the active session's note count, or nothing at zero.
- Note numbering comes from `session.noteCount`, which only ever increases — deleting note 2 leaves a
  gap, and files stay `01-`, `03-`.
- Every session mutation broadcasts `state:changed`; the side panel re-pulls the whole state.

## Touchpoints

| Part | File |
| --- | --- |
| Create/rename/activate/delete handlers, badge | `src/background/index.ts` |
| Session name input, `▾` switcher, `+`, `×` | `src/sidepanel/App.tsx` |
| Slug and timestamp generation | `slugify`, `stamp` in `src/lib/format.ts` |
| Persistence + cascade delete | `src/lib/db.ts` |
| Folder naming | `sessionDir` in `src/lib/fs.ts` |

## Data

`Session { id, name, slug, createdAt, updatedAt, origin, noteCount }` in the `sessions` store; the
active session id lives at `kv.activeSessionId`. Notes reference it by `sessionId` and are read
through the `bySession` index. `deleteSession` cascades to notes and their two blob keys.

## Edge cases

- **Deleting the last session** sets `activeSessionId` to `null`; the next note creates a fresh one.
- **Two sessions created in the same minute with the same name** get `-2` appended, so folders never
  collide.
- **Renaming after the folder is written** leaves the old folder name — intentional, since moving a
  directory the user's agent may already be reading is worse than a stale name.
- **A session recorded on one origin, continued on another** keeps its original `origin` field; the
  report's header uses the first note's origin instead.
- **Notes recorded while the panel is closed** attach to whatever session was last active — including
  one you switched to hours ago.

## Open questions

- [ ] No way to move a note between sessions, or to renumber after deletions.
- [ ] Deleting a session from the panel never offers to delete the folder, even though
      `deleteSessionFolder()` exists in `src/lib/fs.ts` and is currently unused.

## How to verify

See `verify.md` flow **6** [cheap]. The one that catches real regressions: rename a session and
confirm the `gripes/<slug>` sub-line does **not** change.
