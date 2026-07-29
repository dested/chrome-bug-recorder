# The Timeline (the editor)

> Status: **done** · Last updated: 2026-07-29

## What / Why

A gripe is **one time axis**, and this is the surface that edits it. Everything recorded — every
keyframe, every spoken line — sits on a single clock; you scrub it, read what you said, fix a word,
sweep a junk stretch and delete it, drag something to where it belongs. **The point is to sanitize the
prompt before it reaches the agent**: `report.md` is generated from the same positions this component
draws, so an edit here is an edit to the handoff.

It replaced a list of cards, one per recording. Two things forced that: the cards said "recording 1 /
recording 2" when the user's mental model was one continuous walkthrough, and they let you fix exactly
one line at a time. The rendering was then rebuilt a second time the same day, after a real 10:18
recording turned per-frame thumbnails into an overlapping smear — **a ten-minute walkthrough is the
normal case and an hour is allowed** (decisions.md, 2026-07-29).

The component lives in two shapes: stacked in the 380px side panel, landscape in the popped **editor
strip**. The strip is where the real work happens; the rail must stay fully functional anyway.

## Behavior spec

### The axis

- Takes (one sitting of recording) are laid **end to end in `createdAt` order with no gaps**. A take
  with no measured duration still gets 1000ms of width, or nothing inside it is reachable.
- A frame or line sits at `tl ?? span.start + t`. `tl` is written **only** when a human moves
  something; absent means "computed". `src/lib/timeline.ts` is the sole authority, and `report.md`
  reads the same functions.
- Where one take ends and the next begins, a **1px dashed seam** is drawn. No label, no number. The
  words "part", "rec 01", "recording 2" appear nowhere.
- The axis always starts at 0:00 and ends at the total; the clock under the monitor reads
  `m:ss / m:ss` on that axis, not on any take.

### The monitor

- Shows the keyframe **at or just before the playhead** (an image lookup, not a video seek — it is
  instant while dragging). With the playhead before the first frame it shows the first frame.
- Double-clicking a filmstrip cell **pins** its frame in the monitor until the next click elsewhere.
- It is the elastic member of the layout: a squeeze takes height from the picture first, so the
  lanes, the selection bar and the zoom row are the last things to give ground.

### The playhead readout

- Directly under the monitor: the transcript line covering the playhead, or the nearest one before
  it, at `--fs-md` with its mm:ss — full width, readable.
