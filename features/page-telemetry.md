# Page Telemetry

> Status: **done** · Last updated: 2026-07-29

## What / Why

A gripe carries whatever the page's own console and network threw while you were talking. You say "and
now this button does nothing"; the report already contains the `TypeError` that broke it. This is the
feature that most often lets an agent fix a bug without reproducing it.

The same MAIN-world tap does a second job as of 2026-07-29: it reports **SPA navigations**, which the
recorder turns into forced keyframes. A route change that repaints one cream page into another cream
page scores under the dedup bar and would otherwise leave no frame at all.

## Behavior spec

- When the content script boots, it injects `injected.js` into the page's **MAIN world** via a
  `<script src=chrome.runtime.getURL(...)>` tag, which removes itself on load. An isolated content
  script cannot see the page's own `console` or patch its `fetch`.
- When injection fails (strict CSP), the failure is swallowed — recording still works, it just has no
  events on that page.
- When the page calls `console.error` or `console.warn`, the arguments are stringified and forwarded;
  the original console method is always called afterward, unchanged.
- When an uncaught `error` or `unhandledrejection` fires, it's forwarded as level `error`, preferring
  `error.stack` over the message.
- When `fetch` resolves with a non-`ok` response, a `network` event is recorded as
  `<status> <statusText> — <url>`; when it rejects, `fetch failed — <url>` plus the stringified error
  as detail.
- When an `XMLHttpRequest` loads with status ≥400 or errors, the equivalent `network` event is recorded
  with the method and URL.
- Each event is trimmed to 2000 characters and carries a `ts`.
- Forwarding is `window.postMessage` tagged `source: 'gripe:page-event'`; the content script ignores any
  message not from `window` with that tag.
- **Nothing is buffered.** An event that fires outside a recording has no timeline to land on, so it is
  dropped where it happens. While a recording is live, each event is relayed straight to the panel as
  `recording:event` with the sender's own `origin`.
- The **recorder** keeps only events whose origin matches the tab that was in front when Record was
  pressed; everything else is counted in `droppedEvents` and reported rather than silently discarded.
  No scope at all (a `chrome://` tab was in front) keeps everything. It holds at most 200 events.
- `report.md` places each event on the gripe's axis (clamped to its own take's span) and renders it as
  `- [level] @ m:ss message — detail` under the frame it follows; the header counts them and the
  caveat block names the origin and the drop count. `recording.json` carries them take-local.
- **Navigations:** `pushState` and `replaceState` are wrapped, and `popstate` / `hashchange` are
  listened for; each posts `source: 'gripe:page-nav'`. While recording, the content script turns that
  into `recording:force { why: 'nav' }`, and the recorder keeps the next sample as `reason: 'nav'`
  unless the screen is byte-identical. A tab that *loads* inside a live walkthrough sends the same
  thing when its dock opens, because a full navigation is one the SPA tap never sees.
- Every hook in the injected script is individually try/caught and re-entrancy-guarded by
  `window.__gripeTap`; it must never break the host page.

## Touchpoints

| Part | File |
| --- | --- |
| The MAIN-world tap (plain JS, shipped verbatim) | `public/injected.js` |
| Web-accessible resource declaration | `public/manifest.json` (`web_accessible_resources`) |
| Injection, message listener, event + nav relay | `src/content/index.ts` |
| Scope filtering, drop count, the 200 cap | `addEvent` / `inScope` in `src/sidepanel/recorder.ts` |
| Forced keyframe on nav | `force()` in `recorder.ts` |
| `PageEvent` type | `src/lib/types.ts` |
| Rendering: `traceBeat`, `axisEvents`, `scopeLines` | `src/lib/markdown.ts` |

## Data

`PageEvent { level: 'error' | 'warn' | 'network'; message: string; detail?: string; ts: number }` —
`ts` is absolute; the report converts it. Events live inline on `RecordingMeta.events`, with
`eventScope` (the origin kept) and `droppedEvents` beside them. `MAX_EVENTS = 200` in `recorder.ts` is
the only cap.

## Edge cases

- **Strict CSP** blocks the script tag → no events and no nav forcing on that page, no error surfaced.
- **The page patches `fetch` after us** → its wrapper wins and network events are missed; console
  events still work.
- **Events fired before the content script booted** are lost (`document_idle` is after most app
  bootstrapping, so early startup errors are the usual casualty).
- **A page that logs constantly** overflows the 200-event cap; the oldest go, which is the desired bias.
- **Circular objects** in a `console.error` argument fall back to `Object.prototype.toString`.
- **Errors in cross-origin iframes** are not captured (`all_frames: false`).
- **An event stamped after the recorder stopped** is clamped to that take's span by the report, so it
  can't drift into a take recorded hours later.
- **`injected.js` is copied from `public/` verbatim** — it is not TypeScript, is not bundled, and
  cannot import anything.

## Open questions

- [ ] Successful network calls are never recorded, so "the request returned 200 but with wrong data"
      leaves no trace.
- [ ] Events have no lane on the timeline — they exist in the report but can't be selected or deleted
      like frames and lines can.
- [ ] A gripe with zero captured events reads the same as one where capture failed; the report is
      specced to say which (`plans/2026-07-29-transcription-report-fixes.md`).

## How to verify

See `verify.md` flow **4** [cheap]. Record, trigger a console error in the recorded tab **and** one in
another tab, then check the report: the first appears with its m:ss, the second is absent and counted
in the scope line. For the nav half, click through an SPA route change while recording and confirm a
frame with `"reason": "nav"` lands in `rec-NN/recording.json`.
