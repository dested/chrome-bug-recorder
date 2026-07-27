import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, FONT_DISPLAY, FONT_MONO } from '../theme'
import { Mark } from '../ui'

export const TITLE_DUR = 120

export const Title = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const markIn = spring({ frame, fps, delay: 5, config: { damping: 14 } })
  const wordIn = spring({ frame, fps, delay: 22, config: { damping: 200 } })
  const tagIn = spring({ frame, fps, delay: 40, config: { damping: 200 } })

  const pulse = 1 + 0.03 * Math.sin((frame / fps) * Math.PI * 2 * 0.7)

  return (
    <AbsoluteFill
      style={{ background: C.bg, alignItems: 'center', justifyContent: 'center', gap: 44 }}>
      <div style={{ transform: `scale(${markIn * pulse})` }}>
        <Mark size={120} />
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 34,
          fontWeight: 600,
          letterSpacing: '0.42em',
          textTransform: 'uppercase',
          color: C.ink,
          opacity: wordIn,
          transform: `translateY(${(1 - wordIn) * 14}px)`,
          marginLeft: '0.42em',
        }}>
        Gripe
      </div>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 44,
          fontWeight: 600,
          color: C.muted,
          opacity: tagIn,
          transform: `translateY(${(1 - tagIn) * 14}px)`,
        }}>
        point at what&rsquo;s broken. say what&rsquo;s wrong.
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(900px 500px at 50% -10%, rgba(255,92,57,${
            0.12 * interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' })
          }), transparent 70%)`,
        }}
      />
    </AbsoluteFill>
  )
}
