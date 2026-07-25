import type { ContentCommand } from '../lib/messages';
import type { CaptureMode, NoteDraft, PageEvent, Rect, Settings, TargetInfo } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';
import { compose, type Stroke } from './capture';
import { Dictation, speechSupported } from './speech';
import { createOverlay, type Overlay } from './ui';

declare global {
  interface Window {
    __bugRecorderContent?: boolean;
  }
}

if (!window.__bugRecorderContent) {
  window.__bugRecorderContent = true;
  boot();
}

function boot() {
  const PAGE_EVENT = 'bug-recorder:page-event';
  const EVENT_WINDOW_MS = 3 * 60 * 1000;
  const MAX_EVENTS_PER_NOTE = 12;

  let overlay: Overlay | null = null;
  let phase: 'idle' | 'aiming' | 'composing' = 'idle';
  let mode: CaptureMode = 'element';
  let settings: Settings = DEFAULT_SETTINGS;

  let hoverEl: Element | null = null;
  let lockedEl: Element | null = null;
  let lockedTarget: TargetInfo | null = null;
  let regionRect: Rect | null = null;
  let dragStart: { x: number; y: number } | null = null;
  let strokes: Stroke[] = [];
  let drawing = false;
  let dictation: Dictation | null = null;
  let saving = false;

  let events: PageEvent[] = [];
  let lastNoteAt = 0;
  let cursorStyle: HTMLStyleElement | null = null;

  // ── page telemetry ──────────────────────────────────────────────────────
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  } catch {
    /* strict CSP — we simply lose console capture on this page */
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as (PageEvent & { source?: string }) | null;
    if (!data || data.source !== PAGE_EVENT) return;
    events.push({ level: data.level, message: data.message, detail: data.detail, ts: data.ts });
    if (events.length > 80) events.shift();
  });

  function recentEvents(): PageEvent[] {
    const since = Math.max(lastNoteAt, Date.now() - EVENT_WINDOW_MS);
    return events.filter((e) => e.ts >= since).slice(-MAX_EVENTS_PER_NOTE);
  }

  // ── element description ─────────────────────────────────────────────────
  const INTERESTING_ATTRS = [
    'data-testid',
    'data-test-id',
    'data-test',
    'data-cy',
    'aria-label',
    'role',
    'name',
    'type',
    'href',
    'placeholder',
    'alt',
    'title',
  ];

  const isUnique = (selector: string) => {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };

  function selectorFor(el: Element): string {
    const parts: string[] = [];
    let node: Element | null = el;
    let depth = 0;

    while (node && node.nodeType === 1 && depth < 5) {
      const current: Element = node;
      if (current.id) {
        const byId = `#${CSS.escape(current.id)}`;
        if (isUnique(byId)) {
          parts.unshift(byId);
          break;
        }
      }
      const testid =
        current.getAttribute('data-testid') ??
        current.getAttribute('data-test-id') ??
        current.getAttribute('data-cy');
      if (testid) {
        parts.unshift(`[data-testid="${testid}"]`);
        break;
      }

      let part = current.tagName.toLowerCase();
      const classes = Array.from(current.classList)
        .filter((c) => c.length < 28 && !/^(ng-|css-|jsx-|sc-|emotion-)/.test(c) && !/\d{4,}/.test(c))
        .slice(0, 2);
      if (classes.length) part += `.${classes.map((c) => CSS.escape(c)).join('.')}`;

      const parent = current.parentElement;
      if (parent) {
        const twins = Array.from(parent.children).filter((c) => c.tagName === current.tagName);
        if (twins.length > 1) part += `:nth-of-type(${twins.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      if (parts.length && isUnique(parts.join(' > '))) break;
      node = current.parentElement;
      depth++;
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  }

  function describe(el: Element): TargetInfo {
    const rect = el.getBoundingClientRect();
    const attrs: Record<string, string> = {};
    for (const name of INTERESTING_ATTRS) {
      const value = el.getAttribute(name);
      if (value) attrs[name] = value;
    }
    if (el instanceof HTMLInputElement && el.value) attrs.value = el.value.slice(0, 80);

    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const html = el.outerHTML.replace(/\s+/g, ' ').trim().slice(0, 400);

    return {
      selector: selectorFor(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: Array.from(el.classList).slice(0, 8),
      text: text || undefined,
      attrs,
      html: html.length === 400 ? `${html}…` : html,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  }

  // ── overlay lifecycle ───────────────────────────────────────────────────
  function ui(): Overlay {
    if (overlay) return overlay;
    overlay = createOverlay();
    document.documentElement.appendChild(overlay.host);
    wireComposer(overlay);
    wireSurface(overlay);
    wireToolbar(overlay);
    return overlay;
  }

  function inOverlay(event: Event): boolean {
    return Boolean(overlay && event.composedPath().includes(overlay.host));
  }

  function setCrosshair(on: boolean) {
    if (on && !cursorStyle) {
      cursorStyle = document.createElement('style');
      cursorStyle.textContent = '*, *::before, *::after { cursor: crosshair !important; }';
      document.documentElement.appendChild(cursorStyle);
    } else if (!on && cursorStyle) {
      cursorStyle.remove();
      cursorStyle = null;
    }
  }

  const HINTS: Record<CaptureMode, string> = {
    element: "Click what's wrong",
    region: 'Drag a box around it',
    draw: 'Draw on the page, then say what’s wrong',
    page: 'Note about this page',
  };

  /**
   * The toolbar has to be clickable, not just a keyboard legend: arming from the
   * side panel leaves keyboard focus in the panel, so the E/R/D/P keys never
   * reach the page until you've clicked into it.
   */
  function wireToolbar(o: Overlay) {
    for (const button of Array.from(o.tools.querySelectorAll('button'))) {
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = button.dataset.mode as CaptureMode | undefined;
        if (next) arm(next);
      });
    }
    o.exit.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      disarm();
    });
  }

  function paintHint() {
    const o = ui();
    o.hintText.textContent = HINTS[mode];
    for (const button of Array.from(o.tools.querySelectorAll('button'))) {
      button.classList.toggle('on', button.dataset.mode === mode);
    }
    o.hint.classList.toggle('on', phase !== 'idle');
    // The composer owns the bottom of the screen once it's open.
    if (phase !== 'aiming') o.hint.classList.remove('low');
  }

  function arm(next: CaptureMode) {
    const o = ui();
    mode = next;
    phase = 'aiming';
    resetSelection();
    o.bar.classList.remove('on');
    o.highlight.classList.remove('on', 'locked');
    o.tag.classList.remove('on');
    paintHint();

    // Pull keyboard focus to the page so the E/R/D/P keys work even when the
    // user armed from the side panel.
    try {
      window.focus();
    } catch {
      /* not permitted in some embeds */
    }

    const needsSurface = mode === 'region' || mode === 'draw';
    o.surface.classList.toggle('on', needsSurface);
    if (needsSurface) sizeCanvas(o);
    setCrosshair(mode === 'element');
    addAimListeners();

    if (mode === 'page') openComposer();
    if (mode === 'draw') openComposer();
  }

  function disarm() {
    const o = ui();
    phase = 'idle';
    dictation?.stop();
    removeAimListeners();
    setCrosshair(false);
    resetSelection();
    o.hint.classList.remove('on');
    o.bar.classList.remove('on');
    o.surface.classList.remove('on');
    o.highlight.classList.remove('on', 'locked');
    o.tag.classList.remove('on');
    o.marquee.classList.remove('on');
    clearInk(o);
  }

  function resetSelection() {
    hoverEl = null;
    lockedEl = null;
    lockedTarget = null;
    regionRect = null;
    dragStart = null;
    strokes = [];
    drawing = false;
    const o = ui();
    o.textarea.value = '';
    o.interim.textContent = '';
    autoGrow(o.textarea);
    clearInk(o);
  }

  // ── aiming (element picker) ─────────────────────────────────────────────
  function positionHighlight(rect: DOMRect | Rect, label: string, locked: boolean) {
    const o = ui();
    o.highlight.classList.add('on');
    o.highlight.classList.toggle('locked', locked);
    Object.assign(o.highlight.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    if (!label) {
      o.tag.classList.remove('on');
      return;
    }
    o.tag.textContent = label;
    o.tag.classList.add('on');
    const above = rect.y > 26;
    Object.assign(o.tag.style, {
      left: `${Math.max(4, rect.x)}px`,
      top: above ? `${rect.y - 24}px` : `${rect.y + rect.height + 6}px`,
    });
  }

  /** Tags that are almost never what you meant to point at. */
  const PRESENTATIONAL = new Set([
    'SPAN', 'EM', 'STRONG', 'B', 'I', 'U', 'SMALL', 'CODE', 'FONT',
    'SVG', 'PATH', 'G', 'CIRCLE', 'RECT', 'LINE', 'POLYGON', 'USE', 'IMG', 'PICTURE',
  ]);
  const INTERACTIVE =
    'button, a, label, summary, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [data-testid]';

  /**
   * elementFromPoint gives you the topmost node, which for a button is usually
   * the <span> holding its label — a useless selector. Climb to the thing a
   * human would name, unless Alt is held to take the literal hit.
   */
  function refine(el: Element): Element {
    let node = el;
    for (let depth = 0; depth < 4; depth++) {
      const parent = node.parentElement;
      if (!parent || parent === document.body) break;
      const throwaway =
        PRESENTATIONAL.has(node.tagName.toUpperCase()) && !node.id && !node.getAttribute('data-testid');
      if (!throwaway && !parent.matches(INTERACTIVE)) break;
      const child = node.getBoundingClientRect();
      const box = parent.getBoundingClientRect();
      // Don't swallow the whole page to gain one wrapper.
      if (box.width * box.height > Math.max(child.width * child.height, 1) * 10) break;
      node = parent;
    }
    return node;
  }

  function elementUnder(x: number, y: number, literal = false): Element | null {
    const el = document.elementFromPoint(x, y);
    if (!el || el === overlay?.host || el === document.documentElement || el === document.body) return null;
    return literal ? el : refine(el);
  }

  function onMouseMove(event: MouseEvent) {
    if (phase !== 'aiming') return;
    // Get out of the way when the cursor comes for the site's own header.
    if (!inOverlay(event)) ui().hint.classList.toggle('low', event.clientY < 96);
    if (mode !== 'element' || inOverlay(event)) return;
    const el = elementUnder(event.clientX, event.clientY, event.altKey);
    if (!el || el === hoverEl) return;
    hoverEl = el;
    positionHighlight(el.getBoundingClientRect(), selectorFor(el), false);
  }

  function swallow(event: Event) {
    if (phase === 'idle' || inOverlay(event)) return;
    if (mode !== 'element') return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerDown(event: PointerEvent) {
    if (phase !== 'aiming' || mode !== 'element' || inOverlay(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const el = elementUnder(event.clientX, event.clientY, event.altKey);
    if (!el) return;
    lockedEl = el;
    lockedTarget = describe(el);
    positionHighlight(lockedTarget.rect, lockedTarget.selector, true);
    openComposer();
  }

  function onScroll() {
    if (phase !== 'aiming' || mode !== 'element' || !hoverEl) return;
    positionHighlight(hoverEl.getBoundingClientRect(), selectorFor(hoverEl), false);
  }

  const MODE_KEYS: Record<string, CaptureMode> = { e: 'element', r: 'region', d: 'draw', p: 'page' };

  function onKeyDown(event: KeyboardEvent) {
    if (phase !== 'aiming' || inOverlay(event)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      disarm();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const next = MODE_KEYS[event.key.toLowerCase()];
    if (next && next !== mode) {
      event.preventDefault();
      event.stopPropagation();
      arm(next);
    }
  }

  const AIM_EVENTS: [keyof WindowEventMap, EventListener][] = [
    ['mousemove', onMouseMove as EventListener],
    ['pointerdown', onPointerDown as EventListener],
    ['mousedown', swallow],
    ['mouseup', swallow],
    ['click', swallow],
    ['dblclick', swallow],
    ['contextmenu', swallow],
    ['keydown', onKeyDown as EventListener],
    ['scroll', onScroll],
    ['resize', onResize],
  ];

  function addAimListeners() {
    removeAimListeners();
    for (const [type, handler] of AIM_EVENTS) {
      window.addEventListener(type, handler, true);
    }
  }

  function removeAimListeners() {
    for (const [type, handler] of AIM_EVENTS) {
      window.removeEventListener(type, handler, true);
    }
  }

  function onResize() {
    if (overlay && (mode === 'region' || mode === 'draw')) sizeCanvas(overlay);
  }

  // ── region drag + freehand ──────────────────────────────────────────────
  function sizeCanvas(o: Overlay) {
    const dpr = window.devicePixelRatio || 1;
    o.ink.width = Math.round(window.innerWidth * dpr);
    o.ink.height = Math.round(window.innerHeight * dpr);
    const ctx = o.ink.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    repaintInk(o);
  }

  function clearInk(o: Overlay) {
    const ctx = o.ink.getContext('2d');
    ctx?.clearRect(0, 0, o.ink.width, o.ink.height);
  }

  function repaintInk(o: Overlay) {
    const ctx = o.ink.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, o.ink.width, o.ink.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ff5c39';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 4;
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      stroke.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  }

  function wireSurface(o: Overlay) {
    o.surface.addEventListener('pointerdown', (event) => {
      if (phase === 'idle') return;
      o.surface.setPointerCapture(event.pointerId);
      if (mode === 'region') {
        dragStart = { x: event.clientX, y: event.clientY };
        o.marquee.classList.add('on');
        paintMarquee(o, dragStart, dragStart);
      } else if (mode === 'draw') {
        drawing = true;
        strokes.push({ points: [{ x: event.clientX, y: event.clientY }] });
      }
    });

    o.surface.addEventListener('pointermove', (event) => {
      if (mode === 'region' && dragStart) {
        paintMarquee(o, dragStart, { x: event.clientX, y: event.clientY });
      } else if (mode === 'draw' && drawing) {
        strokes[strokes.length - 1]?.points.push({ x: event.clientX, y: event.clientY });
        repaintInk(o);
      }
    });

    o.surface.addEventListener('pointerup', (event) => {
      if (mode === 'region' && dragStart) {
        const rect = normalize(dragStart, { x: event.clientX, y: event.clientY });
        dragStart = null;
        o.marquee.classList.remove('on');
        if (rect.width < 6 || rect.height < 6) return;
        regionRect = rect;
        o.surface.classList.remove('on');
        positionHighlight(rect, `region ${Math.round(rect.width)}×${Math.round(rect.height)}`, true);
        openComposer();
      } else if (mode === 'draw') {
        drawing = false;
      }
    });
  }

  function normalize(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    };
  }

  function paintMarquee(o: Overlay, a: { x: number; y: number }, b: { x: number; y: number }) {
    const rect = normalize(a, b);
    Object.assign(o.marquee.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  // ── composer ────────────────────────────────────────────────────────────
  function autoGrow(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(180, textarea.scrollHeight)}px`;
  }

  function wireComposer(o: Overlay) {
    o.textarea.addEventListener('input', () => autoGrow(o.textarea));

    o.textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void save();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        disarm();
      } else if (event.code === 'Space' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        toggleMic();
      }
    });

    o.mic.addEventListener('click', (event) => {
      event.preventDefault();
      toggleMic();
      o.textarea.focus();
    });
  }

  function toggleMic() {
    if (!dictation) return;
    dictation.toggle();
    ui().mic.classList.toggle('live', dictation.listening);
  }

  function startDictation() {
    const o = ui();
    if (!speechSupported) {
      o.where.textContent = 'no speech recognition in this browser — type it';
      return;
    }
    dictation ??= new Dictation(
      {
        onFinal: (text) => {
          if (!text) return;
          const value = o.textarea.value;
          o.textarea.value = value ? `${value.replace(/\s+$/, '')} ${text}` : text;
          o.interim.textContent = '';
          autoGrow(o.textarea);
        },
        onInterim: (text) => {
          o.interim.textContent = text;
        },
        onState: (state, detail) => {
          o.mic.classList.toggle('live', state === 'listening');
          if (detail) {
            o.where.textContent = detail;
            o.where.classList.add('warn');
          }
        },
      },
      settings.lang,
    );
    if (settings.autoDictate) dictation.start();
  }

  function openComposer() {
    const o = ui();
    phase = 'composing';
    setCrosshair(false);
    paintHint(); // toolbar stays up so you can switch modes mid-note

    o.chip.textContent = mode;
    o.where.classList.remove('warn');
    o.where.textContent = lockedTarget
      ? lockedTarget.selector
      : regionRect
        ? `region ${Math.round(regionRect.width)}×${Math.round(regionRect.height)}`
        : mode === 'draw'
          ? 'freehand — draw anywhere, then ⏎'
          : location.pathname;

    o.bar.classList.add('on');
    o.textarea.focus();
    startDictation();
  }

  function toast(text: string, file: string) {
    const o = ui();
    (o.toast.querySelector('.toast-text') as HTMLElement).textContent = text;
    (o.toast.querySelector('.toast-file') as HTMLElement).textContent = file;
    o.toast.classList.add('on');
    window.setTimeout(() => o.toast.classList.remove('on'), 2400);
  }

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  async function save() {
    if (saving) return;
    saving = true;
    const o = ui();
    const text = o.textarea.value.trim();
    dictation?.stop();
    o.mic.classList.remove('live');

    // Refresh the box — the page may have scrolled or reflowed while talking.
    if (lockedEl && lockedTarget) {
      const rect = lockedEl.getBoundingClientRect();
      lockedTarget = { ...lockedTarget, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    }

    o.host.style.visibility = 'hidden';
    await nextFrame();

    try {
      const response = (await chrome.runtime.sendMessage({ type: 'capture:visible' })) as
        | { dataUrl: string }
        | { error: string };
      if (!('dataUrl' in response)) throw new Error(response.error);

      const images = await compose({
        dataUrl: response.dataUrl,
        mode,
        rect: lockedTarget?.rect ?? regionRect ?? undefined,
        strokes,
        spotlight: settings.spotlight,
      });

      const draft: NoteDraft = {
        text,
        mode,
        url: location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio || 1,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        },
        target: lockedTarget ?? undefined,
        region: regionRect ?? undefined,
        strokes: strokes.length || undefined,
        events: recentEvents(),
        fullImage: images.full,
        cropImage: images.crop,
      };

      o.host.style.visibility = '';
      const saved = (await chrome.runtime.sendMessage({ type: 'note:add', draft })) as {
        index?: number;
        file?: string;
        error?: string;
      };
      if (saved?.error) throw new Error(saved.error);

      lastNoteAt = Date.now();
      const stay = settings.chain;
      disarm();
      toast(`Note ${saved?.index ?? ''} saved`, saved?.file ?? '');
      if (stay) arm(mode);
    } catch (error) {
      o.host.style.visibility = '';
      o.where.textContent = `capture failed: ${String(error).slice(0, 80)}`;
      o.where.classList.add('warn');
    } finally {
      saving = false;
    }
  }

  // ── background wiring ───────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message: ContentCommand, _sender, respond) => {
    if (message.type === 'ping') {
      respond({ ok: true });
      return;
    }
    if (message.type === 'arm') {
      settings = message.settings;
      // Re-arming with the same mode while aiming is a toggle-off.
      if (phase === 'aiming' && mode === message.mode) disarm();
      else arm(message.mode);
      respond({ ok: true });
      return;
    }
    if (message.type === 'disarm') {
      disarm();
      respond({ ok: true });
    }
  });
}
