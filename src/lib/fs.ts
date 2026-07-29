import type { Recording, Session } from './types';
import { buildManifestTxt, buildRecordingJson, buildReport, buildTranscriptTxt } from './markdown';
import { cleanPath, recDirName } from './format';
import { kv } from './db';

/**
 * File System Access plumbing. There is exactly **one** folder: the gripe inbox.
 * It is picked once from the side panel and stashed in IndexedDB, and Chrome hands
 * the permission back on request (with a user gesture) on later launches, so
 * "connect once, then it just writes there" holds across browser restarts.
 *
 * One folder, deliberately. 0.5 tried a list of per-project folders for a day and
 * it was more bookkeeping than it was worth — see decisions.md. 0.7 stopped
 * pretending that folder is "the repo you're in": it is a global inbox, and every
 * prompt carries an absolute path so any repo's agent can read from it.
 *
 * Layout of one gripe, everything under it relative so the folder can be moved:
 *
 *   <inbox>/gripes/<slug>/    ← the `gripes/` level is skipped when the inbox *is* a
 *     report.md                 folder named `gripes` — nobody wants gripes/gripes/
 *     MANIFEST.txt
 *     rec-01/                 one walkthrough part: frames/, grids/, transcript.txt,
 *     rec-02/                 recording.json, walkthrough.webm
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
const PATH_KEY = 'projectPath';
/** 0.5's per-project keys. Read once to reclaim the folder, then deleted. */
const V5_HANDLES = 'projectHandles';
const V5_PROJECTS = 'projects';
const V5_ACTIVE = 'activeProjectId';

export function fsaSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** The picker id is frozen: renaming it makes Chrome forget every user's folder. */
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
  return (await kv.get<FileSystemDirectoryHandle>(DIR_KEY)) ?? (await reclaimFromV5());
}

/**
 * 0.5 shipped a list of per-project folders and was reverted. Whichever one was
 * active becomes *the* folder, so nobody has to re-pick and re-type a path.
 */
async function reclaimFromV5(): Promise<FileSystemDirectoryHandle | null> {
  const handles = await kv.get<Record<string, FileSystemDirectoryHandle>>(V5_HANDLES);
  if (!handles) return null;
  const projects = (await kv.get<{ id: string; path: string }[]>(V5_PROJECTS)) ?? [];
  const activeId = await kv.get<string>(V5_ACTIVE);
  const pick =
    projects.find((p) => p.id === activeId && handles[p.id]) ?? projects.find((p) => handles[p.id]);
  const handle = (pick && handles[pick.id]) ?? Object.values(handles)[0];
  await Promise.all([kv.delete(V5_HANDLES), kv.delete(V5_PROJECTS), kv.delete(V5_ACTIVE)]);
  if (!handle) return null;
  await kv.set(DIR_KEY, handle);
  if (pick?.path) await kv.set(PATH_KEY, pick.path);
  return handle;
}

export async function forgetProjectDir() {
  await kv.delete(DIR_KEY);
  await kv.delete(PATH_KEY);
}

/**
 * The File System Access API refuses to tell us where the folder is on disk, and a
 * report the agent can't locate cost the first one six tool calls of `find`. So the
 * panel asks once, we remember it, and every report opens with the answer.
 */
export async function loadProjectPath(): Promise<string> {
  return (await kv.get<string>(PATH_KEY)) ?? '';
}

export async function saveProjectPath(path: string): Promise<string> {
  const clean = cleanPath(path);
  if (clean) await kv.set(PATH_KEY, clean);
  else await kv.delete(PATH_KEY);
  return clean;
}

/**
 * Point the inbox at a folder already called `gripes` and the `gripes/` level is
 * dead weight — `G:\code\gripes` must write `G:\code\gripes\<slug>`, never
 * `gripes\gripes\<slug>`. Every path builder and every writer applies this.
 */
function needsReportDir(name: string): boolean {
  return name.toLowerCase() !== REPORT_DIR;
}

/** Last segment of a typed path: the inbox's own folder name. */
function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? '';
}

