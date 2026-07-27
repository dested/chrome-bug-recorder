# Gripe — Updates

> Terse log of every task: what was asked → what was done. Newest first.

## 2026-07-26 — revert the folder list, rescale the panel (0.6.0)
Asked: "ooh i kinda hate it. forget all that. forget folders. theres only one gripe folder. you name
it how you want." — plus a screenshot at ~1200px wide: "the ui is so small and clunky. rethink it a
bit". Done: **0.5's per-project folders are gone** — `Project`, `project:*`, `Session.projectId`, the
handles map and the switcher all removed; back to one `kv.projectDir` + `kv.projectPath`, and
`loadProjectDir()` reclaims whichever 0.5 project was active (with its path) then deletes the three
0.5 keys, so nothing has to be re-picked. `done` survives — it was the actual ask underneath.
**Panel rescaled:** every size in `styles.css` comes from tokens stepped at 480/760px (`--fs-xl…
--fs-2xs`, `--gut`, `--strip`, `--thumb-*`, `--frame-min`), the column caps at 900px and centers
instead of running full-bleed, the folder line folded into the session block (it repeated the slug
shown right above it), CTA + the four modes become one control bar past 520px, keyframes are
`auto-fill`, and `.kill` is one shared rule instead of four copies. **Found and fixed a real bug**:
session rows' `×` had never been styled and rendered as a stray block under the meta line.
New `npm run preview` (zero-dep server + `scripts/preview/`) renders the built panel with the chrome
APIs stubbed and IndexedDB seeded, one iframe per width — that's what surfaced the `×`. Typecheck +
both builds clean; layout checked at 380/560/900 in Chrome, extension itself not re-loaded.
Touched: types/messages/fs/format (lib), background, App.tsx, styles.css, scripts/preview*,
manifest+package (0.6.0), README, cliffnotes/ui/decisions/verify/features×2, plans.

## 2026-07-26 — one folder per project, and a gripe you can close (0.5.0, reverted by 0.6.0)
Asked: closing a session should hand it off and start a new one, and the next one lives in a
different repo — find a better solution than a single connected folder (the floated alternative: one
central gripes directory reached by long absolute paths). Done: connected folders are now a
**list**. `Project {id,name,path,addedAt,lastUsedAt}` metadata lives in the worker (`kv.projects`,
`kv.activeProjectId`), the directory handles live in the panel (`kv.projectHandles`) because a
handle can't survive `sendMessage`'s JSON hop; `▾` on the folder strip switches in one click and
`+ connect another folder` adds one. Every session is stamped with `projectId` at creation and
**writes into that folder for life** — switching never redirects a bundle mid-flight. `done` in the
footer replaces `+`: copy the prompt (first, while the click's activation is alive), wait out any
flush, write what's pending, `session:close` → `closed: true` and no active session, so the next
capture opens a fresh gripe; with 2+ projects the switcher pops open. Activating a closed session
reopens it and follows it to its project; the session list is scoped to the active project with the
rest behind one row. The flush effects only ever see the active session, so `finish()` and a late
Whisper pass call `flushNotes`/`flushRecording` by id themselves. 0.4's single folder migrates into
project #1 and adopts every existing session, then the legacy keys are deleted. The central-directory
alternative was rejected in decisions.md — it gives up the one thing that makes this work, a bundle
inside the repo the agent is already running in. Typecheck + both builds clean; not exercised in
Chrome (no unpacked-extension harness here) — verify.md flows 10 and 11 are the recipes.
Touched: types/messages/format/fs (lib), background, App.tsx, styles.css, manifest+package (0.5.0),
README, cliffnotes/ui/decisions/verify/features×2, plans/2026-07-26-multi-project.md.

## 2026-07-26 — act on the first agent's feedback about a real walkthrough bundle (0.4.0)
Asked: an AI agent read a `gripes/` walkthrough and sent seven ranked notes; make the changes. Done,
all seven: (1) panel asks once for the connected folder's absolute path (kv `projectPath`,
`sessionFolder()`), every report opens with it and the copy-prompt uses it, `session:rewrite` catches
up what's on disk; (2) report.md now leads with the contact sheets and inlines a still only inside a
spoken window (cap 16, marks + frame 1 always, spread of 12 when silent), the rest collapsed to one
line per run naming its sheet, counts printed; (3) spoken lines render as ranges — Whisper end-times
land in `TranscriptSegment.d`, estimated otherwise — and name the frames they cover; (4)
`recording:reviewed` + a panel nag, and the report states whether a human checked the transcript;
`Alt+Shift+M` (`mark-frame` command → worker → panel) forces a keyframe, ★ in the panel and report,
never thinned; (5) telemetry scoped to the recorded tab's origin, drops counted and reported; (6)
content scripts forward pointer samples (120ms, selector cached per element), frames carry
`FramePointer` and get an accent crosshair when the capture's aspect ratio identifies it as
screen or tab; (7) debug-HUD tip documented. Typecheck + both builds clean; report rendering smoke-
tested against a synthetic 68-frame recording (68 keyframes → 16 stills).
Touched: types/messages/format/fs/markdown (lib), background, content, recorder.ts, grids.ts,
transcribeWorker.ts, App.tsx, styles.css, manifest+package (0.4.0), README, cliffnotes kit,
plans/2026-07-26-agent-feedback.md.

## 2026-07-26 — landing page at gripe.dested.com: sal-starter port + Remotion promo
Asked: build a full landing page from the sal-starter template, go hard like the README, make a
Remotion promo video, host it at gripe.dested.com via Drydock. Done: `landing/` (Express 5 + Vite
SSR skeleton from the template, tRPC/Prisma/auth stripped — see decisions.md), page in the
extension's visual language with a pure-CSS looping capture demo in the hero; `landing/video/`
Remotion project renders the 60s promo to `landing/public/promo.mp4` (drop a real recording there
to replace it); deployed via Drydock (rootDir `landing`, no db, dnsZone dested.com).
Touched: landing/**, landing/video/**, cliffnotes.md, decisions.md, ui.md.

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
