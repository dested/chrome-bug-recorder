# Agent Report

> Status: **done** · Last updated: 2026-07-26

## What / Why

The deliverable. `report.md` is written **for a coding agent to read, not a human to skim**: an
instruction preamble, then one section per note with the evidence as labeled bullets, the screenshots
inline, the opening tag as HTML, and the console noise folded into `<details>`. Alongside it,
`notes.json` for anything that wants to parse rather than read, a one-click prompt for the clipboard,
and a `.zip` fallback for when no folder is connected.

## Behavior spec

**report.md**

- Header: `# Bug report — <session name>`, then a line with the note count, the recording time range
  (`YYYY-MM-DD HH:MM–HH:MM`), and the origin of the first note.
- Then a blockquoted preamble addressed to the model: each note is one observation in order, here is
  what a note gives you, **read the images** — they are the primary evidence and the spoken notes
  assume you looked.
- When there is more than one note, an **Index** of numbered links (`#note-N`) with each note's title,
  short URL, and selector.
- Each note renders as: an anchor, `## N. <title>`, the remaining lines of the spoken text, then
  bullets — **URL**, **Time**, the target line, **Viewport**.
- The **title** is the first line of the note's text truncated to 90 characters, or `<mode> note` when
  the note has no text.
- The target line depends on mode: **Element** (selector, element text, interesting attributes, box),
  **Region** (coordinates + "dragged, not a single element"), **Annotation** (stroke count), or
  **Scope: the whole page, no specific element**.
- Images follow as relative markdown links — `NN-full.png` always, `NN-target.png` when a crop exists
  — so the folder can be moved or copied anywhere.
- When the target has HTML, the opening tag is emitted as a fenced ```html block.
- When the note has events, a `<details><summary>Console / network at capture time (N)</summary>`
  block holds them in a fenced code block, one `[level] message` per line with the detail indented.
- Footer: a `<sub>` credit line pointing at the repo and naming `notes.json`.
- The file is regenerated in full on every write — it is never appended to.

**notes.json**

- Same content, machine-readable: session (name, slug, ISO `createdAt`, origin) plus a `notes` array
  with index, ISO timestamp, text, mode, url, title, viewport, target, region, events, and an
  `images` array of the filenames. `strokes` and `written` are not included.

**Copy prompt**

- When the user clicks **Copy prompt for Claude Code**, the clipboard receives:
  `Read <folder>/<slug>/report.md — it's a bug report I recorded while clicking through the running
  app, with screenshots. Look at every image, then fix what's described.` — where `<folder>` is
  `<connected dir name>/gripes` when a folder is connected, or just `gripes` when not.
- The panel flashes "prompt copied — paste into Claude Code".

**Export .zip**

- When the user clicks **.zip**, a store-only (uncompressed) archive is assembled containing
  `<slug>/report.md`, `<slug>/notes.json`, and every note's PNGs, and handed to
  `chrome.downloads.download` with `saveAs: true`.
- Both export buttons are disabled while the session has no notes.

## Touchpoints

| Part | File |
| --- | --- |
| `PREAMBLE`, `buildReport`, `buildNotesJson`, `agentPrompt` | `src/lib/markdown.ts` |
| Time/URL/truncation helpers | `src/lib/format.ts` |
| ZIP writer + CRC32 | `src/lib/zip.ts` |
| Copy/zip buttons, blob assembly | `src/sidepanel/App.tsx` |
| Writing the files | `writeSession` in `src/lib/fs.ts` |

## Data

Reads `Session` and `Note[]` — no state of its own. `Note.fullFile` / `Note.cropFile` are assigned at
capture time (`NN-full.png` / `NN-target.png`, zero-padded from `session.noteCount`) and are the only
link between the markdown and the blobs.

## Edge cases

- **A note with no text** gets `<mode> note` as its title; the panel shows "no comment — screenshot
  only".
- **Multi-line dictation** — line 1 is the heading, the rest becomes the body paragraph.
- **Deleted notes leave numbering gaps**; the index and filenames stay consistent with each other.
- **A single-note session** skips the Index section.
- **Markdown-special characters in spoken text** are not escaped — a note containing backticks or a
  `#` can affect rendering (rarely matters; agents read it fine).
- **Very long attribute values** are truncated to 60 chars, element text to 120, opening HTML to 400
  with an ellipsis.
- **Zip is store-only** — PNGs are already compressed, so the archive is roughly the sum of its
  parts. Nothing streams; a very long session builds the whole archive in memory.

## Open questions

- [ ] The credit link points at `https://github.com/dested/gripe` — verify that's the final repo name
      before release.
- [ ] No way to export a subset of notes, or to reorder them.
- [ ] The report has no place for the user to add overall context ("this is the checkout rewrite").

## How to verify

See `verify.md` flow **7** [cheap]. Read the produced `report.md` in a markdown previewer with the
folder in place: the images must render from relative paths, and the console block must be collapsed.
