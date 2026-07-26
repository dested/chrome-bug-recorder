# Gripe — Decisions

> Why things are the way they are. A recorded decision is settled unless the user reopens it.
> Newest first. Entries dated 2026-07-25 were backfilled on 2026-07-26 by reading the shipped code —
> the reasoning is reconstructed from the code's own comments and structure.

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
