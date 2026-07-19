import { computed, ref } from 'vue'
import { applyTheme, readStoredTheme, type ThemeMode } from '@/theme'

const theme = ref<ThemeMode>(readStoredTheme())

export function useTheme() {
  const isDark = computed(() => theme.value === 'dark')

  function setTheme(mode: ThemeMode): void {
    theme.value = mode
    applyTheme(mode)
  }

  function toggleTheme(): void {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return {
    theme,
    isDark,
    setTheme,
    toggleTheme,
  }
}
