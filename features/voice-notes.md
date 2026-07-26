# Voice Notes

> Status: **done** · Last updated: 2026-07-26

## What / Why

Dictation that starts by itself, survives your pauses, and commits the note when you stop talking —
so recording ten bugs is ten pointing gestures and ten sentences, with no keyboard in between. The
two hard parts are that Chrome kills speech recognition on silence, and that "done talking" has to be
detected without ever firing while you're mid-thought.

## Behavior spec

- When the composer opens and `autoDictate` is on, the mic starts listening and pulses accent.
- When Chrome ends the recognition stream (it does this on every silence, even in continuous mode),
  a new recognizer is started 120ms later — invisibly, as long as the user still wants the mic on.
- When an interim result arrives, it renders under the textarea in translucent accent and any pending
  auto-send is cancelled ("still talking").
- When a final result arrives, it's appended to the textarea with a single space and the interim line
  clears.
- When the accumulated text ends with a send phrase — `that's it`, `save it`, `save that`, `send it`,
  `log it`, `ship it`, `next note`, `end note`, `next`, optionally preceded by "and" and followed by
  punctuation — the phrase is stripped and the note commits immediately.
- Otherwise, when `autoSend` is on and there is non-empty text, a drain bar starts across the bottom
  of the composer and the note commits after `autoSendMs` (default 3000).
- When the user types, presses any key, or speaks again, the drain bar is cancelled and reset.
- When the user presses `Enter` (without Shift), the note commits now. `Shift+Enter` inserts a newline.
- When the user presses `Ctrl+Space` (or `Cmd+Space`), or clicks the mic, dictation toggles; turning
  it off also cancels any pending auto-send.
- When the browser has no `SpeechRecognition`, the composer's context line reads "no speech
  recognition in this browser — type it" and everything else still works.
- When the microphone is blocked (`not-allowed` / `service-not-allowed`), the context line turns
  warning-colored and reads "Microphone blocked on this site — type instead"; the mic stops trying.
- When the error is `no-speech` or `aborted`, nothing is shown — the restart loop handles it.
- When a note is saved, dictation stops and the mic stops pulsing.
- The recognizer's language is `settings.lang` when set, otherwise `navigator.language`, otherwise
  `en-US`.
- The first line of the transcript becomes the note's heading in `report.md`; any following lines
  become the body.

## Touchpoints

| Part | File |
| --- | --- |
| `Dictation` class, restart loop, error mapping | `src/content/speech.ts` |
| Handler wiring, send phrases, drain bar, Enter/Ctrl+Space | `src/content/index.ts` (`startDictation`, `scheduleAutoSend`, `wireComposer`) |
| Composer markup: mic, textarea, interim, countdown | `src/content/ui.ts` |
| `SEND_PHRASES`, `autoDictate`/`autoSend`/`autoSendMs`/`lang` | `src/lib/types.ts` |
| `auto-mic` / `auto-send` toggles | `src/sidepanel/App.tsx` |

## Data

Settings only — `autoDictate`, `autoSend`, `autoSendMs`, `lang` on `Settings`, persisted under the
`settings` key in the IndexedDB `kv` store and pushed to the content script with every `arm` command.

## Edge cases

- **Mic permission is per-origin**, so the first note on a new dev origin shows Chrome's prompt.
  Grant once and it sticks for that origin.
- **`Permissions-Policy: microphone=()`** on the host page blocks recognition entirely → typing
  fallback, no crash.
- **`recognition.start()` throws** when a previous instance hasn't released — swallowed; the next
  `onend` picks it up.
- **A send phrase spoken mid-sentence** ("save it for later, the modal is broken") does not trigger:
  the regex is anchored to the end of the transcript.
- **Auto-send with empty text** never fires — pointing at something and saying nothing requires an
  explicit `Enter` (which saves a screenshot-only note).
- **Multiple tabs armed at once** each own an independent recognizer; Chrome may only grant the mic
  to the focused one.

## Open questions

- [ ] `autoSendMs` is settable in `Settings` but has no UI — 3000ms is the only value most users will
      ever have.
- [ ] `lang` likewise has no UI; non-English users get `navigator.language` and no way to override.
- [ ] Send phrases are English-only and hardcoded.

## How to verify

See `verify.md` flow **2** [cheap]. The regression that matters most: talk with pauses for 30+
seconds and confirm the transcript keeps appending — that proves the restart loop is alive.
