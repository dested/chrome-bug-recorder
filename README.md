<div align="center">

<!-- NOTE: this artwork still depicts the deleted element-picker/composer product and needs redrawing. -->
<img src="docs/hero.svg" alt="Gripe: a walkthrough being recorded — the on-page toolbar and ink over the running app, and the side panel's timeline of keyframes and narration" width="900">

# Gripe

**Record what's broken. Talk through it. Hand the folder to your coding agent.**

</div>

---

Your agent just built the feature. Now you're clicking through it and a dozen things are
subtly off — this button does nothing the second time, that column drifts, this list
should be sorted. Typing all that into a chat window is slow and lossy, and you've
forgotten the first one by the time you hit the third.

Gripe turns it into a stream of consciousness:

> **Record → talk through it → circle the broken bit → stop.**

No writing it up, no screenshot tool, no describing where the button is. You get a folder
in your repo holding the keyframes, a timed transcript of what you said, the mouse pointer
on every frame, and whatever the console threw while you were talking.

Then you **edit it** — because the first take is a ramble and the agent should get the
sanitized version. Pop the editor out along the bottom of the window, scrub the timeline,
fix a word the transcription got wrong, sweep the two minutes where you were reading
documentation and delete them. What you cut is cut from the report.

## The output

```
your-inbox/
└─ gripes/
   └─ 2026-07-29-1432-checkout-flow/
      ├─ report.md            ← hand this to your agent
      ├─ MANIFEST.txt         ← every file, with a line saying what it is
      ├─ rec-01/
      │  ├─ grids/grid_01.jpg     ← 9 keyframes per sheet, the whole run, cheap to read
      │  ├─ frames/23-0106.jpg    ← the timestamp is in the filename
      │  ├─ transcript.txt · recording.json
      │  └─ walkthrough.webm      ← the raw video, for you
      └─ rec-02/                  ← you stopped, thought, and kept going
```

One gripe is **one timeline**, however many sittings it took. The `rec-NN/` folders are a
disk layout; nothing in the app ever says "part 2".

`report.md` is written for a model to read, not a human to skim:

```markdown
# Gripe — Checkout flow

`walkthrough 4:12` · `86 keyframes` · `14 spoken lines` · `2 marked` · `3 errors captured`

**This folder:** `G:\code\gripes\2026-07-29-1432-checkout-flow` — every image path below is relative to it.

### Contact sheets — read these first

![contact sheet 1 of 10 — 0:00–0:44](rec-01/grids/grid_01.jpg)

## 1:04 — "place order does nothing the second time"

#### ★ 1:06 · the human marked this moment · `rec-01/frames/23-0106.jpg`

![keyframe at 1:06](rec-01/frames/23-0106.jpg)

- **pointer** `#submit` — "Place order"

> **1:04–1:09** place order does nothing the second time
> ↳ about 3 frames, 1:04–1:09 — `rec-01/frames/22-0104.jpg` … `rec-01/frames/24-0109.jpg`

- `[error] @ 1:07` TypeError: Cannot read properties of undefined (reading 'id')
```

Two things are doing the work there. The **contact sheets** give the model the whole
recording for a fraction of the tokens, so full stills are inlined only where you were
actually saying something about them — every other frame is named, never dropped, and the
report prints the count so a subset never reads as full coverage. And that last line is the
sleeper feature: you complain about a button, and the report already contains the
`TypeError` that broke it.

Then you paste the line the panel put on your clipboard:

> Read G:\code\gripes\2026-07-29-1432-checkout-flow\report.md and fix what it describes.
> It's a gripe I recorded against the running app — 2 walkthrough parts, in the order they
> happened. The images are the evidence — read each part's contact sheets before its
> timeline, look at every screenshot, and where the words and the frames disagree, believe
> the frames.

## Install

```bash
npm install && npm run build
```

`chrome://extensions` → **Developer mode** → **Load unpacked** → pick `dist/`. Click the
icon to open the side panel, hit **Choose folder**, pick where gripes should land — your
repo, or one folder for all of them. Done: Chrome remembers it across restarts.

It then asks you to paste that folder's absolute path, once. Chrome refuses to tell an
extension where a picked folder actually lives, and an agent that can't resolve the path
burns half a dozen tool calls hunting for the report. Every report opens with the answer.

Not connecting a folder is fine too; **.zip** in the footer downloads the same thing.

The first time you hit Record, Gripe opens a tab to ask for the microphone — a Chrome side
panel can't show that prompt itself. Grant it there and it sticks.

## Recording

**Record** shares your screen (tab, window, or the whole thing — your choice) and just
listens. While it runs, the controls are on the page rather than in the panel, because
that's where you're looking: a small bar at the bottom of the tab you're recording.

Keyframes are kept whenever the screen actually changes — plus whenever you click,
whenever the app navigates, and every 15 seconds if the screen is drifting too slowly to
notice. **Drawing is on from the start**: scribble a circle round the broken thing and the
strokes are captured because they're on screen. They fade out on their own after a few
seconds; draw again and everything comes back to full.

Stop, and it saves immediately. Record again and it keeps going on the same timeline — only
**done** ends a gripe. The narration is re-transcribed on-device by Whisper right after you
stop (the live captions are just a ticker), which is why the panel then asks you to read it
back before you hand it over.

