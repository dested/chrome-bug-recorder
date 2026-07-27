import type { Note, Project, Session } from './types';
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
 * File System Access plumbing. Directory handles are picked from the side panel
 * and stashed in IndexedDB; Chrome hands the permission back on request (with a
 * user gesture) on later launches, so "connect once, then it just writes into my
 * repo" holds across browser restarts.
 *
 * There is one handle per connected project, keyed by project id. The handles
 * live here rather than travelling with the `Project` metadata because messages
 * between contexts are JSON-serialized and a handle would not survive the trip —
 * only IndexedDB's structured clone keeps it alive.
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
/** id → live handle. Panel-owned; the worker never reads it. */
const HANDLES_KEY = 'projectHandles';
/** The pre-0.5 single-folder keys, read once at migration and then deleted. */
const LEGACY_DIR = 'projectDir';
const LEGACY_PATH = 'projectPath';

export type ProjectHandles = Record<string, FileSystemDirectoryHandle>;

export function fsaSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/**
 * The picker id is frozen — Chrome keys "reopen where you last were" on it, and
 * it predates the rename. It is shared by every project on purpose: the picker
 * lands in the parent of the last repo you connected, which is where the next one
 * usually lives.
 */
export async function pickProjectDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null;
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite', id: 'bug-recorder-project' });
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') return null;
    throw error;
  }
}

export async function loadHandles(): Promise<ProjectHandles> {
  return (await kv.get<ProjectHandles>(HANDLES_KEY)) ?? {};
}

export async function saveHandle(id: string, handle: FileSystemDirectoryHandle): Promise<ProjectHandles> {
  const next = { ...(await loadHandles()), [id]: handle };
  await kv.set(HANDLES_KEY, next);
  return next;
}

export async function dropHandle(id: string): Promise<ProjectHandles> {
  const next = { ...(await loadHandles()) };
  delete next[id];
  await kv.set(HANDLES_KEY, next);
  return next;
}

/** The 0.4 single folder, if this profile has one and hasn't been migrated yet. */
export async function loadLegacyProject(): Promise<{ handle: FileSystemDirectoryHandle; path: string } | null> {
  const handle = await kv.get<FileSystemDirectoryHandle>(LEGACY_DIR);
  if (!handle) return null;
  return { handle, path: (await kv.get<string>(LEGACY_PATH)) ?? '' };
}

export async function clearLegacyProject() {
  await kv.delete(LEGACY_DIR);
  await kv.delete(LEGACY_PATH);
}

/**
 * Best-known location of a session's folder: absolute when the user told us,
 * project-relative otherwise. The File System Access API refuses to say where a
 * folder is on disk, and a report the agent can't locate cost the first one six
 * tool calls of `find` — so the panel asks once per project and every report
 * opens with the answer.
 */
export function sessionFolder(
  session: Session | null | undefined,
  project: Project | null | undefined,
): string {
  const parts = [REPORT_DIR, ...(session ? [session.slug] : [])];
  if (project?.path) {
    const sep = project.path.includes('\\') ? '\\' : '/';
    return [project.path, ...parts].join(sep);
  }
  return [...(project ? [project.name] : []), ...parts].join('/');
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
  folder?: string,
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

  await writeFile(dir, 'report.md', new Blob([buildReport(session, notes, folder)], { type: 'text/markdown' }));
  await writeFile(
    dir,
    'notes.json',
    new Blob([buildNotesJson(session, notes, folder)], { type: 'application/json' }),
  );
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
  folder?: string,
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
  await writeFile(
    dir,
    'report.md',
    new Blob([buildRecordingReport(session, rec, folder)], { type: 'text/markdown' }),
  );
  await writeFile(dir, 'transcript.txt', new Blob([buildTranscriptTxt(rec)], { type: 'text/plain' }));
  await writeFile(
    dir,
    'recording.json',
    new Blob([buildRecordingJson(session, rec, folder)], { type: 'application/json' }),
  );
  await writeFile(
    dir,
    'MANIFEST.txt',
    new Blob([buildManifestTxt(session, rec, folder)], { type: 'text/plain' }),
  );
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

export function displayPath(project: Project | null, session?: Session | null): string {
  if (!project) return '';
  return sessionFolder(session, project);
}
