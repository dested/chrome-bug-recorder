import type { Note, RecordingFrame, RecordingMeta, Session, TranscriptSegment } from './types';
import { GRID_PER_SHEET } from './types';
import { clockTime, dateTime, hhmm, looksAbsolute, mmss, originOf, shortUrl, truncate } from './format';

/**
 * The whole point of this extension is this file. It is written for a coding
 * agent first and a human second: evidence up front, no prose the model has to
 * wade through, and every image path relative so the folder can be moved.
 */

const PREAMBLE = `> **You are reading a bug report recorded by a human using the running app.**
> Each note below is one observation, in the order it happened. A note gives you:
> what the human said, the exact URL, the DOM element they were pointing at, and
> screenshots — a full viewport capture with the target highlighted, plus a
> close-up crop. Console and network errors captured at that moment are included
> when they exist. **Read the images** — they are the primary evidence, and the
> spoken notes are shorthand that assumes you looked.`;

/**
 * The File System Access API never tells us where the folder is on disk, so this
 * is whatever the user typed once in the panel. The first agent to read a bundle
 * spent six tool calls hunting for it; a line at the top is the whole fix.
 */
function locationLines(folder?: string): string[] {
  if (!folder) return [];
  const absolute = looksAbsolute(folder);
  const tail = absolute
    ? 'every image path below is relative to it.'
    : 'That is relative to the project root — every image path below is relative to it. If it does not resolve from where you are, search for that directory name.';
  return [`**This folder:** \`${folder}\` — ${tail}`, ''];
}

function noteTitle(note: Note): string {
  const first = note.text.split('\n')[0]?.trim();
  return first ? truncate(first, 90) : `${note.mode} note`;
}

