# Gripe — Decisions

> Why things are the way they are. A recorded decision is settled unless the user reopens it.
> Newest first. Entries dated 2026-07-25 were backfilled on 2026-07-26 by reading the shipped code —
> the reasoning is reconstructed from the code's own comments and structure.

## 2026-07-26 — One gripe folder, reverting the per-project list; and the panel scales with its width
**Why:** the per-project folder list shipped in 0.5 and Sal hated it on sight — "forget all that,
forget folders, there's only one gripe folder." He is right: it turned a thing you set once into a
thing you maintain (a list, a switcher, per-project paths, a session→folder binding, a migration),
and the cost it removed — re-picking a folder when you change repos — was smaller than the cost it
added. 0.6 is back to one `projectDir` + one `projectPath`; `loadProjectDir()` reclaims whichever
0.5 project was active so nobody has to re-pick. **What survives from 0.5 is `done`** — write the
bundle, copy the prompt, close the gripe, clear the active session — because "close this gripe and
start a new one" was the actual ask underneath the folder question.
The same message called the panel "small and clunky", with a screenshot of it ~1200px wide: 10.5px
metadata, full-bleed slabs of button, ten stacked strips. So every size in `styles.css` now comes
from a token scale (`--fs-*`, `--gut`, `--strip`, `--thumb-*`, `--frame-min`) that steps up at 480px
and 760px; the column caps at 900px and centers; the folder line moved inside the session block
(it was repeating the slug the line above already showed); the CTA and the four mode buttons become
one control bar past 520px; keyframes are `auto-fill` rather than a hard 3 columns. `npm run preview`
serves the built panel with the chrome APIs stubbed, one iframe per width — writing it immediately
turned up a real bug (session rows' `×` had never been styled and rendered as a stray block).
**Rejected:** keeping the project list behind a setting (the complaint was the concept, not the
placement), a central gripes directory (rejected for its own reasons, below — and the one folder can
be central if you point it there), scaling by `rem` off a root font-size (every size in this
stylesheet is px and the overlay's isn't shared), and a two-column layout at wide widths (the panel
is a rail that is *occasionally* wide; a centered column is the honest answer).

## 2026-07-26 — The walkthrough report leads with contact sheets and rations stills, after an agent read one
**Why:** the first AI agent handed a real bundle came back with ranked feedback, and it is the only
evidence we have about the actual reader. Three findings drove the shape: (1) 68 inlined keyframes for
6 spoken lines was ~100k tokens of near-identical stills of which about four mattered, while the 3×3
grids gave it the whole walkthrough for an eighth of the cost — so grids are now the primary section
and stills are inlined only inside a spoken window (2s before → 2.5s after the line, cap 16), with the
skipped frames collapsed to one line per run naming their sheet and the counts printed so partial
coverage never reads as full; (2) speech stamped at its start correlated to the wrong frames — every
line now renders as a range and names the frames it covers; (3) the report was unfindable on disk
(`test1/gripes/…` vs `G:\junk\test1\gripes\…`, six tool calls of `find`), so the panel asks once for
the absolute path and every report opens with it. Also from the same list: telemetry is scoped to the
recorded tab's origin (the one captured error was another tab's YouTube ping), frames carry the mouse
(crosshair + selector — "these over here" was unresolvable), and `Alt+Shift+M` marks a frame mid-
sentence because ASR ate "tile" and turned a one-tile bug into a one-pixel one.
**Rejected:** loosening the dedup thresholds instead (they were bought with evidence on 2026-07-26 and
the frames themselves are fine — it's the *report* that over-served them), auto-correcting suspicious
ASR words (a confident wrong guess is worse than a flagged one; the report now states whether a human
checked the transcript and the panel nags until they do), deriving the absolute path from the
directory handle (the File System Access API does not expose it, by design).

## 2026-07-26 — Landing site: sal-starter skeleton with the data layer stripped, hosted in-repo via Drydock rootDir
**Why:** Sal asked for a landing page "using the sal-starter template" hosted at gripe.dested.com.
The template ships Express 5 + Vite SSR + React Router 7 + tRPC + Prisma 7 + better-auth; a
marketing page has no users, no API, and no database, so `landing/` ports the SSR skeleton
faithfully (server.ts, logger, entry-server, routes, tsconfig, prettier) and drops
tRPC/Prisma/better-auth/TanStack entirely — the Drydock deploy then provisions no Postgres
(`database: false`). It lives as a subfolder of this repo (Drydock rootDir `landing`) instead of a
second repo so the extension and its site version together. Fonts deviate from ui.md's
system-stack rule on purpose: the marketing surface carries Bricolage Grotesque (display) + IBM
Plex Mono (facts), self-hosted via fontsource; the extension itself stays web-font-free.
**Rejected:** keeping auth/db "because the template has them" (dead weight + a $0 database on the
box), a separate gripe-landing repo (two repos to version one product), reusing the extension's
hand-written CSS approach (Tailwind v4 is the template's styling layer and the page is 500+ lines
of one-off marketing layout).

## 2026-07-26 — Dedup recalibrated for screens: 64×64 cells + absolute count (departs from the reference, with evidence)
**Why:** a real MacBook recording (game dev page, 55s, 111 samples) kept exactly ONE frame. Running
the same webm through the *original* claude-real-video tool reproduced it: 22 extracted → 1 kept,
every reject scoring under 6% against its 8% bar. The reference's 16×16 percent-changed signature is
tuned for full-frame video; on a screen recording the action lives in one region (game canvas,
terminal pane) and 16×16 averages it to nothing. Measured on that recording, a 64×64 signature
separates cleanly — gameplay = 13–178 changed cells, static screen = 0–3 — so the comparator is now
64×64 RGB cells with a keep bar of >8 *cells* changed (tolerance 25 unchanged; window-of-4-kept,
no forced keyframes, and 150-cap thinning all unchanged). This is a deliberate, evidence-backed
departure from the port-exactly rule: the original method was run and failed on the actual content.
**Rejected:** lowering the percent threshold at 16×16 (2% still missed the entire 3–19s gameplay
stretch), per-region signatures (complexity; 64×64 counting already resolves sprite-scale motion).

## 2026-07-26 — Transcription: on-device Whisper after Stop; Web Speech is only the live ticker
**Why:** the same real recording produced a transcript the user called "way off" — Web Speech is a
dictation API, not a transcription engine. Bake-off on that exact audio: Web Speech < Whisper base
(the reference tool's default) < large-v3-turbo < **whisper-small.en (q8) via transformers.js** —
which got every product-relevant line right ("slopes are fine", "the spring is totally broken",
"piranha plants") with timestamps, at ~15s of CPU for a 55s clip. So the webm's mic track is
transcribed *in the extension* right after Stop (user: "i don't care so much about real time…
it just has to have perfect output"): transformers.js + onnx-community/whisper-small.en q8 in a
worker, WebGPU with wasm fallback, ort wasm shipped in the bundle (`public/ort/`, gitignored,
copied by `scripts/copy-ort.mjs`), ~250MB model fetched from huggingface.co on first use and cached
by the browser. The session saves immediately with the Web Speech lines and Whisper replaces them
when it lands (`recording:transcript` → `written:false` → files rewrite) — a failed or interrupted
pass degrades to today's behavior instead of losing the recording.
**Rejected:** shipping the reference's Python CLI alongside (its frame pass fails on screens, its
whisper-base loses the bake-off, and it puts python+ffmpeg install burden on every machine),
a cloud transcription API (key management + privacy in a local-first tool), Chrome's built-in
Prompt API audio (availability gated on flags/hardware today), whisper large-v3-turbo (5× the
download for a transcript that regressed on this clip: "slips are fine", "killing anybody").

## 2026-07-26 — Video walkthroughs distill live, with claude-real-video's methods ported exactly
**Why:** the user explicitly wants the reference tool's logic, not an approximation — its dedup
(16×16 RGB signatures, percent-of-changed-pixels >8 with channel tolerance 25, window of the last 4
*kept* frames, no forced keyframes, 150-frame uniform thinning), its 3×3 contact-sheet grids, and
its MANIFEST.txt all ported verbatim to TypeScript (`src/sidepanel/recorder.ts`, `grids.ts`). But
the pipeline runs *live during recording* instead of post-processing a file: we control capture, so
ffmpeg (decode/scene-detect) and Whisper (transcribe-after) have nothing to do — the 500ms sampler
is the candidate stream and Web Speech is the transcript.
**Two deliberate deviations, flagged to the user:** frames are ≤1920px (his 640px targets
talking-head video; ours are screens full of code the model must read — his 480px overview survives
in the grids), and transcription is live Web Speech, not Whisper.
**Rejected:** recording the webm and post-processing it in-browser (an ffmpeg.wasm dependency and a
wait, for identical output), forced keyframes every N seconds (not in the reference; a static screen
adds nothing).

## 2026-07-26 — A recording is a `Session` kind, not a new store; the raw webm is always kept
**Why:** recordings reuse the whole session pipeline — switcher, rename, delete-cascade, flush,
zip, copy-prompt — by adding `kind: 'recording'` + a `recording` meta field to `Session` (schemaless
store, no DB version bump; `DB_NAME` stays frozen). The webm ships in every output folder at the
user's explicit request ("Yes, always") — the agent reads frames, humans replay the video.
**Rejected:** a parallel output dir and report format (splits the paste-into-Claude flow), notes
masquerading as frames (30 keyframes ≠ 30 notes in the UI).

## 2026-07-25 — Product renamed to Gripe, but storage identifiers stay `bug-recorder`
**Why:** `DB_NAME = 'bug-recorder'` and the `'bug-recorder-project'` directory-picker id are the keys
Chrome uses to find existing data. Renaming them orphans every recorded session and every remembered
project folder on every machine that already installed it. The output directory *was* renamed
(`bug-reports/` → `gripes/`) because that only affects new writes.
**Rejected:** renaming everything (silent data loss), a migration path (not worth it pre-1.0 for a
tool with one user).

## 2026-07-25 — Notes commit themselves on silence, with "save it" as a voice escape hatch
**Why:** the product is "point and talk"; reaching for Enter between notes breaks the rhythm and is
the reason people stop recording after the second bug. A drain bar makes the pending commit visible
and any keystroke or further speech calls it off, so it never feels like it fired behind your back.
**Rejected:** Enter-only (kills the flow), a fixed short timeout with no visual (fires unexpectedly),
wake-word-only (misses when you just stop talking).

## 2026-07-25 — The element picker climbs to the "nameable" element instead of taking the literal hit
**Why:** `elementFromPoint` on a button returns the `<span>` holding its label, which produces a
useless selector and a useless screenshot crop. `refine()` climbs past presentational tags and into
interactive ancestors, bailing when the parent is more than 10× the child's area so it can't swallow
the page. `Alt`+click opts out.
**Rejected:** always literal (bad selectors), a picker UI to walk up/down the tree (too many
keystrokes for a tool whose whole pitch is speed).

## 2026-07-25 — Console/network capture via a MAIN-world injected script
**Why:** this is the sleeper feature — the report contains the `TypeError` that broke the button you
pointed at. An isolated content script cannot see the page's own `console` or patch its `fetch`, so a
small MAIN-world script is the only option. It's ~90 lines, dependency-free, and every hook is
try/caught so it can never break the host app.
**Rejected:** the `chrome.debugger` API (attaches a scary "being debugged" banner and conflicts with
devtools), scraping devtools (not accessible from an extension), doing without (halves the value).

## 2026-07-25 — Background service worker owns all state; the side panel is a pure view
**Why:** the panel is closed most of the time and hotkeys must work regardless. `captureVisibleTab`
is background-only anyway. Making the worker the sole writer means notes recorded with the panel shut
still land, and flush to disk when it next opens. The panel never mutates — it sends a `Request` and
re-pulls on the `state:changed` broadcast.
**Rejected:** state in the panel (notes lost while closed), state split across contexts (two sources
of truth, sync bugs), `chrome.storage` (can't hold image blobs at this size).

## 2026-07-25 — IndexedDB with Blobs, not `chrome.storage` and not data URLs
**Why:** a session is dozens of PNGs. `chrome.storage.local` has quota and serialization limits;
data URLs are ~33% larger than the bytes they wrap. IndexedDB also structured-clones a
`FileSystemDirectoryHandle`, which is the *only* reason "remember my project folder across browser
restarts" works at all.
**Rejected:** `chrome.storage.local` (quota, no blob support), keeping images in memory (lost on
worker teardown), a server (this tool never talks to a network).

## 2026-07-25 — Write into the user's repo via File System Access, with .zip as the fallback
**Why:** the point is to hand a *path* to a coding agent already running on that repo. A download
folder means the user has to move files before the agent can read them. The whole session folder is
rewritten after every note — it's a few KB of markdown plus images that already exist.
**Rejected:** downloads-only (extra manual step), a native messaging host (installation burden),
clipboard-only (no images).

## 2026-07-25 — `report.md` is written for a model, not a human
**Why:** the reader is Claude Code, so the file leads with an instruction preamble telling it the
images are the primary evidence, keeps every field as a labeled bullet, uses relative image paths so
the folder can be moved, and buries console noise in a `<details>`. Human skimmability is secondary.
**Rejected:** a human-first bug-report format (models wade through prose), JSON only (`notes.json`
ships alongside for that), one file per note (agents read one file better than twelve).

## 2026-07-25 — No runtime dependencies except React; ZIP writer and PNG encoder hand-rolled
**Why:** an MV3 extension is reviewed and shipped as a bundle; every dependency is supply-chain
surface and review risk. PNGs are already compressed, so a store-only ZIP is ~100 lines and loses
nothing. Generating icons as code keeps binaries out of git and the mark editable.
**Rejected:** JSZip/fflate (a dependency to emit stored entries), checked-in icon PNGs (drift), a
design tool export step (not reproducible from the repo).

## 2026-07-25 — Content script UI is hand-built DOM in a shadow root; React only in the side panel
**Why:** the content script boots on every page the user visits and must never be the slow thing or
the thing that breaks someone's app. A shadow root with `all: initial` means no page stylesheet can
reach in and nothing leaks out. The panel has none of those constraints and is a real stateful list,
so React earns its place there.
**Rejected:** React in the content script (bundle size on every page load), an `<iframe>` overlay
(can't hit-test the page underneath), styling in the page's own DOM (guaranteed collisions).

## 2026-07-25 — Two Vite builds instead of one
**Why:** MV3 content scripts can't use ESM imports at runtime, so the content script must be a
single self-contained IIFE while the panel and worker are ES modules. One config can't produce both.
The content build runs second with `emptyOutDir: false` because the main build wipes `dist/`.
**Rejected:** a single build with manual chunking (still emits ESM), `webextension-polyfill` +
webpack (a toolchain to solve a two-line problem).

## 2026-07-25 — The side panel relays E/R/D/P keys to the page
**Why:** arming from a panel button leaves keyboard focus in the panel, and Chrome gives extensions
no way to hand focus back to the page. Without the relay, the mode keys silently do nothing right
after the most common way of starting a capture. The overlay toolbar was also made genuinely
clickable for the same reason.
**Rejected:** documenting "click the page first" (the bug report writes itself), keyboard-only
arming (the panel button is the discoverable path).
