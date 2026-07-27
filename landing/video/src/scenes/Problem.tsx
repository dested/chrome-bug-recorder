import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, FONT_DISPLAY, FONT_MONO } from '../theme'

export const PROBLEM_DUR = 240

const GRIPES = [
  'this button does nothing the second time',
  'that column drifts when the table refreshes',
  'this list should be sorted by date',
]

export const Problem = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const line1 = spring({ frame, fps, delay: 4, config: { damping: 200 } })
  const line2 = spring({ frame, fps, delay: 40, config: { damping: 200 } })

  return (
    <AbsoluteFill
      style={{ background: C.bg, justifyContent: 'center', padding: '0 200px', gap: 56 }}>
      <div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: C.ink,
            opacity: line1,
            transform: `translateY(${(1 - line1) * 20}px)`,
          }}>
          your agent just shipped the feature.
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: C.muted,
            opacity: line2,
            transform: `translateY(${(1 - line2) * 20}px)`,
            marginTop: 10,
          }}>
          you click through it — a dozen things are off.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {GRIPES.map((g, i) => {
          const s = spring({ frame, fps, delay: 92 + i * 26, config: { damping: 16 } })
          return (
            <div
              key={g}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                opacity: s,
                transform: `translateX(${(1 - s) * -30}px)`,
              }}>
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 24,
                  fontWeight: 600,
                  color: C.accent,
                  border: `1.5px solid rgba(255,92,57,0.35)`,
                  background: C.accentSoft,
                  borderRadius: 8,
                  padding: '4px 14px',
                }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 32, color: C.ink }}>{g}</span>
            </div>
          )
        })}
      </div>

      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 26,
          color: C.faint,
          opacity: spring({ frame, fps, delay: 185, config: { damping: 200 } }),
        }}>
        typing all that into a chat window is slow, lossy, and you forget half of it.
      </div>
    </AbsoluteFill>
  )
}