/** Best-known location of a session's folder: absolute when the user told us, folder-relative otherwise. */
export function sessionFolder(
  session: Session | null | undefined,
  root: string,
  handle: FileSystemDirectoryHandle | null,
): string {
  const owner = root ? baseName(root) : (handle?.name ?? '');
  const parts = [
    ...(needsReportDir(owner) ? [REPORT_DIR] : []),
    ...(session ? [session.slug] : []),
  ];
  if (root) {
    const sep = root.includes('\\') ? '\\' : '/';
    return [root, ...parts].join(sep);
  }
  return [...(handle ? [handle.name] : []), ...parts].join('/');
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

/** The inbox's `gripes/` dir — or the inbox itself when it is already one. */
async function reportsDir(root: FileSystemDirectoryHandle) {
  if (!needsReportDir(root.name)) return root;
  return root.getDirectoryHandle(REPORT_DIR, { create: true });
}

async function sessionDir(root: FileSystemDirectoryHandle, session: Session) {
  const reports = await reportsDir(root);
  return reports.getDirectoryHandle(session.slug, { create: true });
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob | string) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

/** The report has to describe the part being written, even if the caller's list predates it. */
function withRecording(recordings: Recording[], recording: Recording): Recording[] {
  const rest = recordings.filter((r) => r.id !== recording.id);
  return [...rest, recording].sort((a, b) => a.index - b.index);
}

/** report.md + MANIFEST.txt — rewritten in full every time; they cost a few KB. */
async function writeSummaries(
  dir: FileSystemDirectoryHandle,
  session: Session,
  recordings: Recording[],
  folder?: string,
) {
  await writeFile(
    dir,
    'report.md',
    new Blob([buildReport(session, recordings, folder)], { type: 'text/markdown' }),
  );
  await writeFile(
    dir,
    'MANIFEST.txt',
    new Blob([buildManifestTxt(session, recordings, folder)], { type: 'text/plain' }),
  );
  // The screenshot-notes feature is dead; old folders carry its ghosts, and a
  // notes.json left lying there goes on describing them to the reading agent.
  await dir.removeEntry('notes.json').catch(() => {});
}

/**
 * Writes one walkthrough part, which owns a `rec-NN/` subtree: keyframes into
 * frames/, contact sheets into grids/, then the readable copies — transcript for
 * grepping, json for tooling, the raw webm for humans. The gripe's report and
 * manifest are rewritten at the folder root, which is why the other recordings
 * have to come with it.
 */
export async function writeRecording(
  root: FileSystemDirectoryHandle,
  session: Session,
  recording: Recording,
  frames: Map<number, Blob>,
  video: Blob | undefined,
  grids: Blob[],
  recordings: Recording[],
  folder?: string,
): Promise<void> {
  const rec = recording.meta;
  const dir = await sessionDir(root, session);
  const recDir = await dir.getDirectoryHandle(recDirName(recording.index), { create: true });

  const framesDir = await recDir.getDirectoryHandle('frames', { create: true });
  for (const frame of rec.frames) {
    const blob = frames.get(frame.index);
    // frame.file is rec-relative (frames/03-0125.jpg); the handle wants the leaf.
    if (blob) await writeFile(framesDir, frame.file.split('/').pop()!, blob);
  }
  if (grids.length) {
    const gridsDir = await recDir.getDirectoryHandle('grids', { create: true });
    for (const [i, grid] of grids.entries()) {
      await writeFile(gridsDir, `grid_${String(i + 1).padStart(2, '0')}.jpg`, grid);
    }
  }
  await writeFile(recDir, 'transcript.txt', new Blob([buildTranscriptTxt(rec)], { type: 'text/plain' }));
  await writeFile(
    recDir,
    'recording.json',
    new Blob([buildRecordingJson(session, recording, folder)], { type: 'application/json' }),
  );
  if (video) await writeFile(recDir, rec.videoFile, video);

  await writeSummaries(dir, session, withRecording(recordings, recording), folder);
}

export async function deleteSessionFolder(root: FileSystemDirectoryHandle, session: Session) {
  const reports = await reportsDir(root);
  await reports.removeEntry(session.slug, { recursive: true });
}

export function displayPath(
  handle: FileSystemDirectoryHandle | null,
  session?: Session | null,
  root = '',
): string {
  if (!handle) return '';
  return sessionFolder(session, root, handle);
}
