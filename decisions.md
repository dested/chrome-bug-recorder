# Gripe — Decisions

> Why things are the way they are. A recorded decision is settled unless the user reopens it.
> Newest first. Entries dated 2026-07-25 were backfilled on 2026-07-26 by reading the shipped code —
> the reasoning is reconstructed from the code's own comments and structure.

## 2026-07-29 — The screenshot/notes half of the product is deleted; Gripe is recording-only
**Why:** Sal, verbatim: *"there are no screenshot at a time view anymore. just recording. get rid of
anythign related to that. its a dead feature."* Notes were the original product and recordings were
the addition, but the addition ate it: a walkthrough carries the click, the narration, the errors and
the pointer, and a note carries one still and a sentence. Keeping both meant two capture paths, two
report shapes, two preamble blocks, an aim overlay with four modes, a composer with dictation and
auto-commit, and five settings that only made sense to whoever wrote them (*"idk wtf any of thoes
settings mean. the fuck does stay armed mean"*). All of it is gone: capture modes, the aim chip and
its four mode buttons, the composer and `SEND_PHRASES`, `capture:visible`, every `note:*` message,
`arm`/`disarm` and the two `arm-*` manifest commands, `Note`/`NoteDraft`/`CaptureMode`/`Rect`/
`TargetInfo`/`Viewport`, `Session.noteCount`, `notes.json` and its builder, the notes lane in the
timeline, and `autoDictate`/`autoSend`/`autoSendMs`/`spotlight`/`chain`. **`Settings` is now
`{ drawStart, lang }` — one visible switch.** `features/capture-modes.md` and `features/voice-notes.md`
were deleted with the code; this entry is their tombstone.
**Rejected:** keeping notes behind a setting (the complaint was the concept, and a second capture path
is a second everything); a DB migration that drops the `notes` store (the store and its rows are
harmless, and dropping them means a version bump and an upgrade path for data nobody will read — the
store stays, unused, and old rows are simply ignored); leaving `notes.json` on disk in existing gripe
folders (a stale one goes on describing a dead feature to the reading agent, so `writeSummaries`
deletes it on every rewrite).

## 2026-07-29 — A gripe is ONE timeline: takes are invisible, `tl` is the human's override, and the report follows the edited axis
**Why:** Sal, verbatim: *"no more of this recording 1 recordfing 2 like its just a timeline… redesign
the ui to look like a timeline view like after effects, wtih teh transcripts and images at the right
points, scrobble etc. click, delete, edit, etc. bulk grab them and move them around, dleete section,
etc. **the whole idae is to sanatize the prompt we send to claude.**"* That last sentence is the
decision. The report is the product, and the report is only as good as what is in it; a card list lets
you fix one line at a time, but sanitizing a five-minute ramble needs an editor. So takes are laid
**end to end on one clock** in `createdAt` order with no gaps (`src/lib/timeline.ts` is the only place
a position may be computed), the seam is a 1px dashed line with no label, and the words "part", "rec",
"recording 2" are banned from UI copy — `rec-NN/` survives on disk, where nobody is looking. Moving
something writes `tl` on that frame or line: an explicit position on the unified axis, absent by
default, present only when a human dragged it. **The report reads the same positions**, so a deleted
stretch and a dragged line change what the agent gets — that is the whole loop. Bulk `timeline:move`
/ `timeline:delete` do it in one write per recording, guarded by `revs`: frames are addressed by
identity and survive anything, lines are array positions and a Whisper pass replaces the whole array,
so a stale line op is skipped and the UI says so rather than editing somebody else's words.
**Rejected:** per-take axes side by side (that is "recording 1 / recording 2" with extra steps, and it
is the thing being deleted); rewriting `t` in place when something moves (it is the take-local
timestamp the filenames, `transcript.txt` and `recording.json` are all built from — an override
alongside it keeps the raw recording truthful and the edit reversible by deleting one field); a
separate "edited report" file (two artifacts means two things to paste and one of them is always
stale); letting an unmoved line's frame-claiming window cross a seam (takes abut, so it would claim
frames recorded hours later — unmoved windows clamp to their own take, moved ones claim globally,
because a human placing something is the strongest signal in the file).

