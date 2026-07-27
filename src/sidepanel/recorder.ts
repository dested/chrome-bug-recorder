import type {
  FramePointer,
  PageEvent,
  PointerSample,
  RecordingFrame,
  RecordingMeta,
  TranscriptSegment,
} from '../lib/types';
import { ACCENT } from '../lib/types';
import { blobs } from '../lib/db';
import { noteFileBase, mmssFile } from '../lib/format';
import { Dictation } from '../content/speech';

/**
 * Screen capture, distilled while it records — claude-real-video's dedup shape
 * (sliding window of KEPT frames, no forced keyframes, uniform thinning past the
 * cap), recalibrated for screen recordings. The reference compares 16×16 RGB
 * signatures by *percent* changed with an 8% bar — tuned for full-frame video.
 * On a screen recording the action usually lives in one region (a game canvas,
 * a terminal pane), and a 16×16 signature averages it into nothing: run against
 * a real capture, the original tool kept 1 frame of 22 and every reject scored
 * under 6%. So: 64×64 cells, and a frame is new when more than a handful of
 * cells changed — an absolute count, not a percent, because "how much of the
 * screen moved" is the wrong question when the answer is "one corner of it".
 * A-B-A cutaways still don't re-capture A, a static screen still adds nothing.
 * Speech is stamped where the sentence started, not where recognition finally
 * admitted what it heard.
 *
 * Two things the reference has no equivalent for, both from an agent that read a
 * real bundle: frames carry the mouse (drawn when the capture can be mapped, named
 * by selector always — "these over here" is otherwise unresolvable), and the mark
 * hotkey forces a keyframe mid-sentence.
 */

const SAMPLE_MS = 500; // candidate cadence — stands in for the reference's scene-detect + 1s density floor
const SIG_SIZE = 64; // 64×64 RGB cells — fine enough that a sprite-sized change still flips whole cells
const PIX_TOL = 25; // a cell counts as changed if any channel moves more than this
const DEDUP_THRESHOLD = 8; // cells that must change for a frame to be new (~0.2% of 4096 — localized action counts)
const DEDUP_WINDOW = 4; // vs the last N KEPT frames — A-B-A cutaways don't come back
const MAX_FRAMES = 150; // uniform thin after dedup so survivors stay spread across the recording
const MAX_FRAME_W = 1920;
const JPEG_QUALITY = 0.9;
const MAX_EVENTS = 200;
const POINTER_STALE_MS = 2500; // a pointer older than this says nothing about this frame
const MAP_TOLERANCE = 0.02; // aspect-ratio match required before we believe a coordinate mapping

const MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

export type MicState = 'listening' | 'off' | 'denied' | 'error';

export interface RecorderUpdate {
  elapsedMs: number;
  frameCount: number;
  segmentCount: number;
  markCount: number;
  interim: string;
  micState: MicState;
}

export interface RecorderHandlers {
  onUpdate(update: RecorderUpdate): void;
  /** The user ended the screen share from Chrome's own UI. */
  onEnd(): void;
}

