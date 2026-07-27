export type CaptureMode = 'element' | 'region' | 'draw' | 'page';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TargetInfo {
  selector: string;
  tag: string;
  id?: string;
  classes: string[];
  /** Trimmed visible text, useful for "the Place order button". */
  text?: string;
  /** Attributes worth handing to an agent: data-testid, aria-label, href, name… */
  attrs: Record<string, string>;
  /** Opening tag + a little content, truncated. */
  html: string;
  rect: Rect;
}

export interface PageEvent {
  level: 'error' | 'warn' | 'network';
  message: string;
  detail?: string;
  ts: number;
}

export interface Viewport {
  width: number;
  height: number;
  dpr: number;
  scrollX: number;
  scrollY: number;
}

export interface Note {
  id: string;
  sessionId: string;
  index: number;
  createdAt: number;
  text: string;
  mode: CaptureMode;
  url: string;
  title: string;
  viewport: Viewport;
  target?: TargetInfo;
  region?: Rect;
  strokes?: number;
  events: PageEvent[];
  fullFile: string;
  cropFile?: string;
  /** True once this note's files exist in the connected project folder. */
  written: boolean;
}

/** What the content script hands to the background worker. */
export interface NoteDraft {
  text: string;
  mode: CaptureMode;
  url: string;
  title: string;
  viewport: Viewport;
  target?: TargetInfo;
  region?: Rect;
  strokes?: number;
  events: PageEvent[];
  fullImage: string;
  cropImage?: string;
}

export interface TranscriptSegment {
  /** ms from recording start — where the speaker *started* the line */
  t: number;
  /** Spoken length in ms when the transcriber reported one. A line covers a window, not an instant. */
  d?: number;
  text: string;
}

/** Where the mouse was, sampled by the recorded tab while a walkthrough runs. All lengths are CSS px. */
export interface PointerSample {
  /** Absolute ms — the panel converts it to recording-relative. */
  ts: number;
  /** Viewport coordinates. */
  x: number;
  y: number;
  /** Screen coordinates (`MouseEvent.screenX/Y`). */
  sx: number;
  sy: number;
  /** Viewport size, for the tab-capture mapping. */
  vw: number;
  vh: number;
  /** Screen size, for the full-screen mapping. */
  sw: number;
  sh: number;
  selector?: string;
  text?: string;
}

/** The pointer as it applies to one keyframe. */
export interface FramePointer {
  /** Position inside the frame, 0–1. Absent when the capture couldn't be mapped (window capture, second monitor). */
  nx?: number;
  ny?: number;
  /** What the cursor was over, in the recorded tab. */
  selector?: string;
  text?: string;
}

export interface RecordingFrame {
  index: number;
  /** ms from recording start */
  t: number;
  /** Path relative to the session folder, e.g. frames/03-0125.jpg */
  file: string;
  /** Why this frame exists: first frame, dedup said "new", or the human hit the mark hotkey. */
  reason: 'start' | 'change' | 'mark';
  /** Changed-cell count (of 64×64) vs the closest of the last kept frames (absent on the first). */
  dist?: number;
  /** Mouse at capture time, when the recorded tab was reporting it. */
  pointer?: FramePointer;
}

export interface RecordingMeta {
  startedAt: number;
  durationMs: number;
  /** Candidate frames examined; frames[] is what survived dedup. */
  sampled: number;
  frames: RecordingFrame[];
  transcript: TranscriptSegment[];
  /** Set when the on-device Whisper pass replaced the live Web Speech lines; absent = Web Speech or none. */
  transcriber?: 'whisper';
  /** Bumped on every content mutation; recording:written only sticks when its rev still matches. */
  rev?: number;
  /** True once a human read the transcript back and said it was right. Reset when Whisper replaces it. */
  reviewed?: boolean;
  /** Console/network events forwarded by content scripts while recording. ts is absolute. */
  events: PageEvent[];
  /** Origin the events are scoped to — the tab that was in front at Record. Absent = no scope (kept everything). */
  eventScope?: string;
  /** Events from other origins that were thrown away; reported rather than hidden. */
  droppedEvents?: number;
  videoFile: string;
  /** True once the folder exists in the connected project dir. */
  written: boolean;
}

export interface Session {
  id: string;
  name: string;
  slug: string;
  createdAt: number;
  updatedAt: number;
  origin: string;
  noteCount: number;
  /** Absent means a plain note session. */
  kind?: 'recording';
  recording?: RecordingMeta;
}

export interface Settings {
  /** Autostart dictation when the composer opens. */
  autoDictate: boolean;
  /** Dim everything outside the target in the full screenshot. */
  spotlight: boolean;
  /** Stay armed after saving a note. */
  chain: boolean;
  /** Save the note automatically once you stop talking. */
  autoSend: boolean;
  /** How long a silence counts as "done talking". */
  autoSendMs: number;
  lang: string;
}

export const DEFAULT_SETTINGS: Settings = {
  autoDictate: true,
  spotlight: true,
  chain: false,
  autoSend: true,
  autoSendMs: 3000,
  lang: '',
};

/**
 * Say any of these and the note commits — no reaching for the keyboard. Matched
 * against the end of the transcript and stripped before saving.
 */
export const SEND_PHRASES =
  /\s*(?:and\s+)?(?:that'?s it|save it|save that|send it|log it|ship it|next note|end note|next)\s*[.!?]?\s*$/i;

export const ACCENT = '#ff5c39';

/** Contact sheet shape. The sheet builder and the report that cites the sheets must agree. */
export const GRID_COLS = 3;
export const GRID_ROWS = 3;
export const GRID_PER_SHEET = GRID_COLS * GRID_ROWS;
