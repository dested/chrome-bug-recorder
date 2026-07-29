# Video Walkthrough

> Status: **done** · Last updated: 2026-07-29

## What / Why

Record your screen, talk through it, and hand your coding agent something it can actually read: a
folder of deduplicated keyframes, a timed transcript, and the console/network errors that fired — all
on one timeline. **This is the whole product**; the screenshot/notes half was deleted on 2026-07-29.

Stopping and recording again does **not** start a new gripe: it appends a **take** to the same one,
laid end to end on the same clock. The word "take" is ours, not the user's — the UI shows one axis with
a seam, and `rec-NN/` exists only on disk. Editing that axis is `features/timeline.md`.

Claude can't watch video, so frames are distilled *live, while it records*, and the narration is
transcribed by **on-device Whisper right after Stop** (transformers.js + whisper-small.en in a worker —
no Python, no ffmpeg, nothing to install). The pipeline shape comes from
[claude-real-video](https://github.com/HUANGCHIHHUNGLeo/claude-real-video); the dedup sensitivity
deliberately departs from it for screen content — the original, run against a real capture, kept 1
frame of 22 (decisions.md, 2026-07-26).

## Behavior spec

### Starting and stopping

- **Record** is the panel's hero control (and a `record` pill in the strip's bar). It opens Chrome's
  `getDisplayMedia` picker: tab, window, or full screen. Refusing flashes `screen share refused` and
  nothing is created — the take is only claimed (`recording:start`) once the share is granted, and if
  that message then fails the recorder is cancelled and `recording:discard` cleans up.
- **Recording again appends a take.** `recording:start` reuses the active non-closed gripe (or mints
  one), takes `session.recCount + 1` as the take index — which names its `rec-NN/` folder — and writes
  a `Recording` in `state: 'recording'`. Stopping flashes `saved — on the timeline` and Record is
  pressable again the moment `recording:finish` returns, because back-to-back is the point. Only
  `done` closes the gripe.
- While recording, the panel's controls strip becomes a HUD: pulsing accent dot, mono elapsed clock,
  live `N frames · N lines · N marked`, the interim transcript line, and an inverted **Stop** — plus
  one faint line, `draw and stop from the little bar on the page`, shown only when the recorded tab can
  actually host that bar. Draw, clear and mark are **not** in the panel.
- **Every stop path lands in the same place.** The HUD's Stop, the dock's `stop (s)`, and Chrome's own
  "Stop sharing" bar all end at `stopRecording()`; the dock's arrives as a `recording:stop` message
  because the panel — not the worker — owns the recorder. A `stopGuard` makes the race safe.
- The mic is acquired for real at start and its track is mixed into the webm, so the raw video carries
  the narration. **Chrome cannot show the mic prompt inside a side panel** (getUserMedia rejects
  without asking), so Record first checks `navigator.permissions`; if not granted it opens
  `micperm.html` in a tab — prompts work there, the grant sticks for the extension origin, and the page
  surfaces the real error on failure (including the macOS System Settings case). Pressing Record again
  records regardless; if still blocked the HUD shows a clickable
  `microphone blocked — no narration this time · fix it`.

### The dock on the recorded page

- A glass pill bottom-center reading `[● 2:41] [draw (d)] [clear (c)] [mark (m)] [stop (s)]`, raised by
  `{ type: 'recording', active: true, origin, drawStart }` and opened only where `origin` is empty or
  equals `location.origin` — so exactly one tab gets it, and a tab that loads mid-walkthrough is told
  again and catches up (which also fires a `nav` keyframe).
- **Each button carries its key**, and those keys are handled by a window listener installed with the
  dock — never a manifest command, because Chrome silently refuses to bind bare letters. The listener
  skips when any modifier is held, on `event.repeat`, and when the event target is an
  input/textarea/select/contenteditable; `event.code` is the fallback so remapped layouts still work.
  `Esc` leaves the ink layer and is swallowed.
- Its clock is local (a tab that arrived late reads a few seconds low; invisible at mm:ss). The pill
  fades to `.35` when the cursor comes within 120px, returns to full on hover, never captures a click
  outside itself, and tears down with the recording.

### Drawing, ink that fades, and click ripples

- **Drawing is on by default.** Recording arms a live ink layer in the content script's shadow root
  when `settings.drawStart` (default **true**): a full-viewport canvas with accent freehand strokes.
- The `draw` toggle owns it. Armed, the ink holds the pointer (crosshair) and the label reads
  `click (d)`; off, the page gets its clicks back and **everything drawn stays on screen**.
