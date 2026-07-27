import type { ReactNode } from 'react'
import { CaptureDemo } from '~/components/capture-demo'
import { RecorderDemo } from '~/components/recorder-demo'
import { Reveal } from '~/lib/reveal'

const GITHUB = 'https://github.com/dested/gripe'

function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke="#ff5c39" strokeWidth="4.2" />
      <circle cx="16" cy="16" r="5.4" fill="#ff5c39" />
    </svg>
  )
}

function Kbd({ children, hot = false }: { children: ReactNode; hot?: boolean }) {
  return (
    <kbd
      className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${
        hot
          ? 'border-accent/40 bg-accent-soft text-accent-text'
          : 'border-line-strong bg-white/[.04] text-muted'
      }`}>
      {children}
    </kbd>
  )
}

function Eyebrow({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] tracking-[0.18em] text-faint uppercase">
      <span className="text-accent">{n}</span> · {children}
    </p>
  )
}

function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display mt-3 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
      {children}
    </h2>
  )
}

// ————————————————————————————————————————————————————————————————

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-3.5">
        <a href="#" className="flex items-center gap-2.5">
          <Mark size={18} />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase">Gripe</span>
        </a>
        <div className="ml-auto hidden items-center gap-7 text-[13px] text-muted sm:flex">
          <a href="#output" className="transition-colors hover:text-ink">
            the output
          </a>
          <a href="#walkthroughs" className="transition-colors hover:text-ink">
            walkthroughs
          </a>
          <a href="#controls" className="transition-colors hover:text-ink">
            controls
          </a>
          <a href="#install" className="transition-colors hover:text-ink">
            install
          </a>
        </div>
        <a
          href={GITHUB}
          className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-line-strong">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          GitHub
        </a>
      </nav>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* one warm glow behind the headline — the only decoration on the page */}
      <div
        className="pointer-events-none absolute left-1/2 top-[-320px] h-[560px] w-[900px] -translate-x-1/2 rounded-full opacity-[0.14]"
        style={{
          background: 'radial-gradient(closest-side, #ff5c39, transparent 70%)',
        }}
      />
      <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-14 sm:pt-28">
        <Reveal>
          <p className="font-mono text-[12px] text-faint">
            a chrome extension for people whose coding agent just shipped the feature
          </p>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="font-display mt-5 max-w-3xl text-5xl font-bold tracking-tight text-balance sm:text-7xl">
            point at what&rsquo;s{' '}
            <span className="whitespace-nowrap">
              <span className="relative inline-block">
                <span className="absolute -inset-x-2 -inset-y-1 rounded-lg border-2 border-accent bg-accent/[.08]" />
                <span className="absolute -top-6 -right-2 rounded bg-accent px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-normal text-bg">
                  h1 &gt; span
                </span>
                <span className="relative">broken</span>
              </span>
              .
            </span>{' '}
            say what&rsquo;s wrong.
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted">
            Gripe turns clicking through a half-broken UI into a folder of markdown + screenshots
            your coding agent can read. Hotkey, click the thing, talk — the note saves itself, with
            the CSS selector, the screenshots, and whatever the console threw at that exact moment.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#install"
              className="rounded-lg bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-bg transition-transform hover:-translate-y-0.5">
              install in two minutes
            </a>
            <a
              href="#walkthroughs"
              className="rounded-lg border border-line px-5 py-2.5 text-[13.5px] text-ink transition-colors hover:border-line-strong">
              watch it work ↓
            </a>
            <span className="flex items-center gap-2 font-mono text-[11px] text-faint">
              <Kbd hot>Alt</Kbd>+<Kbd hot>Shift</Kbd>+<Kbd hot>B</Kbd> arms it
            </span>
          </div>
        </Reveal>
        <Reveal delay={340} className="mt-14">
          <CaptureDemo />
          <p className="mt-3 text-center font-mono text-[11px] text-faint">
            no enter key. you stop talking, the bar drains, the note commits.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

function Problem() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <Reveal>
          <p className="font-display max-w-2xl text-2xl leading-snug font-semibold tracking-tight text-muted sm:text-[28px]">
            Your agent just built the feature. You&rsquo;re clicking through it and a dozen things
            are subtly off — <span className="text-ink">this button does nothing the second
            time</span>, <span className="text-ink">that column drifts</span>,{' '}
            <span className="text-ink">this list should be sorted</span>. Typing all that into a
            chat window is slow and lossy, and you&rsquo;ve forgotten the first one by the time you
            hit the third.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-8 font-mono text-[13px] text-accent-text">
            gripe turns it into a stream of consciousness →
          </p>
        </Reveal>
      </div>
    </section>
  )
}

const REPORT_LINES: Array<[cls: string, text: string]> = [
  ['text-accent-text', '## 1. Place order does nothing on the second click'],
  ['', ''],
  ['text-muted', '- **URL** `http://localhost:3000/checkout`'],
  ['text-muted', '- **Time** 14:32:11'],
  ['text-muted', '- **Element** `#submit`'],
  ['text-muted', '- **Element text** "Place order"'],
  ['text-muted', '- **Attributes** `data-testid="place-order"` `type="submit"`'],
  ['text-muted', '- **Box** 412,680 · 120×40'],
  ['text-muted', '- **Viewport** 1512×860 @2x · scrolled to 0,240'],
  ['', ''],
  ['text-faint', '![Note 1 — full viewport](01-full.png)'],
  ['text-faint', '![Note 1 — target close-up](01-target.png)'],
  ['', ''],
  ['text-faint', '<button id="submit" class="btn btn-primary">Place order</button>'],
  ['', ''],
  ['text-ink', '<details><summary>Console / network at capture time (2)</summary>'],
  ['', ''],
  ['text-accent-text', "[error] TypeError: Cannot read properties of undefined (reading 'id')"],
  ['text-accent-text', '        at Checkout.tsx:44'],
  ['text-accent-text', '[network] 500 Internal Server Error — /api/orders'],
  ['', ''],
  ['text-ink', '</details>'],
]

function Output() {
  return (
    <section id="output" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <Eyebrow n="01">the output</Eyebrow>
          <H2>a folder in your repo, not a chat scroll</H2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            Every session writes straight into the repo you connect — markdown built for a model to
            read, screenshots with the target spotlighted, and a close-up crop cut from the clean
            capture.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Reveal className="min-w-0">
            <div className="rounded-xl border border-line bg-raise/60 p-5">
              <p className="font-mono text-[11px] text-faint">your-app/</p>
              <pre className="mt-2 overflow-x-auto font-mono text-[12.5px] leading-7 text-muted">
                {`└─ gripes/
   └─ 2026-07-25-1432-checkout-flow/
      ├─ `}
                <span className="text-accent-text">report.md</span>
                {`        ← hand this to your agent
      ├─ notes.json       ← same thing, machine-readable
      ├─ 01-full.png      ← viewport, target spotlighted
      ├─ 01-target.png    ← close-up crop, upscaled
      └─ 02-full.png`}
              </pre>
            </div>
            <div className="mt-6 rounded-xl border border-accent/25 bg-accent-soft/40 p-5">
              <p className="font-mono text-[11px] tracking-[0.14em] text-accent-text uppercase">
                the sleeper feature
              </p>
              <p className="mt-2.5 text-[14px] leading-relaxed text-ink">
                A 90-line tap on the page&rsquo;s own <span className="font-mono text-[12.5px]">console.error</span>,{' '}
                <span className="font-mono text-[12.5px]">fetch</span> and{' '}
                <span className="font-mono text-[12.5px]">XHR</span> rides along with every note. You
                point at a button; the report already contains the TypeError that broke it.
              </p>
            </div>
            <div className="mt-6 rounded-xl border border-line p-5">
              <p className="text-[13.5px] leading-relaxed text-muted">
                Then paste the line Gripe put on your clipboard:
              </p>
              <p className="mt-3 border-l-2 border-line-strong pl-4 font-mono text-[12px] leading-relaxed text-faint">
                Read gripes/2026-07-25-1432-checkout-flow/report.md — it&rsquo;s a bug report I
                recorded while clicking through the running app, with screenshots. Look at every
                image, then fix what&rsquo;s described.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120} className="min-w-0">
            <div className="overflow-hidden rounded-xl border border-line bg-[#0d0d10]">
              <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
                <Mark size={13} />
                <span className="font-mono text-[11px] text-faint">
                  gripes/2026-07-25-1432-checkout-flow/report.md
                </span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[12px] leading-6">
                {REPORT_LINES.map(([cls, text], i) => (
                  <span key={i} className={`block ${cls || 'text-faint'}`}>
                    {text || ' '}
                  </span>
                ))}
              </pre>
            </div>
            <p className="mt-3 font-mono text-[11px] text-faint">
              written for a model to read, not a human to skim
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function Walkthroughs() {
  return (
    <section id="walkthroughs" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <Eyebrow n="02">video walkthroughs</Eyebrow>
          <H2>your agent can&rsquo;t watch video. record anyway.</H2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
            Hit record and just use the app, narrating as you go. Twice a second Gripe fingerprints
            the screen and throws away every frame where nothing changed —{' '}
            <span className="text-ink">the screenshots take themselves</span>, only at the moments
            that matter. Your words are stamped onto the timeline where you said them, console and
            network errors land where they fired, and when you stop, Whisper re-transcribes the
            audio on your machine and quietly fixes the rough draft. Watch it work:
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-10">
          <RecorderDemo />
          <p className="mt-3 text-center font-mono text-[11px] text-faint">
            an hour of poking around distills to ~150 screenshots, a stamped transcript, and one
            report.md
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-14">
          <div className="overflow-hidden rounded-2xl border border-line bg-raise/60 shadow-[0_24px_60px_-12px_rgba(0,0,0,.7)]">
            {/* the video slot — replace public/promo.mp4 with your own recording
                and this section doesn't change */}
            <video
              className="aspect-video w-full bg-[#0d0d10]"
              src="/promo.mp4"
              autoPlay
              muted
              loop
              playsInline
              controls
            />
          </div>
          <p className="mt-3 text-center font-mono text-[11px] text-faint">
            60 seconds · rendered with remotion
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-8">
          <pre className="overflow-x-auto rounded-xl border border-line bg-[#0d0d10] p-5 font-mono text-[12px] leading-6 text-muted">
            {`gripes/2026-07-26-1104-walkthrough/
├─ report.md          ← the timeline: what you said over what changed
├─ transcript.txt     ← every word, timestamped
├─ recording.json     ← machine-readable
├─ frames/            ← the deduped keyframes
├─ grids/             ← 3×3 contact sheets
└─ walkthrough.webm   ← the raw video, if anyone's nostalgic`}
          </pre>
        </Reveal>
      </div>
    </section>
  )
}

const CONTROLS: Array<[keys: ReactNode, what: string]> = [
  [
    <span key="k" className="flex flex-wrap gap-1">
      <Kbd hot>Alt</Kbd>
      <Kbd hot>Shift</Kbd>
      <Kbd hot>B</Kbd>
    </span>,
    'arm the picker',
  ],
  [
    <span key="k" className="flex flex-wrap gap-1">
      <Kbd hot>Alt</Kbd>
      <Kbd hot>Shift</Kbd>
      <Kbd hot>N</Kbd>
    </span>,
    'quick note about the whole page',
  ],
  [
    <span key="k" className="flex flex-wrap gap-1">
      <Kbd>E</Kbd>
      <Kbd>R</Kbd>
      <Kbd>D</Kbd>
      <Kbd>P</Kbd>
    </span>,
    'element / region / draw / page',
  ],
  [
    <span key="k" className="font-mono text-[12px] text-accent-text">
      &ldquo;save it&rdquo;
    </span>,
    'commit the note by voice',
  ],
  [<Kbd key="k">Enter</Kbd>, 'commit it by hand'],
  [
    <span key="k" className="flex flex-wrap gap-1">
      <Kbd>Ctrl</Kbd>
      <Kbd>Space</Kbd>
    </span>,
    'toggle the mic',
  ],
  [
    <span key="k" className="flex flex-wrap gap-1">
      <Kbd>Alt</Kbd>
      <span className="text-[12px] text-faint">+ click</span>
    </span>,
    'take the literal element, no climbing',
  ],
  [<Kbd key="k">Esc</Kbd>, 'bail out'],
]

function Controls() {
  return (
    <section id="controls" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Reveal>
            <Eyebrow n="03">controls</Eyebrow>
            <H2>you don&rsquo;t reach for the keyboard</H2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              Dictation starts on its own and survives your pauses — Chrome kills recognition on
              silence; Gripe restarts it under you. When you stop talking, a bar drains across the
              composer and the note commits. Keep talking, or touch a key, and it calls it off.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              Four ways to point: <span className="text-ink">element</span> hover-highlights DOM
              nodes and records the selector — clicking a button&rsquo;s inner label gets you the
              button, not the throwaway span. <span className="text-ink">Region</span> drags a box.{' '}
              <span className="text-ink">Draw</span> scribbles arrows on the page.{' '}
              <span className="text-ink">Page</span> is just a note about what you&rsquo;re looking
              at.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="divide-y divide-line rounded-xl border border-line">
              {CONTROLS.map(([keys, what], i) => (
                <div key={i} className="flex items-center justify-between gap-6 px-5 py-3">
                  {keys}
                  <span className="text-right text-[13px] text-muted">{what}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[11px] text-faint">
              the panel shows the shortcut chrome actually bound on your machine — click it to
              rebind
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <Eyebrow n="04">under the hood</Eyebrow>
          <H2>nothing leaves your machine</H2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            No accounts, no servers, no telemetry. The File System Access API writes straight into
            the repo folder you pick, Whisper runs in a worker next to your tabs, and the only
            runtime dependency is React — the ZIP writer, the PNG icon generator, and the
            screenshot compositor are all hand-rolled.
          </p>
        </Reveal>
        <Reveal delay={120} className="mt-10">
          <pre className="overflow-x-auto rounded-xl border border-line bg-[#0d0d10] p-6 font-mono text-[12px] leading-6 text-muted">
            {`content script ──┬─ shadow-DOM overlay: picker, marquee, ink canvas, composer
                 ├─ dictation, restarted through silences
                 └─ composites the capture: spotlight + box + strokes + crop
        │  chrome.runtime
        ▼
background SW ───┬─ tab capture (background-only API)
                 └─ IndexedDB: sessions, notes, image blobs
        │
        ▼
side panel ──────┬─ React view over that state
                 └─ File System Access: `}
            <span className="text-accent-text">writes straight into your repo</span>
          </pre>
        </Reveal>
      </div>
    </section>
  )
}

function Install() {
  return (
    <section id="install" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-2">
          <Reveal>
            <Eyebrow n="05">install</Eyebrow>
            <H2>two minutes, no store</H2>
            <ol className="mt-6 space-y-4 text-[14.5px] leading-relaxed text-muted">
              <li className="flex gap-4">
                <span className="font-mono text-[12px] text-accent">1</span>
                <span>
                  clone and build —{' '}
                  <span className="font-mono text-[13px] text-ink">
                    npm install && npm run build
                  </span>
                </span>
              </li>
              <li className="flex gap-4">
                <span className="font-mono text-[12px] text-accent">2</span>
                <span>
                  <span className="font-mono text-[13px] text-ink">chrome://extensions</span> →
                  developer mode → load unpacked → pick{' '}
                  <span className="font-mono text-[13px] text-ink">dist/</span>
                </span>
              </li>
              <li className="flex gap-4">
                <span className="font-mono text-[12px] text-accent">3</span>
                <span>
                  click the icon, hit <span className="text-ink">Connect folder</span>, choose your
                  repo — Chrome remembers it across restarts
                </span>
              </li>
            </ol>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href={GITHUB}
                className="rounded-lg bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-bg transition-transform hover:-translate-y-0.5">
                dested/gripe on GitHub
              </a>
              <span className="font-mono text-[11px] text-faint">MIT · no runtime deps but react</span>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="rounded-xl border border-line bg-raise/60 p-6">
              <p className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
                known edges
              </p>
              <ul className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-muted">
                <li>
                  won&rsquo;t run on <span className="font-mono text-[12.5px]">chrome://</span>{' '}
                  pages, the web store, or other extensions — chrome forbids it
                </li>
                <li>
                  dictation asks for mic permission per site; grant it once on your dev origin
                </li>
                <li>screenshots are the visible viewport — devtools aren&rsquo;t in frame</li>
                <li>
                  <span className="font-mono text-[12.5px]">gripes/</span> is yours to gitignore or
                  commit. nothing else in the folder you connect is ever touched
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-4 px-6 py-10">
        <span className="flex items-center gap-2.5">
          <Mark size={16} />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase">Gripe</span>
        </span>
        <p className="font-mono text-[11px] text-faint">
          point at what&rsquo;s broken. say what&rsquo;s wrong. hand the folder to your coding
          agent.
        </p>
        <div className="ml-auto flex items-center gap-6 font-mono text-[11px] text-faint">
          <a href={GITHUB} className="transition-colors hover:text-ink">
            github
          </a>
          <a href="https://dested.com" className="transition-colors hover:text-ink">
            dested.com
          </a>
          <span>MIT</span>
        </div>
      </div>
    </footer>
  )
}

export function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Output />
        <Walkthroughs />
        <Controls />
        <HowItWorks />
        <Install />
      </main>
      <Footer />
    </>
  )
}
