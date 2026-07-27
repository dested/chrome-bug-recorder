import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CaptureMode, Note, PageEvent, PointerSample, Session, Settings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';
import { send } from '../lib/messages';
import { blobs } from '../lib/db';
import {
  checkPermission,
  displayPath,
  forgetProjectDir,
  fsaSupported,
  loadProjectDir,
  loadProjectPath,
  pickProjectDir,
  requestPermission,
  saveProjectPath,
  sessionFolder,
  writeRecordingSession,
  writeSession,
  type DirPermission,
  type NoteImages,
} from '../lib/fs';
import {
  agentPrompt,
  buildManifestTxt,
  buildNotesJson,
  buildRecordingJson,
  buildRecordingReport,
  buildReport,
  buildTranscriptTxt,
} from '../lib/markdown';
import { blobBytes, makeZip, textBytes } from '../lib/zip';
import { clockTime, dateTime, mmss, originOf, shortUrl } from '../lib/format';
import { Recorder, type RecorderUpdate } from './recorder';
import { makeGrids, type GridFrame } from './grids';
import { transcribeRecording, type TranscribeProgress } from './transcribe';

interface PanelState {
  sessions: Session[];
  activeSessionId: string | null;
  notes: Note[];
  settings: Settings;
}

const EMPTY: PanelState = { sessions: [], activeSessionId: null, notes: [], settings: DEFAULT_SETTINGS };

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export default function App() {
  const [state, setState] = useState<PanelState>(EMPTY);
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [perm, setPerm] = useState<DirPermission>('prompt');
  // What the user says the gripe folder is on disk — FSA won't tell us, and the
  // agent reading the report has to be able to find it.
  const [root, setRoot] = useState('');
  const [askRoot, setAskRoot] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [markShortcut, setMarkShortcut] = useState('');
  const [showSessions, setShowSessions] = useState(false);
  const [recUpdate, setRecUpdate] = useState<RecorderUpdate | null>(null);
  const [stopping, setStopping] = useState(false);
  const [expandedFrame, setExpandedFrame] = useState<number | null>(null);
  const [frameUrls, setFrameUrls] = useState<Record<number, string>>({});
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [whisper, setWhisper] = useState<TranscribeProgress | null>(null);
  // Session id of the pass in flight — doubles as the "only one at a time" guard.
  const whispering = useRef<string | null>(null);
  const flushing = useRef(false);
  const recorderRef = useRef<Recorder | null>(null);
  const flushingRec = useRef(false);
  // The Stop button and Chrome's own "Stop sharing" bar can both fire.
  const stopGuard = useRef(false);
  const micTabOpened = useRef(false);

  const session = useMemo(
    () => state.sessions.find((s) => s.id === state.activeSessionId) ?? null,
    [state.sessions, state.activeSessionId],
  );

  const refresh = useCallback(async () => {
    const next = await send<PanelState>({ type: 'state:get' });
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
    const listener = (message: { type?: string; origin?: string }) => {
      if (message?.type === 'state:changed') void refresh();
      const recorder = recorderRef.current;
      if (!recorder) return;
      // Telemetry and pointer both arrive from every tab; the recorder keeps only
      // what came from the one being recorded.
      if (message?.type === 'recording:event') {
        recorder.addEvent((message as { event: PageEvent }).event, message.origin);
      }
      if (message?.type === 'recording:pointer') {
        recorder.addPointer((message as { sample: PointerSample }).sample, message.origin);
      }
      if (message?.type === 'recording:mark') {
        recorder.mark();
        say('marked');
      }
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
    void chrome.commands.getAll().then((commands) => {
      setShortcut(commands.find((c) => c.name === 'arm-element')?.shortcut ?? '');
      setMarkShortcut(commands.find((c) => c.name === 'mark-frame')?.shortcut ?? '');
    });
  }, []);

  // ── the gripe folder ──────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      setRoot(await loadProjectPath());
      const handle = await loadProjectDir();
      if (!handle) return;
      setDir(handle);
      setPerm(await checkPermission(handle));
      setRoot(await loadProjectPath()); // the 0.5 reclaim may have just filled it in
    })();
  }, []);

  const [pickerBlocked, setPickerBlocked] = useState(false);

  const connect = async () => {
    try {
      const handle = await pickProjectDir();
      if (!handle) return;
      setDir(handle);
      setPerm(await checkPermission(handle));
      if (!root) setAskRoot(true); // the one moment they know the path by heart
      say(`writing into ${handle.name}`);
    } catch (error) {
      // Some Chrome builds refuse the picker inside the side panel; the same
      // page in a tab shares this IndexedDB, so picking there works fine.
      setPickerBlocked(true);
      setFlash(`picker blocked here — ${String(error).slice(0, 40)}`);
    }
  };

  const commitRoot = async (value: string) => {
    setAskRoot(false);
    const clean = await saveProjectPath(value);
    if (clean === root) return;
    setRoot(clean);
    // The report opens with this path, so what's on disk is now stale.
    if (clean && session) {
      await send({ type: 'session:rewrite', id: session.id });
      await refresh();
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
    setRoot('');
    setPerm('prompt');
  };

  // ── write-through to disk ─────────────────────────────────────────────
  /** Writes one session's folder. Silent when nothing is connected — the notes stay pending. */
  const flushNotes = useCallback(
    async (target: Session, notes: Note[]) => {
      if (!dir || perm !== 'granted') return;
      const pending = notes.filter((n) => !n.written);
      if (!pending.length) return;
      try {
        const images = new Map<string, NoteImages>();
        for (const note of pending) {
          images.set(note.id, {
            full: await blobs.get(`${note.id}:full`),
            crop: note.cropFile ? await blobs.get(`${note.id}:crop`) : undefined,
          });
        }
        await writeSession(dir, target, notes, images, sessionFolder(target, root, dir));
        await send({ type: 'note:written', ids: pending.map((n) => n.id) });
        await refresh();
      } catch (error) {
        setFlash(`write failed: ${String(error).slice(0, 60)}`);
        // A revoked handle is the usual cause — but not the only one, so ask.
        setPerm(await checkPermission(dir));
      }
    },
    [dir, perm, root, refresh],
  );

  const flushRecording = useCallback(
    async (target: Session) => {
      const rec = target.recording;
      if (!rec || !dir || perm !== 'granted') return;
      try {
        const frames = new Map<number, Blob>();
        for (const f of rec.frames) {
          const blob = await blobs.get(`${target.id}:frame:${f.index}`);
          if (blob) frames.set(f.index, blob);
        }
        const video = await blobs.get(`${target.id}:video`);
        const gridFrames = rec.frames
          .map((f) => ({ blob: frames.get(f.index), label: f.file.split('/').pop()! }))
          .filter((g): g is GridFrame => Boolean(g.blob));
        await writeRecordingSession(
          dir,
          target,
          frames,
          video,
          await makeGrids(gridFrames),
          sessionFolder(target, root, dir),
        );
        await send({ type: 'recording:written', id: target.id, rev: rec.rev ?? 0 });
        await refresh();
      } catch (error) {
        setFlash(`write failed: ${String(error).slice(0, 60)}`);
        setPerm(await checkPermission(dir));
      }
    },
    [dir, perm, root, refresh],
  );

  useEffect(() => {
    if (!session || flushing.current) return;
    if (!state.notes.some((n) => !n.written)) return;
    flushing.current = true;
    void flushNotes(session, state.notes).finally(() => {
      flushing.current = false;
    });
  }, [session, state.notes, flushNotes]);

  useEffect(() => {
    if (!session?.recording || session.recording.written || flushingRec.current) return;
    flushingRec.current = true;
    void flushRecording(session).finally(() => {
      flushingRec.current = false;
    });
  }, [session, flushRecording]);

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

  // ── recording frames ──────────────────────────────────────────────────
  useEffect(() => {
    setFrameUrls({});
    setExpandedFrame(null);
  }, [session?.id]);

  useEffect(() => {
    if (session?.kind !== 'recording' || !session.recording) return;
    let cancelled = false;
    void (async () => {
      const next: Record<number, string> = {};
      for (const f of session.recording!.frames) {
        if (frameUrls[f.index]) continue;
        const blob = await blobs.get(`${session.id}:frame:${f.index}`);
        if (blob) next[f.index] = URL.createObjectURL(blob);
      }
      if (!cancelled && Object.keys(next).length) setFrameUrls((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [session, frameUrls]);

  // ── actions ───────────────────────────────────────────────────────────
  const say = (text: string) => {
    setFlash(text);
    window.setTimeout(() => setFlash(null), 1700);
  };

  const arm = async (mode: CaptureMode) => {
    const result = await send<{ ok: boolean }>({ type: 'arm', mode });
    if (!result?.ok) say("can't record on this page");
  };

  /**
   * Runs after the session is already saved, never before: on success it swaps in
   * the Whisper lines and flips `written` back to false so the folder is rewritten.
   * Fail or close the panel and the Web Speech lines stand.
   */
  const runWhisper = async (id: string) => {
    if (whispering.current) return;
    whispering.current = id;
    try {
      const video = await blobs.get(`${id}:video`);
      if (!video) return;
      const segments = await transcribeRecording(video, setWhisper);
      if (segments?.length) {
        await send({ type: 'recording:transcript', id, transcript: segments });
        const next = await refresh();
        // This lands minutes later — the gripe may already be closed, and the
        // flush effect only ever looks at the active session. Write it by id.
        const target = next.sessions.find((s) => s.id === id);
        if (target?.recording && !target.recording.written && !flushingRec.current) {
          flushingRec.current = true;
          try {
            await flushRecording(target);
          } finally {
            flushingRec.current = false;
          }
        }
      }
    } finally {
      whispering.current = null;
      setWhisper(null);
    }
  };

  const stopRecording = async () => {
    const r = recorderRef.current;
    if (!r || stopGuard.current) return;
    stopGuard.current = true;
    setStopping(true);
    try {
      await send({ type: 'recording:setActive', active: false });
      const meta = await r.stop();
      await send({ type: 'recording:add', id: r.sessionId, name: 'Walkthrough', origin: r.scope, meta });
      say('walkthrough saved');
      await refresh();
      void runWhisper(r.sessionId).catch(() => {});
    } finally {
      recorderRef.current = null;
      setRecUpdate(null);
      setStopping(false);
      stopGuard.current = false;
    }
  };

  /**
   * The side panel can't render the getUserMedia prompt — it rejects without
   * ever asking. First Record press without a granted mic opens micperm.html
   * in a tab (prompts work there); a second press records anyway, silent.
   */
  const ensureMic = async (): Promise<boolean> => {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (status.state === 'granted') return true;
    } catch {
      return true; // no Permissions API — let getUserMedia decide
    }
    if (!micTabOpened.current) {
      micTabOpened.current = true;
      await chrome.tabs.create({ url: chrome.runtime.getURL('micperm.html') });
      say('grant the mic in the new tab, then hit Record');
      return false;
    }
    return true;
  };

  const startRecording = async () => {
    if (recorderRef.current) return;
    if (!(await ensureMic())) return;
    // The tab in front now is the app being walked through; everything else that
    // logs an error for the next five minutes is somebody else's noise.
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    const scope = originOf(tab?.url ?? '');
    const r = new Recorder(
      { onUpdate: setRecUpdate, onEnd: () => void stopRecording() },
      state.settings.lang,
      scope.startsWith('http') ? scope : '',
    );
    try {
      await r.start();
    } catch {
      say('screen share refused');
      return;
    }
    recorderRef.current = r;
    await send({ type: 'recording:setActive', active: true });
  };

  const editShortcut = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });

  /**
   * Clicking a button in here leaves keyboard focus in the side panel, and Chrome
   * gives us no way to hand it back to the page. So the panel listens for the
   * same keys and relays them — whichever side has focus, E/R/D/P work.
   */
  useEffect(() => {
    const MODE_KEYS: Record<string, CaptureMode> = { e: 'element', r: 'region', d: 'draw', p: 'page' };
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') {
        void send({ type: 'disarm' });
        return;
      }
      // While a walkthrough runs the panel is a recorder, not an armer.
      if (recorderRef.current) {
        if (event.key.toLowerCase() !== 'm') return;
        event.preventDefault();
        recorderRef.current.mark();
        say('marked');
        return;
      }
      const mode = MODE_KEYS[event.key.toLowerCase()];
      if (!mode) return;
      event.preventDefault();
      void send<{ ok: boolean }>({ type: 'arm', mode });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const switchSession = async (id: string) => {
    await send({ type: 'session:activate', id });
    setShowSessions(false);
    await refresh();
  };

  const copyPrompt = async () => {
    if (!session) return;
    await navigator.clipboard.writeText(agentPrompt(session, sessionFolder(session, root, dir)));
    say(root ? 'prompt copied — paste into Claude Code' : 'prompt copied — set the folder path for a clean handoff');
  };

  /**
   * Closing a gripe: get every byte on disk, hand over the prompt, then let go of
   * the session. The next capture opens a fresh one in whatever project is
   * connected then — usually a different repo, which is the whole point.
   *
   * The clipboard write goes first: it needs the click's user activation, and the
   * flush below can burn through it.
   */
  const finish = async () => {
    if (!session) return;
    const target = session;
    await navigator.clipboard
      .writeText(agentPrompt(target, sessionFolder(target, root, dir)))
      .catch(() => {});
    // After the close there is no active session, and the flush effects only ever
    // run for the active one — so anything still pending has to land right here.
    for (let i = 0; i < 60 && (flushing.current || flushingRec.current); i++) await wait(50);
    flushing.current = true;
    flushingRec.current = true;
    try {
      await flushNotes(target, state.notes);
      if (target.recording && !target.recording.written) await flushRecording(target);
    } finally {
      flushing.current = false;
      flushingRec.current = false;
    }
    await send({ type: 'session:close', id: target.id });
    await refresh();
    say(dir && perm === 'granted' ? 'gripe closed — prompt copied' : 'gripe closed — nothing written to disk');
  };

  const exportZip = async () => {
    if (!session) return;
    if (session.kind === 'recording' && session.recording) {
      const rec = session.recording;
      const files = [
        { name: `${session.slug}/report.md`, data: textBytes(buildRecordingReport(session, rec)) },
        { name: `${session.slug}/transcript.txt`, data: textBytes(buildTranscriptTxt(rec)) },
        { name: `${session.slug}/recording.json`, data: textBytes(buildRecordingJson(session, rec)) },
        { name: `${session.slug}/MANIFEST.txt`, data: textBytes(buildManifestTxt(session, rec)) },
      ];
      const gridFrames: GridFrame[] = [];
      for (const f of rec.frames) {
        const blob = await blobs.get(`${session.id}:frame:${f.index}`);
        if (!blob) continue;
        files.push({ name: `${session.slug}/${f.file}`, data: await blobBytes(blob) });
        gridFrames.push({ blob, label: f.file.split('/').pop()! });
      }
      const sheets = await makeGrids(gridFrames);
      for (const [i, sheet] of sheets.entries()) {
        files.push({
          name: `${session.slug}/grids/grid_${String(i + 1).padStart(2, '0')}.jpg`,
          data: await blobBytes(sheet),
        });
      }
      const video = await blobs.get(`${session.id}:video`);
      if (video) files.push({ name: `${session.slug}/${rec.videoFile}`, data: await blobBytes(video) });
      const zipUrl = URL.createObjectURL(makeZip(files));
      await chrome.downloads.download({ url: zipUrl, filename: `${session.slug}.zip`, saveAs: true });
      say('zip exported');
      return;
    }
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
  const rec = session?.kind === 'recording' ? (session.recording ?? null) : null;
  const hasContent = state.notes.length > 0 || Boolean(session?.recording);

  return (
    <div className="app">
      <header className="head">
        <svg className="mark" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r="2.6" fill="#ff5c39" />
          <circle cx="8" cy="8" r="6.4" fill="none" stroke="#ff5c39" strokeWidth="2" />
        </svg>
        <span className="wordmark">Gripe</span>
        <span className="spacer" />
        <span className="count">
          {rec ? (
            <>
              {rec.frames.length} keyframe{rec.frames.length === 1 ? '' : 's'}
              {rec.written && folderReady ? ' · on disk' : ''}
            </>
          ) : (
            <>
              {state.notes.length} note{state.notes.length === 1 ? '' : 's'}
              {folderReady && state.notes.length ? ` · ${written} on disk` : ''}
            </>
          )}
        </span>
      </header>

      <div className="session">
        <div className="session-row">
          <input
            value={name}
            placeholder="Untitled gripe"
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
        <div className="folder">
          <span className={`status ${folderReady ? 'ok' : dir ? 'warn' : ''}`} />
          <span className="path">
            {!fsaSupported()
              ? 'folder writing unavailable — use .zip'
              : dir
                ? displayPath(dir, session, root)
                : 'no folder yet — nothing lands on disk'}
          </span>
          {dir && (
            <button
              className="link"
              onClick={() => setAskRoot((v) => !v)}
              title="The absolute path to the folder — your agent needs it to find the report"
            >
              {root ? 'path' : 'path?'}
            </button>
          )}
          {dir && perm !== 'granted' && (
            <button className="link" onClick={reconnect}>
              Reconnect
            </button>
          )}
          {dir && (
            <button className="link" onClick={disconnect} title="Forget this folder — files on disk are kept">
              ✕
            </button>
          )}
          {!dir && fsaSupported() && (
            <button className="link hot" onClick={pickerBlocked ? openInTab : connect}>
              {pickerBlocked ? 'Open in tab →' : 'Choose folder'}
            </button>
          )}
        </div>
      </div>

      {askRoot && dir && (
        <div className="rootpath">
          <input
            autoFocus
            defaultValue={root}
            spellCheck={false}
            placeholder={`absolute path to ${dir.name}`}
            onBlur={(e) => void commitRoot(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <div className="why">
            Chrome won't tell an extension where your folder is. Paste it once and every report
            opens with a path your agent can use.
          </div>
        </div>
      )}

      {showSessions && (
        <div className="sessions">
          {!state.sessions.length && <div className="srow-empty">no gripes yet</div>}
          {state.sessions.map((s) => (
            <div
              key={s.id}
              className={`srow ${s.id === state.activeSessionId ? 'on' : ''} ${s.closed ? 'closed' : ''}`}
              onClick={() => void switchSession(s.id)}
            >
              <div className="sname">
                {s.name}
                {s.closed && <span className="stag">closed</span>}
              </div>
              <div className="smeta">
                {s.kind === 'recording'
                  ? `${s.recording?.frames.length ?? 0} frames`
                  : `${s.noteCount} note${s.noteCount === 1 ? '' : 's'}`}{' '}
                · {dateTime(s.createdAt)}
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

      {recUpdate ? (
        <div className="controls">
          <div className="rec">
            <span className="rec-dot" />
            <span className="rec-time">{mmss(recUpdate.elapsedMs)}</span>
            <span className="rec-meta">
              {recUpdate.frameCount} frames · {recUpdate.segmentCount} lines
              {recUpdate.markCount ? ` · ${recUpdate.markCount} marked` : ''}
            </span>
            <button className="rec-stop" onClick={() => void stopRecording()} disabled={stopping}>
              {stopping ? 'saving…' : 'Stop'}
            </button>
          </div>
          {recUpdate.micState === 'denied' ? (
            <button
              className="rec-interim warn"
              title="Open the permission page in a tab"
              onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('micperm.html') })}
            >
              microphone blocked — no narration this time · fix it
            </button>
          ) : (
            <div className="rec-interim">
              {recUpdate.interim || (recUpdate.micState === 'listening' ? 'listening…' : '')}
            </div>
          )}
          <div className="rec-hint">
            <kbd>{markShortcut || 'Alt+Shift+M'}</kbd> marks the frame you're talking about
          </div>
        </div>
      ) : (
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
            <button className="mode" onClick={() => void startRecording()}>
              Record
            </button>
          </div>
          <button className="hintline" onClick={editShortcut}>
            {shortcut ? `${shortcut} works anywhere · change it` : 'no shortcut bound — set one'}
          </button>
        </div>
      )}

      {rec ? (
        <div className="notes">
          <div className="rec-sum">
            {mmss(rec.durationMs)} · {rec.frames.length} keyframes · {rec.transcript.length} spoken lines
            {rec.events.length ? ` · ${rec.events.length} errors` : ''}
          </div>
          {whisper && whispering.current === session!.id && (
            <div className="rec-whisper">
              {whisper.stage === 'decode'
                ? 'reading audio…'
                : whisper.stage === 'transcribe'
                  ? 'transcribing narration…'
                  : whisper.stage === 'model'
                    ? 'loading model…'
                    : `fetching whisper model — ${Math.round(whisper.pct)}%`}
            </div>
          )}
          <div className="rec-frames">
            {rec.frames.map((f) => (
              <div
                key={f.index}
                className="rframe"
                onClick={() => setExpandedFrame(expandedFrame === f.index ? null : f.index)}
              >
                {frameUrls[f.index] && <img src={frameUrls[f.index]} alt="" />}
                <span className={`rtime ${f.reason === 'mark' ? 'marked' : ''}`}>
                  {f.reason === 'mark' ? '★ ' : ''}
                  {mmss(f.t)}
                </span>
                <button
                  className="kill"
                  title="Delete frame (file on disk is kept)"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (expandedFrame === f.index) setExpandedFrame(null);
                    await send({ type: 'recording:frame:delete', id: session!.id, index: f.index });
                    await refresh();
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {expandedFrame !== null && frameUrls[expandedFrame] && (
            <div className="shot">
              <img src={frameUrls[expandedFrame]} alt="" onClick={() => setExpandedFrame(null)} />
            </div>
          )}
          {rec.transcript.length > 0 && !rec.reviewed && !whispering.current && (
            <div className="rec-check">
              <span>
                <b>Read this back before you hand it off.</b> Speech recognition eats the words that
                matter — a number or a noun it guesses wrong sends your agent to the wrong file.
                Click any line to fix it.
              </span>
              <button
                onClick={async () => {
                  await send({ type: 'recording:reviewed', id: session!.id });
                  await refresh();
                  say('transcript confirmed');
                }}
              >
                looks right
              </button>
            </div>
          )}
          {rec.transcript.length > 0 && (
            <div className="rec-script">
              {rec.transcript.map((s, i) => (
                <div className="line" key={i}>
                  <span className="at">{mmss(s.t)}</span>
                  {editingLine === i ? (
                    <input
                      autoFocus
                      defaultValue={s.text}
                      onBlur={async (e) => {
                        setEditingLine(null);
                        if (e.target.value !== s.text) {
                          await send({
                            type: 'recording:line:update',
                            id: session!.id,
                            index: i,
                            text: e.target.value,
                          });
                          await refresh();
                        }
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  ) : (
                    <span className="txt" onClick={() => setEditingLine(i)}>
                      {s.text}
                    </span>
                  )}
                  <button
                    className="kill"
                    title="Delete line"
                    onClick={async () => {
                      await send({ type: 'recording:line:delete', id: session!.id, index: i });
                      await refresh();
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
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
      )}

      <div className="toggles">
        {(
          [
            ['autoDictate', 'auto-mic'],
            ['autoSend', 'auto-send'],
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
        <button className="primary" disabled={!hasContent} onClick={copyPrompt}>
          Copy prompt for Claude Code
        </button>
        <button className="ghost" disabled={!hasContent} onClick={exportZip} title="Download as .zip">
          .zip
        </button>
        <button
          className="ghost"
          disabled={!hasContent}
          title="Write it out, copy the prompt, and close this gripe — the next one starts fresh"
          onClick={() => void finish()}
        >
          done
        </button>
      </div>

      {flash && <div className="flash">{flash}</div>}
    </div>
  );
}
