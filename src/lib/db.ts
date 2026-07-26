import type { Note, Session } from './types';

/**
 * The single source of truth, shared by the service worker and the side panel.
 * Images live here as Blobs (not data URLs) so a long session doesn't balloon
 * memory, and the directory handle lives here too — handles survive structured
 * clone, which is the only reason "remember my project folder" works at all.
 */

// Renaming this would orphan every session already recorded — it stays.
const DB_NAME = 'bug-recorder';
const DB_VERSION = 1;

export const STORE = {
  sessions: 'sessions',
  notes: 'notes',
  blobs: 'blobs',
  kv: 'kv',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE.sessions)) {
        db.createObjectStore(STORE.sessions, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE.notes)) {
        const notes = db.createObjectStore(STORE.notes, { keyPath: 'id' });
        notes.createIndex('bySession', 'sessionId');
      }
      if (!db.objectStoreNames.contains(STORE.blobs)) {
        db.createObjectStore(STORE.blobs);
      }
      if (!db.objectStoreNames.contains(STORE.kv)) {
        db.createObjectStore(STORE.kv);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
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
  const session = await getSession(id);
  if (session?.recording) {
    await Promise.all([
      ...session.recording.frames.map((f) => blobs.delete(`${id}:frame:${f.index}`)),
      blobs.delete(`${id}:video`),
    ]);
  }
  const notes = await listNotes(id);
  await Promise.all(notes.map((n) => deleteNote(n.id)));
  await tx(STORE.sessions, 'readwrite', (s) => s.delete(id));
}

export async function putNote(note: Note) {
  await tx(STORE.notes, 'readwrite', (s) => s.put(note));
}

export async function getNote(id: string) {
  return tx<Note | undefined>(STORE.notes, 'readonly', (s) => s.get(id));
}

export async function listNotes(sessionId: string): Promise<Note[]> {
  const db = await openDb();
  const index = db.transaction(STORE.notes, 'readonly').objectStore(STORE.notes).index('bySession');
  const all = await wrap<Note[]>(index.getAll(sessionId));
  return all.sort((a, b) => a.index - b.index);
}

export async function deleteNote(id: string) {
  await Promise.all([blobs.delete(`${id}:full`), blobs.delete(`${id}:crop`)]);
  await tx(STORE.notes, 'readwrite', (s) => s.delete(id));
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return await (await fetch(dataUrl)).blob();
}
