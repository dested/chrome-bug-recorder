# Gripe — Verify

> How to prove the extension works. Scale to the change: [cheap] always, a flow's recipe when the
> change touches its touchpoints, [heavy] only after asking.
> Last updated: 2026-07-26.

There is no test runner, no linter, and no CI in this repo. `tsc` plus the click-paths below **are**
the test suite — which means the flow recipes matter more here than in a repo with tests.

## Commands

| What | Command | Cost |
| --- | --- | --- |
| Type-check | `npm run typecheck` | [cheap] |
| Full build | `npm run build` | [cheap] (~2s; runs icons + both vite builds) |
| Watch build (panel + worker only) | `npm run dev` | [cheap] |
| Regenerate icons | `npm run icons` | [cheap] |
| Reload the extension | `chrome://extensions` → reload ⟳ on Gripe | [cheap] |
| Load unpacked, first time | `chrome://extensions` → Developer mode → Load unpacked → `dist/` | [medium] |
| Wipe all recorded data | DevTools on the panel → Application → IndexedDB → delete `bug-recorder` | [heavy — ask first] |

**After any content-script change you must run the full `npm run build`** — `npm run dev` does not
rebuild `content.js`. Then reload the extension **and reload the page under test**; a stale content
script is the single most common false failure here.

## Where to look when something breaks

| Context | How to inspect |
| --- | --- |
| Service worker | `chrome://extensions` → Gripe → "service worker" link → DevTools console |
| Side panel | Right-click inside the panel → Inspect |
| Content script | Regular page DevTools; the overlay host is `#gripe-root` (open shadow root) |
| Stored data | Panel DevTools → Application → IndexedDB → `bug-recorder` |

## Test setup

No accounts, no secrets, no network — everything is local. You need:

- Any dev app on `http://localhost:*` with a button and a console error to point at. A page that
  throws on click exercises the telemetry path best.
- Microphone permission granted **on that origin** (Chrome prompts per site).
- A scratch directory to connect as the "project folder" — the extension only ever writes
  `gripes/` inside it and never reads anything else.

## Critical flows

### 1. Point → talk → note lands [cheap]
Touchpoints: `src/content/index.ts`, `src/content/ui.ts`, `src/content/capture.ts`,
`src/background/index.ts`

1. Open the dev page, click the toolbar icon to open the panel.
2. Press `Alt+Shift+B` → expect the hint chip top-center with a pulsing dot and "Click what's wrong".
3. Hover a button → expect the accent box to track it and the tag to show a plausible selector
   (a `#id` or `[data-testid]` if one exists, not a bare `span`).
4. Click it → expect the composer at the bottom, the selector in its meta line, the mic pulsing.
5. Say a sentence, stop talking → expect the drain bar, then "Note 1 saved" + a filename toast.
6. Panel shows the note with a thumbnail, the selector, and the time.

### 2. Voice commit and cancel [cheap]
Touchpoints: `src/content/speech.ts`, `scheduleAutoSend`/`SEND_PHRASES`

1. Arm, pick something, say "the header is misaligned, save it" → commits immediately, and the
   saved text does **not** contain "save it".
2. Arm again, talk, and start typing while the drain bar is running → expect the bar to disappear
   and nothing to commit.
3. `Ctrl+Space` → mic stops pulsing; `Ctrl+Space` again → it resumes.
4. Talk for 30+ seconds with pauses → expect the transcript to keep appending (this is the
   restart-through-silence path; if it dies after one sentence, `Dictation.spin()` regressed).

### 3. All four modes [cheap]
Touchpoints: `src/content/index.ts` (`arm`, `wireSurface`), `src/content/ui.ts`,
`src/lib/markdown.ts` (`targetLine`)

1. Armed, press `R` → drag a box → composer opens, meta reads `region W×H`.
2. Press `D` → scribble → composer is already open; commit and check the strokes are in the PNG.
3. Press `P` → composer opens immediately with the pathname as context.
4. Click the toolbar's Element/Region/Draw/Page buttons instead of the keys → same result.
5. Arm from the **panel** buttons, then press `R` without clicking the page first → mode still
   changes (this is the key-relay path).

### 4. Console/network errors attach to the note [cheap]
Touchpoints: `public/injected.js`, `recentEvents` in `src/content/index.ts`

1. On the dev page, trigger a `console.error` and a failing `fetch`.
2. Within three minutes, record a note.
3. Panel shows "N console/network errors captured"; `report.md` has the `<details>` block with those
   exact lines.
4. Record a second note without triggering anything → expect **no** events on it (the window starts
   at the previous note).

