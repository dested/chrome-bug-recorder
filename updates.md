# Gripe — Updates

> Terse log of every task: what was asked → what was done. Newest first.

## 2026-07-29 — Inloop built: the cloud workspace shipped as its own repo
Asked: "start a fresh repo and start building… full website with marketing and pitch and login…
fully completed project." Done: **G:\code\inloop** (github.com/dested/inloop, private) — S3 +
Postgres ingest, push CLI, review workspace (inbox/viewer/team/projects), landing site, stdio MCP
for agent pull. This repo (the extension) is untouched; next integration step is direct upload from
the extension. Strategy plan flipped to done (per plans/2026-07-29-enterprise-strategy.md).

## 2026-07-29 — enterprise strategy + the overlay-over-Excel answer
Asked: can the extension draw over native apps (no), and how to take Gripe enterprise — pricing,
consumer tier, integrations, Claude Code auto-run, possible rewrite. Done: strategy dumped in chat,
mirrored to `plans/2026-07-29-enterprise-strategy.md` (active). No code touched.

## 2026-07-29 — a gripe is one timeline: notes deleted, an NLE editor, a bottom strip
Asked: "no more of this recording 1 recordfing 2 like its just a timeline… redesign the ui to look like
a timeline view like after effects… the whole idae is to sanatize the prompt we send to claude", plus
"there are no screenshot at a time view anymore. just recording. get rid of anythign related to that",
"i want shortcuts on draw clear mark stop so it should say like draw (d)", "i want the drawings to fade
out over time slowly", "i also need the chrome plugin to be able to pop out somehow" — then, on a real
10:18 recording: "these videos could be an hour long. this ui is terrible." Done (plan:
`plans/2026-07-29-timeline.md`, three addendums). **Notes are dead**: capture modes, aim overlay,
composer, `note:*`/`arm`/`capture:visible`, Note/CaptureMode/TargetInfo, `noteCount`, notes.json and
the two `arm-*` commands all deleted; `Settings` is `{drawStart, lang}` with one switch; the `notes`
store stays unused and `writeSummaries` scrubs leftover `notes.json`. **One axis**: new
`src/lib/timeline.ts` is the sole position authority (takes end to end, `tl` overrides what a human
moved), `timeline:move`/`timeline:delete` do bulk edits behind a `revs` guard against the Whisper-swap
race, and `buildReport` now emits one chronological walkthrough from those same positions — so deleting
a stretch deletes it from the handoff. **New `Timeline.tsx`**, rebuilt once mid-day: **filmstrip** of
fixed-width cells (no overlap at any duration, windowed past ~300), duration-sized voice blocks with
text only ≥48px, a clickable playhead readout under the monitor, time-range-first selection, marks as
ticks, `.wide` landscape shape. **The editor pops out** as a strip pinned across the bottom of the
browser window (`?pop=1` + `strip:track`; the worker re-pins on parent move/resize) — panel = capture
remote, strip = editor; `--max` goes full-bleed at wide-and-short. **Dock buttons carry their keys**
(`draw (d) · clear (c) · mark (m) · stop (s)`, content-script listener — chrome refuses bare-letter
commands) and **ink fades** (3s hold, 4s fade, any stroke restores all). Recorder gained click/nav/15s
heartbeat forced keyframes. Preview harness: `rec|long|empty|nofolder` + `WxH` shape tokens.
Typecheck + both builds clean; checked at 380/560/900 and 1500×400 on the `long` seed.
Touched: types/messages/timeline(new)/markdown/fs (lib), background, content/index+ui, App.tsx,
Timeline.tsx (new), styles.css, recorder.ts, manifest, scripts/preview*, ui/cliffnotes/decisions,
features (+timeline, −capture-modes, −voice-notes, 5 rewritten), plans/2026-07-29-timeline.md.

## 2026-07-29 — forced keyframes (package A of the walkthrough-quality fixes)
Asked: an agent read a real 10-min bundle (`gripes/2026-07-29-1009-walkthrough`) and found a 78s
keyframe gap over the most-narrated stretch (cream-on-cream nav + form typing stays under the 8-cell
dedup bar), plus a shipped Web Speech transcript and report noise; "fix all of those things". Done
(capture only): `RecordingFrame.reason` grew `click | nav | beat`; clicks (ripple condition) and
navigations (`gripe:page-nav` MAIN-world tap: pushState/replaceState/popstate/hashchange + fresh-load
catch-up) send `recording:force`; the recorder forces in-scope keyframes with a 1200ms click cooldown
(mark wins, `minDist === 0` skipped) and keeps a `beat` frame when the screen drifts below the bar
for >15s. Thinning still protects only marks. Packages B (transcription: live chunked Whisper, done
guard, reopen-requeue, vocabulary) and C (report shape) are specced and NOT started —
`plans/2026-07-29-transcription-report-fixes.md`.

