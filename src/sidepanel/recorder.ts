import type { PageEvent, RecordingFrame, RecordingMeta, TranscriptSegment } from '../lib/types';
import { blobs } from '../lib/db';
import { noteFileBase, mmssFile } from '../lib/format';
import { Dictation } from '../content/speech';

/**
 * Screen capture, distilled while it records — a live port of claude-real-video's
 * dedup. Twice a second we glance at the stream, reduce it to a 16×16 RGB
 * signature, and keep the frame only if enough of those pixels changed against a
 * sliding window of the frames we KEPT — so an A-B-A cutaway doesn't re-capture A.
 * Past the cap the survivors are thinned uniformly so they stay spread across the
 * recording. There are no forced keyframes: a static screen adds nothing. Speech
 * is stamped where the sentence started, not where recognition finally admitted
 * what it heard.
 */

const SAMPLE_MS = 500; // candidate cadence — stands in for the reference's scene-detect + 1s density floor
const SIG_SIZE = 16; // signatures are 16×16 RGB — equal-luma hue cuts must not look identical
const PIX_TOL = 25; // a pixel counts as changed if any channel moves more than this
const DEDUP_THRESHOLD = 8; // percent of pixels that must change for a frame to be new
const DEDUP_WINDOW = 4; // vs the last N KEPT frames — A-B-A cutaways don't come back
const MAX_FRAMES = 150; // uniform thin after dedup so survivors stay spread across the recording
const MAX_FRAME_W = 1920;
const JPEG_QUALITY = 0.9;
const MAX_EVENTS = 200;

const MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

export type MicState = 'listening' | 'off' | 'denied' | 'error';

export interface RecorderUpdate {
  elapsedMs: number;
  frameCount: number;
  segmentCount: number;
  interim: string;
  micState: MicState;
}

export interface RecorderHandlers {
  onUpdate(update: RecorderUpdate): void;
  /** The user ended the screen share from Chrome's own UI. */
  onEnd(): void;
}

/** Percent of pixels whose max channel delta exceeds PIX_TOL — the reference's pct_diff. */
function pctDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const pixels = SIG_SIZE * SIG_SIZE;
  let changed = 0;
  for (let i = 0; i < pixels; i++) {
    const p = i * 4;
    const d = Math.max(
      Math.abs(a[p] - b[p]),
      Math.abs(a[p + 1] - b[p + 1]),
      Math.abs(a[p + 2] - b[p + 2]),
    );
    if (d > PIX_TOL) changed++;
  }
  return (100 * changed) / pixels;
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

  private frames: RecordingFrame[] = [];
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

  addEvent(event: PageEvent) {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  // ── sampling ────────────────────────────────────────────────────────────

  private async sample() {
    const video = this.video;
    const sigCtx = this.sigCtx;
    const frameCtx = this.frameCtx;
    if (this.sampling || !video || !sigCtx || !frameCtx) return;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

    this.sampling = true;
    try {
      this.sampled++;
      sigCtx.drawImage(video, 0, 0, SIG_SIZE, SIG_SIZE);
      const sig = sigCtx.getImageData(0, 0, SIG_SIZE, SIG_SIZE).data;

      const t = this.elapsed();
      let reason: RecordingFrame['reason'];
      let dist: number | undefined;
      if (!this.sigs.length) {
        reason = 'start';
      } else {
        const minDist = Math.min(...this.sigs.map((k) => pctDiff(sig, k)));
        if (minDist <= DEDUP_THRESHOLD) return;
        reason = 'change';
        dist = Math.round(minDist * 10) / 10;
      }

      const width = Math.min(video.videoWidth, MAX_FRAME_W);
      const height = Math.round((video.videoHeight * width) / video.videoWidth);
      const canvas = frameCtx.canvas;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        frameCtx.imageSmoothingQuality = 'high';
      }
      frameCtx.drawImage(video, 0, 0, width, height);

      const index = this.frames.length + 1;
      await blobs.set(`${this.sessionId}:frame:${index}`, await toJpeg(canvas));
      this.frames.push({
        index,
        t,
        file: `frames/${noteFileBase(index)}-${mmssFile(t)}.jpg`,
        reason,
        ...(dist === undefined ? {} : { dist }),
      });
      this.sigs.push(sig);
      if (this.sigs.length > DEDUP_WINDOW) this.sigs.shift();
      this.emit();
    } finally {
      this.sampling = false;
    }
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
      const step = this.frames.length / MAX_FRAMES;
      const keepIdx = new Set<number>();
      for (let i = 0; i < MAX_FRAMES; i++) keepIdx.add(Math.floor(i * step));
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
      interim: this.interim,
      micState: this.micState,
    });
  }
}