/** Count of cells whose max channel delta exceeds PIX_TOL — the reference's pct_diff, kept as a count. */
function cellDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const cells = SIG_SIZE * SIG_SIZE;
  let changed = 0;
  for (let i = 0; i < cells; i++) {
    const p = i * 4;
    const d = Math.max(
      Math.abs(a[p] - b[p]),
      Math.abs(a[p + 1] - b[p + 1]),
      Math.abs(a[p + 2] - b[p + 2]),
    );
    if (d > PIX_TOL) changed++;
  }
  return changed;
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('frame encode failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

/**
 * Where the pointer lands inside the captured frame, 0–1, or null when we can't
 * be sure. getDisplayMedia never says *what* it handed us, so the frame's shape
 * is the only evidence: a frame shaped like the screen is the screen (map from
 * `screenX/Y`), a frame shaped like the viewport is the tab (map from
 * `clientX/Y`). A window capture matches neither and a second monitor pushes
 * screen coordinates out of range — both draw nothing rather than draw a lie.
 * The selector still ships in the report either way.
 */
function mapPointer(p: PointerSample, w: number, h: number): { nx: number; ny: number } | null {
  if (!w || !h) return null;
  const aspect = w / h;
  const fits = (a: number) => Math.abs(aspect - a) / a;
  const options: { off: number; nx: number; ny: number }[] = [];
  if (p.sw && p.sh) options.push({ off: fits(p.sw / p.sh), nx: p.sx / p.sw, ny: p.sy / p.sh });
  if (p.vw && p.vh) options.push({ off: fits(p.vw / p.vh), nx: p.x / p.vw, ny: p.y / p.vh });
  const best = options.filter((o) => o.off <= MAP_TOLERANCE).sort((a, b) => a.off - b.off)[0];
  if (!best) return null;
  const out = [best.nx, best.ny];
  if (out.some((v) => v < -0.02 || v > 1.02)) return null;
  return { nx: Math.min(1, Math.max(0, best.nx)), ny: Math.min(1, Math.max(0, best.ny)) };
}

/** The mouse, drawn onto the keyframe. Dark pass first so it survives a white page too. */
function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
  const r = Math.max(9, Math.round(width / 110));
  const arm = r * 2.2;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [color, lineWidth] of [['rgba(0,0,0,0.6)', r / 2], [ACCENT, r / 4.5]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x - r - 2, y);
    ctx.moveTo(x + r + 2, y);
    ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y - r - 2);
    ctx.moveTo(x, y + r + 2);
    ctx.lineTo(x, y + arm);
    ctx.stroke();
  }
  ctx.restore();
}

export class Recorder {
  readonly sessionId: string;

  private stream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private recorder: MediaRecorder | null = null;
  private mime = 'video/webm';
  private chunks: Blob[] = [];

  private dictation: Dictation | null = null;
  private micState: MicState = 'off';
  private interim = '';
  private utteranceStart: number | null = null;
  private segments: TranscriptSegment[] = [];
  private events: PageEvent[] = [];
  /** Events from tabs that aren't the one being recorded — counted, not kept. */
  private dropped = 0;
  private pointer: PointerSample | null = null;

  private frames: RecordingFrame[] = [];
  private marks = 0;
  /** The mark hotkey fired: the next sample is kept whatever dedup thinks. */
  private forced = false;
  /** Signatures of the KEPT frames only — that ring *is* the dedup window. */
  private sigs: Uint8ClampedArray[] = [];
  private sampled = 0;
  private startedAt = 0;

  private sigCtx: CanvasRenderingContext2D | null = null;
  private frameCtx: CanvasRenderingContext2D | null = null;

  private sampleTimer: number | null = null;
  private tickTimer: number | null = null;
  private sampling = false;
  private pending: Promise<void> = Promise.resolve();
  private stopped: Promise<RecordingMeta> | null = null;

  constructor(
    private handlers: RecorderHandlers,
    private lang: string,
    /** Origin of the tab that was in front at Record. Telemetry from anywhere else is noise. */
    readonly scope: string,
  ) {
    this.sessionId = crypto.randomUUID();
  }

  // ── lifecycle ───────────────────────────────────────────────────────────

