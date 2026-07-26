# Page Telemetry

> Status: **done** · Last updated: 2026-07-26

## What / Why

Every note carries whatever the page's own console and network threw around the moment it was
recorded. You point at a button that does nothing; the report already contains the `TypeError` that
broke it. This is the feature that most often lets an agent fix a bug without reproducing it.

## Behavior spec

- When the content script boots, it injects `injected.js` into the page's **MAIN world** via a
  `<script src=chrome.runtime.getURL(...)>` tag, which removes itself on load.
- When injection fails (strict CSP), the failure is swallowed — capture still works, notes just have
  no events.
- When the page calls `console.error` or `console.warn`, the arguments are stringified and forwarded;
  the original console method is always called afterward, unchanged.
- When an uncaught `error` or `unhandledrejection` fires, it's forwarded as level `error`, preferring
  `error.stack` over the message.
- When `fetch` resolves with a non-`ok` response, a `network` event is recorded as
  `<status> <statusText> — <url>`; when it rejects, `fetch failed — <url>` plus the stringified error
  as detail.
- When an `XMLHttpRequest` loads with status ≥400 or errors, the equivalent `network` event is
  recorded with the method and URL.
- Each event is trimmed to 2000 characters and carries a `ts`.
- Forwarding is `window.postMessage` tagged `source: 'gripe:page-event'`; the content script ignores
  any message not from `window` with that tag.
- The content script keeps a rolling buffer of the **last 80 events**.
- When a note is saved, it attaches at most the **12 most recent** events whose `ts` is newer than
  *both* three minutes ago and the previous note in this page session — so consecutive notes don't
  duplicate the same errors.
- When a note has events, the panel row shows "N console/network errors captured" in accent, and
  `report.md` gains a collapsed `<details>` block listing them.
- Every hook in the injected script is individually try/caught and re-entrancy-guarded by
  `window.__gripeTap`; it must never break the host page.

## Touchpoints

| Part | File |
| --- | --- |
| The MAIN-world tap (plain JS, shipped verbatim) | `public/injected.js` |
| Web-accessible resource declaration | `public/manifest.json` (`web_accessible_resources`) |
| Injection, message listener, buffer, `recentEvents()` | `src/content/index.ts` |
| `PageEvent` type | `src/lib/types.ts` |
| `<details>` rendering | `eventsBlock` in `src/lib/markdown.ts` |
| Panel error-count line | `src/sidepanel/App.tsx` |

## Data

`PageEvent { level: 'error' | 'warn' | 'network'; message: string; detail?: string; ts: number }`,
stored inline on each `Note.events`. Constants live in `src/content/index.ts`:
`EVENT_WINDOW_MS = 3 * 60 * 1000`, `MAX_EVENTS_PER_NOTE = 12`, buffer cap 80.

## Edge cases

- **Strict CSP** blocks the script tag → no events, no error surfaced to the user.
- **The page patches `fetch` after us** → its wrapper wins and network events are missed; console
  events still work.
- **Events fired before the content script booted** are lost (`document_idle` is after most app
  bootstrapping, so early startup errors are the usual casualty).
- **A page that logs constantly** overflows the 80-event buffer; only the most recent survive, which
  is the desired bias.
- **Circular objects** in a `console.error` argument fall back to `Object.prototype.toString`.
- **Errors in cross-origin iframes** are not captured (`all_frames: false`).
- **`injected.js` is copied from `public/` verbatim** — it is not TypeScript, is not bundled, and
  cannot import anything.

## Open questions

- [ ] No way to see or clear the buffer from the UI — you find out what was captured only after
      saving a note.
- [ ] Successful network calls are never recorded, so "the request returned 200 but with wrong data"
      leaves no trace.

## How to verify

See `verify.md` flow **4** [cheap]. Both halves matter: the errors appear on the first note, **and**
they don't reappear on the next one.
