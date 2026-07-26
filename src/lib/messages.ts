import type { CaptureMode, NoteDraft, PageEvent, RecordingMeta, Settings } from './types';

/** Content script / side panel → background. */
export type Request =
  | { type: 'capture:visible' }
  | { type: 'note:add'; draft: NoteDraft }
  | { type: 'settings:get' }
  | { type: 'settings:set'; patch: Partial<Settings> }
  | { type: 'session:new'; name?: string }
  | { type: 'session:rename'; id: string; name: string }
  | { type: 'session:activate'; id: string }
  | { type: 'session:delete'; id: string }
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
  | { type: 'recording:written'; id: string }
  | { type: 'recording:frame:delete'; id: string; index: number }
  | { type: 'recording:line:update'; id: string; index: number; text: string }
  | { type: 'recording:line:delete'; id: string; index: number }
  // Content script → panel, relayed while a recording is live.
  | { type: 'recording:event'; event: PageEvent };

/** Background → content script. */
export type ContentCommand =
  | { type: 'arm'; mode: CaptureMode; settings: Settings }
  | { type: 'disarm' }
  | { type: 'recording'; active: boolean }
  | { type: 'ping' };

/** Background → side panel broadcast. */
export type Broadcast =
  | { type: 'state:changed' }
  | { type: 'note:captured'; noteId: string };

export function send<T = unknown>(message: Request): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}
