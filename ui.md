# Gripe — UI / Visual Language

> The source of truth for how Gripe **looks and feels**. Follow it for anything visual.
> Keep it current as part of the definition of done for any UI change.
> Last updated: 2026-07-29 (0.7.0) — rewritten around the timeline: recording-only, one axis,
> the panel is the remote and the popped strip is the editor.

## North star

**A devtool that behaves like a camera — and, once the shutter closes, like an editor.** Near-black
glass, one hot orange, monospace for anything factual. While it records it sits on top of someone
else's app without competing with it; afterwards it turns into the one surface where a five-minute
ramble gets read, cut, and shipped. Reference points: Linear's command bar, the macOS screenshot HUD,
Raycast — and, for the timeline, After Effects.

**Gripe records. That is all it does.** There is no screenshot mode, no element picker, no composer,
no note. One gesture (Record), one artifact (a gripe), one axis (the timeline).

Failure looks like: *too sterile* — a grey Chrome-extension form with a blue Save button, no accent,
nothing that says "this is armed." *Too toy* — rounded pill everything, multiple hues, emoji, drop
shadows on flat elements, an accent on things that aren't the target. And the failure this version
was built to kill: *only works on a demo* — a UI that reads fine over 40 seconds and smears into a
deck of overlapping cards at ten minutes. **Ten minutes is the normal case and an hour is allowed.**

1. **Evidence over chrome.** Keyframes, transcripts, timestamps and filenames are the content.
   Everything around them is a hairline and a whisper.
2. **One accent, earned.** `#ff5c39` marks exactly one thing: *what is live right now, or what you
   have picked out*. Ink strokes, the click ripple, the recording HUD, the playhead, selection
   outlines, marks, the caret, the `path?` chip. Never a decoration, never a plain button fill.
3. **Dark, always.** `color-scheme: dark` in both surfaces. There is no light theme and the overlay
   must not inherit one from the host page.
4. **Motion is feedback, not flourish.** 120–180ms, `cubic-bezier(.2,.8,.3,1)`. Three animations
   exist and each means something: the accent `pulse` (recording), the click `ripple` (you clicked —
   the one thing a screen recording otherwise loses), and the **ink fade** (this drawing is old).
5. **Facts are monospace.** Times, counts, filenames, paths, transcript stamps. Prose is the sans
   stack.

The rest are about what the product is allowed to *be*. Laws 6–8 came out of 0.7's redo; 9 and 10 came
out of the timeline, one day later, from a real 10:18 recording.

6. **The panel is four things.** Record, the timeline, Copy prompt, done. Anything else is deleted,
   folded behind the one `settings` row, or moved onto the page. The header carries exactly one more
   affordance — `⧉`, which moves the editor somewhere it fits — and that is the ceiling.
