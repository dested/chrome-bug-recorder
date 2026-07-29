# Gripe — Verify

> How to prove the extension works. Scale to the change: [cheap] always, a flow's recipe when the
> change touches its touchpoints, [heavy] only after asking.
> Last updated: 2026-07-29.

There is no test runner, no linter, and no CI in this repo. `tsc` plus the click-paths below **are**
the test suite — which means the flow recipes matter more here than in a repo with tests.

## Commands

| What | Command | Cost |
| --- | --- | --- |
| Type-check | `npm run typecheck` | [cheap] |
| Full build | `npm run build` | [cheap] (~2s; runs icons + both vite builds) |
| Watch build (panel + worker only) | `npm run dev` | [cheap] |
| Regenerate icons | `npm run icons` | [cheap] |
| Preview harness | `npm run build && npm run preview` → `localhost:8777/gallery.html` | [cheap] |
| Reload the extension | `chrome://extensions` → reload ⟳ on Gripe | [cheap] |
| Load unpacked, first time | `chrome://extensions` → Developer mode → Load unpacked → `dist/` | [medium] |
| Wipe all recorded data | DevTools on the panel → Application → IndexedDB → delete `bug-recorder` | [heavy — ask first] |

**After any content-script change you must run the full `npm run build`** — `npm run dev` does not
rebuild `content.js`. Then reload the extension. Since 2026-07-29 you do **not** have to reload the
page under test: starting a recording revives an orphaned content script (`setRecordingActive` →
`ensureContentScript`). If drawing is dead on a tab, that revive path is what regressed.

**A rebuild wipes the harness copies out of `dist/`** — restart `npm run preview` after building or
the gallery 404s.

## Where to look when something breaks

| Context | How to inspect |
| --- | --- |
| Service worker | `chrome://extensions` → Gripe → "service worker" link → DevTools console |
| Side panel / strip | Right-click inside it → Inspect (the strip is the same page with `?pop=1`) |
| Content script | Regular page DevTools; the overlay host is `#gripe-root` (open shadow root) |
| Stored data | Panel DevTools → Application → IndexedDB → `bug-recorder` |

## Test setup

No accounts, no secrets, no network — everything is local. You need:

- Any dev app on `http://localhost:*` with something to click and a console error to trigger. A page
  that throws on click exercises the telemetry path best.
- Microphone granted **to the extension** (first Record press opens `micperm.html` in a tab).
- A scratch directory to connect as the inbox — the extension only ever writes `gripes/` inside it
  and never reads anything else.

## Critical flows

### 1. The timeline, at scale, in the harness [cheap]
Touchpoints: `src/sidepanel/Timeline.tsx`, `src/lib/timeline.ts`, `styles.css`, the harness

1. `localhost:8777/gallery.html?w=380,900,1500x400&mode=long` — the `long` seed (10:18, two takes,
   150 frames, 115 lines) is the acceptance test; `rec` is too cozy to prove anything.
2. At every shape: **zero overlapping frame thumbs** (the filmstrip is edge-to-edge cells), voice is
   solid blocks with text only in clips wide enough to hold it, no reserved empty height under the
   lanes. The `1500x400` frame runs popped: slim bar, monitor LEFT, axis filling the rest.
3. Click the ruler → playhead moves, the monitor shows the nearest frame (cells are stamped
   `take-m:ss`, so a wrong frame is obvious), and the readout under the monitor shows the line at
   the playhead.
4. Drag on the ruler → range select; the bar reads `m:ss–m:ss · N items`; **delete** removes them
   and the flash counts them. Drag a selected clip → it moves; reload the page → it stayed (the
   harness mutates its seeded IDB the way the worker mutates the real one).
5. Click a selected clip again → inline edit; a too-narrow clip routes the edit to the readout.
6. Zoom `+` until cells ≈ single keyframes; ctrl+wheel zooms under the cursor; `fit` resets.
7. The words "part", "rec", "recording 1" appear nowhere. Take boundaries are unlabeled dashed
   seams.

### 2. Record → dock → draw → stop [heavy — ask first]
Touchpoints: `src/content/index.ts`, `src/content/ui.ts`, `src/sidepanel/recorder.ts`

1. **Record** → share a tab or the screen → the dock pill appears bottom-center of the recorded
   page: `● clock · draw (d) · clear (c) · mark (m) · stop (s)`.
2. Ink is armed immediately (unless the one settings toggle is off): drag = a stroke, and every
   stroke forces a keyframe. Hold still — after ~3s the ink starts a slow ~4s fade; draw again
   mid-fade and **everything** pops back to full opacity. A bare click must not flash faded ink.
