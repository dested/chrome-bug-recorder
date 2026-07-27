import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, FONT_DISPLAY, FONT_MONO } from '../theme'
import { Mark } from '../ui'

export const REPORT_DUR = 330

const LINES: Array<[color: string, text: string]> = [
  ['accentText', '## 1. Place order does nothing on the second click'],
  ['', ''],
  ['muted', '- **URL** `http://localhost:3000/checkout`'],
  ['muted', '- **Time** 14:32:11'],
  ['muted', '- **Element** `#submit`'],
  ['muted', '- **Element text** "Place order"'],
  ['muted', '- **Attributes** `data-testid="place-order"` `type="submit"`'],
  ['muted', '- **Box** 412,680 · 120×40 · **Viewport** 1512×860 @2x'],
  ['', ''],
  ['faint', '![Note 1 — full viewport](01-full.png)'],
  ['faint', '![Note 1 — target close-up](01-target.png)'],
  ['', ''],
  ['faint', '<button id="submit" class="btn btn-primary">Place order</button>'],
  ['', ''],
  ['ink', '<details><summary>Console / network at capture time (2)</summary>'],
  ['', ''],
  ['accentText', "[error] TypeError: Cannot read properties of undefined"],
  ['accentText', "        (reading 'id') at Checkout.tsx:44"],
  ['accentText', '[network] 500 Internal Server Error — /api/orders'],
  ['', ''],
  ['ink', '</details>'],
]

const colorOf = (key: string) =>
  key === 'accentText' ? C.accentText : key === 'muted' ? C.muted : key === 'ink' ? C.ink : C.faint

export const Report = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const windowIn = spring({ frame, fps, delay: 2, config: { damping: 200 } })
  const rightIn = spring({ frame, fps, delay: 60, config: { damping: 200 } })
  const sleeperIn = spring({ frame, fps, delay: 150, config: { damping: 16 } })
  const pasteIn = spring({ frame, fps, delay: 245, config: { damping: 200 } })

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {/* report.md window */}
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 90,
          width: 1040,
          height: 900,
          background: C.panel,
          border: `1px solid ${C.line}`,
          borderRadius: 24,
          overflow: 'hidden',
          opacity: windowIn,
          transform: `translateY(${(1 - windowIn) * 20}px)`,
        }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '18px 28px',
            borderBottom: `1px solid ${C.line}`,
          }}>
          <Mark size={26} />
          <span style={{ fontFamily: FONT_MONO, fontSize: 20, color: C.faint }}>
            gripes/2026-07-25-1432-checkout-flow/report.md
          </span>
        </div>
        <div style={{ padding: '30px 36px' }}>
          {LINES.map(([key, text], i) => {
            const s = spring({ frame, fps, delay: 14 + i * 3, config: { damping: 200 } })
            const isConsole = key === 'accentText' && i > 10
            return (
              <div
                key={i}
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 21.5,
                  lineHeight: '36px',
                  whiteSpace: 'pre',
                  color: colorOf(key),
                  opacity: s,
                  transform: `translateY(${(1 - s) * 8}px)`,
                  background: isConsole
                    ? `rgba(255,92,57,${0.1 * sleeperIn})`
                    : undefined,
                }}>
                {text || ' '}
              </div>
            )
          })}
        </div>
      </div>

      {/* right column */}
      <div
        style={{
          position: 'absolute',
          left: 1240,
          top: 170,
          width: 580,
          display: 'flex',
          flexDirection: 'column',
          gap: 44,
        }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: C.ink,
            opacity: rightIn,
            transform: `translateY(${(1 - rightIn) * 16}px)`,
          }}>
          written for a model to read, not a human to skim
        </div>

        <div
          style={{
            border: `1.5px solid rgba(255,92,57,0.3)`,
            background: C.accentSoft,
            borderRadius: 18,
            padding: '28px 30px',
            opacity: sleeperIn,
            transform: `translateY(${(1 - sleeperIn) * 16}px)`,
          }}>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 20,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: C.accentText,
            }}>
            the sleeper feature
          </div>
          <div style={{ marginTop: 14, fontSize: 27, lineHeight: 1.5, color: C.ink }}>
            you pointed at a button. the report already contains the TypeError that broke it —
            console and network are tapped at capture time.
          </div>
        </div>

        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 23,
            lineHeight: 1.7,
            color: C.muted,
            borderLeft: `3px solid ${C.lineStrong}`,
            paddingLeft: 26,
            opacity: pasteIn,
            transform: `translateY(${(1 - pasteIn) * 12}px)`,
          }}>
          &gt; Read gripes/…/report.md — look at every image, then fix what&rsquo;s described.
          <div style={{ marginTop: 10, color: C.faint, fontSize: 20 }}>
            ← the prompt is already on your clipboard
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
