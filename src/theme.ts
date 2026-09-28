export const THEME_STORAGE_KEY = 'health-theme'
export const PALETTE_STORAGE_KEY = 'health-palette'

export const THEME_MODE_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemeModePreference = (typeof THEME_MODE_PREFERENCES)[number]

export const RESOLVED_COLOR_MODES = ['light', 'dark'] as const
export type ResolvedColorMode = (typeof RESOLVED_COLOR_MODES)[number]

/** Resolved light or dark. Explicit stored values stay on this pair. */
export type ThemeChoice = ResolvedColorMode

export const HEALTH_PALETTES = ['classic', 'forest', 'ocean', 'sunset', 'plum'] as const
export type HealthPalette = (typeof HEALTH_PALETTES)[number]

export const PALETTE_LABELS: Record<HealthPalette, string> = {
  classic: 'Classic',
  forest: 'Forest',
  ocean: 'Ocean',
  sunset: 'Sunset',
  plum: 'Plum',
}

export const MODE_LABELS: Record<ThemeModePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

type ThemeStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

type ThemeRoot = {
  classList: { toggle: (name: string, force?: boolean) => void }
  style: { colorScheme: string }
  dataset?: { healthPalette?: string }
}

export function isThemeModePreference(value: string | null): value is 'light' | 'dark' {
  return value === 'light' || value === 'dark'
}

export function isHealthPalette(value: string | null): value is HealthPalette {
  return HEALTH_PALETTES.some((palette) => palette === value)
}

export function readThemePreference(storage: Pick<ThemeStorage, 'getItem'>): ThemeModePreference {
  const stored = storage.getItem(THEME_STORAGE_KEY)
  return isThemeModePreference(stored) ? stored : 'system'
}

export function writeThemePreference(storage: ThemeStorage, mode: ThemeModePreference): void {
  if (mode === 'system') {
    storage.removeItem(THEME_STORAGE_KEY)
    return
  }
  storage.setItem(THEME_STORAGE_KEY, mode)
}

export function resolveTheme(preference: ThemeModePreference | null, prefersDark: boolean): ResolvedColorMode {
  if (preference === 'light' || preference === 'dark') {
    return preference
  }
  return prefersDark ? 'dark' : 'light'
}

export function readPalettePreference(storage: Pick<ThemeStorage, 'getItem'>): HealthPalette {
  const stored = storage.getItem(PALETTE_STORAGE_KEY)
  return isHealthPalette(stored) ? stored : 'classic'
}

export function writePalettePreference(storage: Pick<ThemeStorage, 'setItem'>, palette: HealthPalette): void {
  storage.setItem(PALETTE_STORAGE_KEY, palette)
}

export function applyDocumentTheme(theme: ThemeChoice, root: ThemeRoot): void {
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function applyAppearance(
  appearance: { mode: ResolvedColorMode; palette: string },
  root: ThemeRoot,
): { mode: ResolvedColorMode; palette: HealthPalette } {
  const palette = isHealthPalette(appearance.palette) ? appearance.palette : 'classic'
  applyDocumentTheme(appearance.mode, root)
  if (root.dataset) {
    root.dataset.healthPalette = palette
  }
  return { mode: appearance.mode, palette }
}

export function applyStoredAppearance(
  storage: Pick<ThemeStorage, 'getItem'>,
  prefersDark: boolean,
  root: ThemeRoot,
): { mode: ResolvedColorMode; palette: HealthPalette; preference: ThemeModePreference } {
  const preference = readThemePreference(storage)
  const applied = applyAppearance(
    { mode: resolveTheme(preference, prefersDark), palette: readPalettePreference(storage) },
    root,
  )
  return { ...applied, preference }
}

export function syncAppearance(input: {
  storage: Pick<ThemeStorage, 'getItem'>
  prefersDark: boolean
  root: ThemeRoot
  reason: 'mount' | 'media' | 'storage'
  storageKey?: string | null
}): { mode: ResolvedColorMode; palette: HealthPalette; preference: ThemeModePreference } | null {
  if (input.reason === 'media' && readThemePreference(input.storage) !== 'system') {
    return null
  }
  if (
    input.reason === 'storage' &&
    input.storageKey != null &&
    input.storageKey !== THEME_STORAGE_KEY &&
    input.storageKey !== PALETTE_STORAGE_KEY
  ) {
    return null
  }
  return applyStoredAppearance(input.storage, input.prefersDark, input.root)
}
