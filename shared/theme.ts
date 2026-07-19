/** Window chrome + theme mode shared by renderer and Electron main. */

export type ThemeMode = 'light' | 'dark'

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark'
}

/** Title bar overlay / window background (keep in sync with CSS `--chrome-*`). */
export const THEME_CHROME = {
  light: { bg: '#f4f7fc', fg: '#475569' },
  dark: { bg: '#080808', fg: '#b4b4b4' },
} as const

export function chromeForTheme(mode: ThemeMode): { bg: string; fg: string } {
  return THEME_CHROME[mode]
}
