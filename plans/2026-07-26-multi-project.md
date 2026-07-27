# Per-project folders → reverted; one folder + a panel that scales

> Status: **done** · 2026-07-26 · per-project folders shipped as 0.5.0 and were reverted in 0.6.0

## What was asked, and what came back

The ask: "after the session is done it should be like close this gripe and start a new one. the next
one won't be in the same folder. it's per project… need a better solution here."

**0.5.0 answer:** connected folders became a list. `Project` metadata in the worker, handles in the
panel, a switcher on the folder strip, `Session.projectId` binding each gripe to the folder it
started in, plus `done` to close a gripe.

**The verdict, same day:** "ooh i kinda hate it. forget all that. forget folders. theres only one
gripe folder. you name it how you want." Plus a screenshot of the panel ~1200px wide: "the ui is so
small and clunky."

Fair. The list turned a set-once setting into a thing to maintain — a switcher, per-project paths, a
session→folder binding, a migration — and the cost it removed (re-picking a folder when you change
repos) was smaller than the cost it added.

## 0.6.0

**One folder.** Back to `kv.projectDir` + `kv.projectPath`. `loadProjectDir()` reclaims whichever 0.5
project was active — with its typed path — and deletes the three 0.5 keys, so a profile that ran 0.5
for an afternoon doesn't re-pick anything. `Project`, `project:*`, `Session.projectId` and the
handles map are gone.

**`done` survives.** It was the real ask underneath the folder question: write the bundle, copy the
prompt, mark the session `closed`, clear the active session so the next capture starts fresh.

**The panel scales.** Every size in `styles.css` now comes from a token scale stepped at 480px and
760px (`--fs-xl…--fs-2xs`, `--gut`, `--strip`, `--thumb-*`, `--frame-min`); the column caps at 900px
and centers instead of running full-bleed; the folder line moved into the session block (it was
repeating the slug shown directly above it); CTA + modes become one control bar past 520px; the
keyframe grid is `auto-fill`. Two strips removed, ~4px added to everything that was fine print.

**`npm run preview`.** A zero-dep static server + two harness pages (`scripts/preview/`) that render
the *built* panel with the chrome APIs stubbed and IndexedDB seeded, one iframe per width. Writing it
paid for itself immediately: session rows' `×` had never had a CSS rule and was rendering as a stray
block below the meta line — invisible in every screenshot taken so far because nobody had opened the
switcher.

## Gotchas that carried over

- `done` must not close before the write lands: the flush bodies live in `flushNotes` /
  `flushRecording`, and `finish()` waits out any in-flight flush then runs its own. The flush effects
  only ever watch the *active* session.
- Same trap for Whisper, which finishes long after the gripe may be closed — `runWhisper` flushes by
  session id itself.