3. `d` flips to `click (d)` and hands the pointer back; ripples ring your clicks and each click
   forces a keyframe (rate-limited). `c` wipes. `m` flashes the button. `s` stops. Keys must NOT
   fire while typing in a page input, with a modifier held, or on key-repeat.
4. Navigate the SPA mid-recording → the route change forces a keyframe (`recording:force`).
5. Stop → "saved — on the timeline"; press Record again → the same gripe grows (no new session).
   Whisper runs after stop; the review nag appears until **looks right**.
6. Throw a console error in the recorded tab and another in a second tab → the report carries the
   first and counts the second as dropped.

### 3. The strip [medium]
Touchpoints: `popOut` in `App.tsx`, `strip:track`/`onBoundsChanged` in `src/background/index.ts`

1. `⧉` in the panel header → a full-width ~400px strip lands on the bottom edge of THIS browser
   window, showing slim-bar chrome + the wide timeline.
2. Move/resize the browser window → the strip follows and keeps its own height. Press `⧉` again →
   the existing strip focuses instead of a second one appearing. Close the browser window → the
   strip closes with it.
3. Record from the strip works; the dock lands on the page (know that the strip can physically
   cover the dock's spot — documented limitation).

### 4. Folder connect → write-through [medium]
Touchpoints: `src/lib/fs.ts`, the flush effect in `App.tsx`, `src/lib/markdown.ts`

1. **Choose folder** → green dot, `inbox · <path>`, the panel asks once for the absolute path.
2. Stop a recording → `gripes/<slug>/` gains `report.md`, `MANIFEST.txt`, `rec-01/`
   (`frames/`, `grids/`, `transcript.txt`, `recording.json`, `walkthrough.webm`).
3. `report.md`: the counts line, `**This folder:**` with your absolute path, contact sheets before
   the chapters, `## m:ss` headings on the ONE global clock, frame paths all `rec-NN/…`.
4. Delete a line and drag a frame on the timeline → `report.md` rewrites to match (the sanitize
   loop is the product; if edits don't reach disk, `markSessionStale`/rev-guards regressed).
5. Any leftover `notes.json` from the dead feature is scrubbed on the next rewrite.
6. Restart Chrome → path remembered; orange dot → **Reconnect** turns it green.

### 5. Sessions [cheap]
Touchpoints: session handlers in `src/background/index.ts`, `App.tsx`

1. Rename the gripe → the on-disk slug does not change (slugs freeze at creation).
2. **done** → prompt on the clipboard, folder flushed, panel empty, badge cleared. Record → a new
   gripe; the closed one didn't catch it.
3. `history · N` → closed gripes listed muted; activating one reopens it; recording appends to it.
4. `×` on a row forgets the session; the folder on disk survives.
5. Kill the panel mid-recording (close it) → reopen → "recovered an interrupted recording", the
   take is on the timeline tagged interrupted, assembled from its chunk blobs.

### 6. Export and handoff [cheap]
Touchpoints: `src/lib/zip.ts`, `agentPrompt` in `src/lib/markdown.ts`

1. **Copy prompt for Claude Code** → paste: `Read <abs path>/report.md and fix what it describes…`
   with "N recordings on one timeline" — never "parts".
2. `.zip` (only offered with no folder connected) → opens in the OS unzipper, mirrors the disk
   layout exactly.

### 7. Hostile pages don't break [medium]
Touchpoints: `src/content/index.ts` boot, `setRecordingActive` in `src/background/index.ts`

1. Record with a `chrome://` tab in front → recording still starts (unscoped); the dock appears on
   http tabs; nothing throws in the worker console.
2. A page with strict CSP loses the injected telemetry tap only — recording, dock, and ink still
   work.
3. A tab open **since before** the last extension reload still gets its dock when Record is
   pressed — the revive path. This is the regression that presents as "why can't i draw anymore".

### 8. The panel at three shapes [cheap]
Touchpoints: `styles.css`, `scripts/preview.mjs`

1. `gallery.html?w=380,560,900&mode=rec` — same design at every width, centered ≤900, no clipping
   at 380. `&mode=empty` (two-line copy), `&mode=nofolder` (**Choose folder** is the only accent
   link).
2. `w=1500x400` — full-bleed (the `--max` exception), nothing centered in a wasteful column.
3. Then look at it for real in Chrome: the harness stubs the chrome APIs, so it proves layout and
   editing logic against seeded data — never capture, permissions, or writing.
