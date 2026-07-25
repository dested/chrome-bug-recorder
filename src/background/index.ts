import type { ContentCommand, Request } from '../lib/messages';
import type { CaptureMode, Note, NoteDraft, Session, Settings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';
import {
  blobs,
  dataUrlToBlob,
  deleteNote,
  deleteSession,
  getNote,
  getSession,
  kv,
  listNotes,
  listSessions,
  putNote,
  putSession,
} from '../lib/db';
import { noteFileBase, originOf, slugify, stamp } from '../lib/format';

/**
 * The service worker is the only component that's always alive when it needs to
 * be, so it owns: hotkeys, tab capture (the API is background-only), and the
 * write path into IndexedDB. The side panel is a view over that state — notes
 * recorded while it's closed are still captured and flushed to disk later.
 */

const ACTIVE_SESSION = 'activeSessionId';
const SETTINGS = 'settings';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await kv.get<Partial<Settings>>(SETTINGS)) ?? {}) };
}

async function broadcast() {
  chrome.runtime.sendMessage({ type: 'state:changed' }).catch(() => {
    /* no side panel listening — fine */
  });
}

async function updateBadge() {
  const session = await activeSession();
  const count = session?.noteCount ?? 0;
  await chrome.action.setBadgeText({ text: count ? String(count) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#ff5c39' });
}

async function activeSession(): Promise<Session | undefined> {
  const id = await kv.get<string>(ACTIVE_SESSION);
  return id ? getSession(id) : undefined;
}

async function createSession(name: string, origin: string): Promise<Session> {
  const now = Date.now();
  const label = name.trim() || 'Session';
  const existing = await listSessions();
  const taken = new Set(existing.map((s) => s.slug));
  let slug = `${stamp(now)}-${slugify(label)}`;
  let n = 2;
  while (taken.has(slug)) slug = `${stamp(now)}-${slugify(label)}-${n++}`;

  const session: Session = {
    id: crypto.randomUUID(),
    name: label,
    slug,
    createdAt: now,
    updatedAt: now,
    origin,
    noteCount: 0,
  };
  await putSession(session);
  await kv.set(ACTIVE_SESSION, session.id);
  return session;
}

async function ensureSession(draft: NoteDraft): Promise<Session> {
  const current = await activeSession();
  if (current) return current;
  const name = draft.title?.trim() || originOf(draft.url);
  return createSession(name, originOf(draft.url));
}

async function addNote(draft: NoteDraft): Promise<Note> {
  const session = await ensureSession(draft);
  const index = session.noteCount + 1;
  const base = noteFileBase(index);
  const id = crypto.randomUUID();

  const note: Note = {
    id,
    sessionId: session.id,
    index,
    createdAt: Date.now(),
    text: draft.text.trim(),
    mode: draft.mode,
    url: draft.url,
    title: draft.title,
    viewport: draft.viewport,
    target: draft.target,
    region: draft.region,
    strokes: draft.strokes,
    events: draft.events,
    fullFile: `${base}-full.png`,
    cropFile: draft.cropImage ? `${base}-target.png` : undefined,
    written: false,
  };

  await blobs.set(`${id}:full`, await dataUrlToBlob(draft.fullImage));
  if (draft.cropImage) await blobs.set(`${id}:crop`, await dataUrlToBlob(draft.cropImage));
  await putNote(note);
  await putSession({ ...session, noteCount: index, updatedAt: note.createdAt });
  await updateBadge();
  await broadcast();
  return note;
}

async function tellTab(tabId: number, command: ContentCommand): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, command);
    return true;
  } catch {
    return false;
  }
}

/** Content scripts don't exist in tabs that were already open at install time. */
async function ensureContentScript(tabId: number): Promise<boolean> {
  if (await tellTab(tabId, { type: 'ping' })) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch {
    return false;
  }
}

async function arm(mode: CaptureMode, tabId?: number) {
  const id =
    tabId ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id ?? undefined;
  if (id === undefined) return false;
  if (!(await ensureContentScript(id))) return false;
  const settings = await getSettings();
  return tellTab(id, { type: 'arm', mode, settings });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'arm-element') void arm('element');
  if (command === 'arm-page') void arm('page');
});

chrome.runtime.onMessage.addListener((message: Request, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'capture:visible': {
        const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
        return { dataUrl };
      }
      case 'note:add': {
        const note = await addNote(message.draft);
        return { ok: true, noteId: note.id, index: note.index, file: note.fullFile };
      }
      case 'settings:get':
        return getSettings();
      case 'settings:set': {
        const next = { ...(await getSettings()), ...message.patch };
        await kv.set(SETTINGS, next);
        await broadcast();
        return next;
      }
      case 'session:new': {
        const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
        const session = await createSession(
          message.name ?? tab?.title ?? 'Session',
          originOf(tab?.url ?? ''),
        );
        await updateBadge();
        await broadcast();
        return session;
      }
      case 'session:rename': {
        const session = await getSession(message.id);
        if (session) await putSession({ ...session, name: message.name });
        await broadcast();
        return { ok: true };
      }
      case 'session:activate': {
        await kv.set(ACTIVE_SESSION, message.id);
        await updateBadge();
        await broadcast();
        return { ok: true };
      }
      case 'session:delete': {
        await deleteSession(message.id);
        const remaining = await listSessions();
        await kv.set(ACTIVE_SESSION, remaining[0]?.id ?? null);
        await updateBadge();
        await broadcast();
        return { ok: true };
      }
      case 'note:update': {
        const note = await getNote(message.id);
        if (note) await putNote({ ...note, text: message.text, written: false });
        await broadcast();
        return { ok: true };
      }
      case 'note:delete': {
        await deleteNote(message.id);
        await broadcast();
        return { ok: true };
      }
      case 'note:written': {
        for (const id of message.ids) {
          const note = await getNote(id);
          if (note) await putNote({ ...note, written: true });
        }
        return { ok: true };
      }
      case 'state:get': {
        const sessions = await listSessions();
        const current = await activeSession();
        return {
          sessions,
          activeSessionId: current?.id ?? null,
          notes: current ? await listNotes(current.id) : [],
          settings: await getSettings(),
        };
      }
      case 'arm':
        return { ok: await arm(message.mode, message.tabId) };
      default:
        return { ok: false };
    }
  })().then(sendResponse, (error) => sendResponse({ error: String(error) }));
  return true;
});
