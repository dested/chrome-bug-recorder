# Gripe — UI / Visual Language

> The source of truth for how Gripe **looks and feels**. Follow it for anything visual.
> Keep it current as part of the definition of done for any UI change.
> Last updated: 2026-07-26.

## North star

**A devtool that behaves like a camera.** Near-black glass, one hot orange, monospace for anything
factual. It sits on top of someone else's app without competing with it, and it disappears the
instant the shutter fires. Reference points: Linear's command bar, macOS screenshot HUD, Raycast.

Failure looks like: *too sterile* — a grey Chrome-extension form with a blue Save button, no accent,
no motion, nothing that says "this is armed." *Too toy* — rounded pill everything, multiple hues,
emoji, drop shadows on flat elements, an accent that shows up on things that aren't the target.

1. **Evidence over chrome.** Screenshots, selectors, timestamps and filenames are the content.
   Everything around them is a hairline and a whisper.
2. **One accent, earned.** `#ff5c39` marks exactly one thing: *what you are pointing at, or what is
   live right now*. Target box, mic-live, active mode, active session, error count, the drain bar.
   Never a decoration, never a plain button fill.
3. **Dark, always.** `color-scheme: dark` in both surfaces. There is no light theme and the overlay
   must not inherit one from the host page.
4. **Motion is feedback, not flourish.** 120–180ms, `cubic-bezier(.2,.8,.3,1)`. Two animations exist
   and both mean something: the accent `pulse` (armed / listening) and the countdown drain (about to
   commit).
5. **Facts are monospace.** Selectors, paths, times, counts, filenames. Prose is the sans stack.

## Two surfaces, one language

