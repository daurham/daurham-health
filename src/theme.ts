import {
  PROGRESSION_THEME_UNLOCKS,
  progressionThemeUnlocked,
  themeUnlockLevel,
} from './domain/progression.js'

export const THEME_STORAGE_KEY = 'health-theme'
export const PALETTE_STORAGE_KEY = 'health-palette'

export const THEME_MODE_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemeModePreference = (typeof THEME_MODE_PREFERENCES)[number]

export const RESOLVED_COLOR_MODES = ['light', 'dark'] as const
export type ResolvedColorMode = (typeof RESOLVED_COLOR_MODES)[number]

/** Resolved light or dark. Explicit stored values stay on this pair. */
export type ThemeChoice = ResolvedColorMode

export const BASE_HEALTH_PALETTES = ['classic', 'forest', 'ocean', 'sunset', 'plum'] as const
export const PROGRESSION_HEALTH_PALETTES = PROGRESSION_THEME_UNLOCKS.map((unlock) => unlock.id)
export const HEALTH_PALETTES = [
  ...BASE_HEALTH_PALETTES,
  ...PROGRESSION_HEALTH_PALETTES,
] as const

export type HealthPalette = (typeof HEALTH_PALETTES)[number]

export type ThemePack = {
  id: HealthPalette
  label: string
  flavor: string
  unlockLevel: number | null
  preview: {
    canvas: string
    surface: string
    accent: string
    secondary: string
    reward: string
  }
}

export const THEME_PACKS: readonly ThemePack[] = [
  {
    id: 'classic',
    label: 'Classic',
    flavor: 'Quiet graphite with a calm blue signal.',
    unlockLevel: null,
    preview: { canvas: '#f7f7f8', surface: '#ffffff', accent: '#42648f', secondary: '#758ba7', reward: '#c58a18' },
  },
  {
    id: 'forest',
    label: 'Forest',
    flavor: 'Deep teal and moss with softened natural surfaces.',
    unlockLevel: null,
    preview: { canvas: '#f4f7f5', surface: '#fbfdfb', accent: '#16716a', secondary: '#59866e', reward: '#b9851d' },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    flavor: 'Crisp blue and cyan with an open-water feel.',
    unlockLevel: null,
    preview: { canvas: '#f2f7fb', surface: '#fbfdff', accent: '#1476b8', secondary: '#29a7bb', reward: '#d1901d' },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    flavor: 'Warm coral and amber without losing Health clarity.',
    unlockLevel: null,
    preview: { canvas: '#fbf6f2', surface: '#fffdfb', accent: '#b75b31', secondary: '#cb7e4a', reward: '#d59b1f' },
  },
  {
    id: 'plum',
    label: 'Plum',
    flavor: 'Plum, berry, and violet with a softer editorial feel.',
    unlockLevel: null,
    preview: { canvas: '#f8f4f8', surface: '#fffafe', accent: '#8d3979', secondary: '#7351a2', reward: '#c69324' },
  },
  {
    id: 'aura',
    label: 'Aura',
    flavor: 'Electric violet and cyan with a restrained energy glow.',
    unlockLevel: 2,
    preview: { canvas: '#f5f4fb', surface: '#fdfcff', accent: '#6650d8', secondary: '#31b6c4', reward: '#e1a72b' },
  },
  {
    id: 'saiyan-dawn',
    label: 'Saiyan Dawn',
    flavor: 'Royal blue, sunrise orange, and focused gold energy.',
    unlockLevel: 3,
    preview: { canvas: '#f5f6fa', surface: '#fcfcff', accent: '#3453b8', secondary: '#e36f2f', reward: '#e4ad1f' },
  },
  {
    id: 'grand-line',
    label: 'Grand Line',
    flavor: 'Sea blue, warm red, and gold for an adventurous deck.',
    unlockLevel: 4,
    preview: { canvas: '#f3f8f9', surface: '#fcffff', accent: '#197a9c', secondary: '#b94e43', reward: '#d7a321' },
  },
  {
    id: 'hidden-leaf',
    label: 'Hidden Leaf',
    flavor: 'Warm orange, charcoal, and grounded leaf green.',
    unlockLevel: 5,
    preview: { canvas: '#f8f6f1', surface: '#fffdf8', accent: '#bd632e', secondary: '#47745a', reward: '#d69d21' },
  },
  {
    id: 'super-saiyan-gold',
    label: 'Super Saiyan Gold',
    flavor: 'Prestige gold against deep navy and cool shadow.',
    unlockLevel: 6,
    preview: { canvas: '#f8f7f1', surface: '#fffefa', accent: '#a97906', secondary: '#30466f', reward: '#e7b820' },
  },
  {
    id: 'spartan',
    label: 'Spartan',
    flavor: 'Olive armor, steel surfaces, and a cyan HUD signal.',
    unlockLevel: 7,
    preview: { canvas: '#f3f5f1', surface: '#fafcf8', accent: '#647244', secondary: '#21a5b1', reward: '#c79e26' },
  },
  {
    id: 'namek-sky',
    label: 'Namek Sky',
    flavor: 'Fresh green, cobalt sky, and lavender atmosphere.',
    unlockLevel: 8,
    preview: { canvas: '#f3f8f3', surface: '#fbfffb', accent: '#3c8b4a', secondary: '#4b77c9', reward: '#d8a724' },
  },
  {
    id: 'wasteland',
    label: 'Wasteland',
    flavor: 'Amber, olive, and terminal green with utilitarian grit.',
    unlockLevel: 9,
    preview: { canvas: '#f5f3ea', surface: '#fbf9f0', accent: '#7d772f', secondary: '#3f7a4d', reward: '#cb8e18' },
  },
  {
    id: 'bonfire',
    label: 'Bonfire',
    flavor: 'Ash, charcoal, and ember-orange warmth.',
    unlockLevel: 10,
    preview: { canvas: '#f6f3f1', surface: '#fdfbf9', accent: '#a94c2f', secondary: '#625651', reward: '#d98a24' },
  },
  {
    id: 'clone-legion',
    label: 'Clone Legion',
    flavor: 'Clean slate surfaces with disciplined tactical blue.',
    unlockLevel: 11,
    preview: { canvas: '#f4f6f8', surface: '#ffffff', accent: '#3f68a5', secondary: '#7f8b9c', reward: '#c89826' },
  },
  {
    id: 'silver-instinct',
    label: 'Silver Instinct',
    flavor: 'Silver, cyan, and indigo with a high-energy finish.',
    unlockLevel: 12,
    preview: { canvas: '#f4f6fa', surface: '#fcfdff', accent: '#5c6fa8', secondary: '#54b6c8', reward: '#d7ad33' },
  },
] as const

export const PALETTE_LABELS = Object.fromEntries(
  THEME_PACKS.map((pack) => [pack.id, pack.label]),
) as Record<HealthPalette, string>

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

export function themePack(id: HealthPalette): ThemePack {
  return THEME_PACKS.find((pack) => pack.id === id) ?? THEME_PACKS[0]
}

export function themePackUnlocked(id: HealthPalette, lifetimeXp: number): boolean {
  return progressionThemeUnlocked(id, lifetimeXp)
}

export function themePackUnlockLevel(id: HealthPalette): number | null {
  return themeUnlockLevel(id)
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
