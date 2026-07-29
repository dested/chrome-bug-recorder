/**
 * The in-page overlay for a walkthrough in progress: the recording dock, the ink
 * canvas it draws on, and the click ripples. Built into a shadow root so no page
 * stylesheet can reach it and none of our styles leak out. One host element, one
 * style sheet, hand-built DOM — no framework in the content script, because it
 * has to boot on every page the user visits and must never be the slow thing.
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

/* ── live ink + click ripples ──────────────────────────── */
/* .on is "the strokes are on screen"; .capture is "the pointer is mine" — the
   dock's draw toggle flips the second one, so turning drawing off hands the
   page back its clicks without erasing what you already drew. */
canvas.live { position: absolute; inset: 0; width: 100%; height: 100%; display: none; }
canvas.live.on { display: block; }
canvas.live.on.capture { pointer-events: auto; touch-action: none; cursor: crosshair; }

/* ── recording dock ────────────────────────────────────── */
/* Everything you can do to a walkthrough in progress, on the page you're
   walking through. Each button carries its key, so nothing is hidden. */
.dock {
  position: absolute;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%) translateY(8px);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 6px 6px 13px;
  border-radius: 999px;
  font-size: 12.5px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity .16s ease, transform .16s cubic-bezier(.2,.8,.3,1);
}
.dock.on { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }
/* Gets out of the way of whatever it's sitting on, without ever being gone. */
.dock.on.near { opacity: .35; }
.dock.on:hover { opacity: 1; }

.dock-live { display: flex; align-items: center; gap: 9px; }
.dock .dot {
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
.dock .clock {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.dock .sep { width: 1px; height: 18px; background: var(--line); margin: 0 3px; }

.dock button {
  font: inherit;
  font-size: 12.5px;
  min-height: 32px;
  padding: 0 13px;
  color: var(--muted);
  background: rgba(255,255,255,.05);
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  transition: background .12s ease, color .12s ease;
}
.dock button:hover { background: rgba(255,255,255,.11); color: var(--text); }
/* Armed: the ink owns the pointer. The label says how to get back. */
.dock button.arm { background: rgba(255,92,57,.16); border-color: rgba(255,92,57,.3); color: #ffb9a5; }
.dock button.arm:hover { background: rgba(255,92,57,.26); color: #ffb9a5; }
/* The one label that swaps — hold the width so the row never shuffles. */
.dock button.draw { min-width: 86px; }
.dock button.stop { background: var(--text); color: #0a0a0c; font-weight: 650; }
.dock button.stop:hover { background: #fff; }

/* A click leaves no trace in a screen recording. This is the trace. */
.ripple {
  position: fixed;
  width: 64px;
  height: 64px;
  margin: -32px 0 0 -32px;
  border: 2px solid var(--accent);
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
  animation: ripple .35s cubic-bezier(.2,.8,.3,1) forwards;
}
@keyframes ripple {
  0% { transform: scale(.44); opacity: .9; }
  100% { transform: scale(1); opacity: 0; }
}
`;

export interface Overlay {
  host: HTMLElement;
  layer: HTMLElement;
  dock: HTMLElement;
  dockDraw: HTMLElement;
  dockMark: HTMLElement;
  clock: HTMLElement;
  live: HTMLCanvasElement;
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
      <canvas class="live"></canvas>
      <div class="dock glass">
        <span class="dock-live"><span class="dot"></span><span class="clock">0:00</span></span>
        <span class="sep"></span>
        <button class="draw" data-act="draw">draw (d)</button>
        <button data-act="clear">clear (c)</button>
        <button class="mark" data-act="mark">mark (m)</button>
        <button class="stop" data-act="stop">stop (s)</button>
      </div>
    </div>
  `);
  shadow.append(layer);

  const q = <T extends Element>(sel: string) => layer.querySelector(sel) as T;

  return {
    host,
    layer,
    dock: q('.dock'),
    dockDraw: q('.dock button.draw'),
    dockMark: q('.dock button.mark'),
    clock: q('.clock'),
    live: q<HTMLCanvasElement>('canvas.live'),
  };
}
