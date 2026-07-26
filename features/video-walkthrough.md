# Video Walkthrough

> Status: **done** · Last updated: 2026-07-26

## What / Why

Record your screen, talk through it, and hand your coding agent something it can actually read: a
folder of deduplicated keyframes, a timed transcript, and the console/network errors that fired —
all on one timeline. Claude can't watch video; frames are distilled *live, while it records*, and
the narration is transcribed by **on-device Whisper right after Stop** (transformers.js +
whisper-small.en in a worker — no Python, no ffmpeg, nothing to install). The pipeline shape comes
from [claude-real-video](https://github.com/HUANGCHIHHUNGLeo/claude-real-video); the dedup
sensitivity deliberately departs from it for screen content — the original, run against a real
capture, kept 1 frame of 22 (see `decisions.md`, 2026-07-26).

## Behavior spec

- When the user clicks **Record** in the panel's mode row, Chrome's `getDisplayMedia` picker opens —
  tab, window, or full screen, their choice. Refusing it flashes `screen share refused`.
- While recording, the controls strip becomes a HUD: pulsing accent dot, mono elapsed clock, live
  frame/line counts, the interim transcript line, and an inverted **Stop** button.
- The mic is acquired for real at start and its track is mixed into the webm, so the raw video
  carries the narration. **Chrome cannot show the mic prompt inside a side panel** (getUserMedia
  rejects without asking), so Record first checks `navigator.permissions`; if not granted it opens
  `micperm.html` in a tab — prompts work there, the grant sticks for the extension origin, and the
  page surfaces the real error on failure (including the macOS System Settings → Microphone case).
  Pressing Record again records regardless; if still blocked the HUD shows a clickable
  `microphone blocked — no narration this time · fix it`.
- Recordings are editable after the fact: hover-✕ deletes a keyframe (blob gone, file on disk kept,
  no renumbering — same rule as notes), clicking a transcript line edits it inline, ✕ deletes it,
  emptying a line deletes it. Every edit flips `written: false`, so report.md, MANIFEST.txt,
  recording.json, and the grids are rebuilt on disk automatically.
- Every 500ms the stream is reduced to a **64×64 RGB signature**; a frame is kept iff more than
  **8 cells changed** (a cell counts as changed when any channel moves >25) versus the closest of
  the **last 4 kept frames** — an absolute count, not a percent, so action confined to one region
  (a game canvas, a terminal pane) still registers. A-B-A tab flips don't re-capture A. No forced
  keyframes: a static screen adds nothing.
- Kept frames are stored immediately as ≤1920px-wide JPEGs named `NN-mmss.jpg` — the timestamp is in
  the filename and survives everything downstream.
- Spoken lines are stamped where the sentence *started* (first interim), not where recognition
  finalized, so speech lines up with the frame that was on screen.
- **Web Speech is only the live ticker.** After Stop, the webm's mic track is transcribed on-device:
  transformers.js + `onnx-community/whisper-small.en` (q8) in a module worker, WebGPU with wasm
  fallback (ort wasm ships in the bundle under `ort/`; the ~250MB model downloads from huggingface
  on first use and is cached by the browser). The session saves *immediately* with the Web Speech
  lines; when Whisper lands, `recording:transcript` swaps them in and flips `written: false` so
  every file on disk rewrites. Whisper failing (no mic, silence, offline first run) just leaves the
  Web Speech lines — honest wording in MANIFEST either way. A quiet status line in the recording
  view shows model download / transcription progress.
- While recording, every tab's content script forwards console/network events to the panel; each is
  woven into the timeline at its offset.
- On stop (button or Chrome's own "Stop sharing"): one final frame candidate runs through normal
  dedup, then if >150 frames survived they are **thinned uniformly** (survivors stay spread across
  the recording, timestamps intact, files renumbered).
- The session appears as a `kind: 'recording'` session named "Walkthrough" (rename like any session)
  and flushes to `gripes/<slug>/` when a folder is connected:
  `report.md` (frame-anchored timeline for the agent) · `transcript.txt` (`[m:ss] line`) ·
  `recording.json` (frames with `dist`/`reason`, transcript, events, `sampled`) · `MANIFEST.txt`
  (crv-style stats + inline transcript) · `frames/` · `grids/grid_NN.jpg` (3×3 contact sheets,
  480px cells, filename label bar) · `walkthrough.webm` (raw video, always kept).
- The panel's recording view shows duration/keyframes/lines/errors, a 3-col frame grid with mm:ss
  badges (click to expand), and the transcript.
- Copy prompt and `.zip` work exactly like note sessions; the prompt tells the agent it's reading a
  narrated recording and to look at every image in order.
- Deleting a recording session cascades its frame and video blobs; files on disk are kept.

## Touchpoints

| Part | File |
| --- | --- |
| Capture, dedup, thinning, dictation stamps | `src/sidepanel/recorder.ts` |
| Whisper pass (decode → worker → segments) | `src/sidepanel/transcribe.ts` + `transcribeWorker.ts` |
| ort wasm copy step (build) | `scripts/copy-ort.mjs` → `public/ort/` (gitignored) |
| Contact sheets (`make_grids` port) | `src/sidepanel/grids.ts` |
| Record button, HUD, recording view, flush, zip | `src/sidepanel/App.tsx` + `styles.css` |
| Timeline report, transcript, json, MANIFEST | `src/lib/markdown.ts` |
| `writeRecordingSession` | `src/lib/fs.ts` |
| Session minting, recording-active flag, event relay | `src/background/index.ts` |
| Event forwarding while recording | `src/content/index.ts` |
| `RecordingMeta` / `RecordingFrame` / `TranscriptSegment` | `src/lib/types.ts` |

## Data

`Session.kind: 'recording'` + `Session.recording: RecordingMeta` (no new IndexedDB stores, no
version bump). Blobs: `<sessionId>:frame:<index>` (JPEG) and `<sessionId>:video` (webm). The
`recordingActive` kv flag tells re-loaded tabs to keep forwarding events.

## Edge cases

- **Panel closed mid-recording** kills the recorder — the HUD lives in the panel document. Keep the
  panel open; the webm chunks captured so far are lost (v1 accepted).
- **`stop()` is idempotent** — Chrome's "Stop sharing" and the Stop button can race safely.
- **Whole-screen capture of a static IDE** correctly produces very few frames; that's the reference
  behavior (no density-floor keeps), and the webm still has everything.
- **Speech recognition unsupported/denied** → frames + telemetry only; `transcript:` line in
  MANIFEST says so honestly. Whisper also skips (no audio track to decode).
- **Whisper interrupted** (panel closed mid-pass, offline first-run download) → the Web Speech
  transcript already on disk simply stands; nothing is lost or blocked.
- **A second walkthrough recorded while a pass is still running** keeps its Web Speech lines — one
  Whisper pass at a time, no queue (v1 accepted).
- **>150 keyframes** (long scroll-heavy sessions) → uniform thinning, never a hard stop.

## Open questions

- [ ] No `--why` equivalent yet — the reference's "viewing intent" line focuses the reading agent;
      a small input at record time could feed it into MANIFEST.txt and report.md.
- [ ] Frame width is 1920 (vs the reference's 640) — right for screen text, but nobody has measured
      token cost on a really long walkthrough.

## How to verify

Build, reload the extension, connect a folder. Record ~30s: switch tabs twice (A-B-A — expect no
third capture of A), scroll once, talk through it, trigger a console error. Stop. Check
`gripes/<slug>/`: frame count sane (neither 1 nor one per 500ms — localized motion must register),
timestamps in filenames, error in the timeline, grids present, webm plays. Then wait for the
whisper status line to finish (first run downloads ~250MB) and confirm transcript.txt rewrote with
noticeably better text and MANIFEST says `Whisper small.en, on-device`.
