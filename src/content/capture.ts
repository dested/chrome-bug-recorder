import type { CaptureMode, Rect } from '../lib/types';
import { ACCENT } from '../lib/types';

/**
 * Turns the raw tab capture into the two images that end up in the report:
 * a full viewport shot with everything outside the target dimmed (so an agent's
 * eye lands where yours did), and a close-up crop upscaled to be legible.
 */

export interface Stroke {
  points: { x: number; y: number }[];
}

export interface ComposeInput {
  dataUrl: string;
  mode: CaptureMode;
  rect?: Rect;
  strokes?: Stroke[];
  spotlight: boolean;
}

export interface ComposeResult {
  full: string;
  crop?: string;
}

const CROP_PAD = 28;
const CROP_MIN_WIDTH = 560;
const CROP_MAX_WIDTH = 1400;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('screenshot decode failed'));
    img.src = dataUrl;
  });
}

function strokeBounds(strokes: Stroke[]): Rect | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return undefined;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function drawBox(ctx: CanvasRenderingContext2D, rect: Rect, scale: number) {
  const x = rect.x * scale;
  const y = rect.y * scale;
  const w = rect.width * scale;
  const h = rect.height * scale;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(4, 4 * scale);
  ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = Math.max(2, 2 * scale);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number, offset = { x: 0, y: 0 }) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4 * scale;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = Math.max(3, 3.5 * scale);
  for (const stroke of strokes) {
    if (stroke.points.length < 2) {
      const p = stroke.points[0];
      if (!p) continue;
      ctx.beginPath();
      ctx.arc((p.x - offset.x) * scale, (p.y - offset.y) * scale, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT;
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    stroke.points.forEach((p, i) => {
      const px = (p.x - offset.x) * scale;
      const py = (p.y - offset.y) * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
  ctx.restore();
}

/** Dim everything outside `rect` without touching the pixels inside it. */
function spotlightAround(ctx: CanvasRenderingContext2D, rect: Rect, scale: number, w: number, h: number) {
  const x = rect.x * scale;
  const y = rect.y * scale;
  const rw = rect.width * scale;
  const rh = rect.height * scale;
  ctx.save();
  ctx.fillStyle = 'rgba(6,6,8,0.52)';
  ctx.fillRect(0, 0, w, Math.max(0, y));
  ctx.fillRect(0, y + rh, w, Math.max(0, h - (y + rh)));
  ctx.fillRect(0, y, Math.max(0, x), rh);
  ctx.fillRect(x + rw, y, Math.max(0, w - (x + rw)), rh);
  ctx.restore();
}

export async function compose(input: ComposeInput): Promise<ComposeResult> {
  const img = await loadImage(input.dataUrl);
  const scale = img.naturalWidth / window.innerWidth || 1;

  const full = document.createElement('canvas');
  full.width = img.naturalWidth;
  full.height = img.naturalHeight;
  const ctx = full.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(img, 0, 0);

  const focus = input.rect ?? (input.strokes?.length ? strokeBounds(input.strokes) : undefined);

  if (input.rect) {
    if (input.spotlight) spotlightAround(ctx, input.rect, scale, full.width, full.height);
    drawBox(ctx, input.rect, scale);
  }
  if (input.strokes?.length) drawStrokes(ctx, input.strokes, scale);

  const result: ComposeResult = { full: full.toDataURL('image/png') };
  if (!focus || focus.width < 4 || focus.height < 4) return result;

  // Close-up crop, taken from the clean capture so the dimming doesn't muddy it.
  const cx = Math.max(0, (focus.x - CROP_PAD) * scale);
  const cy = Math.max(0, (focus.y - CROP_PAD) * scale);
  const cw = Math.min(full.width - cx, (focus.width + CROP_PAD * 2) * scale);
  const ch = Math.min(full.height - cy, (focus.height + CROP_PAD * 2) * scale);
  if (cw < 8 || ch < 8) return result;

  const zoom = Math.min(3, Math.max(1, CROP_MIN_WIDTH / cw), CROP_MAX_WIDTH / cw);
  const crop = document.createElement('canvas');
  crop.width = Math.round(cw * zoom);
  crop.height = Math.round(ch * zoom);
  const cctx = crop.getContext('2d');
  if (!cctx) return result;
  cctx.imageSmoothingQuality = 'high';
  cctx.drawImage(img, cx, cy, cw, ch, 0, 0, crop.width, crop.height);

  const cropScale = scale * zoom;
  const offset = { x: cx / scale, y: cy / scale };
  if (input.rect) {
    drawBox(
      cctx,
      { x: input.rect.x - offset.x, y: input.rect.y - offset.y, width: input.rect.width, height: input.rect.height },
      cropScale,
    );
  }
  if (input.strokes?.length) drawStrokes(cctx, input.strokes, cropScale, offset);

  result.crop = crop.toDataURL('image/png');
  return result;
}