function targetLine(note: Note): string[] {
  const lines: string[] = [];
  if (note.target) {
    const t = note.target;
    lines.push(`- **Element** \`${t.selector}\``);
    if (t.text) lines.push(`- **Element text** "${truncate(t.text, 120)}"`);
    const attrs = Object.entries(t.attrs);
    if (attrs.length) {
      lines.push(`- **Attributes** ${attrs.map(([k, v]) => `\`${k}="${truncate(v, 60)}"\``).join(' ')}`);
    }
    lines.push(
      `- **Box** ${Math.round(t.rect.x)},${Math.round(t.rect.y)} · ${Math.round(t.rect.width)}×${Math.round(t.rect.height)}`,
    );
  } else if (note.region) {
    const r = note.region;
    lines.push(
      `- **Region** ${Math.round(r.x)},${Math.round(r.y)} · ${Math.round(r.width)}×${Math.round(r.height)} (dragged, not a single element)`,
    );
  } else if (note.mode === 'draw') {
    lines.push(`- **Annotation** freehand drawing on the screenshot (${note.strokes ?? 0} strokes)`);
  } else {
    lines.push(`- **Scope** the whole page, no specific element`);
  }
  return lines;
}

function eventsBlock(note: Note): string {
  if (!note.events.length) return '';
  const body = note.events
    .map((e) => `[${e.level}] ${e.message}${e.detail ? `\n        ${e.detail}` : ''}`)
    .join('\n');
  return `\n<details><summary><b>Console / network at capture time</b> (${note.events.length})</summary>\n\n\`\`\`\n${body}\n\`\`\`\n\n</details>\n`;
}

export function buildReport(session: Session, notes: Note[], folder?: string): string {
  const first = notes[0]?.createdAt ?? session.createdAt;
  const last = notes[notes.length - 1]?.createdAt ?? session.updatedAt;
  const origin = notes[0] ? originOf(notes[0].url) : session.origin;

  const out: string[] = [];
  out.push(`# Bug report — ${session.name}`);
  out.push('');
  out.push(
    `\`${notes.length} note${notes.length === 1 ? '' : 's'}\` · recorded ${dateTime(first)}–${hhmm(last)} · ${origin}`,
  );
  out.push('');
  out.push(...locationLines(folder));
  out.push(PREAMBLE);
  out.push('');

  if (notes.length > 1) {
    out.push('## Index');
    out.push('');
    for (const note of notes) {
      const where = note.target ? ` · \`${note.target.selector}\`` : '';
      out.push(`${note.index}. [${noteTitle(note)}](#note-${note.index}) — \`${shortUrl(note.url)}\`${where}`);
    }
    out.push('');
  }

  for (const note of notes) {
    out.push('---');
    out.push('');
    out.push(`<a id="note-${note.index}"></a>`);
    out.push('');
    out.push(`## ${note.index}. ${noteTitle(note)}`);
    out.push('');
    if (note.text.includes('\n')) {
      out.push(note.text.split('\n').slice(1).join('\n').trim());
      out.push('');
    }
    out.push(`- **URL** \`${note.url}\``);
    out.push(`- **Time** ${clockTime(note.createdAt)}`);
    out.push(...targetLine(note));
    out.push(
      `- **Viewport** ${note.viewport.width}×${note.viewport.height} @${note.viewport.dpr}x · scrolled to ${Math.round(note.viewport.scrollX)},${Math.round(note.viewport.scrollY)}`,
    );
    out.push('');
    out.push(`![Note ${note.index} — full viewport](${note.fullFile})`);
    if (note.cropFile) {
      out.push('');
      out.push(`![Note ${note.index} — target close-up](${note.cropFile})`);
    }
    if (note.target?.html) {
      out.push('');
      out.push('```html');
      out.push(note.target.html);
      out.push('```');
    }
    const events = eventsBlock(note);
    if (events) out.push(events);
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(
    `<sub>Recorded with [Gripe](https://github.com/dested/gripe). Machine-readable copy: \`notes.json\`.</sub>`,
  );
  out.push('');
  return out.join('\n');
}

export function buildNotesJson(session: Session, notes: Note[], folder?: string): string {
  return JSON.stringify(
    {
      session: {
        name: session.name,
        slug: session.slug,
        folder,
        createdAt: new Date(session.createdAt).toISOString(),
        origin: session.origin,
      },
      notes: notes.map((n) => ({
        index: n.index,
        at: new Date(n.createdAt).toISOString(),
        text: n.text,
        mode: n.mode,
        url: n.url,
        title: n.title,
        viewport: n.viewport,
        target: n.target,
        region: n.region,
        events: n.events,
        images: [n.fullFile, n.cropFile].filter(Boolean),
      })),
    },
    null,
    2,
  );
}

const RECORDING_PREAMBLE = `> **You are reading a narrated screen recording, distilled for a model.**
> A human recorded their screen and talked through it. Read it in this order:
>
> 1. **The contact sheets** — nine keyframes per image, in order. Those cover the
>    *whole* recording at a fraction of the tokens; read all of them first.
> 2. **The timeline** below — the same recording as text. A full still is inlined
>    only where the narration is pointing at something; every other keyframe is
>    listed by filename (\`frames/NN-mmss.jpg\`) so you can open one when you need it.
>
> A spoken line covers a **window, not an instant**: it is stamped where the speaker
> started talking, and people narrate what just happened, so each line names the
> frames it is actually about — trust that range over the stamp. An accent crosshair
> drawn on a frame is the mouse pointer, and \`pointer\` under a frame names what it
> was over — that is how "this one over here" resolves.`;

/** How far around a spoken line we consider "the frames that line is about". */
const SPEECH_LEAD_MS = 2000;
const SPEECH_TAIL_MS = 2500;
/** Fallback line length when the transcriber gave no end time. */
const WORD_MS = 380;
const MIN_LINE_MS = 1200;
/** Ceilings on inlined stills — the complaint that started all this was 68 for 6 lines. */
const MAX_INLINE = 16;
const QUIET_INLINE = 12;

/** A spoken line plus the window of screen time it plausibly refers to. */
interface Spoken {
  seg: TranscriptSegment;
  end: number;
  from: number;
  to: number;
}

function spokenWindows(rec: RecordingMeta): Spoken[] {
  return rec.transcript.map((seg) => {
    const spoken = seg.d ?? Math.max(MIN_LINE_MS, seg.text.split(/\s+/).length * WORD_MS);
    const end = seg.t + spoken;
    return { seg, end, from: Math.max(0, seg.t - SPEECH_LEAD_MS), to: end + SPEECH_TAIL_MS };
  });
}

/** frame index → the contact sheet it appears on. Batching must match `makeGrids`. */
function sheetOf(rec: RecordingMeta): Map<number, number> {
  const map = new Map<number, number>();
  rec.frames.forEach((f, i) => map.set(f.index, Math.floor(i / GRID_PER_SHEET) + 1));
  return map;
}

function sheetFile(n: number): string {
  return `grids/grid_${String(n).padStart(2, '0')}.jpg`;
}

/** Pick every nth of `pool` until `budget` is met — the thinning shape used for frames. */
function spread<T>(pool: T[], budget: number): T[] {
  if (budget <= 0 || !pool.length) return [];
  if (pool.length <= budget) return pool;
  const step = pool.length / budget;
  return Array.from({ length: budget }, (_, i) => pool[Math.floor(i * step)]);
}

/**
 * Which frames get a full still. Marks and the opening frame always; otherwise the
 * ones inside a spoken window, thinned if the human talked the whole time. With no
 * narration at all there is nothing to aim at, so take a spread and lean on the sheets.
 */
function inlineFrames(rec: RecordingMeta, spoken: Spoken[]): Set<number> {
  const must = rec.frames.filter((f) => f.reason === 'mark' || f.index === rec.frames[0]?.index);
  const shown = new Set(must.map((f) => f.index));
  if (!spoken.length) {
    for (const f of spread(rec.frames.slice(1), QUIET_INLINE - shown.size)) shown.add(f.index);
    return shown;
  }
  const inWindow = rec.frames.filter(
    (f) => !shown.has(f.index) && spoken.some((s) => f.t >= s.from && f.t <= s.to),
  );
  for (const f of spread(inWindow, MAX_INLINE - shown.size)) shown.add(f.index);
  return shown;
}

/** The frames a spoken line is pointing at, rendered as a range. */
function coverage(rec: RecordingMeta, s: Spoken): string {
  const hit = rec.frames.filter((f) => f.t >= s.from && f.t <= s.to);
  if (!hit.length) return 'no keyframe inside that window — see the contact sheets';
  const first = hit[0];
  const last = hit[hit.length - 1];
  if (hit.length === 1) return `frame ${first.index} @ ${mmss(first.t)}`;
  return `frames ${first.index}–${last.index} · ${mmss(first.t)}–${mmss(last.t)}`;
}

/** A spoken line or an error, already rendered, carrying where it lands on the timeline. */
interface TimelineItem {
  pos: number;
  lines: string[];
}

function timelineItems(rec: RecordingMeta, spoken: Spoken[]): TimelineItem[] {
  const items: TimelineItem[] = spoken.map((s) => ({
    pos: s.seg.t,
    lines: [
      '',
      `> **${mmss(s.seg.t)}–${mmss(s.end)}** ${s.seg.text}`,
      `> ↳ about ${coverage(rec, s)}`,
    ],
  }));
  for (const e of rec.events) {
    // Event timestamps are absolute; the timeline is relative to the recording.
    const rel = Math.max(0, e.ts - rec.startedAt);
    const detail = e.detail ? ` — ${truncate(e.detail, 200)}` : '';
    items.push({
      pos: rel,
      lines: ['', `- \`[${e.level}] @ ${mmss(rel)}\` ${truncate(e.message, 200)}${detail}`],
    });
  }
  return items.sort((a, b) => a.pos - b.pos);
}

function pointerLine(frame: RecordingFrame): string | null {
  const p = frame.pointer;
  if (!p?.selector) return null;
  const text = p.text ? ` — "${truncate(p.text, 60)}"` : '';
  const drawn = p.nx === undefined ? ' (position not drawable on this capture)' : '';
  return `- **pointer** \`${p.selector}\`${text}${drawn}`;
}

/** One inlined still. */
function frameBlock(frame: RecordingFrame, sheet: number | undefined): string[] {
  const marked = frame.reason === 'mark';
  const where = sheet ? ` · also on \`${sheetFile(sheet)}\`` : '';
  const lines = [
    '---',
    '',
    `### ${marked ? '★ ' : ''}frame ${frame.index} @ ${mmss(frame.t)}${marked ? ' — the human marked this moment' : ''}${where}`,
    '',
    `![frame ${frame.index} @ ${mmss(frame.t)}](${frame.file})`,
  ];
  const pointer = pointerLine(frame);
  if (pointer) lines.push('', pointer);
  return lines;
}

/** A run of frames nobody narrated over: one line, not one image each. */
function runLine(run: RecordingFrame[], sheets: Map<number, number>): string {
  const first = run[0];
  const last = run[run.length - 1];
  const grids = [...new Set(run.map((f) => sheets.get(f.index)).filter(Boolean))] as number[];
  const on = grids.length ? ` · on ${grids.map((n) => `\`${sheetFile(n)}\``).join(', ')}` : '';
  if (run.length === 1) return `- frame ${first.index} @ ${mmss(first.t)} — \`${first.file}\`${on}`;
  return `- frames ${first.index}–${last.index} · ${mmss(first.t)}–${mmss(last.t)} — ${run.length} keyframes, nothing said over them: \`${first.file}\` … \`${last.file}\`${on}`;
}

