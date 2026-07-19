import { isThemeMode, type ThemeMode } from '@shared/theme'

export type { ThemeMode }
export { isThemeMode }

const STORAGE_KEY = 'aigc-ui:theme'

export function readStoredTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (isThemeMode(raw)) return raw
  } catch {
    // ignore
  }
  return 'light'
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore
  }
  try {
    void window.api?.theme?.set?.(mode)
  } catch {
    // preload may not be ready in some test hosts
  }
}

/** Call before Vue mount to reduce first-paint flash. */
export function applyStoredTheme(): void {
  applyTheme(readStoredTheme())
}