### 5. Folder connect → write-through [medium]
Touchpoints: `src/lib/fs.ts`, the flush effect in `src/sidepanel/App.tsx`, `src/lib/markdown.ts`

1. Panel → **Choose folder** → pick the scratch dir → dot turns green, the folder line reads
   `<dir>/gripes/<slug>`, and the panel asks for the absolute path.
2. Record a note → within a second, `gripes/<slug>/` on disk contains `report.md`, `notes.json`,
   `01-full.png`, and `01-target.png` (element/region modes).
3. Open `report.md` → images render, every note has URL, time, element, box, viewport.
4. Close the panel, record two more notes, reopen the panel → both flush to disk and the header count
   reads "3 notes · 3 on disk".
5. Restart Chrome, open the panel → path is remembered; if the dot is orange, **Reconnect** turns it
   green (permission re-request needs the gesture).

### 6. Sessions [cheap]
Touchpoints: `src/background/index.ts` (session handlers), the session UI in `src/sidepanel/App.tsx`

1. Rename the session → the `gripes/<slug>` sub-line keeps the *original* slug (slugs are frozen at
   creation; renaming must not move an existing folder).
2. **done** → the bundle is on disk, the prompt is on the clipboard, the panel is empty and the
   toolbar badge is clear. Record a note → a *new* session appears; the closed one didn't catch it.
3. `▾` → the closed session is listed, muted, tagged `closed`; click it → it reopens with its notes;
   record one more → it appends and `report.md` is rewritten with all of them.
4. `×` on a session row → it vanishes from the list and the folder on disk is still there.

### 7. Export and handoff [cheap]
Touchpoints: `src/lib/zip.ts`, `agentPrompt` in `src/lib/markdown.ts`

1. **Copy prompt for Claude Code** → paste somewhere; expect `Read <path>/report.md — …`, where
   `<path>` is the absolute one you typed into the panel (folder-name-relative if you haven't).
2. **.zip** → save it → the archive opens in your OS's unzipper and contains `<slug>/report.md`,
   `notes.json`, and every PNG. (A broken central directory here means `makeZip` regressed —
   Explorer/Finder will simply refuse to open it.)

### 8. Walkthrough bundle reads like a bundle [heavy — ask first]
Touchpoints: `src/sidepanel/recorder.ts`, `src/lib/markdown.ts`, `features/video-walkthrough.md`

1. **Record** → share a tab or the whole screen → talk through ~30s, hit `Alt+Shift+M` mid-sentence,
   throw a console error in the recorded tab and another in a second tab → **Stop**.
2. `report.md`: absolute path on line 5, contact sheets before the timeline, `N of M keyframes
   inlined` with N well under M, the marked frame has a ★, spoken lines read `0:23–0:31` and name
   their frames, the second tab's error is absent and counted as dropped.
3. Frames: an accent crosshair sits where your mouse was (tab or full-screen capture; a *window*
   capture correctly draws none), and inlined frames carry a `**pointer**` selector line.
4. Panel nags to check the transcript → fix a word → click **looks right** → report.md rewrites and
   now says the speaker corrected it.

### 9. Hostile pages don't break [medium]
Touchpoints: `src/content/index.ts` boot, `arm()` in `src/background/index.ts`

1. Press the hotkey on a `chrome://` page → panel flashes "can't record on this page", nothing throws
   in the worker console.
2. Record on a page with a strict CSP (the injected tap fails to load) → the note still saves, just
   with no events.
3. Record on a page open **since before** the last extension reload → `ensureContentScript` re-injects
   and it still arms.
4. `Esc` mid-compose → overlay fully disappears: no crosshair cursor left on the page, no leftover
   highlight, host page clicks work again.

### 10. The panel at three widths [cheap]
Touchpoints: `src/sidepanel/styles.css`, `scripts/preview.mjs`

1. `npm run build && npm run preview` → open
   `localhost:8777/gallery.html?w=380,560,900&mode=rec`.
2. All three read as the same design: no fine print at 900, no clipping at 380, the column centered
   rather than full-bleed at 900, the CTA and mode buttons on one row past ~520.
3. `&mode=notes`, `&mode=empty`, `&mode=nofolder` — thumbnails scale, the empty state stays centered,
   and **Choose folder** is the only accent-tinted link on the screen.
4. Hover a row in the gripe switcher and a keyframe → `×` fades in, top-right, and nothing else moves.
5. Then look at it for real in Chrome: the harness stubs the chrome APIs, so it proves layout and
   nothing else.