/** How much to trust the words — the ASR error that sent an agent to the wrong file. */
function transcriptCaveat(rec: RecordingMeta): string[] {
  if (!rec.transcript.length) return [];
  if (rec.reviewed) {
    return ['> The speaker read this transcript back and corrected it — the wording is theirs.', ''];
  }
  const how = rec.transcriber === 'whisper' ? 'Whisper small.en, on-device' : 'live browser dictation';
  return [
    `> The transcript is machine-transcribed (${how}) and **was not checked by the speaker**.`,
    '> Speech recognition mangles exactly the words that matter most — nouns, units, small numbers.',
    '> Where a word contradicts the frames or the code, believe the frames.',
    '',
  ];
}

function scopeLines(rec: RecordingMeta): string[] {
  if (!rec.events.length && !rec.droppedEvents) return [];
  const dropped = rec.droppedEvents ? ` ${rec.droppedEvents} event(s) from other tabs were dropped.` : '';
  if (!rec.eventScope) return [];
  return [
    `> Console/network lines below come only from \`${rec.eventScope}\` — the tab that was in front when recording started.${dropped}`,
    '',
  ];
}

export function buildRecordingReport(session: Session, rec: RecordingMeta, folder?: string): string {
  const frameCount = rec.frames.length;
  const lineCount = rec.transcript.length;
  const errorCount = rec.events.length;
  const markCount = rec.frames.filter((f) => f.reason === 'mark').length;

  const spoken = spokenWindows(rec);
  const shown = inlineFrames(rec, spoken);
  const sheets = sheetOf(rec);
  const sheetCount = Math.ceil(frameCount / GRID_PER_SHEET);

  const out: string[] = [];
  out.push(`# Walkthrough — ${session.name}`);
  out.push('');
  const stats = [
    `\`${frameCount} keyframe${frameCount === 1 ? '' : 's'}\``,
    `\`${mmss(rec.durationMs)}\``,
    `\`${lineCount} spoken line${lineCount === 1 ? '' : 's'}\``,
    `recorded ${dateTime(rec.startedAt)}`,
  ];
  if (markCount) stats.push(`\`${markCount} marked\``);
  if (errorCount) stats.push(`\`${errorCount} error${errorCount === 1 ? '' : 's'} captured\``);
  out.push(stats.join(' · '));
  out.push('');
  out.push(...locationLines(folder));
  out.push(RECORDING_PREAMBLE);
  out.push('');
  out.push(...transcriptCaveat(rec));
  out.push(...scopeLines(rec));

  if (sheetCount) {
    out.push('## Contact sheets — read these first');
    out.push('');
    out.push(
      `${frameCount} keyframes across ${sheetCount} sheet${sheetCount === 1 ? '' : 's'}, nine per image, in order, each tile labeled with its filename in \`frames/\`.`,
    );
    out.push('');
    for (let n = 1; n <= sheetCount; n++) {
      const batch = rec.frames.slice((n - 1) * GRID_PER_SHEET, n * GRID_PER_SHEET);
      const first = batch[0];
      const last = batch[batch.length - 1];
      const span = `frames ${first.index}–${last.index} · ${mmss(first.t)}–${mmss(last.t)}`;
      out.push(`![contact sheet ${n} — ${span}](${sheetFile(n)})`);
      out.push('');
    }
  }

  out.push('## Timeline');
  out.push('');
  if (frameCount) {
    out.push(
      `${shown.size} of ${frameCount} keyframe${frameCount === 1 ? '' : 's'} inlined below — the moments the narration is pointing at${markCount ? ', plus everything the human marked' : ''}. The rest are listed by filename, not dropped; every one of them is on the sheets above.`,
    );
    out.push('');
  }

  // Every item lands under the last frame at or before it — so anything spoken
  // before the first frame rides with it, and the final frame absorbs the tail.
  const items = timelineItems(rec, spoken);
  let cursor = 0;
  let run: RecordingFrame[] = [];
  const flushRun = () => {
    if (run.length) out.push(runLine(run, sheets), '');
    run = [];
  };

  rec.frames.forEach((frame, i) => {
    const end = rec.frames[i + 1]?.t ?? Infinity;
    const due = cursor < items.length && items[cursor].pos < end;
    if (shown.has(frame.index)) {
      flushRun();
      out.push(...frameBlock(frame, sheets.get(frame.index)));
    } else {
      run.push(frame);
      if (due) flushRun(); // narration has to stay in order with the frames it follows
    }
    while (cursor < items.length && items[cursor].pos < end) {
      out.push(...items[cursor].lines);
      cursor++;
    }
    if (shown.has(frame.index) || due) out.push('');
  });
  flushRun();
  // No frames means nothing to anchor to, but the narration still has to survive.
  for (; cursor < items.length; cursor++) out.push(...items[cursor].lines);
  if (!frameCount && items.length) out.push('');

  out.push('---');
  out.push('');
  out.push(
    `Every keyframe is in \`frames/\` (\`NN-mmss.jpg\` — the timestamp is the filename). Raw video: \`${rec.videoFile}\` (for humans). Machine-readable: \`recording.json\` — frame times, pointer positions, transcript windows, events. Transcript: \`transcript.txt\`. Manifest: \`MANIFEST.txt\`.`,
  );
  out.push('');
  out.push(`<sub>Recorded with [Gripe](https://github.com/dested/gripe).</sub>`);
  out.push('');
  return out.join('\n');
}

