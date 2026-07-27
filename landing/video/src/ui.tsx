import type { CSSProperties, ReactNode } from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { C, FONT_MONO } from './theme'

// The Gripe reticle mark.
export const Mark = ({ size = 64 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="13" fill="none" stroke={C.accent} strokeWidth="4.2" />
    <circle cx="16" cy="16" r="5.4" fill={C.accent} />
  </svg>
)

// "This is live" — a dot with the extension's pulse ring, driven by the clock.
export const LiveDot = ({ size = 14 }: { size?: number }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = (frame / (1.6 * fps)) % 1
  const ring = Math.min(t / 0.7, 1)
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div
        style={{
          position: 'absolute',
          inset: -ring * size * 0.9,
          borderRadius: 999,
          border: `2px solid rgba(255,92,57,${0.5 * (1 - ring)})`,
        }}
      />
      <div
        style={{ position: 'absolute', inset: 0, borderRadius: 999, background: C.accent }}
      />
    </div>
  )
}

export const Kbd = ({ children, hot = false }: { children: ReactNode; hot?: boolean }) => (
  <span
    style={{
      fontFamily: FONT_MONO,
      fontSize: 22,
      padding: '4px 12px',
      borderRadius: 8,
      border: `1.5px solid ${hot ? 'rgba(255,92,57,0.4)' : C.lineStrong}`,
      background: hot ? C.accentSoft : 'rgba(255,255,255,0.04)',
      color: hot ? C.accentText : C.muted,
    }}>
    {children}
  </span>
)

// The one elevated surface treatment — Gripe's .glass, verbatim values.
export const glass: CSSProperties = {
  background: 'rgba(12,12,14,0.88)',
  border: `1px solid ${C.lineStrong}`,
  borderRadius: 22,
  boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 24px 60px -12px rgba(0,0,0,0.7)',
}

export const Eyebrow = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      fontFamily: FONT_MONO,
      fontSize: 24,
      letterSpacing: '0.22em',
      textTransform: 'uppercase',
      color: C.faint,
    }}>
    {children}
  </div>
)
