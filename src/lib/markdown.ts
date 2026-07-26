import type { Note, RecordingMeta, Session } from './types';
import { clockTime, dateTime, hhmm, mmss, originOf, shortUrl, truncate } from './format';

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

export function buildReport(session: Session, notes: Note[]): string {
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

export function buildNotesJson(session: Session, notes: Note[]): string {
  return JSON.stringify(
    {
      session: {
        name: session.name,
        slug: session.slug,
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
> A human recorded their screen and talked through it. Below is the recording as
> you can read it: keyframes captured whenever the screen meaningfully changed,
> every spoken line stamped where the speaker started it, and any console or
> network errors that fired — one timeline, in order. \`frame 3 @ 1:24\` means
> that image shows the screen at 1:24. **Read every image in order** — the
> narration assumes you are watching.`;

/** A spoken line or an error, already rendered, carrying where it lands on the timeline. */
interface TimelineItem {
  pos: number;
  lines: string[];
}

function timelineItems(rec: RecordingMeta): TimelineItem[] {
  const items: TimelineItem[] = rec.transcript.map((seg) => ({
    pos: seg.t,
    lines: ['', `> **${mmss(seg.t)}** ${seg.text}`],
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

export function buildRecordingReport(session: Session, rec: RecordingMeta): string {
  const frameCount = rec.frames.length;
  const lineCount = rec.transcript.length;
  const errorCount = rec.events.length;

  const out: string[] = [];
  out.push(`# Walkthrough — ${session.name}`);
  out.push('');
  const stats = [
    `\`${frameCount} keyframe${frameCount === 1 ? '' : 's'}\``,
    `\`${mmss(rec.durationMs)}\``,
    `\`${lineCount} spoken line${lineCount === 1 ? '' : 's'}\``,
    `recorded ${dateTime(rec.startedAt)}`,
  ];
  if (errorCount) stats.push(`\`${errorCount} error${errorCount === 1 ? '' : 's'} captured\``);
  out.push(stats.join(' · '));
  out.push('');
  out.push(RECORDING_PREAMBLE);
  out.push('');
  out.push('## Timeline');
  out.push('');

  // Every item lands under the last frame at or before it — so anything spoken
  // before the first frame rides with it, and the final frame absorbs the tail.
  const items = timelineItems(rec);
  let cursor = 0;
  rec.frames.forEach((frame, i) => {
    const end = rec.frames[i + 1]?.t ?? Infinity;
    out.push('---');
    out.push('');
    out.push(`### frame ${frame.index} @ ${mmss(frame.t)}`);
    out.push('');
    out.push(`![frame ${frame.index} @ ${mmss(frame.t)}](${frame.file})`);
    while (cursor < items.length && items[cursor].pos < end) {
      out.push(...items[cursor].lines);
      cursor++;
    }
    out.push('');
  });
  // No frames means nothing to anchor to, but the narration still has to survive.
  for (; cursor < items.length; cursor++) out.push(...items[cursor].lines);
  if (!frameCount && items.length) out.push('');

  out.push('---');
  out.push('');
  out.push(
    `Raw video: \`${rec.videoFile}\` (for humans). Contact sheets: \`grids/\` — 3×3 chronological tiles when you want the sweep instead of stills. Machine-readable: \`recording.json\`. Transcript: \`transcript.txt\`. Manifest: \`MANIFEST.txt\`.`,
  );
  out.push('');
  out.push(`<sub>Recorded with [Gripe](https://github.com/dested/gripe).</sub>`);
  out.push('');
  return out.join('\n');
}

export function buildTranscriptTxt(rec: RecordingMeta): string {
  if (!rec.transcript.length) return '(no narration)\n';
  return `${rec.transcript.map((seg) => `[${mmss(seg.t)}] ${seg.text}`).join('\n')}\n`;
}

export function buildRecordingJson(session: Session, rec: RecordingMeta): string {
  return JSON.stringify(
    {
      session: {
        name: session.name,
        slug: session.slug,
        createdAt: new Date(session.createdAt).toISOString(),
        origin: session.origin,
      },
      recording: {
        startedAt: new Date(rec.startedAt).toISOString(),
        durationMs: rec.durationMs,
        sampled: rec.sampled,
        video: rec.videoFile,
        frames: rec.frames.map((f) => ({
          index: f.index,
          at: mmss(f.t),
          tMs: f.t,
          file: f.file,
          reason: f.reason,
          dist: f.dist,
        })),
        transcript: rec.transcript.map((s) => ({ at: mmss(s.t), tMs: s.t, text: s.text })),
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

/** crv-style manifest: stats up top, transcript inline — the reference's MANIFEST.txt. */
export function buildManifestTxt(session: Session, rec: RecordingMeta): string {
  const lines = [
    `source: screen recording — ${session.name}`,
    `duration: ${Math.round(rec.durationMs / 1000)}s | frames: ${rec.frames.length} (0.5s candidates + live dedup, deduped from ${rec.sampled} sampled)`,
    `frames dir: frames`,
    `transcript: ${rec.transcript.length ? 'transcript.txt (live dictation, Web Speech)' : '(none — no narration was captured)'}`,
    '--- transcript ---',
    rec.transcript.length ? rec.transcript.map((s) => `[${mmss(s.t)}] ${s.text}`).join('\n') : '(none)',
  ];
  return lines.join('\n') + '\n';
}

/** The line you paste into Claude Code. */
export function agentPrompt(session: Session, folderName: string): string {
  if (session.kind === 'recording') {
    return `Read ${folderName}/${session.slug}/report.md — it's a narrated screen recording I made walking through the running app, distilled into keyframes and a timed transcript. Look at every image in order, then do what the narration asks.`;
  }
  return `Read ${folderName}/${session.slug}/report.md — it's a bug report I recorded while clicking through the running app, with screenshots. Look at every image, then fix what's described.`;
}