- **Ink expires on its own**: one global opacity, full for 3s after the last stroke activity, then
  linear to zero over 4s, at which point the strokes are dropped. **Any new stroke restores every
  stroke on screen to full opacity** — that is what makes it cheaper than reaching for `clear`. A
  pointerdown that never moved is not a stroke and must not flash old ink back to full; mid-stroke
  drawing pins opacity at 1.
- `clear (c)` is the instant wipe, and the only one.
- Each real stroke end sends `recording:mark`, because dedup would otherwise call the drawn state the
  same screen. **The ink draws in the tab, not over other apps or `chrome://` pages** — an extension
  has no system-level overlay.
- **Clicks leave ripples.** While recording and not drawing, every `pointerdown` in the page spawns a
  brief accent ring (350ms, `pointer-events: none`) — a click is otherwise invisible in a screen
  recording. The same `pointerdown` also sends `recording:force { why: 'click' }`.

### Distillation

- Every 500ms the stream is reduced to a **64×64 RGB signature**; a frame is kept iff more than
  **8 cells changed** (a cell counts when any channel moves >25) versus the closest of the **last 4
  kept frames** — an absolute count, not a percent, so action confined to one region still registers.
  A-B-A tab flips don't re-capture A.
- **Four things force a keyframe past dedup**, and `RecordingFrame.reason` records which:
  - `mark` — the human said this moment matters. Always wins, never thinned.
  - `click` — a click in the recorded tab, **rate-limited to one per 1200ms** (a walkthrough is mostly
    clicking, and a double-click is one moment).
  - `nav` — an SPA route change (`pushState`/`replaceState`/`popstate`/`hashchange`, tapped in the
    MAIN world) or a full page load inside a live walkthrough.
  - `beat` — the screen *is* moving but has stayed under the dedup bar for more than **15s**. A
    cream-on-cream nav and a form being typed into produced a 78-second keyframe gap over the
    most-narrated stretch of a real recording; this is the fix.
- A forced sample whose changed-cell count is exactly **0** is dropped anyway: a click that changed
  literally nothing must not spend one of the 150 slots the whole walkthrough shares.
- Kept frames are stored immediately as ≤1920px-wide JPEGs named `NN-mmss.jpg`. **That mmss is time
  inside that take's own video**, not a position on the report's timeline — the report and MANIFEST
  both say so, because the two stopped matching the moment the axis became editable.
- Each kept frame carries the pointer: the selector + text of the element under the cursor, always, and
  an accent crosshair **drawn into the JPEG** when the coordinates can be mapped. `getDisplayMedia`
  never says what it handed us, so the frame's aspect ratio is the evidence — screen-shaped maps from
  `screenX/Y`, viewport-shaped from `clientX/Y`, anything else (window capture, second monitor) draws
  nothing rather than a lie.
- On stop: one final candidate runs through normal dedup, then if >150 frames survived they are
  **thinned uniformly** (marks exempt, timestamps intact, files renumbered ascending).

### Narration

- Spoken lines are stamped where the sentence *started* (first interim), not where recognition
  finalized, so speech lines up with the frame that was on screen.
- **Web Speech is only the live ticker.** After Stop the webm's mic track is transcribed on-device:
  transformers.js + `onnx-community/whisper-small.en` (q8) in a module worker, WebGPU with wasm
  fallback (ort wasm ships under `ort/`; the ~250MB model downloads from huggingface on first use and
  is cached). The take saves *immediately* with the Web Speech lines; when Whisper lands,
  `recording:transcript` swaps them in and flips `written: false` so every file rewrites. A failed or
  interrupted pass simply leaves the Web Speech lines.
- **Whisper runs off a FIFO, one model at a time.** A second take recorded while the first is still
  transcribing waits its turn instead of being dropped. The timeline reports the stage quietly; a pass
  that lands after its gripe closed flushes that take by id.
- The transcript is **not trusted until a human says so**. The timeline nags until `looks right`
  (`recording:reviewed`) and the report states, in words, whether anyone checked.

### Telemetry

- While recording, every tab's content script forwards console/network events **and pointer samples**
  (120ms throttle) to the panel, each tagged with its own origin. The recorder keeps only what came
  from the origin of the tab that was in front at Record. Dropped events are counted and reported,
  never silently discarded. No scope (a `chrome://` tab was in front) keeps everything.
- Nothing is buffered outside a recording: an event with no timeline to land on is dropped where it
  happens.

### Resilience

- **Nothing lives only in panel memory.** Every 1s MediaRecorder chunk is written to
  `<recordingId>:chunk:<n>` as it arrives, and a throttled (≥1500ms) `recording:progress` pushes the
  meta snapshot plus `mime` and chunk count to the worker — with no broadcast, since it fires
  constantly. Close the panel mid-ramble and about a second is lost, not the take.
