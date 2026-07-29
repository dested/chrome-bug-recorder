# Agent Report

> Status: **done** · Last updated: 2026-07-29

## What / Why

The deliverable. `report.md` is written **for a coding agent to read, not a human to skim**: an
instruction preamble, the contact sheets first, then the walkthrough as one chronological flow with the
stills that matter inlined and every other frame named.

Two properties make it more than a dump. It is **rationed** — the first agent handed a real bundle came
back saying 68 inlined keyframes for 6 spoken lines was ~100k tokens of near-identical stills, of which
four mattered (decisions.md, 2026-07-26). And since 2026-07-29 it **follows the edited axis**: every
position comes from `src/lib/timeline.ts`, the same functions the panel's timeline draws with, so
deleting a junk stretch or dragging a line to where it belongs changes the handoff directly. That loop —
edit the timeline, get a better prompt — is the point of the whole editor.

## Behavior spec

### report.md

- **Header:** `# Gripe — <name>`, then a mono counts line — `walkthrough m:ss · N keyframes · N spoken
  lines · N marked · N errors captured` (or `empty`) — plus the recorded date range and the origin. The
  range is the span the *evidence* covers, not when the gripe was last touched: a rename hours later
  must not stretch the recorded window.
- **Location:** `**This folder:** <path>` when known. Absolute paths say every image path is relative
  to it; a relative one adds "search for that directory name". The File System Access API will not tell
  us the path, so this is whatever the user typed once.
- **Preamble**, blockquoted and addressed to the model: everything is on one timeline in the order it
  happened, **the human pruned and reordered it before handing it over**, read the images, every path
  is relative, and wherever the report caps or thins something it prints the count. A second paragraph
  is added whenever there is a recording: read the contact sheets first, a full still is inlined only
  where the narration is pointing at something, **the mmss inside a filename is time within that file's
  own video** (not a position on this timeline), a spoken line covers a window rather than an instant,
  a crosshair is the mouse, and takes are laid end to end so no arithmetic is asked of the reader.
- **Video line:** every take's `rec-NN/walkthrough.webm` with its duration — the raw recording, for
  humans.
- **Caveats, in order:** interrupted takes (never presented as whole), how much to trust the transcript
  (which engine, and whether a human read it back — with a partial case for gripes where only some
  takes were confirmed), and the telemetry scope (which origin, and how many events from other tabs
  were dropped).
