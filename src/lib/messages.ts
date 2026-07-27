import type {
  CaptureMode,
  NoteDraft,
  PageEvent,
  PointerSample,
  RecordingMeta,
  Settings,
  TranscriptSegment,
} from './types';

/** Content script / side panel → background. */
export type Request =
  | { type: 'capture:visible' }
  | { type: 'note:add'; draft: NoteDraft }
  | { type: 'settings:get' }
  | { type: 'settings:set'; patch: Partial<Settings> }
  | { type: 'session:rename'; id: string; name: string }
  | { type: 'session:activate'; id: string }
  | { type: 'session:delete'; id: string }
  // Handed off and finished: no more notes land here, and the panel goes blank
  // until the next capture opens a fresh one.
  | { type: 'session:close'; id: string }
  // Mark everything in a session unwritten so the folder is rebuilt (the project
  // path changed, and it's printed at the top of every report).
  | { type: 'session:rewrite'; id: string }
  | { type: 'note:update'; id: string; text: string }
  | { type: 'note:delete'; id: string }
  | { type: 'note:written'; ids: string[] }
  | { type: 'state:get' }
  | { type: 'arm'; mode: CaptureMode; tabId?: number }
  | { type: 'disarm' }
  // The panel has already stored the frame/video blobs under `id`; the
  // background just mints the Session record around them.
  | { type: 'recording:add'; id: string; name: string; origin: string; meta: RecordingMeta }
  | { type: 'recording:setActive'; active: boolean }
  | { type: 'recording:written'; id: string; rev: number }
  | { type: 'recording:frame:delete'; id: string; index: number }
  | { type: 'recording:line:update'; id: string; index: number; text: string }
  | { type: 'recording:line:delete'; id: string; index: number }
  // The on-device Whisper pass finished and supersedes the Web Speech lines.
  | { type: 'recording:transcript'; id: string; transcript: TranscriptSegment[] }
  // The human read the transcript back and confirmed it.
  | { type: 'recording:reviewed'; id: string }
  // Content script → panel, relayed while a recording is live. `origin` is the
  // sender's own, so the panel can drop everything outside the recorded tab.
  | { type: 'recording:event'; event: PageEvent; origin: string }
  | { type: 'recording:pointer'; sample: PointerSample; origin: string };

/** Background → content script. */
export type ContentCommand =
  | { type: 'arm'; mode: CaptureMode; settings: Settings }
  | { type: 'disarm' }
  | { type: 'recording'; active: boolean }
  | { type: 'ping' };

/** Background → side panel broadcast. */
export type Broadcast =
  | { type: 'state:changed' }
  | { type: 'note:captured'; noteId: string }
  // The mark hotkey fired. It's a command, so only the worker hears it.
  | { type: 'recording:mark' };

export function send<T = unknown>(message: Request): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}
