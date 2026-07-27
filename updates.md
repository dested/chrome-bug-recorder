# Gripe — Updates

> Terse log of every task: what was asked → what was done. Newest first.

## 2026-07-26 — rename the repo folder to gripe without losing Claude Code history
Asked: rename the folder to `gripe`, keep every Claude Code session, and make it repeatable for the
next 5-6 renames. Found: Claude Code keys everything to the project's absolute path — the
`projects/<mangled-cwd>` history dir, `cwd`/`realParentDir` inside 4127 places in the transcripts,
the `projects` map + `githubRepoPaths` in `.claude.json`, `history.jsonl`, and the session/teams
registries. Done: built `reproject` (github.com/dested/reproject, also installed as a skill) which
moves the folder and re-points all of it; the folder move itself must run with no Claude session
live in the folder. Repo was already named gripe everywhere but this line.
Touched: cliffnotes.md, updates.md.

## 2026-07-26 — 0.3.0: dedup that sees canvases + on-device Whisper
Asked: real recording kept 1 keyframe of 111 sampled and the Web Speech transcript was way off;
run the webm through the original crv tool; use "real tools" for perfect output. Found: the
*original* tool also kept 1 of 22 (16×16/8% is blind to action confined to one screen region);
transcript bake-off on the same audio ranked whisper-small.en (q8, transformers.js) above Whisper
base AND large-v3-turbo. Done: dedup recalibrated to 64×64 cells, keep on >8 changed cells (84
frames on the same recording, statics still skipped); post-stop on-device Whisper pass in a module
worker (webgpu→wasm, ort wasm shipped at ort/, ~250MB model cached from HF on first use) that
replaces the Web Speech lines via recording:transcript and rewrites the folder; rev token so a
flush racing an edit/transcript can't mark stale files written; CSP + wasm-unsafe-eval; dist dup
wasm pruned (23MB). Regenerated the user's session at gripes/…-walkthrough-FIXED as proof.
Tagged v0.3.0. Touched: recorder.ts, transcribe.ts + transcribeWorker.ts (new), copy-ort.mjs +
prune-dist.mjs (new), App.tsx, background, types/messages/markdown, manifest CSP, vite worker
format, styles, kit docs.

## 2026-07-26 — 0.2.1: mac mic fix + editable recordings
Asked: mic said "blocked" on macOS with no prompt despite Allow; also wants to edit recordings
(delete frames/lines). Cause: side panels can't render the getUserMedia prompt — it rejects
silently. Done: public/micperm.html+js permission page opened in a tab (prompts work there;
surfaces the real error + macOS System Settings hint); Record pre-checks via navigator.permissions
and routes through it once; blocked-HUD line is clickable. Editing: recording:frame:delete /
line:update / line:delete messages, hover-✕ on frame tiles, inline transcript editing; edits flip
written:false so report/MANIFEST/json/grids rewrite on disk. Tagged v0.2.1, release zip attached.
Touched: public/micperm.*, messages.ts, background, App.tsx, styles.css, feature doc.

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