## 2026-07-29 — The frames lane is a filmstrip of fixed-width cells, not one thumbnail per keyframe
**Why:** Sal, watching v1 render a real 10:18 recording: *"these videos could be an hour long. this ui
is terrible. i cannot go to market with this."* He was right, and the cause was structural rather than
cosmetic: absolutely-positioned fixed-size thumbnails at fit zoom pack 150 frames into 900px, so every
tile overlaps its neighbours into a card-deck smear, and duration-scaled voice pills shrink to
unreadable fragments. Any layout that gives each item a fixed size fails at some duration; the only
question is which. So the track divides into `--cell-w`-wide **cells** and each cell renders the
keyframe nearest the middle of its own time slice, `object-fit: cover`, edge to edge — no overlap at
any duration and any zoom, and zooming in refines the slices until a cell is one keyframe. Cells with
no keyframe within reach render as a visible gap, which is honest: nothing happened there. Past ~300
cells only the ones near the viewport are built. Voice became blocks whose width is duration, with
text rendered **only at ≥48px wide**, and the words moved to a full-width **playhead readout** under
the monitor — scrub, read, click, fix. Marks are instants, so they became ticks on the strip's top
edge rather than a property of a cell.
**Rejected:** virtualizing the old thumbnails (the overlap is at fit zoom, where virtualization saves
nothing); a fixed thumbnail count with "+N more" (an hour of screen recording is exactly the case
where you need to see the shape of it); making the track scroll horizontally by default instead of
fitting (fit-to-width is how you find the junk stretch you came to delete); text inside every clip at
any width (a 6px block with three ellipsised characters is noise, and the readout does the job better).

## 2026-07-29 — The editor is a popup window pinned to the bottom of the browser, not a side panel
**Why:** Sal: *"what if the timeline view was at the bottom? like you open up the plugin along the wide
axis and put everything in there."* A timeline is a wide object and the side panel is a 380px rail;
`chrome.sidePanel` is side-only, with no API to dock anywhere else. So `⧉` opens the same document
(`sidepanel.html?pop=1`) as a `type: 'popup'` window positioned over the bottom edge of the current
browser window, and the worker keeps it there — `strip:track` stores `{stripId, parentId}`,
`windows.onBoundsChanged` re-pins it on every parent move/resize (keeping whatever height the user
dragged), `onRemoved` closes it with its parent. It is DevTools-docked-to-bottom in feel; it is still a
popup, so it can be occluded, and that is accepted. This splits the product's two jobs cleanly: **the
side panel is the capture remote** (Record, the inbox, the prompt, done) and **the strip is the
editor**. Same page, same IndexedDB, no new state — `?pop=1` swaps the panel chrome for one slim bar
and `.tl` notices its own box is landscape and moves the monitor to the left.
**Rejected:** a content-script overlay docked inside the page (it would be captured by the recording it
exists to edit, and it dies on `chrome://` pages and the Web Store); a full-window tab for editing
(loses the app you are griping about, which is the thing you are scrubbing against); making the side
panel wider (Chrome decides that, not us); two components for two shapes (the rail must stay a
functional editor — the strip is comfort, not a requirement).

## 2026-07-29 — `--max` goes full-bleed for wide-and-short windows
**Why:** 0.6 capped the content column at 900px and centered it, because a full-bleed 1200px row of
10.5px metadata was the bug that started the token scale. The dock strip breaks that rule's premise: at
1500×400 a 900px centered column leaves 600px of empty canvas beside the editor, which costs the strip
half its usable width for a rule that exists to stop *tall* windows looking sparse. So one media query,
`(min-width: 1000px) and (max-height: 560px)`, returns `--max` to `100%`. Keying it on the shape rather
than adding a class means the rail and a normal tab can never accidentally opt in — neither is ever
that short.
**Rejected:** a `.pop` class overriding `--max` (the strip is a shape, and a tab dragged to 1500×400
deserves the same treatment); dropping the cap entirely (it is still right for the 1200px tab, which is
what it was written for); letting `.tl` opt out of the cap alone (the header and the bar would then be
narrower than the thing under them, which reads as a rendering bug).