## 2026-07-28 — UI redo: five things, zero shortcuts, ink by default
Asked: "Redo the ui. I hate it. It has 50 buttons that don't make sense. Make drawing default on and I
can turn it off. No more shortcuts at all. My users are not smart. Go hard." Done (plan:
`plans/2026-07-28-ui-redo.md`). **The panel is five things** — Record, point at something, the
timeline, Copy prompt, done: the four mode buttons, the shortcut hint line, `chrome.commands.getAll`,
`editShortcut`, every `<kbd>` and the E/R/D/P key relay are gone (only `Escape` → disarm survives), the
hero Record control is full width and `--hero-h` tall (52/60/68), one secondary entry reads
`point at something broken`, the inbox collapses to a single clickable line (setup card when
unconnected), the switcher chevron became `history · N`, five toggles hide behind one `settings` row,
and `.zip` renders only when no folder is connected. **The controls moved onto the page**: recording
raises a glass `.dock` on the recorded tab — clock · draw/click · clear · mark · stop — scoped by the
new `recordingOrigin` kv, re-sent to tabs that load mid-walkthrough, fading to .35 near the cursor and
stepping aside while a capture is armed; the new `recording:stop` Request lets it stop the recorder the
panel owns. **Drawing starts armed** (`Settings.drawStart`, default true); toggling it off returns
clicks to the page without erasing strokes, and the button's label swaps `draw` ⇄ `click`. Overlay
de-shortcutted too: modes are plain words, `esc` is now a `✕`, the composer got a `save` button.
Manifest commands stay wired and unadvertised. Typecheck + both builds clean; panel checked at
380/560/900 in all five preview modes. Touched: content/index+ui, App.tsx, styles.css, types/messages,
background, scripts/preview*, ui/cliffnotes/decisions/features×2, plans/2026-07-28-ui-redo.md.

## 2026-07-28 — the rethink: one gripe, many parts, one inbox (0.7.0)
Asked: Sal recorded a walkthrough, stopped, hit Record again — and the panel switched to a new gripe,
making part 1 look destroyed. Plus "the whole folder flow sucks", "I need a full path in the prompt",
"I should be able to draw while recording". Done, as a full rethink (plan:
`plans/2026-07-28-rethink.md`). **A gripe is a container**: recording again appends a **part** to the
open gripe, notes and parts interleave by `createdAt` in one timeline and **one `report.md`**, and only
`done` closes it. `kind: 'recording'` is dead — parts live in a new `recordings` store (**DB v2**, and
the migration keeps `recording.id === the old session id` so every existing frame/video blob still
resolves); `Session` gains `recCount`, each part owns a `rec-NN/` subtree on disk. **The one folder is
now the gripe inbox** — global, not per-repo; picked once, its absolute path typed once, and every
prompt carries it so any repo's agent can read the report (the `gripes/` level is skipped when the
inbox is itself named `gripes`). **Recorder resilience**: every 1s webm chunk is persisted plus a
throttled meta push, so a dead panel loses ~1s instead of the ramble; the orphan is recovered on next
load and tagged `interrupted`. **Whisper is a FIFO** — back-to-back parts used to drop the second
transcript silently. **`Alt+Shift+D` draws on the page** while recording (in-tab ink layer, stroke end
force-marks a keyframe) and clicks leave accent ripples. **Panel redesign**: hero Record + live HUD,
inbox line, one chronological timeline of note rows and part cards. Typecheck + both builds clean;
panel checked at 380/560/900 via `npm run preview` (`mode=mixed`). Landing site deliberately deferred.
Touched: types/db/messages/fs/markdown/format (lib), background, content/index+ui, recorder.ts,
App.tsx, styles.css, scripts/preview*, manifest+package (0.7.0), cliffnotes/ui/decisions/features×2,
plans/2026-07-28-rethink.md.

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
