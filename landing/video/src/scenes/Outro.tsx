import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, FONT_DISPLAY, FONT_MONO } from '../theme'
import { Mark } from '../ui'

export const OUTRO_DUR = 170

export const Outro = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const markIn = spring({ frame, fps, delay: 4, config: { damping: 14 } })
  const line1 = spring({ frame, fps, delay: 18, config: { damping: 200 } })
  const line2 = spring({ frame, fps, delay: 34, config: { damping: 200 } })
  const urlIn = spring({ frame, fps, delay: 58, config: { damping: 16 } })
  const metaIn = spring({ frame, fps, delay: 76, config: { damping: 200 } })

  const pulse = 1 + 0.03 * Math.sin((frame / fps) * Math.PI * 2 * 0.7)

  return (
    <AbsoluteFill
      style={{ background: C.bg, alignItems: 'center', justifyContent: 'center', gap: 36 }}>
      <div style={{ transform: `scale(${markIn * pulse})` }}>
        <Mark size={96} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: C.ink,
            opacity: line1,
            transform: `translateY(${(1 - line1) * 16}px)`,
          }}>
          point at what&rsquo;s broken. say what&rsquo;s wrong.
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 44,
            fontWeight: 600,
            color: C.muted,
            marginTop: 18,
            opacity: line2,
            transform: `translateY(${(1 - line2) * 14}px)`,
          }}>
          hand the folder to your coding agent.
        </div>
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 30,
          fontWeight: 600,
          color: '#0a0a0c',
          background: C.ink,
          borderRadius: 14,
          padding: '16px 40px',
          opacity: urlIn,
          transform: `scale(${0.94 + urlIn * 0.06})`,
        }}>
        gripe.dested.com
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 21,
          color: C.faint,
          opacity: metaIn,
        }}>
        MIT · github.com/dested/gripe · no accounts, no servers, nothing leaves your machine
      </div>
    </AbsoluteFill>
  )
}
