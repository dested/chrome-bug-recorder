import type { Note, Session } from './types';
import {
  buildManifestTxt,
  buildNotesJson,
  buildRecordingJson,
  buildRecordingReport,
  buildReport,
  buildTranscriptTxt,
} from './markdown';
import { kv } from './db';

/**
 * File System Access plumbing. The directory handle is picked once from the side
 * panel and stashed in IndexedDB; Chrome hands the permission back on request
 * (with a user gesture) on later launches, so "connect once, then it just writes
 * into my repo" holds across browser restarts.
 */

declare global {
  interface Window {
    showDirectoryPicker?(options?: {
      mode?: 'read' | 'readwrite';
      id?: string;
      startIn?: string;
    }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}

export const REPORT_DIR = 'gripes';
const DIR_KEY = 'projectDir';

export function fsaSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function pickProjectDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'bug-recorder-project' });
    await kv.set(DIR_KEY, handle);
    return handle;
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') return null;
    throw error;
  }
}

export async function loadProjectDir(): Promise<FileSystemDirectoryHandle | null> {
  return (await kv.get<FileSystemDirectoryHandle>(DIR_KEY)) ?? null;
}

export async function forgetProjectDir() {
  await kv.delete(DIR_KEY);
}

export type DirPermission = 'granted' | 'prompt' | 'denied';

export async function checkPermission(handle: FileSystemDirectoryHandle): Promise<DirPermission> {
  if (!handle.queryPermission) return 'granted';
  return (await handle.queryPermission({ mode: 'readwrite' })) as DirPermission;
}

/** Must be called from a user gesture. */
export async function requestPermission(handle: FileSystemDirectoryHandle): Promise<DirPermission> {
  if (!handle.requestPermission) return 'granted';
  return (await handle.requestPermission({ mode: 'readwrite' })) as DirPermission;
}

async function sessionDir(root: FileSystemDirectoryHandle, session: Session) {
  const reports = await root.getDirectoryHandle(REPORT_DIR, { create: true });
  return reports.getDirectoryHandle(session.slug, { create: true });
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob | string) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

export interface NoteImages {
  full?: Blob;
  crop?: Blob;
}

/**
 * Writes (or rewrites) the whole session folder. Cheap enough to run after every
 * note — the markdown is a few KB and images are skipped when they already exist.
 */
export async function writeSession(
  root: FileSystemDirectoryHandle,
  session: Session,
  notes: Note[],
  images: Map<string, NoteImages>,
): Promise<string[]> {
  const dir = await sessionDir(root, session);
  const wroteImagesFor: string[] = [];

  for (const note of notes) {
    const bundle = images.get(note.id);
    if (!bundle) continue;
    if (bundle.full) await writeFile(dir, note.fullFile, bundle.full);
    if (bundle.crop && note.cropFile) await writeFile(dir, note.cropFile, bundle.crop);
    wroteImagesFor.push(note.id);
  }

  await writeFile(dir, 'report.md', new Blob([buildReport(session, notes)], { type: 'text/markdown' }));
  await writeFile(dir, 'notes.json', new Blob([buildNotesJson(session, notes)], { type: 'application/json' }));
  return wroteImagesFor;
}

/**
 * Same idea for a recording: keyframes into frames/, then the readable copies —
 * report for the agent, transcript for grepping, json for tooling, manifest for
 * a model handed the folder cold — plus the contact sheets in grids/.
 */
export async function writeRecordingSession(
  root: FileSystemDirectoryHandle,
  session: Session,
  frames: Map<number, Blob>,
  video: Blob | undefined,
  grids: Blob[],
): Promise<void> {
  const rec = session.recording;
  if (!rec) return;
  const dir = await sessionDir(root, session);
  const framesDir = await dir.getDirectoryHandle('frames', { create: true });
  for (const frame of rec.frames) {
    const blob = frames.get(frame.index);
    // frame.file is session-relative (frames/03-0125.jpg); the handle wants the leaf.
    if (blob) await writeFile(framesDir, frame.file.split('/').pop()!, blob);
  }
  await writeFile(dir, 'report.md', new Blob([buildRecordingReport(session, rec)], { type: 'text/markdown' }));
  await writeFile(dir, 'transcript.txt', new Blob([buildTranscriptTxt(rec)], { type: 'text/plain' }));
  await writeFile(dir, 'recording.json', new Blob([buildRecordingJson(session, rec)], { type: 'application/json' }));
  await writeFile(dir, 'MANIFEST.txt', new Blob([buildManifestTxt(session, rec)], { type: 'text/plain' }));
  if (grids.length) {
    const gridsDir = await dir.getDirectoryHandle('grids', { create: true });
    for (const [i, grid] of grids.entries()) {
      await writeFile(gridsDir, `grid_${String(i + 1).padStart(2, '0')}.jpg`, grid);
    }
  }
  if (video) await writeFile(dir, rec.videoFile, video);
}

export async function deleteSessionFolder(root: FileSystemDirectoryHandle, session: Session) {
  const reports = await root.getDirectoryHandle(REPORT_DIR, { create: true });
  await reports.removeEntry(session.slug, { recursive: true });
}

export function displayPath(handle: FileSystemDirectoryHandle | null, session?: Session | null): string {
  if (!handle) return '';
  const parts = [handle.name, REPORT_DIR];
  if (session) parts.push(session.slug);
  return parts.join('/');
}