- **Contact sheets** — `### Contact sheets — read these first`: every take's sheets, nine keyframes
  each, **sorted by axis position** rather than by take, each labeled with the m:ss range it covers. If
  reordering has made two sheets cover the same stretch, the line says so ("ranges overlap — items were
  reordered") rather than letting "in order" quietly become a lie.
- **The ration line:** `N of M keyframes are inlined below…` naming what got a still, how silent runs
  are collapsed, and where the machine-readable copies are.
- **The flow:** `##` sections cut wherever narration goes quiet for more than 15s. Each is headed
  `## m:ss — "first words…"`, or `## m:ss — nothing said over these frames`.
  - Frames anchor it. A frame that earned a still renders as a `####` block with its m:ss, a ★ and
    "the human marked this moment" when marked, its path, the sheet it also appears on, the image, and
    a `pointer` line naming what the cursor was over.
  - Frames that didn't collapse into one line per **run**: `m:ss–m:ss — N keyframes, nothing said over
    them:` followed by the filenames. Past 6, the first 5 are named and the rest counted honestly
    (`+12 more, all on the contact sheets`). A run never crosses a take seam, because the mmss inside
    those filenames is take-local and first…last across two takes reads backwards.
  - Spoken lines land under the last frame at or before them: `> **m:ss–m:ss** text` plus
    `> ↳ about <the frames that line is pointing at>`.
  - Console/network lines land the same way: `- [level] @ m:ss message — detail`.
- **Which frames get a still:** every take's first frame and every marked frame, always; then frames
  inside a spoken window (2s before the line through 2.5s after it ends), thinned to a budget of **16
  per take** (12 when nobody narrated at all, taken as a spread — with no narration there is nothing to
  aim at). A gripe recorded in three sittings gets three times the budget, because it is three times as
  long and must not be shown a third as thickly.
- **Whether a line "claims" a frame** is position *plus* a rule: takes abut with no gap, so an unmoved
  line's window is clamped to its own take. Anything a human moved claims by position alone — that is
  what moving it meant.
- **Footer:** a `<sub>` credit line pointing at the repo and naming the machine-readable copies.
- The file is regenerated in full on every write — it is never appended to.

### The per-take files

- **`rec-NN/transcript.txt`** — `[m:ss–m:ss] line`, **take-local**, for grepping.
- **`rec-NN/recording.json`** — the take's index and dir, `interrupted`, `startedAt`, duration,
  `sampled`, the transcriber and whether it was reviewed, event scope and drop count, every frame
  (`index`, `at`, `tMs`, `file`, `reason`, `dist`, `pointer`) and every transcript window
  (`tMs`/`endMs`/`aboutFromMs`/`aboutToMs`). All times here are take-local, matching the filenames.
- **`MANIFEST.txt`** — crv-style: source, folder, recorded line, then a padded listing of every path
  with a one-line description, then each take's transcript inline. It repeats the
  filename-mmss-is-take-local warning where the `frames/` line is, because that is where someone reads
  a filename and guesses.

### Copy prompt

- Clicking **Copy prompt for Claude Code** (or `Copy prompt` in the strip) writes, with an absolute
  folder: `Read <folder>\report.md and fix what it describes. It's a gripe I recorded against the
  running app — N recordings on one timeline, in the order they happened. The images are the
  evidence — read the contact sheets first, then the timeline…`. Without one, it names the report and
  tells the agent the file opens with its own location.
- **The prompt says "recordings on one timeline", never "parts".** It is the one piece of
  user-facing text outside the UI itself, and the same copy law applies to it.
- The take count comes off the live recordings list, not `recCount`.
- The panel flashes `prompt copied — paste into Claude Code`, or
  `prompt copied — set the folder path for a clean handoff` when the absolute path is still missing.

### Export .zip

- Only rendered when no folder is connected. Assembles a store-only archive mirroring the disk layout —
  `<slug>/report.md`, `<slug>/MANIFEST.txt`, and each `<slug>/rec-NN/` with transcript, json, frames,
  grids and the webm — and hands it to `chrome.downloads.download` with `saveAs: true`.
- Both export buttons are disabled while the gripe has no recordings.

## Touchpoints

| Part | File |
| --- | --- |
| `PREAMBLE_*`, `buildReport`, `buildManifestTxt`, `buildRecordingJson`, `buildTranscriptTxt`, `agentPrompt` | `src/lib/markdown.ts` |
| Axis positions (the only source) | `src/lib/timeline.ts` |
| Time/URL/truncation helpers, `recDirName` | `src/lib/format.ts` |
| ZIP writer + CRC32 | `src/lib/zip.ts` |
| Copy/zip buttons, blob assembly | `src/sidepanel/App.tsx` |
| Writing the files | `writeRecording` / `writeSummaries` in `src/lib/fs.ts` |

## Data

Reads `Session` and `Recording[]` — no state of its own. `RecordingFrame.file` is rec-relative
(`frames/03-0125.jpg`) and the report prefixes `rec-NN/`; that pairing is the only link between the
markdown and the blobs. Contact-sheet batching (nine frames per sheet, in `meta.frames` order) must stay
in lockstep with `makeGrids`, or the report cites sheets that don't contain what it says they do.

## Edge cases

- **A take with no frames** has no contact sheets, so a spoken line inside it says "no keyframe inside
  that window" without pointing at sheets that were never written.
- **A take with no narration at all** gets a spread of 12 stills and leans on the sheets; its sections
  are headed "nothing said over these frames".
- **A moved frame** can put a later take's sheet earlier on the axis. Sheets are re-sorted by position
  and the overlap is stated.
- **An event stamped after its recorder stopped** is clamped to that take's span, so it can't drift
  into a take recorded hours later.
- **A gripe with nothing in it** prints `empty` in the counts line and still writes a valid report.
- **Markdown-special characters in spoken text** are not escaped — a line containing backticks or a `#`
  can affect rendering (rarely matters; agents read it fine).
- **Very long detail strings** are truncated to 200 characters, pointer text to 60, headings to 80.
- **Zip is store-only** — JPEGs and webm are already compressed. Nothing streams; a very long gripe
  builds the whole archive in memory.

## Open questions

- [ ] The credit link points at `https://github.com/dested/gripe` — verify that's the final repo name
      before release.
- [ ] The report has no place for the user to add overall context ("this is the checkout rewrite").
- [ ] A round of report-shape fixes is specced and unbuilt: fragment merging, text-first pointer lines,
      click/nav frame labels, zero-events honesty (`plans/2026-07-29-transcription-report-fixes.md`).

## How to verify

See `verify.md` flow **7** [cheap]. Read the produced `report.md` in a markdown previewer with the
folder in place: images must render from relative paths, the counts must match what's on disk, and the
ration line must not claim more than it shows.

The 2026-07-29 property has its own check: delete a stretch of the timeline, then reopen `report.md` and
confirm exactly that stretch is gone; drag a spoken line thirty seconds later and confirm its `##`
section moves with it and the frames it "is about" change accordingly.
