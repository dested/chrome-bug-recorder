# Sessions

> Status: **done** · Last updated: 2026-07-29

## What / Why

A session is one complaint — a named **container** that maps 1:1 to one folder on disk and one
`report.md`. It holds **takes**: sittings of narrated screen recording, laid end to end on a single
time axis (`features/timeline.md`). It exists so that a click-through of the checkout flow produces one
artifact to hand to an agent rather than four unrelated videos, and so you can come back to an old run
and keep going.

A session — a "gripe", in the UI's own words — ends by being **closed**: handed off, written out, done.
Closing is the gesture that separates one gripe from the next, and it is the *only* one: hitting Record
again always lands in the open gripe.

**The container is invisible to the user.** The UI never says "part 2", "rec 01" or "recording 2" — it
shows one timeline with a seam. `recCount` and `rec-NN/` are a disk layout, not a concept.

## Behavior spec

- When a recording starts and no session is active (or the active one is closed), one is created
  automatically (`recording:start` → `ensureSession`), named "Walkthrough".
- **Stopping a recording and starting another appends a take to the same session.** The take gets
  `session.recCount + 1` as its index — which names its `rec-NN/` folder — and `recCount` is bumped.
  Nothing but `done` starts a new gripe.
- A session's `slug` is `YYYY-MM-DD-HHMM-<slugified name>`, deduplicated with a `-2`, `-3` suffix
  against existing slugs. **The slug is frozen at creation** — it is the folder name.
- When the user renames a session, the display name changes and `report.md`'s title changes on the next
  write; the folder does **not** move.
- When the user clicks **done** (in the footer, or in the strip's bar), the session is flushed to disk,
  the agent prompt is copied, the session is marked `closed`, and *no* session is active afterwards;
  the panel goes back to its empty state and the next recording opens a fresh gripe.
- The clipboard write happens first: it needs the click's user activation, which the flush can outlast.
  The prompt's count comes off the live recordings list, not `recCount` — that only ever climbs, so a
  gripe you deleted a take out of would otherwise be described as bigger than it is.
- When the user clicks `history · N` — a text button next to the name, rendered only when other gripes
  exist — the session list opens showing every session newest-first with its recording count and
  creation time; the active one is marked with an accent left rail, closed ones are muted and tagged
  `closed`. Each row's `×` appears on hover only.
- When the user clicks a session in that list, it becomes active and the list closes. A closed session
  is **reopened** by being activated.
- When takes are added to a reactivated session they continue its numbering, and the whole `report.md`
  is rewritten in place.
- When the user clicks `×` on a session row, the session, its recordings, and every blob those own
  (keyframes, chunks, videos) are deleted from IndexedDB; **files already on disk are kept** (the
  tooltip says so). The newest remaining session that isn't closed becomes active, or none.
- The toolbar badge shows the active session's `recCount`, or nothing at zero.
- Take numbering comes from `session.recCount` and **never decreases** — deleting a take leaves a gap
  and the folders stay `rec-01`, `rec-03`. Renumbering would invalidate paths in a report an agent may
  already be reading.
- The panel's timeline and `report.md` both place everything through `src/lib/timeline.ts`, so the
  screen and the handoff read the same way — including after the user has moved or deleted things.
- Every session mutation broadcasts `state:changed`; the panel (and the strip, which is the same page)
  re-pulls the whole state.

## Touchpoints

| Part | File |
| --- | --- |
| Create/rename/activate/close/delete handlers, badge | `src/background/index.ts` (`ensureSession`, `resumeOpen`) |
| Session name input, `history · N` list, `done`, `×` | `src/sidepanel/App.tsx` |
| Slug and timestamp generation | `slugify`, `stamp` in `src/lib/format.ts` |
| Persistence + cascade delete | `src/lib/db.ts` (`deleteSession`, `deleteRecording`) |
| Folder naming (+ the `gripes/gripes` rule) | `sessionDir` / `needsReportDir` in `src/lib/fs.ts` |
| Takes → one axis | `partSpans` in `src/lib/timeline.ts` |
| One report over the whole gripe | `buildReport` in `src/lib/markdown.ts` |

## Data

`Session { id, name, slug, createdAt, updatedAt, origin, recCount, closed? }` in the `sessions` store;
the active session id lives at `kv.activeSessionId` (`null` right after a close). Recordings reference
it by `sessionId` and are read through the `bySession` index. `deleteSession` cascades to the recordings
and their frame/chunk/video blobs.

`Session.kind` / `Session.recording` are gone as of DB v2 — a walkthrough is a `Recording` in its own
store, not a kind of session. `Session.noteCount` went with the screenshot feature on 2026-07-29; the
`notes` store itself is left in place, unused, so old profiles open without a migration.

## Edge cases

- **Deleting the last session** sets `activeSessionId` to `null`; the next recording creates a fresh one.
- **Two sessions created in the same minute with the same name** get `-2` appended, so folders never
  collide.
- **Renaming after the folder is written** leaves the old folder name — intentional, since moving a
  directory the user's agent may already be reading is worse than a stale name.
- **A session recorded on one origin, continued on another** keeps its original `origin` field; the
  report's header prefers the first take's event scope.
- **A take left mid-recording by a dead panel** is recovered on the next panel load and tagged
  `interrupted`; it still belongs to its gripe and still counts against `recCount`.
- **Closing with nothing connected** still closes; the flash says "gripe closed — nothing written to
  disk". The bundle survives in IndexedDB — export it as **.zip** (which is exactly why that button
  appears only when no folder is connected), or connect a folder and reopen the gripe from `history`,
  which makes it active again and flushes it.
- **The strip and the side panel are both open.** They are the same document over the same IndexedDB;
  both re-pull on every broadcast, and writes are idempotent.

## Open questions

- [ ] No way to move a take between sessions, or to renumber after deletions.
- [ ] No way to split a gripe that ran long, or to merge two that should have been one.
- [ ] Deleting a session from the panel never offers to delete the folder, even though
      `deleteSessionFolder()` exists in `src/lib/fs.ts` and is currently unused.

## How to verify

See `verify.md` flow **6** [cheap]. The one that catches real regressions: rename a session and confirm
the inbox line's `gripes/<slug>` does **not** change.

The container model has its own one-minute check: record a few seconds, Stop, hit Record again, Stop.
The panel must still show one gripe, the header summary must read the **combined** duration
(`m:ss recorded`), and the timeline must be one axis with a single dashed seam — not two of anything.
One folder on disk holding `report.md`, `rec-01/` and `rec-02/`. A second gripe appearing anywhere is
the 0.6 bug coming back.