7. **Zero keyboard *in the panel*; the dock advertises its own.** No `<kbd>`, no key names, no
   "set one" links anywhere in the side panel or the strip. But every button on the **on-page dock**
   carries its key in its label — `draw (d)`, `clear (c)`, `mark (m)`, `stop (s)` — because the key
   printed on the thing it fires is not a lookup, it is the label. (This amends 0.7's "zero keyboard
   anywhere"; see decisions.md 2026-07-29.) The timeline's `Delete`/`Backspace` and `Escape` stay
   silent — they duplicate a visible button.
8. **The controls live where the eyes are.** While a walkthrough records, the user is looking at
   *their app*. So draw / clear / mark / stop sit on the page in a floating pill, and the panel keeps
   only what it can't delegate: the clock, the counts, and Stop.
9. **The panel is the remote; the strip is the editor.** A 380px rail is the right shape for pressing
   Record and nothing else. A timeline is a wide object, so `⧉` opens the same page as a **dock strip
   across the bottom of the browser window** — DevTools-shaped — and that is where a gripe gets
   sanitized. Same document, same IndexedDB, no new state.
10. **It has to survive an hour.** Nothing in the timeline may be laid out per item at a fixed size.
    Frames are a **filmstrip of fixed-width cells**, not absolutely positioned thumbnails; voice is
    **blocks sized by duration**, with text only when text fits. Check every timeline change against
    the `long` preview seed (10:18, 150 frames), never the cozy short one.

## Two surfaces, one language — and the panel has two shapes

| | Side panel (and the strip) | In-page overlay |
| --- | --- | --- |
| File | `src/sidepanel/styles.css` | CSS template string at the top of `src/content/ui.ts` |
| Built with | React + a plain stylesheet | Hand-built DOM in a shadow root |
| Background | Opaque `--bg` (#0a0a0c) | Translucent `.glass` over the host page |
| Sizing | A token scale that steps at 480/760px | 12.5px fixed — it floats over someone's app |

The **side panel** and the **popped strip** are the same document (`sidepanel.html`, with `?pop=1`).
`pop=1` swaps the panel chrome for one slim bar and hands every other pixel to the timeline; the
timeline itself measures **its own box** and turns landscape when the box is landscape, so the shape
change is one class, not a second component.

Check panel work at more than one shape before calling it done:

```
npm run build && npm run preview
localhost:8777/gallery.html?w=380,560,900&mode=rec
localhost:8777/gallery.html?w=1500x400&mode=long     ← the dock strip, on a ten-minute gripe
```

`mode` is `rec | long | empty | nofolder`. A `w` token may be a width (`900`) or a **shape**
(`1500x400`) — a shape token gets its own height and is rendered popped, because the strip is a shape,
not a width. `long` is the acceptance seed: 10:18 across two takes, 150 frames, silences and bursts.

The two stylesheets are **deliberately separate and deliberately duplicated**. The overlay can't
import the panel's CSS (shadow-root isolation is the whole point), so the shared values are copied.
Change a token in one, change it in the other.

(A third surface — the marketing site in `landing/` — mirrors these tokens in
`landing/src/styles/app.css` and is allowed two web fonts the extension is not: Bricolage Grotesque
for display, IBM Plex Mono for facts. Everything else here still applies to it.)

## Tokens

### Color

| Token | Panel value | Overlay value | Use |
| --- | --- | --- | --- |
| Canvas | `--bg: #0a0a0c` | — (host page shows through) | Panel background |
| Well | `--well: #08080a` | — | **The timeline's track area** — the one surface darker than the canvas, the way an editor's well is |
| Surface / raise | `--raise: #131316` | `--glass: rgba(12,12,14,.88)` | Footer, session list, path input, the playhead readout / the dock |
| Hairline | `--line: rgba(255,255,255,.08)` | `--line: rgba(255,255,255,.10)` | 1px dividers and borders |
| Hairline strong | `--line-strong: rgba(255,255,255,.14)` | — | Hover borders, take seams |
| Text | `--text: #f2efec` | `--text: #f2efec` | Primary copy |
| Muted | `--muted: rgba(242,239,236,.5)` | `--muted: rgba(242,239,236,.52)` | Labels, secondary |
| Faint | `--faint: rgba(242,239,236,.32)` | — | Metadata, ticks, lane labels |
| Accent | `--accent: #ff5c39` | `--accent: #ff5c39` | See discipline below |
| Accent soft | `--accent-soft: rgba(255,92,57,.14)` | `rgba(255,92,57,.16)` | Live/armed fills, the selection bar |
| Accent text | `#ffcbbb` (panel) | `#ffb9a5` (overlay) | Text *on* an accent-soft fill |
| Success | `#58c98a` | — | The folder-connected dot. The only non-accent hue in the product. |

**Accent discipline.** `#ff5c39` is allowed on: ink strokes, the click ripple, the dock's armed
`draw` button, the live recording HUD and its pulsing dot, the **playhead** (line + knob), the
**selection outline** on a cell or a clip, **marks** on the filmstrip's top edge, the selection bar,
the review nag's tint, the active session's left rail, the caret, the `path?` chip, the `.link.hot`
button. It is **not** allowed on: the primary footer button (that one is inverted — `--text`
background, `#0a0a0c` label), the **idle Record control** (a hairline until hover, because nothing is
live yet), generic hovers, headers, or borders that aren't marking state.

The canonical source is `ACCENT` in `src/lib/types.ts`; `make-icons.mjs` mirrors it. If the accent
ever changes, four places move: `types.ts`, `styles.css`, `content/ui.ts`, `make-icons.mjs`, plus the
`setBadgeBackgroundColor` call in `background/index.ts`.

### Typography and rhythm

| Role | Stack | Use |
| --- | --- | --- |
| Body | `ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif` | All prose |
| Mono (`--mono`) | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` | Times, paths, counts, filenames, ruler ticks |
| Wordmark | Body stack, `--fs-2xs` / 700 / `.14em` / uppercase | "GRIPE" in the side panel header only |

**The panel has no hardcoded sizes.** Everything comes from tokens on `:root` in `styles.css`, stepped
at two breakpoints — the same document is a 360px rail, a 1200px tab, and a 1500×400 dock strip.

| Token | <480px | ≥480px | ≥760px | Used for |
| --- | --- | --- | --- | --- |
| `--fs-xl` | 16 | 18 | 21 | Gripe name, recording clock |
| `--fs-lg` | 13.5 | 14.5 | 16 | The hero Record label |
| `--fs-md` | 12.5 | 13.5 | 14.5 | Body, the playhead readout, primary button |
| `--fs-sm` | 11.5 | 12.5 | 13.5 | Links, chips, secondary buttons, clip editors |
| `--fs-xs` | 10.5 | 11.5 | 12.5 | Paths, transcript stamps |
| `--fs-2xs` | 9.5 | 10.5 | 11 | Ruler ticks, lane labels, clip text, wordmark |
| `--gut` | 14 | 20 | 26 | Horizontal padding on every strip |
| `--strip` | 11 | 13 | 16 | Vertical padding on every strip |
| `--hero-h` | 52 | 60 | 68 | Height of the Record control — the biggest thing in the product |
| `--monitor-h` | 128 | 176 | 224 | The timeline's monitor (a *basis*, not a height — see below) |
| `--ruler-h` | 20 | 22 | 24 | The ruler lane |
| `--track-h` | 30 | 36 | 42 | Each track lane (filmstrip, voice) |
| `--cell-w` | 56 | 72 | 88 | **Filmstrip cell width** — the whole reason an hour fits |

`--cell-w` is overridden to `140px` inside `.tl.wide`, where the cells are twice as tall and a
narrow slice would crop a 16:10 frame to a sliver.

`--thumb-w/h` is **gone** — nothing in the product renders a fixed-size thumbnail any more. So is the
notes/keyframe grid it fed.

**Width caps.** Past 760px the content column stops at `--max: 900px` and centers; below that `--max`
is `100%`. **One exception, and it is load-bearing:**

```css
/* The dock strip is the one surface that wants the whole window. */
@media (min-width: 1000px) and (max-height: 560px) { :root { --max: 100%; } }
```

A 900px column centred in a 1500px dock strip wastes half the editor. Wide-and-short is a shape the
rail and a normal tab never have, so the exception can be keyed on it directly.

Overlay (fixed sizes, it floats over someone's app): 12.5px dock buttons with a 12px tabular clock.
Weights are 400 / 600 / 650 / 700 — nothing else.

### Spacing, shape, elevation

| Token | Value | Use |
| --- | --- | --- |
| Panel gutter | `var(--gut)` on every strip | Header, session, controls, timeline chrome, footer |
| Strip padding | `var(--strip)` vertical | Denser than a web app on purpose |
| Radius — pill | `999px` | The dock, the flash, the strip's bar buttons |
| Radius — glass panel | `14px` | The dock |
| Radius — control | `8–12px` | Hero, HUD, footer buttons |
| Radius — inline | `2–7px` | Clips (2px — a cut, not a pill), chips, tags, zoom buttons |
| Separation | 1px `--line` borders | **Panel uses borders, never shadows** |
| Elevation | `0 24px 60px -12px rgba(0,0,0,.7)` + inset top highlight | Overlay glass and `.flash` only |
| Glass blur | `blur(24px) saturate(150%)` (+ `-webkit-` twin) | Overlay only |
| Overlay z-index | `2147483647` on `:host` | Must beat every host page |

## Layout

### Side panel — the capture remote

A fixed-height flex column; the timeline takes what's left.

```
header      wordmark + summary ('4:12 recorded · on disk') + ⧉ pop out
session     name input + 'history · N' text button (only while other gripes exist)
            inbox line: status dot + 'inbox · <path>' + 'path?' — the whole line is the button
            (or the setup card when nothing is connected; a lone 'reconnect' when permission lapsed)
            (+ the absolute-path input, its why-line and 'forget this folder', when the line is open)
            (+ the gripe list, when history is open)
controls    idle: the hero Record control, full width, --hero-h tall
            live: the HUD replaces it in place — pulse dot, mono clock, 'N frames · N lines ·
                  N marked', inverted Stop, the interim line, and one --faint sub-line saying
                  where the rest of the controls went
timeline    flex:1 — monitor, readout, ruler, filmstrip, voice, selection bar, zoom
settings    one --faint 'settings' row; open, it reveals one switch
footer      Copy prompt (primary) + done — and .zip only when there is no folder to write into
```

Record is the hero because talking through the app is the only gesture, and it is the only control
that gets `--hero-h`. Only `done` empties the panel: everything recorded between opens and `done`
stacks up on one timeline.

### The strip — the editor

`⧉` opens `sidepanel.html?pop=1` as a popup window pinned across the **bottom edge of the current
browser window** (~400px tall; the worker re-pins it whenever that window moves or resizes). One
strip exists at a time; pressing `⧉` again brings it forward.

```
bar         mark + name input + summary + [reconnect] + record/■ m:ss + Copy prompt + done
timeline    everything else
```

The bar is one row of pill-shaped controls at `--fs-sm`; there is no session block, no inbox line, no
settings, no footer. Capture belongs to the side panel; this surface is for reading and cutting.

### The timeline — anatomy

One component, `src/sidepanel/Timeline.tsx`, in two shapes. Stacked (the rail, a tab):

```
┌───────────────────────────────────────────────┐
│                 monitor            0:42/10:18 │  keyframe at/just-before the playhead
├───────────────────────────────────────────────┤
│ 0:42  "the spring is totally broken"          │  playhead readout — click to edit
├───────────────────────────────────────────────┤
│ (review nag, when a transcript is unconfirmed)│
│ (whisper status, while one is running)        │
├───────────────────────────────────────────────┤
│ 0:00    0:30    1:00    1:30            ▼     │  ruler — click to place, drag to range-select
│ frames ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓     │  filmstrip: fixed-width cells, edge to edge
│ voice  [══clip══][═clip═]      [════clip════] │  blocks: width = duration
├───────────────────────────────────────────────┤
│ 0:42–1:10 · 9 items                  [delete] │  only when something is selected
│ – +  fit                                      │
└───────────────────────────────────────────────┘
```

Landscape (`.tl.wide`, when the component's own box is ≥900px wide, ≥120px tall and wider than
2.2× its height — i.e. the strip) turns that one flex direction: the monitor sits **left** at
`clamp(300px, 30%, 360px)` with its clock under it, and the whole axis fills the rest. Both lanes then
grow into the vertical room the rail never has (the filmstrip capped at 88px so its cells stay
landscape, the voice lane taking the remainder).

The parts, and what each is for:

- **Monitor** — the only place a keyframe is big enough to read anything in. Black, letterboxed,
  `object-fit: contain`. It is the elastic member (`flex: 1 100 var(--monitor-h)`): slack goes into
  the picture and a squeeze comes out of it first, so the lanes and the zoom row are the last things
  to give ground. A double-clicked cell pins itself here until the next click.
- **Clock** — `m:ss / m:ss`, mono, bottom-right of the monitor; on its own line under the picture in
  wide mode.
- **Playhead readout** — the subtitle line, `--fs-md`, on `--raise`: the transcript line covering (or
  nearest before) the playhead, with its mm:ss. **Click it to edit it.** This is how a long transcript
  actually gets read and fixed: scrub, read here, fix here. A voice block too narrow to type in hands
  its edit to the readout rather than growing.
- **Ruler** — sticky, mono ticks at a step chosen so labels never collide (≥56px apart), crosshair
  cursor. Click places the playhead; drag selects a **time range**. The `▼` knob is the grab handle.
- **Filmstrip** — the answer to an hour of footage. The track is divided into `--cell-w`-wide cells;
  each renders the keyframe nearest the middle of its time slice, `object-fit: cover`, edge to edge,
  **zero gaps and zero overlap at any duration and any zoom**. Zooming in refines the slices until a
  cell is one keyframe. A slice with no keyframe within reach renders as a faint `gap` — nothing
  happened there, and it shows. Past ~300 cells only the ones near the viewport are rendered.
- **Marks** — instants, not cells: 2px accent ticks along the filmstrip's top edge at their exact x.
- **Voice** — blocks first, text second. Width is duration × pxPerMs (min 2px, squared 2px corners,
  1px gap), and the words render **only at ≥48px wide**. The block under the playhead brightens.
- **Seams** — a 1px dashed vertical line where one take ends and the next begins. No label, no number.
- **Selection** — accent outline, never a fill. The bar appears only when something is picked and
  carries the range (`0:42–1:10 · 9 items`) or the count, plus the one destructive verb, `delete`.
- **Zoom** — `–` / `+` (×1.5), plus `fit` once zoomed. Ctrl-scroll works and is named nowhere.

## Components

| Component | File | Purpose |
| --- | --- | --- |
| `.glass` | `content/ui.ts` | The one elevated surface treatment: translucent fill, hairline, blur, deep shadow. Worn by the dock, and nothing else any more |
| `.dock` | `content/ui.ts` | **The recording toolbar.** A glass pill bottom-center on the recorded tab only: `.dock-live` (pulsing `.dot` + mono tabular `.clock`), a `.sep`, then `button[data-act]` — `draw (d)`, `clear (c)`, `mark (m)`, `stop (s)`. Lowercase labels, each carrying its key, ≥32px hit targets |
| `.dock.on.near` | `content/ui.ts` | Politeness, not hiding: fades to `.35` when the cursor comes within 120px without being on it, back to `1` on hover. It never blocks the app irrecoverably |
| `.dock button.arm` | `content/ui.ts` | Armed: accent-soft fill, `rgba(255,92,57,.3)` border, `#ffb9a5`. Marks `draw` while the ink owns the pointer, and flashes on `mark` for 260ms — a mark leaves nothing on screen, so the button says it landed |
| `.dock button.draw` | `content/ui.ts` | The one label that swaps: `draw (d)` while the page has the pointer, `click (d)` while the ink does — the way back is labeled, never inferred. `min-width: 86px` so the row never shuffles |
| `.dock button.stop` | `content/ui.ts` | Inverted like every primary: `--text` fill, `#0a0a0c` label |
| `canvas.live` | `content/ui.ts` | The live ink layer: full-viewport, accent strokes at 3.5px with a dark shadow so they read on a white page. `.on` = the strokes are on screen; `.on.capture` = the pointer is the ink's (crosshair). One global alpha: full for 3s after the last stroke, then linear to 0 over 4s; any new stroke restores **everything** to full |
| `.ripple` | `content/ui.ts` | One click, made visible: a 64px accent ring, `scale(.44)`→`1`, fading over 350ms, `pointer-events: none` |
| `.hero` | `styles.css` | The Record control, the largest thing in the product: full width, `--hero-h` tall, `--fs-lg`/650. Idle it is a hairline with a `--faint` dot; hover accents the dot and the border |
| `.hud` | `styles.css` | Record's live state, in the hero's place: accent-soft slab, pulsing dot, mono clock at `--fs-xl`, `N frames · N lines · N marked`, inverted Stop, the interim line, and `.sub` — one `--fs-2xs` line saying where the rest of the controls went |
| `.popout` | `styles.css` | `⧉` in the header. 24px, `--faint` until hover. The only header control, and the only way to the editor |
| `.tl` | `styles.css` | The timeline root. `.tl.wide` is the landscape shape — the class is set by the component measuring its **own box**, never a media query |
| `.tl-monitor` / `.tl-screen` / `.tl-clock` | `styles.css` | The picture and its clock. `flex: 1 100 var(--monitor-h)` — the shrink of 100 is what makes the picture, not the lanes, absorb a squeeze |
| `.tl-read` | `styles.css` | The playhead readout: `--raise` bar, mono mm:ss + the line, `cursor: text`, an inline `<input>` when open |
| `.tl-nag` | `styles.css` | The unconfirmed-transcript banner: accent-tinted, one sentence, one `looks right` button per pending take |
| `.tl-busy` | `styles.css` | The transcriber, said once and quietly, in mono `--fs-2xs`. The word is the status |
| `.tl-scroll` / `.tl-inner` | `styles.css` | One scroller for ruler *and* tracks, so they can never disagree about x. Background `--well`. It **hugs its lanes** — a well with empty space in it is what made this look like a broken editor |
| `.tl-ruler` / `.tl-tick` / `.tl-knob` / `.tl-head` | `styles.css` | Sticky ruler, mono ticks, the accent grab knob, the 1px accent playhead line |
| `.tl-strip` / `.tl-cell` | `styles.css` | The filmstrip and one cell. `.gap` when no keyframe is within reach; `.on` is an accent outline, inset, never a fill |
| `.tl-marks` / `.tl-mark` | `styles.css` | 3px strip along the filmstrip's top edge and the 2px accent ticks on it |
| `.tl-voice` / `.tl-clip` | `styles.css` | The voice lane and one block. No padding on the box (border-box would floor a 5px clip at its own padding and re-create overlap); the text carries the inset. `.now` under the playhead, `.on` selected, `.edit` widens to type in |
| `.tl-seam` | `styles.css` | 1px dashed `--line-strong`, where a take begins. No label — it is one gripe |
| `.tl-range` / `.tl-marquee` | `styles.css` | Accent-soft with a `.4` border: the ruler sweep (full height) and the marquee (a box) |
| `.tl-bar` | `styles.css` | The selection bar: accent-soft, the range or the count, and `delete` pushed right |
| `.tl-zoom` | `styles.css` | `–` `+` and `fit`, hairline squares at `--fs-sm` |
| `.tl-label` | `styles.css` | `frames` / `voice`, sticky at the left edge over a `--well` gradient, so a scrolled lane still says what it is |
| `.empty` | `styles.css` | The two-line empty state, centered, `--faint`, 1.75 line-height |
| `.histbtn` | `styles.css` | `history · N` — a text button. N counts the *other* gripes; at 0 it isn't rendered |
| `.inbox-line` | `styles.css` | The connected inbox as one row: status dot + `inbox · <path>` + `.pathq` when the absolute path is still missing. The whole line is the button; clicking it opens `.rootpath` |
| `.setup` | `styles.css` | The one state that gets a card instead of a line: `gripes need somewhere to land`, the `.link.hot` button, one sub-line. Nothing else in the panel until a folder exists |
| `.settings-row` + `.toggle` | `styles.css` | One `--faint` lowercase word, revealing one switch — a sentence per line with a dot carrying the state, not a pill |
| `.app.pop` | `styles.css` | The strip: `.head` at 7px padding, `.popname` (a borderless name input), `.recmini` / `.stopmini`, and the footer buttons shrunk to pills |
| `.srow` | `styles.css` | A gripe in the history list: accent left rail when active, mono sub-line, hover-only `×`. `.srow.closed` mutes its name and carries a `closed` tag |
| `.kill` | `styles.css` | *Every* destructive hover-`✕`: absolute, invisible until its row is hovered, accent on hover. Contexts set position only |
| `.link.hot` | `styles.css` | The accent-tinted link for the one thing still missing: `Choose folder` (or `Open in tab →`), and `reconnect` when permission lapsed |
| `.flash` | `styles.css` | Inverted transient toast, 1.7s, rises 8px |

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

/* Selected is a state, so it wears the accent — as an outline, never a fill */
.tl-cell.on, .tl-clip.on { outline: 1px solid var(--accent); outline-offset: -1px; }
```

There is no `<kbd>` in either stylesheet. Where a key is advertised — the dock — it is plain text
inside the button's own label, in the same weight and size as the verb.

## States

- **Empty** — centered, `--faint`, two lines and no keys: `nothing yet` / `hit **Record** and talk
  through what's wrong`. Never "No data."
- **Recording** — two surfaces change at once. In the panel the controls strip *becomes* the HUD:
  the hero is gone for the duration, because there is exactly one thing to do here and it is Stop.
  Stop reads `saving…` and disables itself while the take is written; the moment it returns, Record is
  pressable again — back-to-back takes are the point. On the recorded tab the `.dock` slides up with
  the clock and everything else you might want. The panel says so once, in `.sub`, then stays out of it.
- **Recording, elsewhere** — the dock is scoped to the origin that was in front when Record was
  pressed, so every other tab gets ripples and telemetry but no pill. A tab that loads mid-walkthrough
  is told again and catches up; its clock starts from when it arrived, a few seconds low and invisible
  at mm:ss.
- **Drawing vs clicking** — one toggle, two honest states. `draw (d)` armed: the ink owns the pointer
  (crosshair, strokes land immediately), the button wears `.arm`, and its label reads `click (d)` —
  what pressing it does next, not what it is. Off: the pointer belongs to the page again and
  **everything drawn stays on screen**. Drawing starts armed by default (`settings.drawStart`) — a
  feature behind a hotkey is a feature nobody has.
- **Ink getting old** — strokes hold full opacity for 3s after the last stroke activity, then fade
  linearly to nothing over 4s and are dropped. Any new stroke restores **every** stroke on screen to
  full. Fading is the default way ink goes away; `clear (c)` is the instant wipe. A click that never
  moved is not a stroke and must not flash old ink back to full.
- **Recording on a page that can't host the dock** — `chrome://`, the Web Store, no content script:
  the HUD omits its `.sub` line rather than pointing at a bar that isn't there.
- **Waiting on the transcript** — one quiet mono line above the tracks (`reading audio…`,
  `transcribing narration…`, `loading model…`, `fetching whisper model — 42%`, `queued`). No spinner,
  no progress bar; the word is the status.
- **Unconfirmed transcript** — the nag sits above the axis until every take with words has been read
  back. It is the one banner in the product, because a noun the ASR guessed wrong sends an agent to
  the wrong file.
- **Interrupted** — a take reassembled from chunks after the panel died is never presented as whole;
  the report says the tail may be missing and the panel flashes `recovered an interrupted recording`.
- **Something selected** — the selection bar appears; that is the only time a destructive verb is
  visible in the timeline. `Delete`/`Backspace` do the same thing silently, and are advertised nowhere.
- **A stale edit** — a Whisper pass can replace a whole transcript under a drag. The write is skipped
  and the flash says so in plain words: `the transcript changed underneath — check what remains`.
- **Error / degraded** — never a red banner. In the panel it's the `.flash` pill; in the HUD it's the
  interim line turning `.warn` (`#ffcbbb`): `microphone blocked — no narration this time · fix it`.
- **Connection status** — one 6px dot on the inbox line: `--faint` (nothing connected or FSA
  unsupported), `--accent` (connected, needs permission), `#58c98a` (writing). While the absolute path
  is still missing, a `.pathq` chip reading `path?` sits at the end of the line — it's the one thing
  that makes the prompt work from any repo. Permission lapsed shows exactly one control, `reconnect`.
- **Finished** — closing a gripe empties the panel back to its empty state; that blankness is the
  confirmation, plus one `.flash` (`gripe closed — prompt copied`). Nothing turns green, nothing ticks.
- **Destructive** — a `✕` that only appears on row hover, with a tooltip saying what survives
  ("Forget this session (files on disk are kept)"). No confirmation dialogs — modals freeze capture.

## Voice / copy

Lowercase, terse, second person, no punctuation at the end of short strings. The UI talks like a
colleague watching over your shoulder.

Good: `hit Record and talk through what's wrong` · `gripes need somewhere to land` ·
`prompt copied — paste into Claude Code` · `saved — on the timeline` ·
`recovered an interrupted recording` · `screen share refused` · `gripe closed — prompt copied`

Bad: `Please select an element to continue.` · `Error: Operation failed` · `Successfully saved!` ·
`Settings` as a heading · anything with an exclamation mark · **anything naming a key outside the
dock's own labels**.

| Where | Copy |
| --- | --- |
| Empty timeline | `nothing yet` / `hit **Record** and talk through what's wrong` |
| Header summary | `4:12 recorded · on disk` (or `2/3 on disk`) |
| No folder | `gripes need somewhere to land` · button `Choose folder` (`Open in tab →` when the picker is refused) · sub-line `pick or create one folder — every project's gripes go there` |
| No File System Access | `folder writing unavailable — use .zip` |
| Idle controls | `Record` (with a `●` dot) |
| Live HUD | `■ Stop` → `saving…` · `draw and stop from the little bar on the page` · `microphone blocked — no narration this time · fix it` |
| Page dock | `draw (d)` ⇄ `click (d)` · `clear (c)` · `mark (m)` · `stop (s)` |
| Timeline nag | `Read this back before you hand it off.` + `looks right` |
| Selection bar | `0:42–1:10 · 9 items` / `9 selected` · `delete` |
| Zoom | `–` · `+` · `fit` |
| Inbox line | `inbox · <path>` · `path?` · `reconnect` · `forget this folder` |
| History | `history · 4` · `no gripes yet` · `closed` · `3 recordings · <date>` |
| Settings | `settings` — then the one switch, `recordings start ready to draw` |
| Footer | `Copy prompt for Claude Code` · `.zip` · `done` |
| Strip bar | `record` · `■ 2:41` · `Copy prompt` · `done` |

A recorded session is a **gripe** in the UI (`Untitled gripe`, `no gripes yet`, `gripe closed`), even
though the code and the specs call it a session. **A gripe is one timeline.** Recording twice does not
produce "part 2" or "recording 2" — it extends the same axis, with a seam and nothing else. The words
**part**, **rec**, **recording 1/2** must never appear in UI copy again; `rec-NN/` survives on disk,
where the user isn't looking. Internally a single sitting is a **take**, and that word stays in the
code and these docs, not on screen. The one connected folder is the **inbox**.

The longest string in the product is the one that earns it — the why-line under the path input:
`chrome won't tell us where this folder lives. paste its full path once — every prompt will carry it
so your agent never hunts.` It asks for something only the user can give, so it says why.

Buttons are verbs or nouns, never sentences: `Choose folder`, `reconnect`, `.zip`, `done`, `Stop`,
`delete`, `fit`, `Copy prompt for Claude Code`.

## Don'ts

- ❌ **A keyboard shortcut in panel or strip copy.** Not a `<kbd>`, not "press X", not a tooltip
  carrying the only instruction. The dock's labels are the single exception, and they are labels, not
  documentation.
- ❌ **The words "part", "rec 01", "recording 2" in the UI.** A gripe is one timeline. Takes are a
  disk layout and an implementation detail.
- ❌ **Absolutely positioned fixed-size thumbnails on a track.** That is the card-deck smear that
  killed v1. Frames are a filmstrip of fixed-width cells; anything per-item and fixed-size dies at ten
  minutes.
- ❌ **Text as the primary form of a voice clip.** Blocks are the shape; text is a bonus at ≥48px.
  The readout is where words are read.
- ❌ **A fifth thing in the panel.** Record, timeline, Copy prompt, done. New controls go behind the
  `settings` disclosure, onto the page, into the strip's bar — or they don't ship.
- ❌ **A control in the panel when the user's eyes are on the page.** Anything you'd reach for
  *during* a walkthrough belongs on the `.dock`.
- ❌ **Full-bleed content at wide widths — except the strip.** The column caps at `--max` and centers;
  the wide-and-short media query is the only exemption, and it exists for one surface.
- ❌ **Empty reserved height in the timeline.** The tracks container hugs its lanes. A well with
  nothing in it reads as broken.
- ❌ **A second hue.** `#58c98a` on the folder dot is the entire exception. No blue, no yellow, no red.
- ❌ **Accent as a plain button fill.** The primary action inverts (`--text` bg); accent means *state*.
- ❌ **Shadows in the side panel.** Separation there is 1px `--line`. Shadows belong to `.glass` and
  the `.flash` pill only.
- ❌ **A CSS framework, a component library, or CSS-in-JS.** Two hand-written stylesheets, that's it.
- ❌ **React (or any framework) in the content script.** It boots on every page the user visits.
- ❌ **Unscoped styles in the page.** Everything overlay-side lives inside the shadow root; `:host`
  starts with `all: initial`.
- ❌ **Light mode / system theme.** Both surfaces declare `color-scheme: dark`.
- ❌ **Emoji, illustrations, or icon fonts.** The reticle mark is inline and hand-drawn; the extension
  icons are generated by `scripts/make-icons.mjs`. (`⧉` is a glyph on a button, not decoration.)
- ❌ **`alert` / `confirm` / any modal.** A browser dialog blocks the extension's event loop.
- ❌ **Decorative animation.** If it loops it means "live"; if it fades it means "old".
- ❌ **Title Case, exclamation marks, or "Successfully".**
- ❌ **A hardcoded `px` font-size or padding in `styles.css`.** Use a token, or add one.
