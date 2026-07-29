# Gripe — enterprise strategy

- **Date:** 2026-07-29
- **Status:** done — decisions made (eng buyer, cloud, bootstrap, pull-first, S3 day one) and the
  build shipped as the **Inloop** repo (`G:\code\inloop`, github.com/dested/inloop); remaining
  ideas here are the product backlog
- **Type:** analysis
- **What:** monetization / enterprise plan + the overlay-over-native-apps answer; dumped in chat for Sal, mirrored here

## Q1 — drawing over Excel from the extension

**Impossible, with certainty.** A Chrome extension's only render surfaces are web pages inside
Chrome and its own extension pages. Chrome exposes no API to draw over other applications'
windows — no transparent overlay, no click-through, nothing. The ink layer is a canvas in a
content script's shadow root (already a cliffnotes hard rule).

Three exits, ranked:

1. **Draw on the recording, not the screen — no install needed.** Gripe is recording-only; the
   artifact is the report, nobody watches the live screen. The panel already owns the
   getDisplayMedia stream. Show a live preview and let the user draw on the *preview*;
   composite strokes into kept keyframes (and into the webm via canvas.captureStream if we
   re-encode). Chrome's **Document Picture-in-Picture** (Chrome 116+, exactly our
   `minimum_chrome_version`) gives an always-on-top window that floats over Excel/anything —
   put the dock + live preview there. This is "draw over Excel" for every purpose that matters.
2. **Native Messaging helper.** Tiny native binary (transparent always-on-top click-through
   overlay) the extension drives via `connectNative`. Needs an installer — MDM-fine for
   enterprise, friction for individuals. Back pocket.
3. **Full native app (Tauri).** Only if the thesis becomes "annotate everything live". It isn't.

## Q2 — enterprise

### Positioning

Gripe is not a screen recorder. Loom = video for humans; Jam = bug reports for humans; Gripe =
**task capture for agents** — the input format for agentic engineering. The org bottleneck moved
from writing code to specifying work with context; Gripe is the specification device.
Pipeline to sell: **see it → say it → agent fixes it → PR with the before-video attached.**

### Target architecture

1. **Extension** — thin capture client (screen, mic, DOM, console/network, pointer). Only install.
2. **Gripe Cloud** — workspace: uploads, processing pipeline (transcription, vision,
   LLM structuring), web editor (port of Timeline), project routing, integrations, SSO/admin.
3. **Agent side** — MCP server + dispatch: agents pull gripes; cloud pushes gripes into Claude
   Code sessions / CI agents and posts PRs back.

Local folder mode survives as the free tier: dev-loved, privacy-perfect, costs $0 to serve.

### Big ideas — NOW (makes the enterprise demo)

1. **Gripe MCP server + `gripe watch`** — MCP exposing the inbox (list/read/resolve); watcher
   auto-launches `claude -p` per new gripe. "It auto runs in Claude Code." Days of work, glues
   what exists today.
2. **Cloud + web editor + share links** — the rewrite core; links are the Loom-style growth loop.
3. **Project graph** — origin/URL → project → repo → destinations (Linear/Asana/Jira issue,
   Slack channel, agent queue). Auto-detected from the recorded tab; switcher in the panel.
4. **Server transcription with repo-aware vocabulary** — Whisper large/Deepgram + boost list
   mined from the repo (component/route names). Names transcribing right = product feels magical.
5. **LLM structuring pass** — split a rambling recording into N discrete gripes; per gripe:
   title, severity, repro steps, expected vs actual, acceptance criteria. Human confirms, routes.

### Big ideas — LATER (each a quarter)

1. **Auto-repro** — capture rrweb/DOM alongside pixels → generate a Playwright repro script →
   agent's fix must pass it. Closes "plausible PR" → "verified fix". Nobody has this.
2. **Public capture link + SDK** — end users record gripes on a plain web page (getDisplayMedia
   needs no extension; embedded snippet adds console/DOM). Second market + bottoms-up spread.
3. **PII redaction** — auto-blur emails/tokens/faces in frames + video. Enterprise gate-opener.
4. **Slack triage** — gripe lands → summary + clip in channel → 👍 dispatches the agent.
5. **Fix verification recording** — after the PR's preview deploy, agent re-runs the repro and
   attaches the "after" clip.

### Pricing

| Tier | Price | Gets |
| --- | --- | --- |
| Free | $0 | Local mode, unlimited gripes, your own agent |
| Pro | $20/seat/mo | Cloud workspace, share links, server transcription (fair use), MCP, GitHub |
| Business | $40/seat/mo | Project routing, Linear/Asana/Jira/Slack, structuring pass, admin |
| Enterprise | custom, ~$50–60k/yr floor | SSO/SCIM, retention, redaction, BYO bucket, MDM helper, audit |
| Agent runs | metered (~$1–3/run or packs) | Cloud agent fix dispatch — the pricing upside |

Anchors: Loom ~$15, Jam ~$10, Linear ~$10/seat. Gripe sits above because the deliverable is
engineering work initiated, not a video. Outcome pricing (per merged agent PR) = later experiment,
not v1 billing.

### Consumer

The free local tier **is** the consumer version — individuals, dogfooding, OSS goodwill. No
separate consumer product. The adjacent play is the public capture link (indie devs embed
"report a bug" powered by Gripe); every external gripe advertises Gripe.

### Rewrite

Keep (port to a shared package): `timeline.ts`, `markdown.ts`, the recorder distiller logic
(dedup + forced keyframes), the Timeline editor concept. Kill: IndexedDB-as-primary-store, the
three-context message maze, FSA as the only sink, sidepanel-as-app.

Monorepo: `packages/core` (timeline + report + types) · `apps/extension` (thin MV3 capture) ·
`apps/web` (editor + workspace) · `apps/api` (uploads, pipeline, integrations, MCP endpoint) ·
`apps/cli` (`gripe watch` + local MCP).

Phases: **(1)** extract core + MCP/watcher against today's folder output — 1–2 wks, immediately
demoable, touches none of the hated code. **(2)** cloud upload + web editor — 4–6 wks; the
hate-purge happens here. **(3)** integrations + structuring — ~4 wks. **(4)** enterprise
hardening when the first real logo asks.

### Open questions for Sal

1. Buyer: eng leadership (bug→PR) or product/QA (feedback capture)? Rec: eng — changes
   integration order (GitHub/Linear first vs Asana/Slack first).
2. Cloud as paid default OK? (Local stays free; BYO bucket softens enterprise objections.)
3. Solo/bootstrapped or raising? Changes design-partners-now vs free-tier-distribution-first.
4. Public capture link/SDK — v1 vision or parked?
5. Claude Code integration: pull model first (MCP + watcher, days) or push model (cloud
   dispatch, needs the cloud)?
