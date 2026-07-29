# 2026-07-29 — transcription + report fixes (packages B and C)

> Status: **active** — paused, not abandoned. Package A (capture) SHIPPED; B and C are
> specced below and waiting only because another session was mid-sweep on the
> "notes are dead" removal + timeline rewrite (`plans/2026-07-29-timeline.md`) in the
> same files. **Before starting: confirm `npm run typecheck` is green.** If it is, that
> sweep is done and this work is unblocked. Re-read the current shape of any file
> before editing — B and C were specced against the pre-removal tree and call out
> what changed.

## Why this work exists

A real 10-minute walkthrough (`G:\code\gripes\2026-07-29-1009-walkthrough`) was read
end-to-end by an agent. Findings, ranked:

1. **The shipped transcript was Web Speech, not Whisper** (`transcriber: 'webspeech'`
   in recording.json). The part was closed before the queue drained; nothing recovers
   it afterward. Web Speech mangled every domain noun ("fuck ready to emails" =
   Rock Ready evals, "natick.pros androbes.com" = natick.frozenropes.com) and
   duplicated overlapping lines on its restarts.
2. **Dedup went blind for 78s** (5:48→7:06) during sign-out → sign-in → new-area tour:
   cream-on-cream UI + form typing stays under the 8-cell bar. → FIXED by package A
   (click/nav/beat forced keyframes; see below).
3. **Report noise**: ten ≤3-word fragments ("and", "what's up" — phone-call
   interruptions) each got a full blockquote + "↳ about no keyframe" boilerplate.
4. **Pointer lines lead with selector garbage** (`div.mb-1\.5:nth-of-type(2) > nav…`)
   when the text snippet ("Rock Ready evals") is the signal.
5. **The preamble hard-codes "bug report" and the prompt says "fix"** — real gripes are
   also task briefs ("write me a demo script"); the agent gets told to *fix* a request.
6. **Zero kept events reads as ambiguous** — say "no console/network errors fired"
   explicitly when the scope kept nothing.

## Package A — SHIPPED (capture, 2026-07-29)

For the record, so nobody re-does it: `RecordingFrame.reason` grew
`'click' | 'nav' | 'beat'`; content script sends `recording:force` on clicks (ripple
condition) and navigations (`gripe:page-nav` MAIN-world tap in injected.js:
pushState/replaceState/popstate/hashchange, 500ms debounce, + fresh-load catch-up in
the `recording` handler); recorder gained `force(why, origin)` (in-scope only, 1200ms
click cooldown, mark always wins, skip when `minDist === 0`) and a heartbeat: below
the dedup bar but `minDist > 0` and >15s (`BEAT_MS`) since the last kept frame keeps a
`'beat'` frame. Thinning still protects only `'mark'`.

## Package B — transcription (NOT started)

Goal: a gripe can never again ship with the Web Speech transcript when Whisper was
possible. Four pieces:

1. **Live chunked Whisper during recording.** New `LiveWhisper` class in
   `src/sidepanel/transcribe.ts`: one worker kept alive across jobs (rework
   `transcribeWorker.ts` to accept `{id, audio, offsetMs}` jobs and cache the
   pipeline; today it is one-job-per-lifetime). Every ~45s of recording, the panel
   assembles the in-memory chunk prefix (`new Blob(chunks)` — a MediaRecorder prefix
   decodes), decodes, slices the window `[lastMs − 1000ms overlap, nowMs]`, transcribes,
   offsets timestamps, keeps segments starting ≥ lastMs (except the first window).
   Silent windows (peak < SILENCE_FLOOR) skip. On stop, a final small tail job runs
   through the existing queue path (save-first-then-swap semantics unchanged:
   `recording:transcript` → refresh → `flushRecordingById`). Any window decode failure
   → fall back to today's one-shot `transcribeRecording` on the full webm. Mic-denied
   → no LiveWhisper at all.
