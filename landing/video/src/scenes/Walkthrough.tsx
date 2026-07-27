import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, FONT_DISPLAY, FONT_MONO } from '../theme'
import { Eyebrow, LiveDot } from '../ui'

export const WALKTHROUGH_DUR = 360

// Deterministic pseudo-layouts for the fake keyframes — no Math.random.
const FRAMES = [
  { ts: '00:04', bars: [0.9, 0.5, 0.7] },
  { ts: '00:09', bars: [0.4, 0.8, 0.6] },
  { ts: '00:15', bars: [0.7, 0.7, 0.3] },
  { ts: '00:22', bars: [0.55, 0.35, 0.8] },
  { ts: '00:31', bars: [0.8, 0.6, 0.5] },
  { ts: '00:38', bars: [0.3, 0.75, 0.65] },
  { ts: '00:47', bars: [0.65, 0.45, 0.75] },
  { ts: '00:55', bars: [0.5, 0.85, 0.4] },
  { ts: '01:02', bars: [0.75, 0.55, 0.6] },
]

const TRANSCRIPT = [
  ['00:04', 'so this is the new checkout flow'],
  ['00:15', 'adding to cart works but watch the total'],
  ['00:31', "it didn't update until i refreshed"],
  ['00:47', 'and the coupon field just swallowed the code'],
]

const STATS = ['whisper-small.en · on-device', '64×64 cell dedup', '≤150 frames', '3×3 grids']

export const Walkthrough = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const headIn = spring({ frame, fps, delay: 2, config: { damping: 200 } })
  const recIn = spring({ frame, fps, delay: 14, config: { damping: 16 } })

  return (
    <AbsoluteFill style={{ background: C.bg, padding: '80px 120px' }}>
      <div style={{ opacity: headIn, transform: `translateY(${(1 - headIn) * 14}px)` }}>
        <Eyebrow>02 · video walkthroughs</Eyebrow>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 66,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: C.ink,
            marginTop: 16,
          }}>
          record the screen. ship the distilled version.
        </div>
      </div>

      {/* rec pill */}
      <div
        style={{
          position: 'absolute',
          top: 92,
          right: 120,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          border: `1.5px solid rgba(255,92,57,0.35)`,
          background: C.accentSoft,
          borderRadius: 999,
          padding: '12px 26px',
          opacity: recIn,
          transform: `scale(${0.9 + recIn * 0.1})`,
        }}>
        <LiveDot />
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '0.14em',
            color: C.accentText,
          }}>
          REC 01:02
        </span>
      </div>

      <div style={{ display: 'flex', gap: 60, marginTop: 60 }}>
        {/* 3×3 contact sheet */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 300px)',
            gap: 18,
          }}>
          {FRAMES.map((f, i) => {
            const s = spring({ frame, fps, delay: 34 + i * 9, config: { damping: 15 } })
            return (
              <div
                key={f.ts}
                style={{
                  width: 300,
                  height: 176,
                  background: C.panel,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  padding: 14,
                  position: 'relative',
                  opacity: s,
                  transform: `scale(${0.9 + s * 0.1})`,
                }}>
                <div
                  style={{
                    height: 14,
                    width: 120,
                    borderRadius: 4,
                    background: 'rgba(255,255,255,0.10)',
                  }}
                />
                {f.bars.map((w, j) => (
                  <div
                    key={j}
                    style={{
                      height: 22,
                      width: `${w * 100}%`,
                      marginTop: 14,
                      borderRadius: 5,
                      background: 'rgba(255,255,255,0.05)',
                      border: `1px solid ${C.line}`,
                    }}
                  />
                ))}
                <div
                  style={{
                    position: 'absolute',
                    right: 10,
                    bottom: 8,
                    fontFamily: FONT_MONO,
                    fontSize: 17,
                    color: C.faint,
                  }}>
                  {f.ts}
                </div>
              </div>
            )
          })}
        </div>

        {/* transcript + stats */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 26 }}>
          {TRANSCRIPT.map(([ts, text], i) => {
            const s = spring({ frame, fps, delay: 130 + i * 22, config: { damping: 200 } })
            return (
              <div
                key={ts}
                style={{
                  display: 'flex',
                  gap: 22,
                  alignItems: 'baseline',
                  opacity: s,
                  transform: `translateX(${(1 - s) * -20}px)`,
                }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 21, color: C.accentText }}>
                  [{ts}]
                </span>
                <span style={{ fontSize: 28, color: C.ink }}>{text}</span>
              </div>
            )
          })}

          <div
            style={{
              marginTop: 20,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 14,
            }}>
            {STATS.map((stat, i) => {
              const s = spring({ frame, fps, delay: 230 + i * 12, config: { damping: 16 } })
              return (
                <span
                  key={stat}
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 21,
                    color: C.accentText,
                    border: `1px solid rgba(255,92,57,0.3)`,
                    background: C.accentSoft,
                    borderRadius: 999,
                    padding: '9px 22px',
                    opacity: s,
                    transform: `scale(${0.92 + s * 0.08})`,
                  }}>
                  {stat}
                </span>
              )
            })}
          </div>

          <div
            style={{
              marginTop: 12,
              fontSize: 27,
              lineHeight: 1.55,
              color: C.muted,
              opacity: spring({ frame, fps, delay: 290, config: { damping: 200 } }),
            }}>
            your agent can&rsquo;t watch a video. it can read a timeline of what you said over
            what changed — with every console error stamped where it fired.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
