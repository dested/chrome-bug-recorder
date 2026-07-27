import { useEffect, useState } from 'react'
import '~/styles/recorder.css'

// A scripted, looping recreation of a walkthrough recording. Everything below
// is a pure function of `t` (ms into the loop) so SSR renders the idle state
// and the client just runs the clock.
//
// Loop (26s):  0–1s idle · 1–19s recording (screen time runs 0:00→1:02,
// sampler chips every 450ms, most dropped, 9 kept → grid + flash) ·
// 19–21.5s on-device whisper pass rewrites the draft lines · 21.5–25s the
// folder line lands · fade, repeat.

const LOOP = 26000
const REC_START = 1000
const REC_END = 19000
const REC_SECONDS = 62
const CHIP_MS = 450
const CHIP_COUNT = Math.floor((REC_END - REC_START) / CHIP_MS)

// Moments (in screen seconds) where the screen actually changes — these are
// the frames the dedup keeps.
const KEEPS = [0, 7, 14, 22, 31, 38, 47, 52, 58]

const LINES: Array<{
  at: number
  draft: string
  final: string
  event?: boolean
}> = [
  { at: 4, draft: 'so this is the new check out flow', final: 'so this is the new checkout flow' },
  {
    at: 15,
    draft: 'adding to cart works but watch the total',
    final: 'adding to cart works but watch the total',
  },
  {
    at: 31,
    draft: "it didn't update untill i refresh",
    final: "it didn't update until i refreshed",
  },
  {
    at: 31.5,
    draft: '[error] TypeError: cart.total is undefined — Cart.tsx:31',
    final: '[error] TypeError: cart.total is undefined — Cart.tsx:31',
    event: true,
  },
  {
    at: 47,
    draft: 'and the coupon field just swallow the code',
    final: 'and the coupon field just swallowed the code',
  },
  {
    at: 48,
    draft: '[network] 400 Bad Request — /api/coupon',
    final: '[network] 400 Bad Request — /api/coupon',
    event: true,
  },
]

const CELL_BARS = [
  [0.9, 0.5],
  [0.4, 0.8],
  [0.7, 0.3],
  [0.55, 0.75],
  [0.8, 0.45],
  [0.35, 0.65],
  [0.6, 0.85],
  [0.5, 0.4],
  [0.75, 0.6],
]

