/**
 * The in-page overlay, built into a closed-ish shadow root so no page stylesheet
 * can reach it and none of our styles leak out. One host element, one style
 * sheet, hand-built DOM — no framework in the content script, because it has to
 * boot on every page the user visits and must never be the slow thing.
 */

const CSS = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  color-scheme: dark;
}
* { box-sizing: border-box; margin: 0; padding: 0; }

.layer {
  position: fixed;
  inset: 0;
  font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
  --accent: #ff5c39;
  --glass: rgba(12, 12, 14, 0.88);
  --line: rgba(255, 255, 255, 0.10);
  --text: #f2efec;
  --muted: rgba(242, 239, 236, 0.52);
}

.glass {
  background: var(--glass);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 24px 60px -12px rgba(0,0,0,0.7);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  color: var(--text);
}

/* ── hint chip ─────────────────────────────────────────── */
.hint {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%) translateY(-6px);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px 7px 12px;
  border-radius: 999px;
  font-size: 12.5px;
  letter-spacing: 0.01em;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity .14s ease, transform .14s ease;
}
.hint.on { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }
/* Dodge to the bottom when the cursor goes for the page's own header. */
.hint.low { top: auto; bottom: 22px; }

.tools { display: flex; gap: 3px; }
.tools button {
  font: inherit;
  font-size: 11.5px;
  color: var(--muted);
  background: none;
  border: 0;
  border-radius: 7px;
  padding: 5px 9px;
  cursor: pointer;
  white-space: nowrap;
  transition: background .12s ease, color .12s ease;
}
.tools button:hover { background: rgba(255,255,255,.08); color: var(--text); }
.tools button.on { background: rgba(255,92,57,.18); color: #ffcbbb; }
.tools .k { text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }
.exit {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  color: var(--muted);
  background: rgba(255,255,255,.06);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  transition: color .12s ease;
}
.exit:hover { color: var(--text); }
.hint .dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 0 rgba(255,92,57,.55);
  animation: pulse 1.9s ease-out infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(255,92,57,.5); }
  70% { box-shadow: 0 0 0 8px rgba(255,92,57,0); }
  100% { box-shadow: 0 0 0 0 rgba(255,92,57,0); }
}
.hint .sep { width: 1px; height: 14px; background: var(--line); }
.keys { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11.5px; }
kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 5px;
  background: rgba(255,255,255,0.07);
  border: 1px solid var(--line);
  color: var(--text);
}
kbd.hot { background: rgba(255,92,57,.16); border-color: rgba(255,92,57,.4); color: #ffb9a5; }

/* ── element highlight ─────────────────────────────────── */
.highlight {
  position: absolute;
  border: 2px solid var(--accent);
  border-radius: 4px;
  background: rgba(255, 92, 57, 0.08);
  box-shadow: 0 0 0 1px rgba(0,0,0,.35), 0 0 28px -4px rgba(255,92,57,.6);
  transition: all .07s cubic-bezier(.2,.8,.3,1);
  display: none;
}
.highlight.on { display: block; }
.highlight.locked { transition: none; background: rgba(255, 92, 57, 0.04); }

.tag {
  position: absolute;
  display: none;
  padding: 3px 7px;
  border-radius: 6px;
  background: var(--accent);
  color: #1a0a05;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  max-width: 60vw;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tag.on { display: block; }

/* ── region + draw surface ─────────────────────────────── */
.surface { position: absolute; inset: 0; display: none; cursor: crosshair; }
.surface.on { display: block; pointer-events: auto; }
canvas.ink { position: absolute; inset: 0; width: 100%; height: 100%; }
.marquee {
  position: absolute;
  display: none;
  border: 2px dashed var(--accent);
  background: rgba(255,92,57,.10);
  border-radius: 3px;
}
.marquee.on { display: block; }

/* ── composer ──────────────────────────────────────────── */
.bar {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%) translateY(8px);
  width: min(680px, calc(100vw - 40px));
  padding: 14px 16px 11px;
  opacity: 0;
  pointer-events: none;
  transition: opacity .16s ease, transform .16s cubic-bezier(.2,.8,.3,1);
}
.bar.on { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }

.bar-top { display: flex; gap: 12px; align-items: flex-start; }

.mic {
  flex: none;
  width: 26px; height: 26px;
  margin-top: 2px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: rgba(255,255,255,.05);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all .15s ease;
}
.mic:hover { background: rgba(255,255,255,.1); }
.mic i {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--muted);
  display: block;
  transition: all .15s ease;
}
.mic.live { border-color: rgba(255,92,57,.55); background: rgba(255,92,57,.14); }
.mic.live i { background: var(--accent); animation: pulse 1.6s ease-out infinite; }

