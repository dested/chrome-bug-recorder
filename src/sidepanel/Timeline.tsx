import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Recording, TimelineMove, TimelineRef } from '../lib/types';
import { send } from '../lib/messages';
import { framePos, linePos, partSpans, totalMs } from '../lib/timeline';
import { mmss } from '../lib/format';

interface TimelineProps {
  recordings: Recording[];
  /** `${recId}:${frame.index}` → object URL */
  frameUrls: Record<string, string>;
  /** recId → whisper status label */
  busy: Record<string, string>;
  refresh: () => Promise<unknown>;
  say: (text: string) => void;
}

type Row = 'frames' | 'voice';

/** One thing on the axis, already resolved to a position — the render and every hit test read this. */
interface Item {
  key: string;
  ref: TimelineRef;
  row: Row;
  pos: number;
  /** ms of width. Only voice clips cover a window; everything else is an instant. */
  dur: number;
  text?: string;
  url?: string;
  mark?: boolean;
}

/** One slot of the filmstrip. The strip is cells, not frames — that's the whole point. */
interface Cell {
  i: number;
  /** Middle of the slice this cell covers. */
  mid: number;
  left: number;
  w: number;
  frame?: Item;
}

type Drag =
  | { mode: 'scrub' }
  /** Ruler and filmstrip both resolve to a time range; `click` is what a sub-slop drag meant. */
  | { mode: 'range'; a: number; b: number; click?: { key?: string; pos: number } }
  | { mode: 'marquee'; x0: number; y0: number; x1: number; y1: number }
  | { mode: 'move'; x0: number; dx: number; live: boolean };

/** Both edges get breathing room so a clip at 0:00 and one at the end are both whole. */
const EDGE = 8;
/** A drag has to beat this before a click stops being a click. */
const SLOP = 3;
const TICKS = [1e3, 2e3, 5e3, 1e4, 15e3, 3e4, 6e4, 12e4, 3e5, 6e5, 12e5];
/** Narrower than this and a clip is a block, not a label — the readout carries its text. */
const TEXT_MIN = 48;
/** Past this many cells the strip renders only what's near the viewport. */
const WINDOW_AT = 300;
/** How far a cell will reach for a keyframe before it gives up and reads as a gap. */
const GAP_MS = 8000;
const CELL_FALLBACK = 72;
/** Monitor beside the axis only when the box is genuinely landscape, not merely big. */
const WIDE_MIN_W = 900;
const WIDE_RATIO = 2.2;
/** A box mid-layout is 0 tall, and 0 tall divides into any width — that is not landscape. */
const WIDE_MIN_H = 120;

/** No transcriber told us how long the line took, so guess from the words. */
const estimate = (text: string) => Math.max(700, text.trim().split(/\s+/).length * 320);

/** Items are sorted by pos, so the cell under any time is a bisect away, not a scan. */
function nearest(list: Item[], t: number): Item | undefined {
  if (!list.length) return undefined;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].pos < t) lo = mid + 1;
    else hi = mid;
  }
  const before = list[lo - 1];
  const after = list[lo];
  if (!before) return after;
  if (!after) return before;
  return t - before.pos <= after.pos - t ? before : after;
}

