export const THEME_STORAGE_KEY = 'health-theme'

export type ThemeChoice = 'light' | 'dark'

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>

type ThemeRoot = {
  classList: { toggle: (name: string, force?: boolean) => void }
  style: { colorScheme: string }
}

export function readThemePreference(storage: ThemeStorage): ThemeChoice | null {
  const stored = storage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : null
}

export function resolveTheme(preference: ThemeChoice | null, prefersDark: boolean): ThemeChoice {
  if (preference) {
    return preference
  }
  return prefersDark ? 'dark' : 'light'
}

export function writeThemePreference(storage: ThemeStorage, theme: ThemeChoice): void {
  storage.setItem(THEME_STORAGE_KEY, theme)
}

export function applyDocumentTheme(theme: ThemeChoice, root: ThemeRoot): void {
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function applyStoredTheme(storage: ThemeStorage, prefersDark: boolean, root: ThemeRoot): ThemeChoice {
  const theme = resolveTheme(readThemePreference(storage), prefersDark)
  applyDocumentTheme(theme, root)
  return theme
}
