import type { Note, Session } from './types';
import { clockTime, dateTime, hhmm, originOf, shortUrl, truncate } from './format';

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

/** The line you paste into Claude Code. */
export function agentPrompt(session: Session, folderName: string): string {
  return `Read ${folderName}/${session.slug}/report.md — it's a bug report I recorded while clicking through the running app, with screenshots. Look at every image, then fix what's described.`;
}