- **Clicking it opens an inline editor** for that line (commits on blur or Enter, via
  `recording:line:update` carrying the recording's current `rev`). Emptying it deletes the line.
- This is the primary way a long transcript gets read and corrected. A voice block too narrow to type
  in delegates its edit here rather than growing: clicking such a block a second time parks the
  playhead on it and opens the readout.

### Scrubbing and the ruler

- Clicking the ruler places the playhead. Dragging the ruler sweeps a **time range**.
- The `▼` knob is the grab handle; dragging it scrubs continuously and the monitor follows live.
- Ticks are mono, at the largest step from a fixed ladder (1s…20m) that keeps labels ≥56px apart.
- Ruler and tracks share one horizontal scroller, so they can never disagree about x.

### The filmstrip

- The track divides into cells of `--cell-w` (56/72/88px by breakpoint; 140px in the landscape shape).
  Each cell renders the keyframe **nearest the middle of its own time slice**, `object-fit: cover`,
  edge to edge — **no overlap and no gaps at any duration or zoom**.
- Zooming in narrows the slices until a cell is a single keyframe.
- A slice with no keyframe within reach (`max(1.5 × slice, 8s)`) renders as a faint `gap`. Nothing
  happened there, and it says so.
- Past ~300 cells only the cells near the viewport are built.
- **Clicking a cell** places the playhead at that cell's time and selects the frame it is showing.
  **Double-click** pins it in the monitor.
- **Marks** are instants, not cells: 2px accent ticks along the strip's top edge at their exact x.

### The voice lane

- Every spoken line is a block: `left = position`, `width = duration × pxPerMs` with a 2px floor
  (`d` from the transcriber, or word-count × 320ms when it gave none).
- **Text renders only when the block is ≥48px wide.** Below that it is a block and nothing else.
- The block under the playhead brightens. Selection is an accent outline, never a fill.

### Selecting

- Click a cell or a clip → select that one item and move the playhead to it.
- Ctrl/Cmd-click → add or remove one item.
- Drag on empty track space → **marquee**: everything whose box intersects it, in the lanes the
  marquee covers.
- Drag on the ruler or across cells → **time range**: every frame and line whose extent intersects
  the range, *including frames no cell is currently showing at this zoom*. The selection bar then
  reads `0:42–1:10 · 9 items`; a plain multi-select reads `9 selected`.
- A drag shorter than 3px is a click, not a sweep.
- Clicking empty space clears the selection.

### Moving, editing, deleting

- Dragging any **selected** item moves the whole selection horizontally; on drop, one `timeline:move`
  carries every item's new `tl`. `Escape` mid-drag cancels it.
- Clicking an already-single-selected clip opens it for inline editing (in the landscape shape the
  clip itself widens; in the rail the readout takes it).
- The selection bar's **delete** sends one `timeline:delete`. `Delete`/`Backspace` do the same,
  silently — the button is the advertised path.
- Frames are addressed by identity (`RecordingFrame.index`) and survive anything. Lines are array
  positions, so every batch carries `revs` (recId → `meta.rev`); if a Whisper pass replaced that
  transcript underneath, the line half is skipped and the panel says
  `the transcript changed underneath — check what remains`.
- Deleting a frame drops its blob; the JPEG already on disk is left alone and frames are never
  renumbered.
- Every mutation bumps `meta.rev`, sets `written: false`, and broadcasts — so `report.md`,
  `MANIFEST.txt`, `recording.json` and the contact sheets rewrite on disk.

### Zoom

- Fit-to-width by default. `–` / `+` step by ×1.5 (1×–64×), `fit` returns to 1× and only appears when
  zoomed. Ctrl-scroll zooms and is named nowhere.
- Zoom keeps whatever was under the cursor (or the middle) where it was.

### The two shapes

- `.tl.wide` is applied when the component's **own box** is ≥900px wide, ≥120px tall, and wider than
  2.2× its height. That is the strip, and a tab dragged to the same shape.
- Wide: the monitor moves left (`clamp(300px, 30%, 360px)`) with its clock beneath it, and the axis
  fills the rest — both lanes growing into the vertical room the rail never has.
- The box is re-measured every commit (the strips above the timeline settle over several renders while
  a gripe loads, and one observation during that is a shape that never existed) and on resize.

### Status and nagging

- While any take with words has not been read back, a banner sits above the axis:
  **"Read this back before you hand it off."** with a `looks right` button per pending take
  (`recording:reviewed`). A Whisper pass landing later resets the flag.
- While a transcription is running, one quiet mono line above the tracks reports it (`queued`,
  `reading audio…`, `transcribing narration…`, `loading model…`, `fetching whisper model — 42%`).
- With no recordings at all the component is two lines: `nothing yet` / `hit **Record** and talk
  through what's wrong`.

## Touchpoints

| Part | File |
| --- | --- |
| Position authority (`partSpans`, `totalMs`, `linePos`, `framePos`) | `src/lib/timeline.ts` |
| `tl`, `TimelineRef`, `TimelineMove` | `src/lib/types.ts` |
| `timeline:move` / `timeline:delete` (+ `revs`) | `src/lib/messages.ts` → `src/background/index.ts` |
| The component: cells, clips, drags, selection, zoom, shape | `src/sidepanel/Timeline.tsx` |
| `.tl*` styles, `--cell-w` / `--track-h` / `--ruler-h` / `--monitor-h` / `--well`, `.tl.wide` | `src/sidepanel/styles.css` |
| Frame object URLs (`recId:index` → blob URL), whisper labels, `busy` map | `src/sidepanel/App.tsx` |
| The report reading the same axis | `axisShots` / `axisLines` / `axisEvents` in `src/lib/markdown.ts` |
| The popped strip that this is really built for | `popOut` in `App.tsx` + `strip:track` in `background/index.ts` |

## Data

Nothing of its own. It reads `Recording[]` and writes two optional fields:

```ts
TranscriptSegment.tl?: number   // ms on the gripe's unified axis
RecordingFrame.tl?: number      // same; absent = computed from t
```

Both ride inside existing `meta` records — **no DB version bump**. `meta.rev` is the concurrency
token; `written: false` is what makes the folder rewrite.

## Edge cases

- **A Whisper pass lands mid-drag.** The transcript array is replaced, so positional line ops are
  refused (`stale: true`) while identity-addressed frame ops in the same batch still apply. The user
  is told; nothing is silently mis-edited.
- **A moved item leaves its take.** Allowed and meaningful — the report treats a moved line as
  claiming frames globally instead of clamping to its own take, and contact sheets are re-sorted by
  axis position with an explicit "(ranges overlap — items were reordered)" note when that reordering
  makes two sheets cover the same stretch.
- **A take with no frames** contributes a span and its transcript, and the filmstrip is simply not
  rendered when nothing anywhere has frames.
- **A recording still in `state: 'recording'`** has a growing meta; the timeline redraws on each
  broadcast, but progress pushes deliberately do not broadcast, so it updates on real events only.
- **Zero-duration take** gets `MIN_SPAN_MS` (1000ms) of width so its contents are reachable.
- **150 frames at fit zoom in a 380px rail** is ~6 cells of screen per second of footage — the strip
  is coarse, not broken, and zoom is the answer. This is exactly the case `mode=long` exists to check.
- **Two autofocused inputs** (a clip and the readout usually cover the same line) would blur each
  other shut, so `editing` records both the key *and* which surface opened it.
- **`pointerdown`'s focus default** would blur an input as it mounts, which is why clip editing calls
  `preventDefault()` and the readout opens on `click`, not `pointerdown`.

## Open questions

- [ ] The monitor scrubs by keyframe, not video. Playing the actual webm (per-take `<video>`, paused
      at the take end) was specced as a stretch and did not land.
- [ ] No undo. Delete is immediate and the only recovery is the raw `walkthrough.webm`.
- [ ] No way to move an item between gripes, or to split one gripe into two.
- [ ] Marks can't be added after the fact, only during recording.
- [ ] Events (console/network) are on the report's axis but have no lane in the UI.

## How to verify

`npm run build && npm run preview`, then
`localhost:8777/gallery.html?w=380,560,900&mode=long` and
`localhost:8777/gallery.html?w=1500x400&mode=long`.

On the 10:18 seed: the filmstrip must be an unbroken strip of thumbnails with **no overlapping tiles
at any zoom**, voice must be blocks with text only on the wide ones, and the 1500×400 shape must put
the monitor on the left and use the **whole** width (no centered 900px column). Then, in the real
extension: scrub with the ruler and watch the monitor follow; click the readout and fix a word; sweep a
range on the ruler and confirm the bar reads `m:ss–m:ss · N items`; delete it and confirm `report.md`
loses exactly that stretch; drag a line 30 seconds later and confirm the report's `##` heading moves
with it.