## 2026-07-29 — Keyboard shortcuts come back, but only as labels on the on-page dock
**Why:** Sal, verbatim: *"i want shortcuts on draw clear mark stop so it should say like draw (d) etc."*
This **amends** the 2026-07-28 law ("zero keyboard anywhere in the UI"), and the amendment is precise:
that law was written against a panel that *taught itself with `<kbd>` chips* and hid features behind
bindings the user had to go find. A key printed on the button it fires is the opposite — it is a label,
it costs no discoverability, and it is at the exact place the eyes already are. So the dock reads
`draw (d) · clear (c) · mark (m) · stop (s)` and the **panel and strip stay entirely shortcut-free**.
The keys are handled by a window listener the content script installs with the dock, because
**Chrome silently refuses to bind bare letters to manifest commands** — that is the hard-learned part,
and it is why this can never be tidied into `manifest.json`. Guards came with it: any modifier held,
`event.repeat`, or an editable target (input/textarea/select/contenteditable, via `composedPath`) skips
the handler, with `event.code` as a layout fallback so a cyrillic or dvorak keyboard still works.
Typing `s` in the host page's search box must never stop the recording.
**Rejected:** manifest commands with modifiers (`Alt+Shift+D` already exists for draw and nobody uses
it — that is the evidence that a binding you have to discover is a feature nobody has); a tooltip
carrying the key (a `title` may reward a hover, it may never be where the instruction lives); putting
the keys in the panel too (the panel is not where your hands are during a walkthrough, and law 6 stands).

## 2026-07-28 — The panel is five things, and the controls moved onto the page
**Why:** Sal, verbatim: *"Redo the ui. I hate it. It has 50 buttons that don't make sense. Make
drawing default on and I can turn it off. No more shortcuts at all. My users are not smart."* The
count was close to literal, and every one of them had been justified on its own. The deeper change is
the last sentence: this stopped being a tool its author uses and became a product with **users who
will never read a tooltip, a README, or a `chrome://extensions/shortcuts` page**. Density and
keyboard-first flows were what failed — a panel that teaches itself with `<kbd>` chips teaches nobody,
and a feature reachable only by hotkey is a feature that does not exist. So: **the panel is five
things** — Record, point at something, the timeline, Copy prompt, done — and everything else was
deleted, folded behind one `settings` disclosure, or moved onto the page. One secondary capture entry
(`point at something broken`); region/draw/page live on the page's own hint chip as plain word
buttons, because by then the user is already looking at the page. `.zip` appears only when there is no
folder to write into. **Drawing is on by default** (`Settings.drawStart`, default `true`) and the
recording controls sit on the page in a floating pill — clock · draw/click · clear · mark · stop —
scoped to the recorded tab by the `recordingOrigin` kv; the panel HUD shrinks to status plus Stop and
one line saying where the rest went. **Zero shortcut mentions anywhere**: no `<kbd>` in either
stylesheet, no key names in copy, no `chrome.commands.getAll` lookup, no "set one" link, and the
overlay's `esc` chip became a `✕` button. The four manifest commands and the in-page `e/r/d/p`, `c`
and `Esc` keys stay wired and silent, for whoever already learned them.
**Rejected:** keyboard-first flows in general (correct for an expert tool, wrong for this one — the
keyboard is now a shortcut in the literal sense: a faster path to something already clickable); the
four-mode row in the panel (the page's aim chip already offers all four at the moment they're
relevant, and having both is the fifty-buttons problem in miniature); drawing behind a hotkey (that
is how it shipped in the rethink hours earlier, and it made a real feature dead to anyone who doesn't
read docs — this reverses that part of the 2026-07-28 live-drawing decision below, and only that
part); deleting the `.zip` fallback outright (it is the entire no-File-System-Access path, so it stays
— just conditional, invisible to anyone with a folder connected).