2. **`done` guard.** In `finish()`: if the whisper queue is non-empty or a LiveWhisper
   tail is in flight, first press flashes `still transcribing — press done again to
   close anyway` (lowercase, no key names) and arms a ~5s window; second press
   proceeds. Never block forever.
3. **Requeue on panel open.** New `RecordingMeta.whisperTries?: number`. On load,
   enqueue every `done` recording (any session, including closed) where
   `meta.transcriber !== 'whisper'` and `(whisperTries ?? 0) < 2` and it isn't the live
   recorder's id. `runWhisper` failure paths send a new `recording:whisperTried`
   message (background increments the counter, no broadcast). This is what rescues
   already-closed gripes like the 2026-07-29 one.
4. **Vocabulary glossary.** `Settings.vocabulary: string` (default `''`) — NOTE:
   Settings just shrank to `{ drawStart, lang }` in the removal; add alongside. UI: a
   text input row in the settings disclosure, label `vocabulary`, placeholder like
   `names & jargon, comma-separated — improves transcription`. New pure
   `src/lib/vocab.ts`: `parseVocabulary` (split commas/newlines, trim, dedupe, drop
   <3 chars) and `correctTranscript(segments, terms)` — conservative fuzzy replace:
   single words len ≥4 at normalized-Levenshtein ≥0.8 and length-diff ≤2; multi-word
   terms via sliding window (±1 word) joined-similarity ≥0.8; always canonical casing.
   Apply to whisper output before `recording:transcript` AND to the webspeech meta
   before `recording:finish`. Also pass the vocabulary string to the worker and try it
   as a whisper initial prompt inside try/catch (transformers.js support is patchy —
   harmless if ignored; the fuzzy pass is the reliable half).

## Package C — the report (NOT started; re-spec against post-removal markdown.ts)

All in `src/lib/markdown.ts`. The removal deleted note sections/PREAMBLE_NOTES and
changed builder signatures — adapt, don't resurrect.

1. **Merge fragments**: report-level only (transcript.txt/json stay raw). A segment of
   ≤3 words with no human `tl` merges into the following segment of the same part when
   the gap < 2000ms; windows union, texts space-join. Loop to stable.
2. **Drop the no-keyframe boilerplate**: when a line claims no frames and sheets
   exist, render just the quote — no `↳ about` row. Add one preamble sentence: a
   quoted line with no frame note happened over an unchanging screen (sheets cover
   it), and very short stray lines may be the speaker answering someone off-screen.
3. **Pointer text-first**: with text → `- **pointer** "Rock Ready evals" —
   \`span.truncate…\`` (last `>` segment of the selector, truncated ~60); without text
   → full selector as today. recording.json keeps the full selector regardless.
4. **Frame-reason labels**: inlined `'click'` frames append `after a click` to the
   heading bits; `'nav'` → `page changed`; `'beat'` → nothing.
5. **Reframe intent**: preamble head — a gripe is "a report a human recorded against
   the running app — a bug, a request, or a walkthrough briefing; the narration says
   which". `agentPrompt` — "do what it asks: fix what it shows broken, or carry out
   what the narration requests" (signature is now `(session, folder?, parts?)`).
6. **Zero-events honesty**: when `eventScope` is set and zero events were kept, say
   `No console or network errors fired in <scope> while recording.` (+ dropped count
   if any) instead of silence/ambiguity.

## Verify (both packages)

`npm run typecheck` && `npm run build` (content script needs the full build). Then a
real end-to-end: record ~1 min on a low-contrast page with a couple of route changes,
stop, wait for whisper, `done`, and read the written report.md for: click/nav/beat
frames present, whisper transcript (`transcriber: 'whisper'` in recording.json),
merged fragments, text-first pointer lines, reframed prompt. Then close a part early
(before whisper lands), reopen the panel, confirm the requeue upgrades the transcript
on disk.

When shipped: flip this to **done**, log in `updates.md`, and record the vocabulary
fuzzy-match thresholds in `decisions.md` if they were tuned away from the numbers
above.