- **An interrupted take is recovered on the next panel load.** Any recording still in `state:
  'recording'` that isn't the live recorder's is an orphan: `recording:recover` concatenates chunks
  1..n into `<id>:video`, deletes them, marks it `done` + `interrupted`, and takes the duration from
  the last kept frame. The panel says `recovered an interrupted recording`, and the report says the
  tail may be missing — it is never presented as whole. Whisper is queued for it like any other take.

### Output

- The gripe is named "Walkthrough" when a recording opens it (rename like any gripe) and flushes to
  `<inbox>/gripes/<slug>/` when a folder is connected. The gripe's own files sit at the root —
  `report.md` (the whole gripe on one axis) and `MANIFEST.txt` — and **each take owns a `rec-NN/`
  subtree**: `transcript.txt` (`[m:ss–m:ss] line`, take-local) · `recording.json` (its index and dir,
  frames with `reason`/`dist`/`pointer`, transcript windows, events, scope, `sampled`) · `frames/` ·
  `grids/grid_NN.jpg` (3×3 contact sheets, filename label bar) · `walkthrough.webm` (raw video, always
  kept). `RecordingFrame.file` stays rec-relative; the report prefixes `rec-NN/`.
- Copy prompt and `.zip` cover the **whole gripe**. The prompt counts takes off the live list (not
  `recCount`, which never decrements), carries the absolute folder path, and tells the agent to read
  the contact sheets first. The zip mirrors the disk layout, `rec-NN/` and all.
- **Recording a canvas app? Leave the debug HUD visible.** Documented in the README: coordinates and
  state flags burned into the pixels are what let a reading agent tie a frame to something greppable.
- Deleting a gripe cascades every take's frame, chunk, and video blobs; files on disk are kept.

## Touchpoints