## 2026-07-28 — A gripe is a container of parts — recording again appends, and `kind: 'recording'` dies
**Why:** Sal recorded a walkthrough, stopped, hit Record again — and the panel switched to a
brand-new gripe. Part 1 looked destroyed. That is `stopRecording` → `recording:add` minting a session
per recording, and it is the direct consequence of the 2026-07-26 decision below ("a recording is a
`Session` kind"). The deeper problem is that one-recording-per-gripe splits the handoff: a five-minute
ramble in three takes became three folders, three `report.md`s, and three prompts to paste, when the
agent wants one. So a **gripe is now a container**: `recording:start` reuses the open session and takes
`session.recCount + 1` as the part index, notes and parts interleave by `createdAt` in one timeline and
one report, and only `done` closes a gripe. **This partially reverses "a recording is a `Session` kind,
not a new store"** — the store exists now (`recordings`, indexed `bySession`), `Session` loses `kind`
and `recording` and gains `recCount`, and `DB_NAME` finally takes a version bump to 2. The migration
lifts every old walkthrough session into a part of itself **keeping the session's id as the recording
id**, which is what makes every `<id>:frame:<n>` and `<id>:video` blob already on disk still resolve —
it reads like a copy-paste bug and it is load-bearing. What survives from the old decision is its real
insight: parts still reuse the whole session pipeline (switcher, rename, delete-cascade, flush, zip,
copy-prompt), and the raw webm is still always kept.
**Rejected:** pause/resume on one recording instead of parts (floated, and Sal chose parts — pausing
gives you one video with invisible seams; parts give you a report that says "Part 2" where he stopped
to think, which is information); renumbering parts when one is deleted (same rule as notes: `recCount`
only ever climbs, deleting part 2 leaves `rec-01`/`rec-03` and the report says so — renumbering would
invalidate paths in a report an agent may already be reading).

## 2026-07-28 — The one folder is a global gripe inbox, and the prompt carries an absolute path
**Why:** "the whole folder flow sucks", and underneath it: *"i have no idea where im going to go…
every time i go searching."* The 0.6 decision below got the count right (one folder) but kept framing
it as **the repo you're in** — and the cost it explicitly accepted, "re-picking a folder when you
change repos", is exactly what Sal hit, over and over, because this tool is how he reports bugs across
every project he has. So the framing changes, **amending the 2026-07-26 one-folder decision with Sal's
explicit sanction**: the one folder is a *global inbox*. Gripes land there no matter which app you were
ranting at, you pick it once, you type its absolute path once, and every prompt is a complete
instruction from any repo — `Read G:\code\gripes\<slug>\report.md and fix what it describes.` Nothing
about the storage changed (`projectDir`/`projectPath` are frozen identifiers, zero migration); what
changed is that the panel calls it the inbox, the empty state says `no inbox yet — gripes have nowhere
to land`, and the absolute path stopped being a nicety for the report header and became the mechanism.
One rule fell out of it: point the inbox at a folder already called `gripes` and the `gripes/` level is
skipped, because `G:\code\gripes\gripes\<slug>` is nobody's idea of a path.
**Rejected:** a native-messaging daemon that could hand the agent a real path (installation burden on
every machine, to learn one string the user can type in four seconds); a per-project folder list (that
is 0.5, it shipped, it was hated on sight, and it was reverted the same day — see below); auto-deriving
the absolute path from the directory handle (the File System Access API does not expose it, by design,
and this is the third decision to say so).

## 2026-07-28 — Live drawing and click ripples happen in the tab; recorder resilience happens in IndexedDB
**Why:** "I should be able to draw while recording." Drawing *anywhere on screen* is not a thing a
Chrome extension can do — there is no system-level overlay — so the honest version is an ink layer
inside the page: a full-viewport canvas in the content script's shadow root, `Alt+Shift+D` to toggle,
`c` to clear, `Esc` to leave. It is captured for exactly one reason, which is that it is on screen.
Because the drawn state would otherwise read as "the same screen" to a 64×64 dedup, every stroke end
sends `recording:mark` and force-marks a keyframe — a circle around the broken thing is worth more
than the frame it's drawn on. The same logic produced click ripples: a click leaves no trace in a
screen recording (the cursor doesn't even render in some capture paths), so every `pointerdown` while
recording spawns a 350ms accent ring. Neither touches the capture pipeline. The resilience half is the
same instinct pointed at the other failure Sal could hit: the recorder lived in panel memory until
Stop, so closing the panel mid-ramble lost everything. Now every 1s webm chunk is written to
`<id>:chunk:<n>` as it arrives and a throttled (≥1500ms) `recording:progress` pushes the meta to the
worker, so a dead panel costs about a second; the next load finds the orphaned part, reassembles it,
and tags it `interrupted` rather than pretending it is whole. Whisper became a FIFO in the same pass —
back-to-back parts made the old single-slot guard silently drop the second transcript.
**Rejected:** a system-level overlay app for real screen-wide drawing (that is not a Chrome extension
anymore, and the install burden buys one gesture); OffscreenCanvas or a worker to keep recording alive
without the panel (MediaRecorder has to live where `getDisplayMedia` was granted, which is the panel
document — chunks in IndexedDB are the achievable 95%); broadcasting on `recording:progress` (it fires
every couple of seconds and the panel already holds the live meta — a re-render per push would be a
performance bug written into the protocol).

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
