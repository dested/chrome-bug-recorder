import { loadFont as loadDisplay } from '@remotion/google-fonts/BricolageGrotesque'
import { loadFont as loadMono } from '@remotion/google-fonts/IBMPlexMono'

const display = loadDisplay('normal', { weights: ['600', '700', '800'], subsets: ['latin'] })
const mono = loadMono('normal', { weights: ['400', '500', '600'], subsets: ['latin'] })

export const FONT_DISPLAY = display.fontFamily
export const FONT_MONO = mono.fontFamily
export const FONT_SANS = 'ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif'

export const C = {
  bg: '#0a0a0c',
  raise: '#131316',
  panel: '#0d0d10',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.14)',
  ink: '#f2efec',
  muted: 'rgba(242,239,236,0.5)',
  faint: 'rgba(242,239,236,0.32)',
  accent: '#ff5c39',
  accentSoft: 'rgba(255,92,57,0.14)',
  accentText: '#ffcbbb',
  success: '#58c98a',
}