export function buildTranscriptTxt(rec: RecordingMeta): string {
  if (!rec.transcript.length) return '(no narration)\n';
  const lines = spokenWindows(rec).map((s) => `[${mmss(s.seg.t)}–${mmss(s.end)}] ${s.seg.text}`);
  return `${lines.join('\n')}\n`;
}

export function buildRecordingJson(session: Session, rec: RecordingMeta, folder?: string): string {
  return JSON.stringify(
    {
      session: {
        name: session.name,
        slug: session.slug,
        folder,
        createdAt: new Date(session.createdAt).toISOString(),
        origin: session.origin,
      },
      recording: {
        startedAt: new Date(rec.startedAt).toISOString(),
        durationMs: rec.durationMs,
        sampled: rec.sampled,
        video: rec.videoFile,
        transcriber: rec.transcriber ?? 'webspeech',
        transcriptReviewed: Boolean(rec.reviewed),
        eventScope: rec.eventScope,
        droppedEvents: rec.droppedEvents ?? 0,
        frames: rec.frames.map((f) => ({
          index: f.index,
          at: mmss(f.t),
          tMs: f.t,
          file: f.file,
          reason: f.reason,
          dist: f.dist,
          pointer: f.pointer,
        })),
        transcript: spokenWindows(rec).map((s) => ({
          at: mmss(s.seg.t),
          tMs: s.seg.t,
          // The window this line is about, not just where it started.
          endMs: s.end,
          aboutFromMs: s.from,
          aboutToMs: s.to,
          text: s.seg.text,
        })),
        events: rec.events.map((e) => ({
          level: e.level,
          at: mmss(Math.max(0, e.ts - rec.startedAt)),
          message: e.message,
          detail: e.detail,
        })),
      },
    },
    null,
    2,
  );
}