.field { flex: 1; min-width: 0; }
textarea {
  width: 100%;
  min-height: 24px;
  max-height: 180px;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 15px;
  line-height: 1.45;
  caret-color: var(--accent);
}
textarea::placeholder { color: rgba(242,239,236,.34); }
.interim { color: rgba(255,92,57,.75); font-size: 15px; line-height: 1.45; min-height: 0; }
.interim:empty { display: none; }

.bar-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.chip {
  padding: 2px 7px;
  border-radius: 5px;
  background: rgba(255,92,57,.15);
  color: #ffb9a5;
  text-transform: uppercase;
  letter-spacing: .06em;
  font-size: 9.5px;
  font-weight: 600;
}
.where { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.bar-meta .keys { margin-left: auto; flex: none; }
.warn { color: #ffb9a5; }

/* Silence countdown — drains to nothing, then the note commits itself. */
.countdown {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 100%;
  border-radius: 0 0 14px 14px;
  background: linear-gradient(90deg, rgba(255,92,57,.35), var(--accent));
  opacity: 0;
  transition: opacity .12s ease;
}
.countdown.on { opacity: 1; }

/* ── toast ─────────────────────────────────────────────── */
.toast {
  position: absolute;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%) translateY(10px);
  padding: 10px 15px;
  border-radius: 999px;
  font-size: 12.5px;
  display: flex;
  align-items: center;
  gap: 9px;
  opacity: 0;
  transition: opacity .18s ease, transform .18s cubic-bezier(.2,.8,.3,1);
}
.toast.on { opacity: 1; transform: translateX(-50%) translateY(0); }
.toast b { font-weight: 600; }
.toast .file {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--muted);
}
.tick { width: 14px; height: 14px; flex: none; }
`;

export interface Overlay {
  host: HTMLElement;
  shadow: ShadowRoot;
  layer: HTMLElement;
  hint: HTMLElement;
  hintText: HTMLElement;
  tools: HTMLElement;
  exit: HTMLElement;
  highlight: HTMLElement;
  tag: HTMLElement;
  surface: HTMLElement;
  marquee: HTMLElement;
  ink: HTMLCanvasElement;
  bar: HTMLElement;
  mic: HTMLElement;
  textarea: HTMLTextAreaElement;
  interim: HTMLElement;
  chip: HTMLElement;
  where: HTMLElement;
  countdown: HTMLElement;
  toast: HTMLElement;
}

const html = (markup: string): HTMLElement => {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild as HTMLElement;
};

export function createOverlay(): Overlay {
  const host = document.createElement('div');
  host.id = 'gripe-root';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.append(style);

  const layer = html(`
    <div class="layer">
      <div class="highlight"></div>
      <div class="tag"></div>
      <div class="surface"><canvas class="ink"></canvas><div class="marquee"></div></div>
      <div class="hint glass">
        <span class="dot"></span>
        <span class="hint-text"></span>
        <span class="sep"></span>
        <div class="tools">
          <button data-mode="element"><span class="k">E</span>lement</button>
          <button data-mode="region"><span class="k">R</span>egion</button>
          <button data-mode="draw"><span class="k">D</span>raw</button>
          <button data-mode="page"><span class="k">P</span>age</button>
        </div>
        <button class="exit">esc</button>
      </div>
      <div class="bar glass">
        <div class="bar-top">
          <button class="mic" title="Toggle dictation (ctrl+space)"><i></i></button>
          <div class="field">
            <textarea rows="1" placeholder="What's wrong here?" spellcheck="false"></textarea>
            <div class="interim"></div>
          </div>
        </div>
        <div class="bar-meta">
          <span class="chip"></span>
          <span class="where"></span>
          <span class="keys">
            <kbd class="hot">⏎</kbd> or say <kbd class="hot">“save it”</kbd> <kbd>esc</kbd> cancel
          </span>
        </div>
        <div class="countdown"></div>
      </div>
      <div class="toast glass">
        <svg class="tick" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 5" stroke="#ff5c39" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <b class="toast-text"></b><span class="file toast-file"></span>
      </div>
    </div>
  `);
  shadow.append(layer);

  const q = <T extends Element>(sel: string) => layer.querySelector(sel) as T;

  return {
    host,
    shadow,
    layer,
    hint: q('.hint'),
    hintText: q('.hint-text'),
    tools: q('.tools'),
    exit: q('.exit'),
    highlight: q('.highlight'),
    tag: q('.tag'),
    surface: q('.surface'),
    marquee: q('.marquee'),
    ink: q<HTMLCanvasElement>('canvas.ink'),
    bar: q('.bar'),
    mic: q('.mic'),
    textarea: q<HTMLTextAreaElement>('textarea'),
    interim: q('.interim'),
    chip: q('.chip'),
    where: q('.where'),
    countdown: q('.countdown'),
    toast: q('.toast'),
  };
}
