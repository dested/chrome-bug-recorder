import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { C, FONT_DISPLAY, FONT_MONO, FONT_SANS } from '../theme'
import { Kbd, LiveDot, glass } from '../ui'

export const CAPTURE_DUR = 560

// Browser window geometry (screen coords, 1920×1080 canvas)
const BX = 210
const BY = 90
const BW = 1500
const BH = 800

const TRANSCRIPT = 'place order does nothing the second time i click it'

export const Capture = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const windowIn = spring({ frame, fps, delay: 2, config: { damping: 200 } })

  // hotkey chip → hint chip
  const hotkeyIn = spring({ frame, fps, delay: 14, config: { damping: 16 } })
  const hotkeyOut = spring({ frame, fps, delay: 52, config: { damping: 200 } })
  const hintIn = spring({ frame, fps, delay: 58, config: { damping: 16 } })
  const hintOut = spring({ frame, fps, delay: 128, config: { damping: 200 } })

  // cursor flight → click
  const cursorX = interpolate(frame, [62, 106], [560, 1518], {
    easing: Easing.inOut(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const cursorY = interpolate(frame, [62, 106], [1010, 585], {
    easing: Easing.inOut(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const cursorIn = interpolate(frame, [58, 66], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const cursorOut = interpolate(frame, [126, 136], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const click = spring({ frame, fps, delay: 108, durationInFrames: 12, config: { damping: 12 } })
  const pressScale = 1 - 0.06 * Math.sin(click * Math.PI)

  // target highlight + tag
  const targetIn = spring({ frame, fps, delay: 112, config: { damping: 14 } })
  const targetOut = spring({ frame, fps, delay: 430, config: { damping: 200 } })

  // composer lifecycle
  const composerIn = spring({ frame, fps, delay: 134, config: { damping: 18 } })
  const composerOut = spring({ frame, fps, delay: 404, config: { damping: 200 } })
  const chars = Math.round(
    interpolate(frame, [152, 322], [0, TRANSCRIPT.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )
  const caretOn = Math.floor(frame / 16) % 2 === 0
  const drain = interpolate(frame, [332, 402], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const drainVisible = frame >= 330 && frame < 404

  // saved toast
  const toastIn = spring({ frame, fps, delay: 410, config: { damping: 15 } })
  const toastOut = spring({ frame, fps, delay: 466, config: { damping: 200 } })

  // closing caption
  const captionIn = spring({ frame, fps, delay: 486, config: { damping: 200 } })

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT_SANS }}>
      {/* ————— browser window ————— */}
      <div
        style={{
          position: 'absolute',
          left: BX,
          top: BY,
          width: BW,
          height: BH,
          background: C.panel,
          border: `1px solid ${C.line}`,
          borderRadius: 24,
          boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset',
          opacity: windowIn,
          transform: `scale(${0.97 + windowIn * 0.03})`,
        }}>
        {/* titlebar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            height: 68,
            padding: '0 26px',
            borderBottom: `1px solid ${C.line}`,
          }}>
          <div style={{ display: 'flex', gap: 9 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.12)',
                }}
              />
            ))}
          </div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 20,
              color: C.faint,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: '5px 18px',
            }}>
            localhost:3000/checkout
          </div>
        </div>

        {/* the app */}
        <div style={{ padding: '44px 60px' }}>
          <div style={{ fontSize: 40, fontWeight: 650, color: C.ink }}>Checkout</div>
          <div
            style={{
              marginTop: 30,
              border: `1px solid ${C.line}`,
              borderRadius: 16,
            }}>
            {(
              [
                ['Field notes tee · black / M', '$28.00', true],
                ['Shipping', '$4.00', false],
                ['Total', '$32.00', true],
              ] as const
            ).map(([label, price, strong], i) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '22px 30px',
                  borderTop: i > 0 ? `1px solid ${C.line}` : 'none',
                  fontSize: 26,
                  color: strong ? C.ink : C.muted,
                  fontWeight: strong ? 600 : 400,
                }}>
                <span>{label}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 24, color: C.muted }}>
                  {price}
                </span>
              </div>
            ))}
          </div>

          {/* the target */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 40 }}>
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  fontSize: 27,
                  fontWeight: 600,
                  color: '#0a0a0c',
                  background: '#e8e4e0',
                  borderRadius: 14,
                  padding: '18px 38px',
                  transform: `scale(${pressScale})`,
                }}>
                Place order
              </div>
              {/* highlight box */}
              <div
                style={{
                  position: 'absolute',
                  inset: -11,
                  border: `3.5px solid ${C.accent}`,
                  borderRadius: 18,
                  background: 'rgba(255,92,57,0.08)',
                  opacity: targetIn * (1 - targetOut),
                  transform: `scale(${0.94 + targetIn * 0.06})`,
                }}
              />
              {/* selector tag */}
              <div
                style={{
                  position: 'absolute',
                  right: -11,
                  top: -56,
                  fontFamily: FONT_MONO,
                  fontSize: 22,
                  fontWeight: 500,
                  color: '#0a0a0c',
                  background: C.accent,
                  borderRadius: 8,
                  padding: '4px 14px',
                  opacity: targetIn * (1 - targetOut),
                  transform: `translateY(${(1 - targetIn) * 8}px)`,
                }}>
                #submit
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ————— hotkey chip ————— */}
      <div
        style={{
          position: 'absolute',
          top: 160,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: hotkeyIn * (1 - hotkeyOut),
          transform: `translateY(${(1 - hotkeyIn) * 12}px)`,
        }}>
        <div
          style={{
            ...glass,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '16px 30px',
          }}>
          <Kbd hot>Alt</Kbd>
          <span style={{ color: C.faint, fontSize: 24 }}>+</span>
          <Kbd hot>Shift</Kbd>
          <span style={{ color: C.faint, fontSize: 24 }}>+</span>
          <Kbd hot>B</Kbd>
        </div>
      </div>

      {/* ————— armed hint chip ————— */}
      <div
        style={{
          position: 'absolute',
          top: 160,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: hintIn * (1 - hintOut),
          transform: `translateY(${(1 - hintIn) * 12}px)`,
        }}>
        <div
          style={{
            ...glass,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '16px 32px',
          }}>
          <LiveDot />
          <span style={{ fontSize: 26, color: C.ink }}>click what&rsquo;s wrong</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <Kbd>E</Kbd>
            <Kbd>R</Kbd>
            <Kbd>D</Kbd>
            <Kbd>P</Kbd>
            <Kbd>esc</Kbd>
          </span>
        </div>
      </div>

      {/* ————— cursor ————— */}
      <svg
        width={38}
        height={42}
        viewBox="0 0 20 22"
        style={{
          position: 'absolute',
          left: cursorX,
          top: cursorY,
          opacity: cursorIn * cursorOut,
          transform: `scale(${pressScale})`,
        }}>
        <path
          d="M3 1.5L16.5 12.5L10 13.5L13 20L10 21.5L7 14.5L3 18.5V1.5Z"
          fill="#f2efec"
          stroke="#0a0a0c"
          strokeWidth="1.4"
        />
      </svg>

      {/* ————— composer ————— */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 118,
          width: 1040,
          marginLeft: -520,
          ...glass,
          padding: '26px 32px 22px',
          overflow: 'hidden',
          opacity: composerIn * (1 - composerOut),
          transform: `translateY(${(1 - composerIn) * 24}px) scale(${
            1 - composerOut * 0.02
          })`,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <LiveDot size={16} />
          <span style={{ fontSize: 30, color: C.ink, whiteSpace: 'pre' }}>
            {TRANSCRIPT.slice(0, chars)}
            <span
              style={{
                display: 'inline-block',
                width: 3,
                height: 30,
                verticalAlign: -4,
                background: C.accent,
                opacity: caretOn ? 1 : 0,
              }}
            />
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 28,
            marginTop: 18,
            fontFamily: FONT_MONO,
            fontSize: 20,
            color: C.faint,
          }}>
          <span style={{ color: C.accentText }}>#submit</span>
          <span>&ldquo;Place order&rdquo;</span>
          <span>14:32:11</span>
          <span>2 console events</span>
        </div>
        {drainVisible && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              height: 4,
              width: '100%',
              transformOrigin: 'left',
              transform: `scaleX(${drain})`,
              background: `linear-gradient(90deg, ${C.accent}, rgba(255,92,57,0.4))`,
            }}
          />
        )}
      </div>

      {/* ————— saved toast ————— */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 130,
          display: 'flex',
          justifyContent: 'center',
          opacity: toastIn * (1 - toastOut),
          transform: `translateY(${(1 - toastIn) * 16}px)`,
        }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            background: C.ink,
            color: '#0a0a0c',
            borderRadius: 999,
            padding: '15px 32px',
            fontSize: 25,
            fontWeight: 600,
          }}>
          <svg width={22} height={22} viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6.2L4.8 9L10 3.2"
              stroke="#0a0a0c"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          note 1 saved
          <span
            style={{
              fontFamily: FONT_MONO,
              fontWeight: 500,
              fontSize: 20,
              color: 'rgba(10,10,12,0.6)',
            }}>
            01-full.png · 01-target.png
          </span>
        </div>
      </div>

      {/* ————— closing caption ————— */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 34,
          textAlign: 'center',
          fontFamily: FONT_DISPLAY,
          fontSize: 40,
          fontWeight: 600,
          color: C.muted,
          opacity: captionIn,
          transform: `translateY(${(1 - captionIn) * 12}px)`,
        }}>
        you stopped talking. it committed. you never touched the keyboard.
      </div>
    </AbsoluteFill>
  )
}
