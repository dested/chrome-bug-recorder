import type { ReactNode } from 'react'
import {
  AbsoluteFill,
  Series,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { C } from './theme'
import { Capture, CAPTURE_DUR } from './scenes/Capture'
import { Outro, OUTRO_DUR } from './scenes/Outro'
import { Problem, PROBLEM_DUR } from './scenes/Problem'
import { Report, REPORT_DUR } from './scenes/Report'
import { Title, TITLE_DUR } from './scenes/Title'
import { Walkthrough, WALKTHROUGH_DUR } from './scenes/Walkthrough'

export const PROMO_DUR =
  TITLE_DUR + PROBLEM_DUR + CAPTURE_DUR + REPORT_DUR + WALKTHROUGH_DUR + OUTRO_DUR

// Every scene fades in over 8 frames and out over its last 10.
const Fade = ({ dur, children }: { dur: number; children: ReactNode }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const opacity =
    interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' }) *
    interpolate(frame, [dur - 10, dur - 1], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  void fps
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>
}

export const Promo = () => {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Series>
        <Series.Sequence durationInFrames={TITLE_DUR} premountFor={30}>
          <Fade dur={TITLE_DUR}>
            <Title />
          </Fade>
        </Series.Sequence>
        <Series.Sequence durationInFrames={PROBLEM_DUR} premountFor={30}>
          <Fade dur={PROBLEM_DUR}>
            <Problem />
          </Fade>
        </Series.Sequence>
        <Series.Sequence durationInFrames={CAPTURE_DUR} premountFor={30}>
          <Fade dur={CAPTURE_DUR}>
            <Capture />
          </Fade>
        </Series.Sequence>
        <Series.Sequence durationInFrames={REPORT_DUR} premountFor={30}>
          <Fade dur={REPORT_DUR}>
            <Report />
          </Fade>
        </Series.Sequence>
        <Series.Sequence durationInFrames={WALKTHROUGH_DUR} premountFor={30}>
          <Fade dur={WALKTHROUGH_DUR}>
            <Walkthrough />
          </Fade>
        </Series.Sequence>
        <Series.Sequence durationInFrames={OUTRO_DUR} premountFor={30}>
          <Fade dur={OUTRO_DUR}>
            <Outro />
          </Fade>
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  )
}