const fmt = (s: number) => `0${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function RecorderDemo() {
  const [t, setT] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setT(23000) // static end state: full grid, final transcript, folder line
      return
    }
    const start = performance.now()
    const id = setInterval(() => setT((performance.now() - start) % LOOP), 100)
    return () => clearInterval(id)
  }, [])

  const recording = t >= REC_START && t < REC_END
  const screenSec = recording
    ? ((t - REC_START) / (REC_END - REC_START)) * REC_SECONDS
    : t >= REC_END
      ? REC_SECONDS
      : 0

  const chipCount = recording
    ? Math.min(CHIP_COUNT, Math.floor((t - REC_START) / CHIP_MS))
    : t >= REC_END
      ? CHIP_COUNT
      : 0

  // A chip is "kept" iff a keep moment falls inside its sampling interval —
  // exactly one lit chip per kept frame, so the strip and counter agree.
  const chipSec = (i: number) => ((i * CHIP_MS) / (REC_END - REC_START)) * REC_SECONDS
  const chipKept = (i: number) => KEEPS.some((k) => k >= chipSec(i) && k < chipSec(i + 1))
  const keptSoFar = KEEPS.filter((k) => k <= screenSec).length
  const lastChip = chipCount - 1
  const lastKept = lastChip >= 0 && chipKept(lastChip)

  // screen phases
  const totalWrong = screenSec >= 22 && screenSec < 38
  const errorToast = screenSec >= 31 && screenSec < 38
  const couponText =
    screenSec < 40 ? '' : 'SAVE10'.slice(0, Math.max(0, Math.floor((screenSec - 40) * 3)))
  const flashOn = recording && KEEPS.some((k) => screenSec >= k && screenSec < k + 0.9)

  // whisper pass
  const whisperOn = t >= REC_END && t < 21500
  const whisperP = whisperOn ? (t - REC_END) / 2500 : t >= 21500 ? 1 : 0
  const doneOn = t >= 21800 && t < 25400

  const visibleLines = LINES.filter((l) => l.at <= screenSec && t >= REC_START)
  const lineFinal = (idx: number) => whisperP >= (idx + 1) / LINES.length

  return (
    <div className="rec" aria-hidden="true">
      <div className="rec-head">
        <span className={`rec-pill ${recording ? '' : 'is-idle'}`}>
          {recording && <span className="rec-dot" />}
          {recording ? `REC ${fmt(screenSec)}` : t < REC_START ? 'ready' : `stopped · ${fmt(REC_SECONDS)}`}
        </span>
        <span className="rec-head-note">
          sampling twice a second · keeping only what changed
        </span>
      </div>

      <div className="rec-body">
        {/* ————— the screen being recorded ————— */}
        <div className="rec-screen-wrap">
          <div className="rec-screen">
            <h5>Checkout</h5>
            <div className="rec-screen-rows">
              <div className="rec-screen-row">
                <span>Field notes tee · black / M</span>
                <span className="rec-price">$28.00</span>
              </div>
              <div className="rec-screen-row">
                <span>Sticker pack ×2</span>
                <span className="rec-price">{screenSec >= 7 ? '$8.00' : '—'}</span>
              </div>
              <div className="rec-screen-row">
                <span style={{ color: 'var(--color-ink)', fontWeight: 600 }}>Total</span>
                <span className={`rec-price ${totalWrong ? 'is-wrong' : ''}`}>
                  {screenSec >= 38 ? '$36.00' : screenSec >= 7 ? '$28.00' : '$28.00'}
                </span>
              </div>
            </div>
            <div className="rec-coupon">
              <span className="rec-coupon-field">{couponText}</span>
              <span className="rec-coupon-btn">Apply</span>
            </div>
            <div
              className="rec-toast"
              style={{ opacity: errorToast ? 1 : 0, translate: errorToast ? '0 0' : '0 6px' }}>
              something went wrong
            </div>
            <div className="rec-flash" style={{ opacity: flashOn ? 1 : 0 }} />
          </div>

          <div className="rec-strip-label">
            <span>the sampler, live</span>
            <span className={`rec-verdict ${lastKept ? 'is-keep' : ''}`}>
              {chipCount === 0
                ? '—'
                : lastKept
                  ? 'kept — 23 of 4096 cells changed'
                  : 'dropped — Δ under 8 cells'}
            </span>
          </div>
          <div className="rec-strip">
            {Array.from({ length: CHIP_COUNT }, (_, i) => (
              <span
                key={i}
                className={`rec-chip ${i < chipCount && chipKept(i) ? 'is-kept' : ''}`}
                style={{ opacity: i < chipCount ? 1 : 0.18 }}
              />
            ))}
          </div>
          <div className="rec-counters">
            <span>
              sampled <b>{chipCount}</b>
            </span>
            <span>
              kept <b className="rec-kept-n">{t >= REC_START ? keptSoFar : 0}</b>
            </span>
            <span>
              dropped{' '}
              <b>{Math.max(0, chipCount - (t >= REC_START ? keptSoFar : 0))}</b>
            </span>
          </div>
        </div>

        {/* ————— what gripe is building ————— */}
        <div className="rec-out">
          <div>
            <div className="rec-out-label">grids/ — contact sheet</div>
            <div className="rec-grid" style={{ marginTop: 8 }}>
              {CELL_BARS.map((bars, i) => {
                const filled = t >= REC_START && KEEPS[i] <= screenSec
                const isNew = filled && recording && screenSec - KEEPS[i] < 2
                return (
                  <div
                    key={i}
                    className={`rec-cell ${filled ? 'is-filled' : ''} ${isNew ? 'is-new' : ''}`}>
                    {filled && (
                      <>
                        <div className="rec-cell-bars">
                          <i style={{ width: `${bars[0] * 100}%` }} />
                          <i style={{ width: `${bars[1] * 100}%` }} />
                        </div>
                        <span className="rec-cell-ts">{fmt(KEEPS[i])}</span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <div className="rec-out-label">transcript — stamped where you said it</div>
            <div className="rec-lines" style={{ marginTop: 8 }}>
              {LINES.map((l, i) => {
                const visible = visibleLines.includes(l)
                const final = lineFinal(i)
                return (
                  <div
                    key={i}
                    className={`rec-line ${visible ? 'is-in' : ''} ${final ? 'is-final' : ''} ${
                      l.event ? 'is-event' : ''
                    }`}>
                    <span className="rec-ts">[{fmt(l.at)}]</span>
                    <span className="rec-text">{final ? l.final : l.draft}</span>
                    {!l.event && <span className="rec-tick">✓ whisper</span>}
                  </div>
                )
              })}
            </div>
          </div>

          <div className={`rec-whisper ${whisperOn ? 'is-on' : ''}`}>
            <span>whisper-small.en · transcribing on-device</span>
            <span className="rec-whisper-bar">
              <i style={{ width: `${whisperP * 100}%` }} />
            </span>
          </div>

          <div className={`rec-done ${doneOn ? 'is-in' : ''}`}>
            → gripes/2026-07-26-1104-walkthrough/ · report.md + 9 frames + grids/ +
            transcript.txt
          </div>
        </div>
      </div>
    </div>
  )
}
