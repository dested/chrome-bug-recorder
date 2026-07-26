# Gripe — Updates

> Terse log of every task: what was asked → what was done. Newest first.

## 2026-07-26 — video walkthrough: record the screen, distill it live for Claude
Asked: record a screen video + narration and hand it to Claude like a gripe, mimicking
claude-real-video's methods exactly (user pushed back mid-build on an approximated dedup — the
reference's core.py was then ported verbatim). Done: panel Record button → getDisplayMedia +
MediaRecorder; live dedup (16×16 RGB sigs, >8% pixels changed w/ tol 25, window of 4 kept frames,
no forced keyframes, 150-cap uniform thinning); Web Speech transcript stamped at sentence start;
telemetry forwarded from all tabs while recording; output gripes/<slug>/ = report.md timeline,
transcript.txt, recording.json, MANIFEST.txt, frames/, grids/ (3×3 contact sheets), walkthrough.webm
(always kept). Recording = Session kind, no new stores. Typecheck + both builds clean.
Touched: types/messages/format/db/markdown/fs (lib), background, content, recorder.ts + grids.ts
(new), App.tsx, styles.css, cliffnotes kit.

## 2026-07-26 — create the cliffnotes kit for this repo
Generated the full kit from a read of the whole codebase: cliffnotes.md (map, surfaces, systems,
gotchas), ui.md (two-surface visual language, accent discipline, don'ts), decisions.md (11 backfilled
decisions), verify.md (8 click-path flows — there is no test runner), and six feature docs.
Touched: cliffnotes.md, ui.md, decisions.md, verify.md, updates.md, features/capture-modes.md,
features/voice-notes.md, features/page-telemetry.md, features/sessions.md,
features/project-folder-sync.md, features/agent-report.md
