<div align="center">

# Bug Recorder

**Point at what's broken. Say what's wrong. Hand the folder to your coding agent.**

</div>

---

You just had Claude Code build a feature. Now you're clicking through it and half of it
is subtly wrong — this button does nothing, that spacing is off, this list should be
sorted. Describing all that in a chat message is slow, lossy, and you forget half of it.

Bug Recorder makes that a stream of consciousness. Hit a hotkey, click the thing, talk.
It captures the screenshot, the element, the URL, and any console errors, and writes a
markdown report **straight into your project folder**:

```
your-project/
└─ bug-reports/
   └─ 2026-07-25-1432-checkout-flow/
      ├─ report.md          ← paste this path into Claude Code
      ├─ notes.json         ← same thing, machine-readable
      ├─ 01-full.png        ← viewport with your target spotlighted
      ├─ 01-target.png      ← close-up crop
      └─ 02-full.png
```

Then: `Read bug-reports/2026-07-25-1432-checkout-flow/report.md` and it picks up
everything — text, images, selectors, stack traces.

## Install

```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
select the `dist/` folder. Pin the extension and click it to open the side panel.

## Use it

| Key (Windows / Linux) | macOS | What happens |
| --- | --- | --- |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> | <kbd>⌥</kbd><kbd>⇧</kbd><kbd>B</kbd> | Arm the element picker |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> | <kbd>⌥</kbd><kbd>⇧</kbd><kbd>N</kbd> | Quick note about the whole page |
| <kbd>E</kbd> <kbd>R</kbd> <kbd>D</kbd> <kbd>P</kbd> | same | While armed: element / region / draw / page |
| <kbd>Enter</kbd> | same | Save the note |
| <kbd>Ctrl</kbd>+<kbd>Space</kbd> | same | Toggle the mic |
| <kbd>Alt</kbd>+click | <kbd>⌥</kbd>+click | Take the *literal* element under the cursor, no climbing |
| <kbd>Esc</kbd> | same | Bail out |

The side panel always shows the shortcut Chrome actually bound on your machine — click
that line to rebind it at `chrome://extensions/shortcuts`.

The flow that matters: **shortcut → click the broken thing → talk → Enter.** Repeat. The
mic starts on its own, keeps listening through pauses, and the text lands in the composer
as you speak — edit it by typing if a word comes out wrong.

The floating toolbar is clickable, not just a keyboard legend — tap **Element / Region /
Draw / Page** to switch mid-note. (Keyboard letters only reach the page when the page has
focus, which it doesn't right after you click a button in the side panel.) It dodges to
the bottom of the screen when your cursor goes for the site's own header.

Four ways to point:

- **Element** — hover-highlights DOM nodes; the report gets the CSS selector, the visible
  text, `data-testid`/`aria-label`, and the opening tag. Clicking a button's inner label
  selects the *button*, not the throwaway `<span>` — hold <kbd>Alt</kbd> to override.
- **Region** — drag a box for things that aren't one element (spacing, alignment).
- **Draw** — scribble arrows and circles right on the page.
- **Page** — no target, just a note about what you're looking at.

### Connecting your project folder

Open the side panel, hit **Connect folder**, pick your repo. Chrome remembers it across
restarts (you'll re-approve once per browser session). After that, every note is written
to disk the instant you save it — the report is complete even if the browser dies.

No folder connected? Everything still records, and **.zip** in the footer downloads it.

### Sessions

Every session you've ever recorded is kept. Click the **▾** next to the session name to
switch back to an old one — new notes append to it and `report.md` is rewritten in place.
**+** in the footer starts a fresh one. Forgetting a session from the list drops it from
the extension but leaves the files on disk alone.

### Handing it off

**Copy prompt for Claude Code** puts this on your clipboard:

> Read bug-reports/2026-07-25-1432-checkout-flow/report.md — it's a bug report I recorded
> while clicking through the running app, with screenshots. Look at every image, then fix
> what's described.

## What ends up in the report

Each note carries:

- what you said, verbatim
- the exact URL and the time
- the element: selector, tag, visible text, test ids, bounding box, opening HTML
- the viewport size, DPR, and scroll position
- **console errors, unhandled rejections, and failed fetch/XHR calls** captured in the
  window around that note — usually the actual cause of what you're pointing at
- two PNGs: the full viewport with everything outside your target dimmed, and an upscaled
  close-up crop

## Settings

Three toggles in the panel:

- **auto-mic** — start dictating the moment the composer opens (on)
- **spotlight** — dim everything outside the target in the full screenshot (on)
- **stay armed** — after saving, immediately re-arm for the next note (off)

## How it works

```
content script ──┬─ overlay (shadow DOM): picker, marquee, ink canvas, composer
                 ├─ Web Speech API dictation, auto-restarted through silences
                 └─ composites the capture: spotlight + box + strokes + crop
        │
        ▼  chrome.runtime
background SW ───┬─ chrome.tabs.captureVisibleTab (background-only API)
                 └─ IndexedDB: sessions, notes, image blobs
        │
        ▼
side panel ──────┬─ React view over that state
                 └─ File System Access: writes report.md + PNGs into your repo
```

Notes are captured whether or not the side panel is open; the panel flushes anything
pending to disk when you open it. The page's own `console.error`/`fetch`/`XHR` are tapped
by a tiny MAIN-world script (`public/injected.js`) that forwards events over
`postMessage`.

Zero runtime dependencies beyond React for the panel — the ZIP writer, the PNG icon
generator, and the screenshot compositor are all hand-rolled.

## Known edges

- Won't run on `chrome://` pages, the Web Store, or other extensions' pages — Chrome
  forbids content scripts there.
- Dictation uses Chrome's Web Speech API, which asks for mic permission **per site**.
  Grant it once on your dev origin. Sites that disable mic via `Permissions-Policy` fall
  back to typing.
- Screenshots are the visible viewport, not the whole desktop — devtools and other windows
  aren't in frame.
- The `bug-reports/` folder is yours to gitignore or commit; the extension never touches
  anything else in the directory you connect.

## Develop

```bash
npm run dev        # vite --watch; reload the extension in chrome://extensions
npm run typecheck
```

MIT.