  async start() {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 10 } },
      audio: false,
    });
    this.stream = stream;
    this.startedAt = Date.now();

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = 'position:fixed; left:-9999px; top:0; width:4px;';
    document.body.appendChild(video);
    video.srcObject = stream;
    await video.play();
    this.video = video;

    const sig = document.createElement('canvas');
    sig.width = SIG_SIZE;
    sig.height = SIG_SIZE;
    this.sigCtx = sig.getContext('2d', { willReadFrequently: true });
    this.frameCtx = document.createElement('canvas').getContext('2d');
    if (this.frameCtx) this.frameCtx.imageSmoothingQuality = 'high';

    // The mic is grabbed for real, not as a throwaway probe: its track is mixed
    // into the webm so the raw video carries the narration, and acquiring it
    // here is also the only chance SpeechRecognition gets at a permission
    // prompt from an extension page.
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.micState = 'denied';
    }

    this.mime = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? 'video/webm';
    const recorded = new MediaStream([
      ...stream.getVideoTracks(),
      ...(this.micStream?.getAudioTracks() ?? []),
    ]);
    const recorder = new MediaRecorder(recorded, { mimeType: this.mime });
    recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    recorder.start(1000);
    this.recorder = recorder;

    stream.getVideoTracks()[0]?.addEventListener('ended', () => this.handlers.onEnd());
    if (this.micState !== 'denied') {
      this.dictation = new Dictation(
        {
          onInterim: (text) => {
            if (text && this.utteranceStart === null) this.utteranceStart = this.elapsed();
            this.interim = text;
            this.emit();
          },
          onFinal: (text) => {
            if (text) this.segments.push({ t: this.utteranceStart ?? this.elapsed(), text });
            this.utteranceStart = null;
            this.emit();
          },
          onState: (state) => {
            this.micState = state;
            this.emit();
          },
        },
        this.lang,
      );
      this.dictation.start();
    }

    this.sampleTimer = window.setInterval(() => {
      // Only replace `pending` when a sample actually starts — a tick that
      // no-ops against an in-flight sample must not mask the real promise,
      // or finish() would thin/renumber while that sample is still writing.
      if (!this.sampling) this.pending = this.sample();
    }, SAMPLE_MS);
    this.tickTimer = window.setInterval(() => this.emit(), 1000);
    this.pending = this.sample();
  }

  stop(): Promise<RecordingMeta> {
    if (!this.stopped) this.stopped = this.finish();
    return this.stopped;
  }

  addEvent(event: PageEvent, origin?: string) {
    if (!this.inScope(origin)) {
      this.dropped++;
      return;
    }
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  addPointer(sample: PointerSample, origin?: string) {
    if (this.inScope(origin)) this.pointer = sample;
  }

  /** Capture this instant no matter what dedup thinks — the human said it matters. */
  mark() {
    if (!this.stream) return;
    this.forced = true;
    if (!this.sampling) this.pending = this.sample();
  }

  /** No scope (a chrome:// tab was in front) keeps everything — better noisy than empty. */
  private inScope(origin?: string): boolean {
    return !this.scope || !origin || origin === this.scope;
  }

  // ── sampling ────────────────────────────────────────────────────────────

  private async sample() {
    const video = this.video;
    const sigCtx = this.sigCtx;
    const frameCtx = this.frameCtx;
    if (this.sampling || !video || !sigCtx || !frameCtx) return;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

    this.sampling = true;
    const forced = this.forced;
    this.forced = false;
    try {
      this.sampled++;
      sigCtx.drawImage(video, 0, 0, SIG_SIZE, SIG_SIZE);
      const sig = sigCtx.getImageData(0, 0, SIG_SIZE, SIG_SIZE).data;

      const t = this.elapsed();
      const minDist = this.sigs.length
        ? Math.min(...this.sigs.map((k) => cellDiff(sig, k)))
        : undefined;
      let reason: RecordingFrame['reason'];
      if (forced) {
        reason = 'mark';
        this.marks++;
      } else if (minDist === undefined) {
        reason = 'start';
      } else {
        if (minDist <= DEDUP_THRESHOLD) return;
        reason = 'change';
      }
      const dist = minDist; // changed-cell count vs the closest kept frame

      const width = Math.min(video.videoWidth, MAX_FRAME_W);
      const height = Math.round((video.videoHeight * width) / video.videoWidth);
      const canvas = frameCtx.canvas;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        frameCtx.imageSmoothingQuality = 'high';
      }
      frameCtx.drawImage(video, 0, 0, width, height);
      const pointer = this.pointerNow(width, height);
      if (pointer?.nx !== undefined && pointer.ny !== undefined) {
        drawCrosshair(frameCtx, pointer.nx * width, pointer.ny * height, width);
      }

      const index = this.frames.length + 1;
      await blobs.set(`${this.sessionId}:frame:${index}`, await toJpeg(canvas));
      this.frames.push({
        index,
        t,
        file: `frames/${noteFileBase(index)}-${mmssFile(t)}.jpg`,
        reason,
        ...(dist === undefined ? {} : { dist }),
        ...(pointer ? { pointer } : {}),
      });
      this.sigs.push(sig);
      if (this.sigs.length > DEDUP_WINDOW) this.sigs.shift();
      this.emit();
    } finally {
      this.sampling = false;
    }
  }

  /** The pointer as it applies to the frame being written, if it's still fresh. */
  private pointerNow(width: number, height: number): FramePointer | undefined {
    const p = this.pointer;
    if (!p || Date.now() - p.ts > POINTER_STALE_MS) return undefined;
    const mapped = mapPointer(p, width, height);
    if (!mapped && !p.selector) return undefined;
    return { ...(mapped ?? {}), selector: p.selector, text: p.text };
  }

  // ── teardown ────────────────────────────────────────────────────────────

  private async finish(): Promise<RecordingMeta> {
    if (this.sampleTimer !== null) clearInterval(this.sampleTimer);
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
    this.sampleTimer = null;
    this.tickTimer = null;
    this.dictation?.stop();
    this.dictation = null;

    await this.pending;
    await this.sample(); // the last screen state gets its fair shot through dedup, nothing more

    if (this.frames.length > MAX_FRAMES) {
      // Marked frames are the human pointing at something; they never get thinned.
      const keepIdx = new Set<number>();
      this.frames.forEach((f, i) => f.reason === 'mark' && keepIdx.add(i));
      const rest = this.frames.map((_, i) => i).filter((i) => !keepIdx.has(i));
      const budget = Math.max(0, MAX_FRAMES - keepIdx.size);
      const step = rest.length / budget;
      for (let i = 0; i < budget; i++) keepIdx.add(rest[Math.floor(i * step)]);
      const survivors = this.frames.filter((_, i) => keepIdx.has(i));
      const dropped = this.frames.filter((_, i) => !keepIdx.has(i));
      await Promise.all(dropped.map((f) => blobs.delete(`${this.sessionId}:frame:${f.index}`)));
      // Renumber ascending: a survivor's new index is always ≤ its old one, and the
      // slot it moves into has already been vacated — never re-key out of order.
      for (let n = 0; n < survivors.length; n++) {
        const f = survivors[n];
        const newIndex = n + 1;
        if (newIndex !== f.index) {
          const blob = await blobs.get(`${this.sessionId}:frame:${f.index}`);
          if (blob) await blobs.set(`${this.sessionId}:frame:${newIndex}`, blob);
          await blobs.delete(`${this.sessionId}:frame:${f.index}`);
          f.index = newIndex;
          f.file = `frames/${noteFileBase(newIndex)}-${mmssFile(f.t)}.jpg`; // t survives — citations stay valid
        }
      }
      this.frames = survivors;
    }

    const recorder = this.recorder;
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }
    this.recorder = null;
    await blobs.set(`${this.sessionId}:video`, new Blob(this.chunks, { type: this.mime }));

    this.stream?.getTracks().forEach((track) => track.stop());
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.video?.remove();
    this.stream = null;
    this.micStream = null;
    this.video = null;

    return {
      startedAt: this.startedAt,
      durationMs: Date.now() - this.startedAt,
      sampled: this.sampled,
      frames: this.frames,
      transcript: this.segments,
      events: this.events,
      ...(this.scope ? { eventScope: this.scope } : {}),
      ...(this.dropped ? { droppedEvents: this.dropped } : {}),
      videoFile: 'walkthrough.webm',
      written: false,
    };
  }

  // ── plumbing ────────────────────────────────────────────────────────────

  private elapsed() {
    return Date.now() - this.startedAt;
  }

  private emit() {
    this.handlers.onUpdate({
      elapsedMs: this.elapsed(),
      frameCount: this.frames.length,
      segmentCount: this.segments.length,
      markCount: this.marks,
      interim: this.interim,
      micState: this.micState,
    });
  }
}
