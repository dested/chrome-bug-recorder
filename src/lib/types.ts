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

export interface Session {
  id: string;
  name: string;
  slug: string;
  createdAt: number;
  updatedAt: number;
  origin: string;
  noteCount: number;
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