Three things worth knowing:

- **`mark (m)` stamps the moment you're talking about.** Marked frames are never thinned and
  always land in the report with a ★.
- **Check the transcript before you hand it off.** The editor nags until you confirm it, and
  the report tells the agent whether a human read it back — speech recognition eats exactly
  the words that matter ("one tile" → "one pixel" is a 16× bug report).
- **Recording a canvas or game?** Leave your debug HUD on screen. Coordinates, state flags,
  and frame counters burned into the pixels are worth more to the reading agent than the art
  is — it's how frames get tied to something it can grep for.

## The timeline

Everything you recorded sits on one axis: a filmstrip of keyframes, a lane of what you said,
and a monitor showing whatever's under the playhead. It works in the side panel, but a
timeline wants width — hit **⧉** in the header and the editor opens as a strip across the
bottom of your browser window, DevTools-style, following it when you move or resize.

- **Scrub** the ruler or click any frame in the strip; the monitor follows instantly.
- **Read and fix** the line under the monitor — click it, type, done. That's how you correct
  a mangled word without hunting for it.
- **Sweep a range** on the ruler to grab a stretch, or drag a box over the lanes. Then
  **delete** — and it's gone from `report.md` too.
- **Drag** anything selected to move it; ctrl-click to add to a selection; double-click a
  frame to park it in the monitor; `–` / `+` / `fit` to zoom.

Editing here is the point. The report is generated from these positions, so the timeline is
where you decide what your agent is going to read.

## Closing a gripe

**done** in the footer ends one: everything hits disk, the prompt lands on your clipboard,
and the panel goes blank. The next recording opens a fresh gripe. Old ones stay in the
history list, tagged `closed` — click one to reopen it and add to it.

## Controls

Everything you need while recording is on the page, and every button says its own key:

| | |
| --- | --- |
| `draw (d)` ⇄ `click (d)` | Hand the pointer to the ink, or give it back to the page |
| `clear (c)` | Wipe the strokes now — they also fade on their own |
| `mark (m)` | Mark this moment |
| `stop (s)` | Stop recording |
| `Esc` | Drop out of drawing; what you drew stays on screen |

Two global shortcuts exist as well, for when the tab isn't focused: `Alt+Shift+M` marks and
`Alt+Shift+D` toggles drawing. Rebind them at `chrome://extensions/shortcuts`. That's the
whole list — nothing in Gripe is reachable only from the keyboard.

## Sessions

Every gripe is kept. **history · N** next to the name opens the list — pick one and it
becomes active again; a closed one reopens by being picked, and new recordings append to it
with `report.md` rewritten in place. If the panel dies mid-recording, the take is reassembled
from what was already on disk the next time you open it, tagged `interrupted`, and the report
says the tail may be missing rather than pretending it's whole.

## How it works

```
content script ──┬─ shadow-DOM overlay: the dock, the ink canvas, click ripples
                 ├─ d / c / m / s while the dock is up
                 └─ forwards console + network events, the pointer, and navigations
        │  chrome.runtime
        ▼
background SW ───┬─ two hotkeys, reach into every tab, re-pinning the editor strip
                 └─ IndexedDB: sessions, recordings, frame/video blobs
        │
        ▼
side panel ──────┬─ React view over that state — and the timeline that edits it
                 ├─ owns the recorder: getDisplayMedia, dedup, Whisper
                 └─ File System Access: writes straight into your repo
```

The page's own `console.error`, `fetch`, and `XHR` are tapped by a small MAIN-world script
that forwards events over `postMessage`; the same script reports SPA route changes, which is
how a navigation that repaints one pale page into another still gets a keyframe. Events are
scoped to the tab you were recording, and anything dropped is counted in the report rather
than silently binned.

No runtime dependencies but React and transformers.js (the on-device Whisper). The ZIP
writer, the PNG icon generator, and the contact-sheet builder are all hand-rolled.

## Known edges

- Won't run on `chrome://` pages, the Web Store, or other extensions — Chrome forbids
  content scripts there. Recording still works; you just get no toolbar, no ink, and no
  console capture on those pages.
- **The ink draws in the tab, not over your desktop.** An extension has no system-level
  overlay, so you can't annotate your editor or another window — only the page you're on.
- The mic is granted to the extension, not per site, which is why the permission page opens
  in a tab. Whisper's model (~250MB) downloads on first use and is cached by the browser.
- The editor strip is a popup window, so another window can cover it. It follows the browser
  window it was opened from and closes with it.
- Deleting something from the timeline rewrites the report but leaves the original
  `walkthrough.webm` untouched — there's no undo, but nothing is truly lost either.
- `gripes/` is yours to gitignore or commit. Nothing else in the folder you connect is ever
  touched.

## Develop

```bash
npm run dev        # vite --watch; note it does NOT rebuild the content script
npm run typecheck
npm run preview    # after a build: the panel at any size, chrome APIs stubbed
```

`npm run preview` serves `localhost:8777/gallery.html?w=380,560,900&mode=rec`. Modes are
`rec | long | empty | nofolder`; a `w` token can be a width or a shape (`1500x400`, which
renders the popped editor strip). Check anything timeline-shaped against `mode=long` — ten
minutes of footage, which is what a real one looks like.

MIT.