export default function Timeline({ recordings, frameUrls, busy, refresh, say }: TimelineProps) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  /** Set only when the selection came from a range drag — the bar says so. */
  const [range, setRange] = useState<{ a: number; b: number } | null>(null);
  const [ph, setPh] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewW, setViewW] = useState(0);
  const [cellW, setCellW] = useState(CELL_FALLBACK);
  const [scrollX, setScrollX] = useState(0);
  /** Landscape enough to sit the monitor beside the axis — the popped dock strip. */
  const [wide, setWide] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Which line is open AND on which surface. The readout usually covers the same
  // line the selected clip holds, and two autofocused inputs blur each other shut.
  const [editing, setEditing] = useState<{ key: string; at: 'clip' | 'read' } | null>(null);
  /** A frame held in the monitor until the next click — double-click parks it there. */
  const [pinned, setPinned] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tracksRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const boxRef = useRef<DOMRect | null>(null);
  const anchor = useRef<{ ms: number; px: number } | null>(null);
  const scrollTick = useRef(0);

  const spans = useMemo(() => partSpans(recordings), [recordings]);
  /** Takes laid end to end are the whole axis: it opens at 0 and ends when the talking does. */
  const axis = useMemo(() => ({ start: 0, end: totalMs(spans) }), [spans]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const rec of recordings) {
      for (const f of rec.meta.frames) {
        out.push({
          key: `f:${rec.id}:${f.index}`,
          ref: { kind: 'frame', recId: rec.id, index: f.index },
          row: 'frames',
          pos: framePos(rec, f, spans),
          dur: 0,
          url: frameUrls[`${rec.id}:${f.index}`],
          mark: f.reason === 'mark',
        });
      }
      rec.meta.transcript.forEach((s, i) => {
        out.push({
          key: `l:${rec.id}:${i}`,
          ref: { kind: 'line', recId: rec.id, index: i },
          row: 'voice',
          pos: linePos(rec, s, spans),
          dur: s.d ?? estimate(s.text),
          text: s.text,
        });
      });
    }
    return out.sort((a, b) => a.pos - b.pos);
  }, [recordings, spans, frameUrls]);

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const frames = useMemo(() => items.filter((i) => i.row === 'frames'), [items]);
  const lines = useMemo(() => items.filter((i) => i.row === 'voice'), [items]);
  const marks = useMemo(() => frames.filter((f) => f.mark), [frames]);

  // Handlers live for a whole drag; the data under them doesn't.
  const selRef = useRef(sel);
  const itemsRef = useRef(items);
  const recsRef = useRef(recordings);
  useLayoutEffect(() => {
    selRef.current = sel;
    itemsRef.current = items;
    recsRef.current = recordings;
  });

  // Lines are positional and Whisper replaces the whole array — every batch says
  // which rev it was looking at, and the background skips a recording that moved on.
  const revsFor = (refs: TimelineRef[]) => {
    const revs: Record<string, number> = {};
    for (const r of refs) {
      const rec = recsRef.current.find((x) => x.id === r.recId);
      if (rec) revs[r.recId] = rec.meta.rev ?? 0;
    }
    return revs;
  };

  const span = Math.max(axis.end - axis.start, 1000) * 1.04;
  const contentW = Math.max(viewW - EDGE * 2, 200) * zoom;
  const pxPerMs = contentW / span;
  const playhead = ph ?? axis.start;
  const hasContent = recordings.length > 0;

  const x = useCallback((pos: number) => EDGE + (pos - axis.start) * pxPerMs, [axis.start, pxPerMs]);
  const msAt = useCallback(
    (clientX: number) => {
      const el = scrollRef.current;
      if (!el) return axis.start;
      const rect = el.getBoundingClientRect();
      return axis.start + (clientX - rect.left + el.scrollLeft - EDGE) / pxPerMs;
    },
    [axis.start, pxPerMs],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // --cell-w steps at the same breakpoints the width does, so both are read together.
    const read = () => {
      setViewW(el.clientWidth);
      const w = parseFloat(getComputedStyle(el).getPropertyValue('--cell-w'));
      if (w > 0) setCellW(w);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
    // `wide` is in here because it restyles --cell-w: the shape changes the cell,
    // and a stale cell width lays the strip out to the wrong grid.
  }, [hasContent, wide]);

  // The shape question is about the component's own box, not the window: the same
  // panel is a 380px rail, a tab, and a 400px-tall dock strip across the screen.
  const measure = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setWide(height >= WIDE_MIN_H && width >= WIDE_MIN_W && width > height * WIDE_RATIO);
  }, []);

  // The strips above the timeline settle over several commits while a gripe loads,
  // and .tl is whatever height they leave behind — one observation during that is
  // a shape that never existed. Re-read every commit; `wide` changes nothing about
  // .tl's own box, so it cannot feed back.
  useLayoutEffect(measure);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasContent, measure]);

  // Zoom keeps whatever was under the cursor (or the middle) where it was.
  const zoomTo = useCallback(
    (next: number, clientX?: number) => {
      const el = scrollRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const px = clientX === undefined ? rect.width / 2 : clientX - rect.left;
        anchor.current = { ms: msAt(rect.left + px), px };
      }
      setZoom(Math.min(64, Math.max(1, next)));
    },
    [msAt],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    el.scrollLeft = EDGE + (a.ms - axis.start) * pxPerMs - a.px;
    setScrollX(el.scrollLeft);
  }, [zoom, pxPerMs, axis.start]);

  // React's wheel listener is passive, and this one has to cancel the page zoom.
  const wheel = useRef<(e: WheelEvent) => void>(() => {});
  useLayoutEffect(() => {
    wheel.current = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX);
    };
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => wheel.current(e);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [hasContent]);

  const setDragBoth = useCallback((next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const doDelete = useCallback(async () => {
    const refs = itemsRef.current.filter((i) => selRef.current.has(i.key)).map((i) => i.ref);
    if (!refs.length) return;
    setSel(new Set());
    setRange(null);
    setEditing(null);
    setPinned(null);
    const res = await send<{ ok: boolean; stale?: boolean }>({
      type: 'timeline:delete',
      items: refs,
      revs: revsFor(refs),
    });
    await refresh();
    say(
      res?.stale
        ? 'the transcript changed underneath — check what remains'
        : `deleted ${refs.length} item${refs.length === 1 ? '' : 's'}`,
    );
  }, [refresh, say]);

  const commitMove = useCallback(
    async (dms: number) => {
      const picked = itemsRef.current.filter((i) => selRef.current.has(i.key));
      if (!picked.length) return;
      const moves: TimelineMove[] = picked.map((i) => ({
        kind: i.ref.kind,
        recId: i.ref.recId,
        index: i.ref.index,
        tl: Math.max(0, Math.round(i.pos + dms)),
      }));
      const res = await send<{ ok: boolean; stale?: boolean }>({
        type: 'timeline:move',
        moves,
        revs: revsFor(moves),
      });
      await refresh();
      if (res?.stale) say('the transcript changed underneath — that drag partly missed');
    },
    [refresh, say],
  );

  // ── dragging ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      if (current.mode === 'scrub') setPh(Math.max(axis.start, msAt(e.clientX)));
      else if (current.mode === 'range') setDragBoth({ ...current, b: msAt(e.clientX) });
      else if (current.mode === 'marquee') {
        const box = boxRef.current;
        if (!box) return;
        setDragBoth({ ...current, x1: e.clientX - box.left, y1: e.clientY - box.top });
      } else {
        const dx = e.clientX - current.x0;
        if (!current.live && Math.abs(dx) < SLOP) return;
        setDragBoth({ ...current, dx, live: true });
      }
    };
    const onUp = () => {
      const current = dragRef.current;
      setDragBoth(null);
      if (!current) return;
      if (current.mode === 'range') {
        const [a, b] = [Math.min(current.a, current.b), Math.max(current.a, current.b)];
        // Under the slop it was a click: the ruler only moved the playhead, a cell
        // also hands over the frame it was showing.
        if ((b - a) * pxPerMs < SLOP) {
          const c = current.click;
          if (!c) return;
          setSel(c.key ? new Set([c.key]) : new Set());
          setRange(null);
          setPh(Math.max(axis.start, c.pos));
          setPinned(null);
          setEditing(null);
          return;
        }
        setRange({ a, b });
        setSel(
          new Set(
            itemsRef.current
              .filter((i) => i.pos + i.dur >= a && i.pos <= b)
              .map((i) => i.key),
          ),
        );
      } else if (current.mode === 'marquee') {
        const box = boxRef.current;
        const inner = tracksRef.current;
        if (!box || !inner) return;
        const [lx, rx] = [Math.min(current.x0, current.x1), Math.max(current.x0, current.x1)];
        const [ty, by] = [Math.min(current.y0, current.y1), Math.max(current.y0, current.y1)];
        // A pointerup that never travelled is a click on empty space: clear.
        if (rx - lx < SLOP && by - ty < SLOP) {
          setSel(new Set());
          setRange(null);
          setEditing(null);
          return;
        }
        const hit = new Set<string>();
        for (const node of inner.querySelectorAll<HTMLElement>('[data-key]')) {
          const r = node.getBoundingClientRect();
          const l = r.left - box.left;
          const t = r.top - box.top;
          if (l <= rx && l + r.width >= lx && t <= by && t + r.height >= ty) {
            hit.add(node.dataset.key!);
          }
        }
        setRange(null);
        setSel(hit);
      } else if (current.mode === 'move' && current.live) {
        void commitMove(current.dx / pxPerMs);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDragBoth(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [drag?.mode, msAt, axis.start, pxPerMs, setDragBoth, commitMove]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditing(null);
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (!selRef.current.size) return;
      e.preventDefault();
      void doDelete();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doDelete]);

  const toggle = (key: string) => {
    setRange(null);
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** A cell you don't own yet sweeps a range; one you do drags the whole selection. */
  const onCellDown = (e: React.PointerEvent, cell: Cell) => {
    e.stopPropagation();
    const f = cell.frame;
    if ((e.ctrlKey || e.metaKey) && f) {
      toggle(f.key);
      return;
    }
    if (f && sel.has(f.key)) {
      setDragBoth({ mode: 'move', x0: e.clientX, dx: 0, live: false });
      return;
    }
    const at = msAt(e.clientX);
    setDragBoth({ mode: 'range', a: at, b: at, click: { key: f?.key, pos: f ? f.pos : cell.mid } });
  };

  const onClipDown = (e: React.PointerEvent, item: Item, wide: boolean) => {
    if (editing?.key === item.key) return;
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      toggle(item.key);
      return;
    }
    if (!sel.has(item.key)) {
      setRange(null);
      setSel(new Set([item.key]));
      setPh(item.pos);
      setPinned(null);
      setEditing(null);
    } else if (sel.size === 1) {
      // Already the one thing selected: the second click is the edit. A block too
      // narrow to type in hands the job to the readout, which is why it exists.
      // preventDefault or mousedown's focus default blurs the input as it mounts.
      e.preventDefault();
      setEditing({ key: item.key, at: wide ? 'clip' : 'read' });
      // Too narrow to type in: park the playhead on it so the readout picks it up.
      if (!wide) setPh(item.pos);
      return;
    }
    // Grabbing anything in the selection drags the whole selection.
    setDragBoth({ mode: 'move', x0: e.clientX, dx: 0, live: false });
  };

  const onTracksDown = (e: React.PointerEvent) => {
    const inner = tracksRef.current;
    if (!inner) return;
    boxRef.current = inner.getBoundingClientRect();
    const box = boxRef.current;
    setEditing(null);
    setDragBoth({
      mode: 'marquee',
      x0: e.clientX - box.left,
      y0: e.clientY - box.top,
      x1: e.clientX - box.left,
      y1: e.clientY - box.top,
    });
  };

  const onRulerDown = (e: React.PointerEvent) => {
    const at = msAt(e.clientX);
    setPh(Math.max(axis.start, at));
    setDragBoth({ mode: 'range', a: at, b: at });
  };

  const commitLine = async (item: Item, text: string) => {
    setEditing(null);
    if (text === item.text) return;
    const ref = item.ref;
    if (ref.kind !== 'line') return;
    await send({
      type: 'recording:line:update',
      id: ref.recId,
      index: ref.index,
      text,
      rev: recsRef.current.find((r) => r.id === ref.recId)?.meta.rev ?? 0,
    });
    await refresh();
  };

  // ── the filmstrip ─────────────────────────────────────────────────────
  const cells = useMemo<Cell[]>(() => {
    if (!hasContent) return [];
    const count = Math.max(1, Math.ceil(contentW / cellW));
    const sliceMs = cellW / pxPerMs;
    // Every cell reaches for the keyframe nearest its middle; past that reach the
    // footage genuinely has nothing there and the cell reads as a gap.
    const reach = Math.max(sliceMs * 1.5, GAP_MS);
    const from = count > WINDOW_AT ? Math.max(0, Math.floor((scrollX - viewW) / cellW)) : 0;
    const to = count > WINDOW_AT ? Math.min(count, Math.ceil((scrollX + viewW * 2) / cellW)) : count;
    const out: Cell[] = [];
    for (let i = from; i < to; i++) {
      const mid = axis.start + (i + 0.5) * sliceMs;
      const f = nearest(frames, mid);
      out.push({
        i,
        mid,
        left: EDGE + i * cellW,
        w: Math.max(1, Math.min(cellW, contentW - i * cellW)),
        frame: f && Math.abs(f.pos - mid) <= reach ? f : undefined,
      });
    }
    return out;
  }, [hasContent, frames, contentW, cellW, pxPerMs, axis.start, scrollX, viewW]);

  // ── what the monitor is showing ───────────────────────────────────────
  const shot = useMemo(() => {
    if (pinned) {
      const held = byKey.get(pinned);
      if (held?.url) return held.url;
    }
    let best: Item | undefined;
    for (const i of frames) {
      if (!i.url) continue;
      if (i.pos <= playhead) best = i;
      else if (!best) return i.url;
      else break;
    }
    return best?.url;
  }, [pinned, byKey, frames, playhead]);

  /** The subtitle under the video: what is being said right here, big enough to fix. */
  const readout = useMemo(() => {
    let before: Item | undefined;
    for (const l of lines) {
      if (l.pos <= playhead && playhead <= l.pos + l.dur) return l;
      if (l.pos <= playhead) before = l;
      else break;
    }
    return before ?? lines[0];
  }, [lines, playhead]);

  const ticks = useMemo(() => {
    const step = TICKS.find((s) => s * pxPerMs >= 56) ?? TICKS[TICKS.length - 1];
    const out: number[] = [];
    for (let t = 0; t <= span && out.length < 240; t += step) out.push(t);
    return out;
  }, [pxPerMs, span]);

  const seams = useMemo(() => spans.slice(1).map((s) => s.start), [spans]);
  const labels = useMemo(() => [...new Set(Object.values(busy))].join(' · '), [busy]);
  const nag = recordings.filter(
    (r) => r.meta.transcript.length && !r.meta.reviewed && !busy[r.id],
  );

  const dx = drag?.mode === 'move' && drag.live ? drag.dx : 0;
  const sweep = drag?.mode === 'range' ? drag : null;
  const marquee = drag?.mode === 'marquee' ? drag : null;
  const shift = dx ? `translateX(${dx}px)` : undefined;

  if (!hasContent) {
    return (
      <div className="tl" ref={rootRef}>
        <div className="empty">
          nothing yet
          <br />
          hit <b>Record</b> and talk through what's wrong
        </div>
      </div>
    );
  }

  // Two shapes, one tree: the monitor and the axis are siblings, and `wide` is the
  // only thing that decides whether CSS stacks them or sits them side by side.
  return (
    <div className={`tl ${wide ? 'wide' : ''}`} ref={rootRef}>
      <div className="tl-monitor">
        <div className="tl-screen">{shot && <img src={shot} alt="" draggable={false} />}</div>
        <span className="tl-clock">
          {mmss(Math.max(0, playhead - axis.start))} / {mmss(Math.max(0, axis.end - axis.start))}
        </span>
      </div>

      <div className="tl-axis">
      {/* Opens on click, not pointerdown: mousedown's own focus default lands after
          the input mounts and would blur it straight back shut. */}
      {readout && (
        <div className="tl-read" onClick={() => setEditing({ key: readout.key, at: 'read' })}>
          <span className="tl-at">{mmss(Math.max(0, readout.pos - axis.start))}</span>
          {editing?.key === readout.key && editing.at === 'read' ? (
            <input
              autoFocus
              defaultValue={readout.text}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => void commitLine(readout, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          ) : (
            <span className="tl-said">{readout.text}</span>
          )}
        </div>
      )}

      {nag.length > 0 && (
        <div className="tl-nag">
          <span>
            <b>Read this back before you hand it off.</b> Speech recognition eats the words that
            matter — a number or a noun it guesses wrong sends your agent to the wrong file. Click
            any line to fix it.
          </span>
          {nag.map((rec) => (
            <button
              key={rec.id}
              onClick={async () => {
                await send({ type: 'recording:reviewed', id: rec.id });
                await refresh();
                say('transcript confirmed');
              }}
            >
              looks right
            </button>
          ))}
        </div>
      )}

      {labels && <div className="tl-busy">{labels}</div>}

      <div
        className="tl-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          // One read per frame: the strip only windows on this, it doesn't animate.
          const left = e.currentTarget.scrollLeft;
          if (scrollTick.current) return;
          scrollTick.current = requestAnimationFrame(() => {
            scrollTick.current = 0;
            setScrollX(left);
          });
        }}
      >
        <div className="tl-inner" style={{ width: contentW + EDGE * 2 }}>
          <div className="tl-ruler" onPointerDown={onRulerDown}>
            {ticks.map((t) => (
              <span className="tl-tick" key={t} style={{ left: EDGE + t * pxPerMs }}>
                {mmss(t)}
              </span>
            ))}
            <span
              className="tl-knob"
              style={{ left: x(playhead) }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setDragBoth({ mode: 'scrub' });
              }}
            />
          </div>

          <div className="tl-tracks" ref={tracksRef} onPointerDown={onTracksDown}>
            {frames.length > 0 && (
              <div className="tl-strip">
                <span className="tl-label">frames</span>
                {cells.map((cell) => {
                  const on = !!cell.frame && sel.has(cell.frame.key);
                  return (
                    <div
                      key={cell.i}
                      data-key={cell.frame?.key}
                      className={`tl-cell ${on ? 'on' : ''} ${cell.frame ? '' : 'gap'}`}
                      style={{
                        left: cell.left,
                        width: cell.w,
                        transform: on ? shift : undefined,
                      }}
                      onPointerDown={(e) => onCellDown(e, cell)}
                      onDoubleClick={() => {
                        if (!cell.frame) return;
                        setPinned(cell.frame.key);
                        setRange(null);
                        setSel(new Set([cell.frame.key]));
                      }}
                    >
                      {cell.frame?.url && <img src={cell.frame.url} alt="" draggable={false} />}
                    </div>
                  );
                })}
                {/* Marks are instants, not cells — they ride the strip's top edge. */}
                <span className="tl-marks">
                  {marks.map((m) => (
                    <span className="tl-mark" key={m.key} style={{ left: x(m.pos) }} />
                  ))}
                </span>
              </div>
            )}

            {lines.length > 0 && (
              <div className="tl-voice">
                <span className="tl-label">voice</span>
                {lines.map((item) => {
                  const on = sel.has(item.key);
                  const w = Math.max(item.dur * pxPerMs, 2);
                  const wide = w >= TEXT_MIN;
                  const open = editing?.key === item.key && editing.at === 'clip';
                  return (
                    <div
                      key={item.key}
                      data-key={item.key}
                      className={`tl-clip ${on ? 'on' : ''} ${open ? 'edit' : ''} ${
                        playhead >= item.pos && playhead <= item.pos + item.dur ? 'now' : ''
                      }`}
                      style={{
                        left: x(item.pos),
                        // Editing drops the duration width — a 22px block can't be typed in.
                        width: open ? undefined : w,
                        transform: on ? shift : undefined,
                      }}
                      onPointerDown={(e) => onClipDown(e, item, wide)}
                    >
                      {open ? (
                        <input
                          autoFocus
                          defaultValue={item.text}
                          onPointerDown={(e) => e.stopPropagation()}
                          onBlur={(e) => void commitLine(item, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        />
                      ) : (
                        wide && <span>{item.text}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {seams.map((s) => (
              <span className="tl-seam" key={s} style={{ left: x(s) }} />
            ))}
            {sweep && (
              <span
                className="tl-range"
                style={{
                  left: x(Math.min(sweep.a, sweep.b)),
                  width: Math.abs(sweep.b - sweep.a) * pxPerMs,
                }}
              />
            )}
            {marquee && (
              <span
                className="tl-marquee"
                style={{
                  left: Math.min(marquee.x0, marquee.x1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                  top: Math.min(marquee.y0, marquee.y1),
                  height: Math.abs(marquee.y1 - marquee.y0),
                }}
              />
            )}
          </div>

          <span className="tl-head" style={{ left: x(playhead) }} />
        </div>
      </div>

      {sel.size > 0 && (
        <div className="tl-bar">
          <span>
            {range
              ? `${mmss(Math.max(0, range.a - axis.start))}–${mmss(
                  Math.max(0, range.b - axis.start),
                )} · ${sel.size} item${sel.size === 1 ? '' : 's'}`
              : `${sel.size} selected`}
          </span>
          <button onClick={() => void doDelete()}>delete</button>
        </div>
      )}

      <div className="tl-zoom">
        <button onClick={() => zoomTo(zoom / 1.5)} disabled={zoom <= 1} title="zoom out">
          –
        </button>
        <button onClick={() => zoomTo(zoom * 1.5)} title="zoom in">
          +
        </button>
        {zoom > 1 && (
          <button className="tl-fit" onClick={() => zoomTo(1)}>
            fit
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
