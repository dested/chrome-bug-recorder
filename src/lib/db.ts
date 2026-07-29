import type { Recording, RecordingMeta, Session } from './types';

/**
 * The single source of truth, shared by the service worker and the side panel.
 * Images live here as Blobs (not data URLs) so a long session doesn't balloon
 * memory, and the directory handle lives here too — handles survive structured
 * clone, which is the only reason "remember my project folder" works at all.
 */

// Renaming this would orphan every session already recorded — it stays.
const DB_NAME = 'bug-recorder';
const DB_VERSION = 2;

export const STORE = {
  sessions: 'sessions',
  notes: 'notes',
  recordings: 'recordings',
  blobs: 'blobs',
  kv: 'kv',
} as const;

/** A v1 session: a walkthrough was the session itself. Only the migration sees this shape. */
type LegacySession = Session & { kind?: 'recording'; recording?: RecordingMeta };

/**
 * The screenshot-notes feature is dead, but its store and its rows are still in
 * every profile that ever used it. Nothing writes one now; the helpers below stay
 * so deleting a gripe still sweeps the ones it owns, and they need no more of the
 * shape than this.
 */
interface StoredNote {
  id: string;
  sessionId: string;
  index: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE.sessions)) {
        db.createObjectStore(STORE.sessions, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE.notes)) {
        const notes = db.createObjectStore(STORE.notes, { keyPath: 'id' });
        notes.createIndex('bySession', 'sessionId');
      }
      if (!db.objectStoreNames.contains(STORE.recordings)) {
        const recordings = db.createObjectStore(STORE.recordings, { keyPath: 'id' });
        recordings.createIndex('bySession', 'sessionId');
      }
      if (!db.objectStoreNames.contains(STORE.blobs)) {
        db.createObjectStore(STORE.blobs);
      }
      if (!db.objectStoreNames.contains(STORE.kv)) {
        db.createObjectStore(STORE.kv);
      }
      // v1 → v2: lift every `kind: 'recording'` session out into a part of itself.
      // The helpers below open their own transactions and can't join a
      // versionchange one, so this walks raw requests on request.transaction.
      const upgrade = request.transaction;
      if (event.oldVersion >= 1 && upgrade) migrateToParts(upgrade);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

/**
 * The recording keeps the session's id, so every `<id>:frame:<n>` and `<id>:video`
 * blob key still resolves — nothing on disk or in blobs moves.
 */
function migrateToParts(upgrade: IDBTransaction) {
  const sessions = upgrade.objectStore(STORE.sessions);
  const recordings = upgrade.objectStore(STORE.recordings);
  sessions.openCursor().onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
    if (!cursor) return;
    const legacy = cursor.value as LegacySession;
    const meta = legacy.kind === 'recording' ? legacy.recording : undefined;
    if (meta) {
      const recording: Recording = {
        id: legacy.id,
        sessionId: legacy.id,
        index: 1,
        createdAt: meta.startedAt,
        state: 'done',
        mime: 'video/webm',
        chunks: 0,
        meta,
      };
      recordings.put(recording);
    }
    const session: Session = {
      id: legacy.id,
      name: legacy.name,
      slug: legacy.slug,
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
      origin: legacy.origin,
      recCount: meta ? 1 : 0,
      closed: legacy.closed,
    };
    cursor.update(session);
    cursor.continue();
  };
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return wrap(fn(db.transaction(store, mode).objectStore(store)));
}

export const kv = {
  get: <T>(key: string) => tx<T>(STORE.kv, 'readonly', (s) => s.get(key) as IDBRequest<T>),
  set: (key: string, value: unknown) => tx(STORE.kv, 'readwrite', (s) => s.put(value, key)),
  delete: (key: string) => tx(STORE.kv, 'readwrite', (s) => s.delete(key)),
};

export const blobs = {
  get: (key: string) => tx<Blob | undefined>(STORE.blobs, 'readonly', (s) => s.get(key)),
  set: (key: string, blob: Blob) => tx(STORE.blobs, 'readwrite', (s) => s.put(blob, key)),
  delete: (key: string) => tx(STORE.blobs, 'readwrite', (s) => s.delete(key)),
};

export async function putSession(session: Session) {
  await tx(STORE.sessions, 'readwrite', (s) => s.put(session));
}

export async function getSession(id: string) {
  return tx<Session | undefined>(STORE.sessions, 'readonly', (s) => s.get(id));
}

export async function listSessions(): Promise<Session[]> {
  const all = await tx<Session[]>(STORE.sessions, 'readonly', (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSession(id: string) {
  const recordings = await listRecordings(id);
  await Promise.all(recordings.map((r) => deleteRecording(r.id)));
  const notes = await listNotes(id);
  await Promise.all(notes.map((n) => deleteNote(n.id)));
  await tx(STORE.sessions, 'readwrite', (s) => s.delete(id));
}

export async function putNote(note: StoredNote) {
  await tx(STORE.notes, 'readwrite', (s) => s.put(note));
}

export async function getNote(id: string) {
  return tx<StoredNote | undefined>(STORE.notes, 'readonly', (s) => s.get(id));
}

export async function listNotes(sessionId: string): Promise<StoredNote[]> {
  const db = await openDb();
  const index = db.transaction(STORE.notes, 'readonly').objectStore(STORE.notes).index('bySession');
  const all = await wrap<StoredNote[]>(index.getAll(sessionId));
  return all.sort((a, b) => a.index - b.index);
}

export async function deleteNote(id: string) {
  await Promise.all([blobs.delete(`${id}:full`), blobs.delete(`${id}:crop`)]);
  await tx(STORE.notes, 'readwrite', (s) => s.delete(id));
}

export async function putRecording(recording: Recording) {
  await tx(STORE.recordings, 'readwrite', (s) => s.put(recording));
}

export async function getRecording(id: string) {
  return tx<Recording | undefined>(STORE.recordings, 'readonly', (s) => s.get(id));
}

export async function listRecordings(sessionId: string): Promise<Recording[]> {
  const db = await openDb();
  const index = db
    .transaction(STORE.recordings, 'readonly')
    .objectStore(STORE.recordings)
    .index('bySession');
  const all = await wrap<Recording[]>(index.getAll(sessionId));
  return all.sort((a, b) => a.index - b.index);
}

export async function deleteRecording(id: string) {
  const recording = await getRecording(id);
  if (recording) {
    const chunks = Array.from({ length: recording.chunks }, (_, i) => `${id}:chunk:${i + 1}`);
    await Promise.all([
      ...recording.meta.frames.map((f) => blobs.delete(`${id}:frame:${f.index}`)),
      ...chunks.map((key) => blobs.delete(key)),
      blobs.delete(`${id}:video`),
    ]);
  }
  await tx(STORE.recordings, 'readwrite', (s) => s.delete(id));
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return await (await fetch(dataUrl)).blob();
}