| Part | File |
| --- | --- |
| Capture, dedup, forced keyframes, thinning, pointer + crosshair | `src/sidepanel/recorder.ts` |
| Chunk persistence + throttled `recording:progress` | `ondataavailable` / `saveProgress` in `recorder.ts` |
| Recovering an interrupted take | the recovery effect in `App.tsx` + `recording:recover` in `src/background/index.ts` |
| Whisper queue (FIFO + serial runner) | `enqueueWhisper` / `runWhisper` / `flushRecordingById` in `App.tsx` |
| Whisper pass (decode → worker → segments) | `src/sidepanel/transcribe.ts` + `transcribeWorker.ts` |
| Live dictation ticker | `src/content/speech.ts` (`Dictation`), driven from `recorder.ts` |
| ort wasm copy step (build) | `scripts/copy-ort.mjs` → `public/ort/` (gitignored) |
| Contact sheets (`make_grids` port) | `src/sidepanel/grids.ts` |
| Hero Record, HUD, flush, zip, strip bar | `src/sidepanel/App.tsx` + `styles.css` |
| Editing what was recorded | `src/sidepanel/Timeline.tsx` (see `features/timeline.md`) |
| One report for the gripe, transcript, json, MANIFEST | `src/lib/markdown.ts` |
| `writeRecording` (the `rec-NN/` tree + the gripe's summaries) | `src/lib/fs.ts` (`recDirName` in `format.ts`) |
| Take minting, recording-active flag + `recordingOrigin`, mark relay, `draw-live` relay | `src/background/index.ts` |
| Dock + its keys, ink + fade, ripples, event/pointer/nav forwarding | `src/content/index.ts` (+ `src/content/ui.ts`) |
| SPA navigation tap | `public/injected.js` (`gripe:page-nav`) |
| `Recording` / `RecordingMeta` / `RecordingFrame` / `TranscriptSegment` | `src/lib/types.ts` |

## Data

A `Recording` in the `recordings` store (`keyPath: 'id'`, index `bySession`), added in **DB v2**:
`{ id, sessionId, index, createdAt, state: 'recording' | 'done', interrupted?, mime, chunks, meta }`.
`index` is 1-based within the gripe, sourced from `Session.recCount`, and names the `rec-NN/` folder.
Blobs: `<recordingId>:frame:<index>` (JPEG), `<recordingId>:video` (webm), and
`<recordingId>:chunk:<n>` (1s webm pieces) — the chunks exist **only** while `state` is `'recording'`.
The v1→v2 migration lifts each old `kind: 'recording'` session into a take **keeping the session's id**,
so pre-0.7 frame and video blobs still resolve.

`RecordingFrame.reason` is `start | change | mark | click | nav | beat`. `meta.rev` is bumped on every
content mutation and guards the `recording:written` acknowledgement. The `recordingActive` kv flag tells
re-loaded tabs to keep forwarding events and rippling; `recordingOrigin` beside it is which tab may show
the dock, and `Settings.drawStart` rides along on the same message.

## Edge cases

- **Panel closed mid-recording** still kills the recorder — the HUD lives in the panel document — but
  no longer loses the take: chunks and the last meta push are on disk, and the next load recovers it
  as `interrupted`. Expect to lose up to the last second and the true duration.
- **`stop()` is idempotent** — Chrome's "Stop sharing", the Stop button and `stop (s)` can race safely.
- **Screen share refused** leaves nothing behind. If `recording:start` then fails, the recorder is
  cancelled and `recording:discard` removes the record and its blobs — but the take *index* is spent.
- **Recording a page that can't host the dock** (`chrome://`, the Web Store, no content script): no
  pill, no ink, no ripples, and the HUD omits its sub-line. The recording itself is unaffected.
- **A click-forced frame that changed nothing** is skipped (`dist === 0`) rather than spending a slot.
- **`settings.drawStart` changed mid-recording** doesn't reach the live dock — it is read when the
  recording starts. The `draw (d)` button is right there.
- **Typing `s` in the page's own search box** must not stop the recording; that is what the
  editable-target guard is for, and it is the first thing to re-check after touching `onDockKey`.
- **Whole-screen capture of a static IDE** correctly produces very few frames — but no longer *zero*
  over a long narrated stretch, because of the heartbeat.
- **Speech recognition unsupported/denied** → frames + telemetry only; MANIFEST says so honestly.
  Whisper also skips (no audio track to decode).
- **A second take recorded while a Whisper pass is running** waits in the queue and gets its own pass.
- **>150 keyframes** → uniform thinning, never a hard stop. Marks survive.

## Open questions

- [ ] No `--why` equivalent yet — the reference's "viewing intent" line focuses the reading agent; a
      small input at record time could feed it into MANIFEST.txt and report.md.
- [ ] Frame width is 1920 (vs the reference's 640) — right for screen text, but nobody has measured
      token cost on a really long walkthrough.
- [ ] Window captures can't place the crosshair (aspect matches neither screen nor viewport).
- [ ] `mark` stamps a frame, not a transcript line.
- [ ] Live chunked Whisper *while* recording is specced and unbuilt
      (`plans/2026-07-29-transcription-report-fixes.md`), as is a guard that stops a gripe shipping
      with a Web Speech transcript.

## How to verify

Build, reload the extension, connect the inbox folder, paste its absolute path when the panel asks.
Record ~30s. The dock should appear at the bottom of the recorded tab **and nowhere else** (check a
second tab: ripples, no pill), with the ink already armed — circle something and expect an accent
stroke plus a forced keyframe; stop drawing and watch it fade out over a few seconds; scribble again and
confirm **everything** on screen snaps back to full opacity. Press `d` (not the button) and confirm the
page takes clicks again with the strokes still on screen; press `c` and confirm they wipe; click into a
text input on the page and type `dcms` — nothing must happen. Switch tabs twice (A-B-A — expect no
third capture of A), navigate within an SPA (expect a `nav` frame), click a few times (ripples, and at
most one forced frame per 1.2s), talk through it, hit `m` mid-sentence (the button flashes, the panel
says `marked`), trigger a console error in the recorded tab **and** one in another tab. Press `s` — the
panel must stop the recorder and flash `saved — on the timeline`. **Then hit Record again immediately**
and take a short second one: the panel must stay on the same gripe and both takes must be on one axis
with a seam, not two cards.

Check `<inbox>/gripes/<slug>/`: one `report.md` at the root opening with the absolute path, contact
sheets before the flow, `##` sections headed with the words that opened them, far fewer stills than
keyframes with the count stated, the marked frame with a ★, spoken lines reading `0:23–0:31` and naming
the frames they are about, the other tab's error absent with the drop count reported, and a crosshair
drawn on the frames. Then wait for both whisper passes (first run downloads ~250MB) and confirm each
`rec-NN/transcript.txt` rewrote with noticeably better text, MANIFEST says `Whisper small.en,
on-device`, and the timeline is asking you to confirm both transcripts again.

**Resilience:** start a take, talk for ten seconds, then close the side panel outright. Reopen it — the
flash should say `recovered an interrupted recording` and `rec-NN/walkthrough.webm` should play back
everything up to about a second before the panel died.

**Inbox nesting:** point the inbox at a folder literally named `gripes` and confirm the output is
`…/gripes/<slug>/`, not `…/gripes/gripes/<slug>/`.