| | Side panel | In-page overlay |
| --- | --- | --- |
| File | `src/sidepanel/styles.css` | CSS template string at the top of `src/content/ui.ts` |
| Built with | React + a plain stylesheet | Hand-built DOM in a shadow root |
| Background | Opaque `--bg` (#0a0a0c) | Translucent `.glass` over the host page |
| Sizing | 13px body — it lives in a ~360px rail | 12.5–15px — it floats over someone's app |

The two stylesheets are **deliberately separate and deliberately duplicated**. The overlay can't
import the panel's CSS (shadow-root isolation is the whole point), so the shared values are copied.
Change a token in one, change it in the other.

## Tokens

### Color

| Token | Panel value | Overlay value | Use |
| --- | --- | --- | --- |
| Canvas | `--bg: #0a0a0c` | — (host page shows through) | Panel background |
| Surface / raise | `--raise: #131316` | `--glass: rgba(12,12,14,.88)` | Footer, folder strip, session list / glass panels |
| Hairline | `--line: rgba(255,255,255,.08)` | `--line: rgba(255,255,255,.10)` | 1px dividers and borders |
| Hairline strong | `--line-strong: rgba(255,255,255,.14)` | — | Hover borders |
| Text | `--text: #f2efec` | `--text: #f2efec` | Primary copy |
| Muted | `--muted: rgba(242,239,236,.5)` | `--muted: rgba(242,239,236,.52)` | Labels, secondary |
| Faint | `--faint: rgba(242,239,236,.32)` | — | Metadata, placeholders |
| Accent | `--accent: #ff5c39` | `--accent: #ff5c39` | See discipline below |
| Accent soft | `--accent-soft: rgba(255,92,57,.14)` | `rgba(255,92,57,.15–.18)` | Armed/active fills |
| Accent text | `#ffcbbb` (panel) | `#ffb9a5` (overlay) | Text *on* an accent-soft fill |
| Success | `#58c98a` | — | The folder-connected dot. The only non-accent hue in the product. |

**Accent discipline.** `#ff5c39` is allowed on: the target highlight and its selector tag, the
marquee, ink strokes, the live mic, the active mode button, the armed CTA, the active session's left
rail, the caret, the note index badge, the console-error line, the countdown bar. It is **not**
allowed on: the primary footer button (that one is inverted — `--text` background, `#0a0a0c` label),
generic hovers, headers, or borders that aren't marking state.

The canonical source is `ACCENT` in `src/lib/types.ts`; `capture.ts` and `make-icons.mjs` import or
mirror it. If the accent ever changes, five places move: `types.ts`, `styles.css`, `ui.ts`,
`make-icons.mjs`, and the `setBadgeBackgroundColor` call in `background/index.ts`.

### Typography

| Role | Stack | Use |
| --- | --- | --- |
| Body | `ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif` | All prose |
| Mono (`--mono`) | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` | Selectors, paths, times, counts, filenames, `kbd` |
| Wordmark | Body stack, 10.5px / 700 / `.14em` / uppercase | "GRIPE" in the panel header only |

Sizes in use — panel: 15px (session name, composer input), 13.5px (armed CTA), 12.5–13px (body, note
text), 11.5px (mode buttons), 10.5px (metadata, wordmark), 9.5–10px (badges, toggle labels). Overlay:
15px composer, 12.5px hint, 11.5px tool buttons, 10.5–11px `kbd` and meta. Weights are 400 / 600 /
650 / 700 — nothing else.

### Spacing, shape, elevation

| Token | Value | Use |
| --- | --- | --- |
| Panel gutter | `14px` horizontal on every strip | Header, session, folder, controls, notes, footer |
| Strip padding | `9–13px` vertical | Denser than a web app on purpose |
| Radius — pill | `999px` | Hint chip, toast, toggles, flash |
| Radius — glass panel | `14px` | Composer bar, hint chip container |
| Radius — control | `8–10px` | Buttons, arm CTA, note textarea |
| Radius — inline | `4–7px` | `kbd`, chips, thumbnails, tags |
| Separation | 1px `--line` borders | **Panel uses borders, never shadows** |
| Elevation | `0 24px 60px -12px rgba(0,0,0,.7)` + inset top highlight | Overlay glass only |
| Glass blur | `blur(24px) saturate(150%)` (+ `-webkit-` twin) | Overlay only |
| Overlay z-index | `2147483647` on `:host` | Must beat every host page |

## Layout

**Side panel** — a fixed-height flex column, only the notes list scrolls:

```
header      wordmark + note count
session     name input + session switcher chevron ▾   (+ expandable session list)
folder      status dot + path + Connect/Reconnect/✕
controls    armed CTA + Region/Draw/Page + shortcut hint line
notes       flex:1, scrolls; note rows, expandable full screenshot
toggles     pill row: auto-mic, auto-send, spotlight, stay armed
footer      Copy prompt (primary) + .zip + New session
```

**Overlay** — absolutely positioned children of one fixed `.layer` inside the shadow root:
hint chip top-center (drops to `bottom: 22px` when the cursor rises above y=96 so it doesn't cover
the host's header), target highlight + selector tag positioned to the element, full-viewport surface
for region/draw, composer bar bottom-center at `min(680px, 100vw - 40px)`, toast bottom-center.

## Components

| Component | File | Purpose |
| --- | --- | --- |
| `.glass` | `content/ui.ts` | The one elevated surface treatment: translucent fill, hairline, blur, deep shadow |
| `.hint` + `.tools` | `content/ui.ts` | Armed chip: pulsing dot, mode hint, E/R/D/P buttons, `esc` |
| `.highlight` + `.tag` | `content/ui.ts` | Target box and its monospace selector label |
| `.bar` (composer) | `content/ui.ts` | Mic + textarea + interim line + meta row + countdown |
| `.toast` | `content/ui.ts` | "Note N saved" + filename, 2.4s |
| `.note` row | `sidepanel/App.tsx` + `styles.css` | Thumbnail, index badge, text, meta, error count, hover ✕ |
| `.toggle` pill | `sidepanel/App.tsx` | Settings switch: dot + label, accent-soft when on |
| `.flash` | `sidepanel/App.tsx` | Inverted transient toast, 1.7s, rises 8px |

Signature patterns, verbatim:

```css
/* Elevated surface — overlay only */
.glass {
  background: var(--glass);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 24px 60px -12px rgba(0,0,0,0.7);
  backdrop-filter: blur(24px) saturate(150%);
}

/* "This is live" — the only looping animation in the product */
@keyframes pulse {
  0%   { box-shadow: 0 0 0 0   rgba(255,92,57,.5); }
  70%  { box-shadow: 0 0 0 8px rgba(255,92,57,0);  }
  100% { box-shadow: 0 0 0 0   rgba(255,92,57,0);  }
}

/* Armed state on any control */
.arm { background: var(--accent-soft); border: 1px solid rgba(255,92,57,.3); color: #ffcbbb; }

/* Primary action is inverted, not accent */
.primary { background: var(--text); color: #0a0a0c; font-weight: 650; }
```

Keyboard hints are always a `<kbd>`: mono, 10–10.5px, translucent fill, hairline border.
`kbd.hot` (accent tint) marks the key that commits.

## States

- **Empty** — centered, `--faint`, 1.65 line-height, three short lines that teach the gesture and
  interpolate the *real* bound shortcut (`Hit **Alt+Shift+B** on the page…`). Never "No data."
- **Live / armed** — accent-soft fill + pulsing dot. Applies to the hint chip, the mic, mode buttons.
- **About to happen** — the countdown drains a 2px accent gradient across the composer's bottom edge
  over `settings.autoSendMs`. Any keystroke or further speech cancels it and the bar resets.
- **Error / degraded** — never a red banner. It's the `.where` line in the composer turning `.warn`
  (`#ffb9a5`) with plain lowercase text: `capture failed: …`, `microphone blocked on this site — type
  instead`. In the panel it's the `.flash` pill.
- **Connection status** — one 6px dot: `--faint` (nothing connected), `--accent` (connected, needs
  permission), `#58c98a` (writing).
- **Destructive** — a `✕` that only appears on row hover, and a tooltip that says what survives
  ("Forget this session (files on disk are kept)"). No confirmation dialogs — modals freeze capture.

## Voice / copy

Lowercase, terse, second person, no punctuation at the end of short strings. The UI talks like a
colleague watching over your shoulder.

Good: `Click what's wrong` · `Drag a box around it` · `no project folder connected` ·
`prompt copied — paste into Claude Code` · `can't record on this page` · `no comment — screenshot only`

Bad: `Please select an element to continue.` · `Error: Operation failed` · `Successfully saved!` ·
`Settings` as a heading · anything with an exclamation mark.

Buttons are verbs or nouns, never sentences: `Connect folder`, `Reconnect`, `.zip`, `+`,
`Copy prompt for Claude Code`. Toggle labels are hyphenated lowercase: `auto-mic`, `auto-send`,
`spotlight`, `stay armed`.

## Don'ts

- ❌ **A second hue.** `#58c98a` on the folder dot is the entire exception. No blue, no yellow, no red.
- ❌ **Accent as a plain button fill.** The primary action inverts (`--text` bg); accent means *state*.
- ❌ **Shadows in the side panel.** Separation there is 1px `--line`. Shadows belong to `.glass` and
  the `.flash` pill only.
- ❌ **A CSS framework, a component library, or CSS-in-JS.** Two hand-written stylesheets, that's it.
- ❌ **React (or any framework) in the content script.** It boots on every page the user visits and
  must never be the slow thing.
- ❌ **Unscoped styles in the page.** Everything overlay-side lives inside the shadow root; `:host`
  starts with `all: initial`. The only global the extension writes to the page is the crosshair
  cursor style, and it's removed on disarm.
- ❌ **Light mode / system theme.** Both surfaces declare `color-scheme: dark`.
- ❌ **Emoji, illustrations, or icon fonts.** The two SVGs (reticle mark, toast tick) are inline and
  hand-drawn; the extension icons are generated by `scripts/make-icons.mjs`.
- ❌ **`alert` / `confirm` / any modal.** A browser dialog blocks the extension's event loop and kills
  an in-flight capture.
- ❌ **Decorative animation.** If it loops, it means "live." If it drains, it means "about to commit."
- ❌ **Title Case, exclamation marks, or "Successfully".**
- ❌ **Growing the panel's vertical chrome.** Notes get the space; every strip above them is fixed.