/** Where the lines in transcript.txt came from — the agent should weigh them differently. */
function transcriptSource(rec: RecordingMeta): string {
  const engine =
    rec.transcriber === 'whisper'
      ? 'transcript.txt (Whisper small.en, on-device)'
      : 'transcript.txt (live dictation, Web Speech)';
  return `${engine} — ${rec.reviewed ? 'read back and corrected by the speaker' : 'NOT checked by the speaker; treat wording as approximate'}`;
}

/** crv-style manifest: stats up top, transcript inline — the reference's MANIFEST.txt. */
export function buildManifestTxt(session: Session, rec: RecordingMeta, folder?: string): string {
  const marks = rec.frames.filter((f) => f.reason === 'mark').length;
  const lines = [
    `source: screen recording — ${session.name}`,
    ...(folder ? [`folder: ${folder}`] : []),
    `duration: ${Math.round(rec.durationMs / 1000)}s | frames: ${rec.frames.length} (0.5s candidates + live dedup, deduped from ${rec.sampled} sampled)${marks ? ` | ${marks} marked by hand` : ''}`,
    `frames dir: frames${rec.frames.length ? ` | contact sheets: grids (${Math.ceil(rec.frames.length / GRID_PER_SHEET)} sheets, ${GRID_PER_SHEET} frames each)` : ''}`,
    `errors: ${rec.events.length}${rec.eventScope ? ` from ${rec.eventScope}` : ''}${rec.droppedEvents ? ` (${rec.droppedEvents} dropped from other tabs)` : ''}`,
    `transcript: ${rec.transcript.length ? transcriptSource(rec) : '(none — no narration was captured)'}`,
    'note: line stamps are where the speaker started; the bracketed range is the window the line is about',
    '--- transcript ---',
    rec.transcript.length
      ? spokenWindows(rec)
          .map((s) => `[${mmss(s.seg.t)}–${mmss(s.end)}] ${s.seg.text}`)
          .join('\n')
      : '(none)',
  ];
  return lines.join('\n') + '\n';
}

/** The line you paste into Claude Code. */
export function agentPrompt(session: Session, folder: string): string {
  if (session.kind === 'recording') {
    return `Read ${folder}/report.md — it's a narrated screen recording I made walking through the running app: contact sheets of every keyframe, then a timeline with the stills and transcript. Read the sheets first, then do what the narration asks.`;
  }
  return `Read ${folder}/report.md — it's a bug report I recorded while clicking through the running app, with screenshots. Look at every image, then fix what's described.`;
}
