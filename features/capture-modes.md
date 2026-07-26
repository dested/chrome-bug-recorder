# Capture Modes

> Status: **done** · Last updated: 2026-07-26

## What / Why

The four ways to point at a bug: **Element** (hover-highlight a DOM node), **Region** (drag a box),
**Draw** (scribble on the page), **Page** (a note about what you're looking at). This is the part
that replaces "take a screenshot, crop it, describe where the button is" — and the element picker is
what makes the report contain a real CSS selector instead of a description.

## Behavior spec

**Arming**

- When the user presses `Alt+Shift+B` (or clicks **Point & record**), the active tab arms in element
  mode: crosshair cursor, hint chip top-center, page clicks swallowed.
- When the user presses `Alt+Shift+N`, the tab arms in page mode and the composer opens immediately.
- When the target tab has no content script (open since before install/reload), it is injected via
  `chrome.scripting.executeScript` before arming.
- When arming is impossible (`chrome://`, the Web Store, another extension), the panel flashes
  "can't record on this page" and nothing else happens.
- When the user re-sends the same mode while already aiming, capture toggles **off**.
- When armed, `E`/`R`/`D`/`P` switch modes — from the page, from the overlay toolbar buttons, or from
  the side panel (which relays the same keys, since arming from the panel leaves focus there).
- When the user presses `Esc` (page, panel, or the overlay's `esc` button), everything tears down:
  listeners, crosshair, highlight, ink, composer.

**Element mode**

- When the cursor moves, the topmost element under it is *refined* — climbing up to 4 levels past
  presentational tags (`span`, `em`, `svg`, `img`, …) and into interactive ancestors — and the
  refined element is outlined with its selector shown in a tag.
- When the parent would be more than 10× the child's area, the climb stops there.
- When `Alt` is held, the literal element under the cursor is used with no climbing.
- When the page scrolls while aiming, the highlight re-tracks the hovered element.
- When the user clicks, the element locks, `TargetInfo` is captured (selector, tag, id, classes,
  visible text ≤160 chars, interesting attributes, opening HTML ≤400 chars, box) and the composer
  opens.
- Selector preference order: a unique `#id` → `[data-testid]`/`[data-test-id]`/`[data-cy]` → a
  tag+class path with `:nth-of-type`, ascending at most 5 levels and stopping as soon as it's unique.
  Framework-generated classes (`ng-`, `css-`, `jsx-`, `sc-`, `emotion-`, anything with 4+ digits, or
  longer than 28 chars) are dropped.

**Region mode**

- When the user drags on the surface, a dashed marquee follows the pointer.
- When the drag ends and the box is at least 6×6, it locks and the composer opens; smaller drags are
  ignored (they're clicks).

**Draw mode**

- When draw mode is armed, the composer opens immediately and the page surface accepts freehand
  strokes in the accent color.
- When the note is saved, the strokes are burned into the screenshot and the crop is taken from the
  strokes' bounding box.

**Page mode**

- When page mode is armed, the composer opens with the pathname as its context line and no target.

**On save**

- The element's box is re-measured just before capture (the page may have scrolled or reflowed while
  the user talked).
- The overlay hides itself and waits two animation frames, the worker returns
  `chrome.tabs.captureVisibleTab`, and the composite is built: everything outside the target dimmed
  (when `spotlight` is on), an accent box, ink strokes.
- When a focus rect exists and is at least 4×4, a second close-up image is cut from the **clean**
  capture with 28px padding, upscaled up to 3× toward a 560px minimum width.
- On success: a toast shows "Note N saved" and the filename. When `chain` is on, the same mode
  re-arms; otherwise everything disarms.
- On failure, the composer's context line turns to `capture failed: …` and the note is **not** lost —
  the text stays in the textarea.

## Touchpoints

| Part | File |
| --- | --- |
| State machine, modes, keys, save | `src/content/index.ts` |
| Overlay DOM + CSS | `src/content/ui.ts` |
| Screenshot compositing | `src/content/capture.ts` |
| Hotkey registration | `public/manifest.json` (`commands`) |
| Arming, injection, tab capture | `src/background/index.ts` |
| Panel buttons + key relay | `src/sidepanel/App.tsx` |

## Data

`CaptureMode`, `TargetInfo`, `Rect`, `Viewport` in `src/lib/types.ts`. A note stores exactly one of
`target` (element), `region` (region), or `strokes` (a count, for draw); page notes store none.

## Edge cases

- **Fixed/sticky host headers** — the hint chip drops to the bottom of the viewport when the cursor
  goes above y=96.
- **Page scrolled between click and save** — the box is re-measured at save time, so the drawn
  rectangle matches the screenshot rather than the click.
- **Element removed from the DOM while composing** — `getBoundingClientRect` returns zeros; the note
  saves with a degenerate box and no crop.
- **Cross-origin iframes** — not covered; the manifest sets `all_frames: false`, so only the top
  document can be pointed at.
- **Shadow-DOM elements in the host page** — `elementFromPoint` returns the host, so the selector
  describes the custom element, not the inner node.
- **Very large elements** (`<main>`, `<body>` children) — the crop is skipped when the focus rect
  fills the viewport, since the full shot already shows it.

## Open questions

- [ ] No undo for a stray draw stroke — the only reset is `Esc` (which discards the note).
- [ ] Region mode has no keyboard nudge for the box edges.

## How to verify

See `verify.md` flows **1** and **3** [cheap]. Fastest single check: arm, hover a button whose label
is wrapped in a `<span>`, and confirm the tag shows the *button's* selector.
