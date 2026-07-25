import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CaptureMode, Note, Session, Settings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';
import { send } from '../lib/messages';
import { blobs } from '../lib/db';
import {
  REPORT_DIR,
  checkPermission,
  displayPath,
  forgetProjectDir,
  fsaSupported,
  loadProjectDir,
  pickProjectDir,
  requestPermission,
  writeSession,
  type DirPermission,
  type NoteImages,
} from '../lib/fs';
import { agentPrompt, buildNotesJson, buildReport } from '../lib/markdown';
import { blobBytes, makeZip, textBytes } from '../lib/zip';
import { clockTime, dateTime, shortUrl } from '../lib/format';

interface PanelState {
  sessions: Session[];
  activeSessionId: string | null;
  notes: Note[];
  settings: Settings;
}

const EMPTY: PanelState = { sessions: [], activeSessionId: null, notes: [], settings: DEFAULT_SETTINGS };

export default function App() {
  const [state, setState] = useState<PanelState>(EMPTY);
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [perm, setPerm] = useState<DirPermission>('prompt');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [showSessions, setShowSessions] = useState(false);
  const flushing = useRef(false);

  const session = useMemo(
    () => state.sessions.find((s) => s.id === state.activeSessionId) ?? null,
    [state.sessions, state.activeSessionId],
  );

  const refresh = useCallback(async () => {
    setState(await send<PanelState>({ type: 'state:get' }));
  }, []);

  useEffect(() => {
    void refresh();
    const listener = (message: { type?: string }) => {
      if (message?.type === 'state:changed') void refresh();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refresh]);

  useEffect(() => {
    setName(session?.name ?? '');
  }, [session?.id, session?.name]);

  // Ask Chrome what the shortcut actually is — it differs per OS and the user
  // may have rebound it.
  useEffect(() => {
    void chrome.commands
      .getAll()
      .then((commands) => setShortcut(commands.find((c) => c.name === 'arm-element')?.shortcut ?? ''));
  }, []);

  // ── project folder ────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const handle = await loadProjectDir();
      if (!handle) return;
      setDir(handle);
      setPerm(await checkPermission(handle));
    })();
  }, []);

  const [pickerBlocked, setPickerBlocked] = useState(false);

  const connect = async () => {
    try {
      const handle = await pickProjectDir();
      if (!handle) return;
      setDir(handle);
      setPerm(await checkPermission(handle));
      setFlash(`connected to ${handle.name}`);
    } catch (error) {
      // Some Chrome builds refuse the picker inside the side panel; the same
      // page in a tab shares this IndexedDB, so picking there works fine.
      setPickerBlocked(true);
      setFlash(`picker blocked here — ${String(error).slice(0, 40)}`);
    }
  };

  const openInTab = () => chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });

  const reconnect = async () => {
    if (!dir) return;
    setPerm(await requestPermission(dir));
  };

  const disconnect = async () => {
    await forgetProjectDir();
    setDir(null);
    setPerm('prompt');
  };

  // ── write-through to disk ─────────────────────────────────────────────
  useEffect(() => {
    if (!dir || perm !== 'granted' || !session || !state.notes.length) return;
    if (flushing.current) return;
    const pending = state.notes.filter((n) => !n.written);
    if (!pending.length) return;

    flushing.current = true;
    void (async () => {
      try {
        const images = new Map<string, NoteImages>();
        for (const note of pending) {
          images.set(note.id, {
            full: await blobs.get(`${note.id}:full`),
            crop: note.cropFile ? await blobs.get(`${note.id}:crop`) : undefined,
          });
        }
        await writeSession(dir, session, state.notes, images);
        await send({ type: 'note:written', ids: pending.map((n) => n.id) });
        await refresh();
      } catch (error) {
        setFlash(`write failed: ${String(error).slice(0, 60)}`);
        setPerm(await checkPermission(dir));
      } finally {
        flushing.current = false;
      }
    })();
  }, [dir, perm, session, state.notes, refresh]);

  // ── thumbnails ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const note of state.notes) {
        if (thumbs[note.id]) continue;
        const blob = (note.cropFile ? await blobs.get(`${note.id}:crop`) : null) ?? (await blobs.get(`${note.id}:full`));
        if (blob) next[note.id] = URL.createObjectURL(blob);
      }
      if (!cancelled && Object.keys(next).length) setThumbs((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [state.notes, thumbs]);

  const [fullShots, setFullShots] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!expanded || fullShots[expanded]) return;
    void (async () => {
      const blob = await blobs.get(`${expanded}:full`);
      if (blob) setFullShots((prev) => ({ ...prev, [expanded]: URL.createObjectURL(blob) }));
    })();
  }, [expanded, fullShots]);

  // ── actions ───────────────────────────────────────────────────────────
  const say = (text: string) => {
    setFlash(text);
    window.setTimeout(() => setFlash(null), 1700);
  };

  const arm = async (mode: CaptureMode) => {
    const result = await send<{ ok: boolean }>({ type: 'arm', mode });
    if (!result?.ok) say("can't record on this page");
  };

  const editShortcut = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });

  const switchSession = async (id: string) => {
    await send({ type: 'session:activate', id });
    setShowSessions(false);
    await refresh();
  };

  const copyPrompt = async () => {
    if (!session) return;
    await navigator.clipboard.writeText(agentPrompt(session, dir ? `${dir.name}/${REPORT_DIR}` : REPORT_DIR));
    say('prompt copied — paste into Claude Code');
  };

  const exportZip = async () => {
    if (!session) return;
    const entries = [
      { name: `${session.slug}/report.md`, data: textBytes(buildReport(session, state.notes)) },
      { name: `${session.slug}/notes.json`, data: textBytes(buildNotesJson(session, state.notes)) },
    ];
    for (const note of state.notes) {
      const full = await blobs.get(`${note.id}:full`);
      if (full) entries.push({ name: `${session.slug}/${note.fullFile}`, data: await blobBytes(full) });
      const crop = note.cropFile ? await blobs.get(`${note.id}:crop`) : undefined;
      if (crop && note.cropFile) entries.push({ name: `${session.slug}/${note.cropFile}`, data: await blobBytes(crop) });
    }
    const url = URL.createObjectURL(makeZip(entries));
    await chrome.downloads.download({ url, filename: `${session.slug}.zip`, saveAs: true });
    say('zip exported');
  };

  const renameSession = async (value: string) => {
    if (!session || value.trim() === session.name) return;
    await send({ type: 'session:rename', id: session.id, name: value.trim() || session.name });
    await refresh();
  };

  const folderReady = dir && perm === 'granted';
  const written = state.notes.filter((n) => n.written).length;

  return (
    <div className="app">
      <header className="head">
        <svg className="mark" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r="2.6" fill="#ff5c39" />
          <circle cx="8" cy="8" r="6.4" fill="none" stroke="#ff5c39" strokeWidth="2" />
        </svg>
        <span className="wordmark">Bug Recorder</span>
        <span className="spacer" />
        <span className="count">
          {state.notes.length} note{state.notes.length === 1 ? '' : 's'}
          {folderReady && state.notes.length ? ` · ${written} on disk` : ''}
        </span>
      </header>

      <div className="session">
        <div className="session-row">
          <input
            value={name}
            placeholder="Untitled session"
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => void renameSession(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <button
            className={`chev ${showSessions ? 'open' : ''}`}
            title="Switch session"
            onClick={() => setShowSessions((v) => !v)}
          >
            {state.sessions.length > 1 ? `${state.sessions.length} ▾` : '▾'}
          </button>
        </div>
        <div className="sub">{session ? `${REPORT_DIR}/${session.slug}` : 'starts on your first note'}</div>
      </div>

      {showSessions && (
        <div className="sessions">
          {!state.sessions.length && <div className="srow-empty">no sessions yet</div>}
          {state.sessions.map((s) => (
            <div
              key={s.id}
              className={`srow ${s.id === state.activeSessionId ? 'on' : ''}`}
              onClick={() => void switchSession(s.id)}
            >
              <div className="sname">{s.name}</div>
              <div className="smeta">
                {s.noteCount} note{s.noteCount === 1 ? '' : 's'} · {dateTime(s.createdAt)}
              </div>
              <button
                className="kill"
                title="Forget this session (files on disk are kept)"
                onClick={async (e) => {
                  e.stopPropagation();
                  await send({ type: 'session:delete', id: s.id });
                  await refresh();
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="folder">
        <span className={`status ${folderReady ? 'ok' : dir ? 'warn' : ''}`} />
        <span className="path">
          {!fsaSupported()
            ? 'folder writing unavailable — use Export .zip'
            : dir
              ? displayPath(dir, session)
              : 'no project folder connected'}
        </span>
        {!dir && fsaSupported() && !pickerBlocked && (
          <button className="link" onClick={connect}>
            Connect folder
          </button>
        )}
        {!dir && pickerBlocked && (
          <button className="link" onClick={openInTab}>
            Open in tab →
          </button>
        )}
        {dir && perm !== 'granted' && (
          <button className="link" onClick={reconnect}>
            Reconnect
          </button>
        )}
        {dir && (
          <button className="link" onClick={disconnect} title="Forget this folder">
            ✕
          </button>
        )}
      </div>

      <div className="controls">
        <button className="arm" onClick={() => void arm('element')}>
          Point &amp; record {shortcut && <kbd>{shortcut}</kbd>}
        </button>
        <div className="modes">
          <button className="mode" onClick={() => void arm('region')}>
            Region
          </button>
          <button className="mode" onClick={() => void arm('draw')}>
            Draw
          </button>
          <button className="mode" onClick={() => void arm('page')}>
            Page
          </button>
        </div>
        <button className="hintline" onClick={editShortcut}>
          {shortcut ? `${shortcut} works anywhere · change it` : 'no shortcut bound — set one'}
        </button>
      </div>

      <div className="notes">
        {!state.notes.length && (
          <div className="empty">
            Nothing recorded yet.
            <br />
            Hit <b>{shortcut || 'the shortcut'}</b> on the page,
            <br />
            click what's wrong, and just say it.
          </div>
        )}
        {state.notes.map((note) => (
          <div key={note.id}>
            <div className="note">
              {thumbs[note.id] && (
                <img
                  className="thumb"
                  src={thumbs[note.id]}
                  alt=""
                  onClick={() => setExpanded(expanded === note.id ? null : note.id)}
                />
              )}
              <span className="idx">{note.index}</span>
              <div className="body">
                {editing === note.id ? (
                  <textarea
                    autoFocus
                    defaultValue={note.text}
                    rows={3}
                    onBlur={async (e) => {
                      setEditing(null);
                      if (e.target.value !== note.text) {
                        await send({ type: 'note:update', id: note.id, text: e.target.value });
                        await refresh();
                      }
                    }}
                  />
                ) : (
                  <div className={`text ${note.text ? '' : 'blank'}`} onClick={() => setEditing(note.id)}>
                    {note.text || 'no comment — screenshot only'}
                  </div>
                )}
                <div className="meta">
                  {note.target && <span className="sel">{note.target.selector}</span>}
                  <span>{shortUrl(note.url)}</span>
                  <span>· {clockTime(note.createdAt)}</span>
                </div>
                {note.events.length > 0 && (
                  <div className="errs">
                    {note.events.length} console/network error{note.events.length === 1 ? '' : 's'} captured
                  </div>
                )}
              </div>
              <button
                className="kill"
                title="Delete note"
                onClick={async () => {
                  await send({ type: 'note:delete', id: note.id });
                  await refresh();
                }}
              >
                ×
              </button>
            </div>
            {expanded === note.id && fullShots[note.id] && (
              <div className="shot">
                <img src={fullShots[note.id]} alt="" onClick={() => setExpanded(null)} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="toggles">
        {(
          [
            ['autoDictate', 'auto-mic'],
            ['spotlight', 'spotlight'],
            ['chain', 'stay armed'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`toggle ${state.settings[key] ? 'on' : ''}`}
            onClick={async () => {
              await send({ type: 'settings:set', patch: { [key]: !state.settings[key] } });
              await refresh();
            }}
          >
            <i />
            {label}
          </button>
        ))}
      </div>

      <div className="foot">
        <button className="primary" disabled={!state.notes.length} onClick={copyPrompt}>
          Copy prompt for Claude Code
        </button>
        <button className="ghost" disabled={!state.notes.length} onClick={exportZip} title="Download as .zip">
          .zip
        </button>
        <button
          className="ghost"
          title="Start a new session"
          onClick={async () => {
            await send({ type: 'session:new' });
            await refresh();
            say('new session started');
          }}
        >
          +
        </button>
      </div>

      {flash && <div className="flash">{flash}</div>}
    </div>
  );
}
