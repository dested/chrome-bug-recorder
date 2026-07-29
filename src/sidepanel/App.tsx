import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PageEvent, PointerSample, Recording, Session, Settings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';
import { send } from '../lib/messages';
import { blobs, getRecording, getSession, kv, listRecordings } from '../lib/db';
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
  writeRecording,
  type DirPermission,
} from '../lib/fs';
import {
  agentPrompt,
  buildManifestTxt,
  buildRecordingJson,
  buildReport,
  buildTranscriptTxt,
} from '../lib/markdown';
import { blobBytes, makeZip, textBytes } from '../lib/zip';
import { dateTime, mmss, originOf, recDirName } from '../lib/format';
import { partSpans, totalMs } from '../lib/timeline';
import { Recorder, type RecorderUpdate } from './recorder';
import { makeGrids, type GridFrame } from './grids';
import { transcribeRecording, type TranscribeProgress } from './transcribe';
import Timeline from './Timeline';

interface PanelState {
  sessions: Session[];
  activeSessionId: string | null;
  /** The active gripe's parts, oldest first. They all land in one folder. */
  recordings: Recording[];
  settings: Settings;
}

const EMPTY: PanelState = {
  sessions: [],
  activeSessionId: null,
  recordings: [],
  settings: DEFAULT_SETTINGS,
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** The popped-out window is this same page; it just doesn't offer to pop itself out again. */
const popped = new URLSearchParams(location.search).has('pop');

export default function App() {
  const [state, setState] = useState<PanelState>(EMPTY);
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [perm, setPerm] = useState<DirPermission>('prompt');
  // What the user says the gripe folder is on disk — FSA won't tell us, and the
  // agent reading the report has to be able to find it.
  const [root, setRoot] = useState('');
  const [askRoot, setAskRoot] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [showSessions, setShowSessions] = useState(false);
  /** The one collapsed row at the bottom. Nothing in here is needed to use the product. */
  const [showSettings, setShowSettings] = useState(false);
  /** Whether the recorded tab can host the on-page toolbar — chrome:// pages can't. */
  const [pageToolbar, setPageToolbar] = useState(false);
  const [recUpdate, setRecUpdate] = useState<RecorderUpdate | null>(null);
  const [stopping, setStopping] = useState(false);
  // Frames belong to a part now, so every frame key is `<recordingId>:<index>`.
  const [frameUrls, setFrameUrls] = useState<Record<string, string>>({});
  const [whisper, setWhisper] = useState<TranscribeProgress | null>(null);
  // The queue, mirrored into state so each part can say `queued` / `transcribing…`.
  // The old single-slot guard silently dropped the second part of a back-to-back pair.
  const [whisperIds, setWhisperIds] = useState<string[]>([]);
  const whisperQueue = useRef<string[]>([]);
  const whisperRunning = useRef(false);
  const recorderRef = useRef<Recorder | null>(null);
  const flushingRec = useRef(false);
  const recovering = useRef<Set<string>>(new Set());
  // The Stop button and Chrome's own "Stop sharing" bar can both fire.
  const stopGuard = useRef(false);
  // The runtime listener is installed once, but the stop path closes over dir/perm/root
  // (the late Whisper flush needs them). Keep the latest one behind a ref.
  const stopRef = useRef<() => void>(() => {});
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

  const say = useCallback((text: string) => {
    setFlash(text);
    window.setTimeout(() => setFlash(null), 1700);
  }, []);

  useEffect(() => {
    void refresh();
    const listener = (message: { type?: string; origin?: string }) => {
      if (message?.type === 'state:changed') void refresh();
      // The stop button on the page toolbar. The panel owns the recorder, so it acts.
      if (message?.type === 'recording:stop') stopRef.current();
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
      // A click or a route change in the recorded tab — dedup gets overruled.
      if (message?.type === 'recording:force') {
        recorder.force((message as { why: 'click' | 'nav' }).why, message.origin);
      }
      if (message?.type === 'recording:mark') {
        recorder.mark();
        say('marked');
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refresh, say]);

  useEffect(() => {
    setName(session?.name ?? '');
  }, [session?.id, session?.name]);

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

  /**
   * The editor pops out as a strip along the bottom of the browser window the
   * user is looking at — a timeline is a wide object, and chrome refuses to dock
   * the side panel anywhere but the side. The worker re-pins it on every parent
   * move/resize (strip:track), so it behaves like DevTools docked to the bottom.
   */
  const STRIP_H = 400;
  const popOut = async () => {
    // One strip. A second ⧉ press brings the existing one forward.
    const dock = await kv.get<{ stripId: number }>('stripDock');
    if (dock) {
      const existing = await chrome.windows.get(dock.stripId).catch(() => null);
      if (existing) {
        await chrome.windows.update(dock.stripId, { focused: true });
        return;
      }
    }
    const win = await chrome.windows.getCurrent().catch(() => null);
    const bounds =
      win?.left !== undefined && win.width !== undefined && win.top !== undefined && win.height !== undefined
        ? {
            left: win.left,
            top: win.top + win.height - STRIP_H,
            width: win.width,
            height: STRIP_H,
          }
        : { width: 1400, height: STRIP_H };
    const strip = await chrome.windows.create({
      url: chrome.runtime.getURL('sidepanel.html?pop=1'),
      type: 'popup',
      ...bounds,
    });
    if (strip?.id !== undefined && win?.id !== undefined) {
      await send({ type: 'strip:track', stripId: strip.id, parentId: win.id });
    }
  };

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
  /**
   * Writes one part's rec-NN tree, plus the gripe-wide report and manifest around
   * it. Silent when nothing is connected — the part stays pending.
   */
  const flushRecording = useCallback(
    async (target: Session, recording: Recording) => {
      if (!dir || perm !== 'granted') return;
      const meta = recording.meta;
      try {
        const frames = new Map<number, Blob>();
        for (const f of meta.frames) {
          const blob = await blobs.get(`${recording.id}:frame:${f.index}`);
          if (blob) frames.set(f.index, blob);
        }
        const video = await blobs.get(`${recording.id}:video`);
        const gridFrames = meta.frames
          .map((f) => ({ blob: frames.get(f.index), label: f.file.split('/').pop()! }))
          .filter((g): g is GridFrame => Boolean(g.blob));
        // Siblings, read fresh: this runs from paths that outlive a render.
        const recordings = await listRecordings(target.id);
        await writeRecording(
          dir,
          target,
          recording,
          frames,
          video,
          await makeGrids(gridFrames),
          recordings,
          sessionFolder(target, root, dir),
        );
        await send({ type: 'recording:written', id: recording.id, rev: meta.rev ?? 0 });
        await refresh();
      } catch (error) {
        setFlash(`write failed: ${String(error).slice(0, 60)}`);
        setPerm(await checkPermission(dir));
      }
    },
    [dir, perm, root, refresh],
  );

  /**
   * The same write, reached by id alone. The flush effects only ever see the
   * active gripe, and a Whisper pass can land minutes after that gripe closed —
   * so this pulls the part and its session straight out of IndexedDB.
   */
  const flushRecordingById = useCallback(
    async (id: string) => {
      const recording = await getRecording(id);
      if (!recording || recording.state !== 'done' || recording.meta.written) return;
      const target = await getSession(recording.sessionId);
      if (!target) return;
      for (let i = 0; i < 60 && flushingRec.current; i++) await wait(50);
      flushingRec.current = true;
      try {
        await flushRecording(target, recording);
      } finally {
        flushingRec.current = false;
      }
    },
    [flushRecording],
  );

  useEffect(() => {
    if (!session || flushingRec.current) return;
    // A part still recording has nothing final to write.
    const pending = state.recordings.filter((r) => r.state === 'done' && !r.meta.written);
    if (!pending.length) return;
    flushingRec.current = true;
    // One at a time: they all rewrite the same report.md and MANIFEST.txt.
    void (async () => {
      for (const rec of pending) await flushRecording(session, rec);
    })().finally(() => {
      flushingRec.current = false;
    });
  }, [session, state.recordings, flushRecording]);

  // ── transcription queue ───────────────────────────────────────────────
  /**
   * Runs after the part is already saved, never before: on success it swaps in
   * the Whisper lines and flips `written` back to false so the folder is
   * rewritten. Fail or close the panel and the Web Speech lines stand.
   */
  const runWhisper = useCallback(
    async (id: string) => {
      const video = await blobs.get(`${id}:video`);
      if (!video) return;
      const segments = await transcribeRecording(video, setWhisper);
      if (!segments?.length) return;
      await send({ type: 'recording:transcript', id, transcript: segments });
      await refresh();
      await flushRecordingById(id);
    },
    [refresh, flushRecordingById],
  );

  const enqueueWhisper = useCallback(
    (id: string) => {
      if (whisperQueue.current.includes(id)) return;
      whisperQueue.current.push(id);
      setWhisperIds([...whisperQueue.current]);
      if (whisperRunning.current) return;
      whisperRunning.current = true;
      void (async () => {
        try {
          // One model in memory at a time — parts wait their turn, none are dropped.
          while (whisperQueue.current.length) {
            await runWhisper(whisperQueue.current[0]).catch(() => {});
            whisperQueue.current.shift();
            setWhisperIds([...whisperQueue.current]);
            setWhisper(null);
          }
        } finally {
          whisperRunning.current = false;
        }
      })();
    },
    [runWhisper],
  );

  // A part still marked `recording` belongs to a panel that died mid-ramble —
  // unless it's the one recording right now. Reassemble it from its chunk blobs.
  useEffect(() => {
    const live = recorderRef.current?.id;
    const orphan = state.recordings.find(
      (r) => r.state === 'recording' && r.id !== live && !recovering.current.has(r.id),
    );
    if (!orphan) return;
    recovering.current.add(orphan.id);
    void (async () => {
      await send({ type: 'recording:recover', id: orphan.id });
      await refresh();
      enqueueWhisper(orphan.id);
      say('recovered an interrupted recording');
    })();
  }, [state.recordings, refresh, enqueueWhisper, say]);

  // ── recording frames ──────────────────────────────────────────────────
  useEffect(() => {
    setFrameUrls({});
  }, [session?.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const rec of state.recordings) {
        for (const f of rec.meta.frames) {
          const key = `${rec.id}:${f.index}`;
          if (frameUrls[key]) continue;
          const blob = await blobs.get(`${rec.id}:frame:${f.index}`);
          if (blob) next[key] = URL.createObjectURL(blob);
        }
      }
      if (!cancelled && Object.keys(next).length) setFrameUrls((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [state.recordings, frameUrls]);

  // ── actions ───────────────────────────────────────────────────────────
  const stopRecording = async () => {
    const r = recorderRef.current;
    if (!r || stopGuard.current) return;
    stopGuard.current = true;
    setStopping(true);
    try {
      await send({ type: 'recording:setActive', active: false });
      const meta = await r.stop();
      await send({ type: 'recording:finish', id: r.id, meta });
      await refresh();
      say('saved — on the timeline');
      // Transcription is queued, not awaited: Record has to be pressable again
      // right now — stopping and starting again is what parts are for.
      enqueueWhisper(r.id);
    } finally {
      recorderRef.current = null;
      setRecUpdate(null);
      setStopping(false);
      setPageToolbar(false);
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
    const id = crypto.randomUUID();
    const r = new Recorder(
      { onUpdate: setRecUpdate, onEnd: () => void stopRecording() },
      state.settings.lang,
      scope.startsWith('http') ? scope : '',
      id,
    );
    try {
      await r.start();
    } catch {
      // Refused the screen share: nothing was minted, so there's nothing to undo.
      say('screen share refused');
      return;
    }
    // Claim the part *before* announcing it: `recording:start` broadcasts, and a
    // refresh that lands before this ref is set reads the new part as an orphan.
    recorderRef.current = r;
    try {
      const started = await send<{ sessionId?: string }>({
        type: 'recording:start',
        id,
        name: 'Walkthrough',
        origin: r.scope,
      });
      if (!started?.sessionId) throw new Error('recording:start refused');
    } catch {
      recorderRef.current = null;
      await r.cancel();
      await send({ type: 'recording:discard', id }).catch(() => {});
      setRecUpdate(null);
      say("couldn't start the recording");
      return;
    }
    // The toolbar only exists where a content script can run, and the HUD's
    // sub-line must not point at a bar that isn't there.
    setPageToolbar(Boolean(r.scope));
    await refresh();
  };

  // Every stop path — this button, Chrome's own "Stop sharing" bar, the page
  // toolbar — lands in stopRecording, and the listener above needs today's copy.
  useEffect(() => {
    stopRef.current = () => void stopRecording();
  });

  const switchSession = async (id: string) => {
    await send({ type: 'session:activate', id });
    setShowSessions(false);
    await refresh();
  };

  const copyPrompt = async () => {
    if (!session) return;
    // The count comes off the list, not the session: recCount only ever climbs
    // (it names the next index), so deleting would leave the prompt lying.
    await navigator.clipboard.writeText(
      agentPrompt(session, sessionFolder(session, root, dir), state.recordings.length),
    );
    say(root ? 'prompt copied — paste into Claude Code' : 'prompt copied — set the folder path for a clean handoff');
  };

  /**
   * Closing a gripe: get every byte on disk, hand over the prompt, then let go of
   * the session. The next recording opens a fresh one — parts only ever accumulate
   * in the open gripe, so this is the only way to start clean.
   *
   * The clipboard write goes first: it needs the click's user activation, and the
   * flush below can burn through it.
   */
  const finish = async () => {
    if (!session) return;
    const target = session;
    const recordings = state.recordings;
    await navigator.clipboard
      .writeText(agentPrompt(target, sessionFolder(target, root, dir), recordings.length))
      .catch(() => {});
    // After the close there is no active session, and the flush effect only ever
    // runs for the active one — so anything still pending has to land right here.
    for (let i = 0; i < 60 && flushingRec.current; i++) await wait(50);
    flushingRec.current = true;
    try {
      for (const rec of recordings) {
        if (rec.state === 'done' && !rec.meta.written) await flushRecording(target, rec);
      }
    } finally {
      flushingRec.current = false;
    }
    await send({ type: 'session:close', id: target.id });
    await refresh();
    say(dir && perm === 'granted' ? 'gripe closed — prompt copied' : 'gripe closed — nothing written to disk');
  };

  /** One zip for the whole gripe, laid out exactly like the folder on disk. */
  const exportZip = async () => {
    if (!session) return;
    const base = session.slug;
    const files = [
      { name: `${base}/report.md`, data: textBytes(buildReport(session, state.recordings)) },
      {
        name: `${base}/MANIFEST.txt`,
        data: textBytes(buildManifestTxt(session, state.recordings)),
      },
    ];
    for (const rec of state.recordings) {
      const meta = rec.meta;
      const recDir = `${base}/${recDirName(rec.index)}`;
      files.push({ name: `${recDir}/transcript.txt`, data: textBytes(buildTranscriptTxt(meta)) });
      files.push({
        name: `${recDir}/recording.json`,
        data: textBytes(buildRecordingJson(session, rec)),
      });
      const gridFrames: GridFrame[] = [];
      for (const f of meta.frames) {
        const blob = await blobs.get(`${rec.id}:frame:${f.index}`);
        if (!blob) continue;
        // f.file is rec-relative (frames/03-0125.jpg) — the rec dir goes in front.
        files.push({ name: `${recDir}/${f.file}`, data: await blobBytes(blob) });
        gridFrames.push({ blob, label: f.file.split('/').pop()! });
      }
      for (const [i, sheet] of (await makeGrids(gridFrames)).entries()) {
        files.push({
          name: `${recDir}/grids/grid_${String(i + 1).padStart(2, '0')}.jpg`,
          data: await blobBytes(sheet),
        });
      }
      const video = await blobs.get(`${rec.id}:video`);
      if (video) files.push({ name: `${recDir}/${meta.videoFile}`, data: await blobBytes(video) });
    }
    const url = URL.createObjectURL(makeZip(files));
    await chrome.downloads.download({ url, filename: `${base}.zip`, saveAs: true });
    say('zip exported');
  };

  const renameSession = async (value: string) => {
    if (!session || value.trim() === session.name) return;
    await send({ type: 'session:rename', id: session.id, name: value.trim() || session.name });
    await refresh();
  };

  /** `queued` / the live stage / nothing — one part's place in the Whisper queue. */
  const whisperLabel = useCallback((id: string): string | null => {
    if (whisperIds[0] !== id) return whisperIds.includes(id) ? 'queued' : null;
    if (!whisper) return 'transcribing…';
    if (whisper.stage === 'decode') return 'reading audio…';
    if (whisper.stage === 'transcribe') return 'transcribing narration…';
    if (whisper.stage === 'model') return 'loading model…';
    return `fetching whisper model — ${Math.round(whisper.pct)}%`;
  }, [whisper, whisperIds]);

  /** recId → what the transcriber is doing. The timeline says it once, quietly. */
  const busy = useMemo(
    () =>
      Object.fromEntries(
        state.recordings
          .map((r) => [r.id, whisperLabel(r.id)] as const)
          .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
      ),
    [state.recordings, whisperLabel],
  );

  const folderReady = dir && perm === 'granted';
  /** Other gripes than this one — the only reason the history button exists. */
  const others = state.sessions.filter((s) => s.id !== state.activeSessionId).length;
  const parts = state.recordings.length;
  const hasContent = parts > 0;
  const onDisk = state.recordings.filter((r) => r.meta.written).length;
  const allWritten = onDisk === parts;

  const summary = [
    // Duration, not a count of takes — the panel presents one timeline.
    parts ? `${mmss(totalMs(partSpans(state.recordings)))} recorded` : '',
    folderReady && hasContent ? (allWritten ? 'on disk' : `${onDisk}/${parts} on disk`) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  // The strip is the editor: one slim bar of chrome, and every remaining pixel
  // belongs to the timeline. Capture lives in the side panel; this is where a
  // ramble gets read, cut, and shipped.
  if (popped) {
    return (
      <div className="app pop">
        <header className="head">
          <svg className="mark" viewBox="0 0 16 16" aria-hidden>
            <circle cx="8" cy="8" r="2.6" fill="#ff5c39" />
            <circle cx="8" cy="8" r="6.4" fill="none" stroke="#ff5c39" strokeWidth="2" />
          </svg>
          <input
            className="popname"
            value={name}
            placeholder="Untitled gripe"
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => void renameSession(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <span className="spacer" />
          <span className="count">{summary}</span>
          {dir && perm !== 'granted' && (
            <button className="link hot" onClick={() => void reconnect()}>
              reconnect
            </button>
          )}
          {recUpdate ? (
            <button className="stopmini" onClick={() => void stopRecording()} disabled={stopping}>
              {stopping ? 'saving…' : `■ ${mmss(recUpdate.elapsedMs)}`}
            </button>
          ) : (
            <button className="recmini" onClick={() => void startRecording()}>
              <span className="dot" /> record
            </button>
          )}
          <button className="primary" disabled={!hasContent} onClick={copyPrompt}>
            Copy prompt
          </button>
          <button
            className="ghost"
            disabled={!hasContent}
            title="Write it out, copy the prompt, and close this gripe"
            onClick={() => void finish()}
          >
            done
          </button>
        </header>
        <Timeline
          recordings={state.recordings}
          frameUrls={frameUrls}
          busy={busy}
          refresh={refresh}
          say={say}
        />
        {flash && <div className="flash">{flash}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="head">
        <svg className="mark" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r="2.6" fill="#ff5c39" />
          <circle cx="8" cy="8" r="6.4" fill="none" stroke="#ff5c39" strokeWidth="2" />
        </svg>
        <span className="wordmark">Gripe</span>
        <span className="spacer" />
        <span className="count">{summary}</span>
        <button className="popout" title="pop out the editor" onClick={() => void popOut()}>
          ⧉
        </button>
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
          {others > 0 && (
            <button
              className={`histbtn ${showSessions ? 'open' : ''}`}
              onClick={() => setShowSessions((v) => !v)}
            >
              history · {others}
            </button>
          )}
        </div>

        {!fsaSupported() ? (
          <div className="inbox">
            <span className="status" />
            <span className="path">folder writing unavailable — use .zip</span>
          </div>
        ) : dir ? (
          // One line, and everything you can do to the folder is behind it.
          <div className="inbox">
            <button
              className="inbox-line"
              onClick={() => setAskRoot((v) => !v)}
              title={displayPath(dir, session, root)}
            >
              <span className={`status ${folderReady ? 'ok' : 'warn'}`} />
              <span className="path">inbox · {root || dir.name}</span>
              {!root && <span className="pathq">path?</span>}
            </button>
            {perm !== 'granted' && (
              <button className="link hot" onClick={() => void reconnect()}>
                reconnect
              </button>
            )}
          </div>
        ) : (
          <div className="setup">
            <div className="setup-row">
              <span className="setup-title">gripes need somewhere to land</span>
              <button
                className="link hot"
                onClick={pickerBlocked ? openInTab : () => void connect()}
              >
                {pickerBlocked ? 'Open in tab →' : 'Choose folder'}
              </button>
            </div>
            <div className="setup-why">
              pick or create one folder — every project's gripes go there
            </div>
          </div>
        )}
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
            chrome won't tell us where this folder lives. paste its full path once — every prompt
            will carry it so your agent never hunts.
          </div>
          <button
            className="forget"
            onClick={() => void disconnect()}
            title="Files already on disk are kept"
          >
            forget this folder
          </button>
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
                {s.recCount} recording{s.recCount === 1 ? '' : 's'} · {dateTime(s.createdAt)}
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
        <div className="controls live">
          <div className="hud">
            <div className="live-row">
              <span className="dot" />
              <span className="clock">{mmss(recUpdate.elapsedMs)}</span>
              <span className="stat">
                {recUpdate.frameCount} frames · {recUpdate.segmentCount} lines ·{' '}
                {recUpdate.markCount} marked
              </span>
              <button className="stop" onClick={() => void stopRecording()} disabled={stopping}>
                {stopping ? 'saving…' : '■ Stop'}
              </button>
            </div>
            {recUpdate.micState === 'denied' ? (
              <button
                className="interim warn"
                title="Open the permission page in a tab"
                onClick={() =>
                  void chrome.tabs.create({ url: chrome.runtime.getURL('micperm.html') })
                }
              >
                microphone blocked — no narration this time · fix it
              </button>
            ) : (
              <div className="interim">
                {recUpdate.interim || (recUpdate.micState === 'listening' ? 'listening…' : '')}
              </div>
            )}
            {pageToolbar && (
              <div className="sub">draw and stop from the little bar on the page</div>
            )}
          </div>
        </div>
      ) : (
        <div className="controls">
          <button className="hero" onClick={() => void startRecording()}>
            <span className="dot" />
            Record
          </button>
        </div>
      )}

      <Timeline
        recordings={state.recordings}
        frameUrls={frameUrls}
        busy={busy}
        refresh={refresh}
        say={say}
      />

      <div className="settings">
        <button
          className={`settings-row ${showSettings ? 'open' : ''}`}
          onClick={() => setShowSettings((v) => !v)}
        >
          settings
        </button>
        {showSettings && (
          <div className="toggles">
            {([['drawStart', 'recordings start ready to draw']] as const).map(([key, label]) => (
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
        )}
      </div>

      <div className="foot">
        <button className="primary" disabled={!hasContent} onClick={copyPrompt}>
          Copy prompt for Claude Code
        </button>
        {/* The escape hatch, and only when there's no folder to write into. */}
        {(!folderReady || !fsaSupported()) && (
          <button className="ghost" disabled={!hasContent} onClick={exportZip} title="Download as .zip">
            .zip
          </button>
        )}
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
