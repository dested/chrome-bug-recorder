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
  /** ms from recording start */
  t: number;
  text: string;
}

export interface RecordingFrame {
  index: number;
  /** ms from recording start */
  t: number;
  /** Path relative to the session folder, e.g. frames/03-0125.jpg */
  file: string;
  /** Why this frame survived dedup. */
  reason: 'start' | 'change';
  /** Percent of pixels changed vs the closest of the last kept frames (absent on the first). */
  dist?: number;
}

export interface RecordingMeta {
  startedAt: number;
  durationMs: number;
  /** Candidate frames examined; frames[] is what survived dedup. */
  sampled: number;
  frames: RecordingFrame[];
  transcript: TranscriptSegment[];
  /** Console/network events forwarded by content scripts while recording. ts is absolute. */
  events: PageEvent[];
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
