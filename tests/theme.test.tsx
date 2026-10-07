import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthContext } from '../src/auth/context.ts'
import { Layout } from '../src/components/Layout.tsx'
import { SettingsPage } from '../src/features/settings/SettingsPage.tsx'
import { readFileSync } from 'node:fs'
import {
  HEALTH_PALETTES,
  THEME_PACKS,
  PALETTE_STORAGE_KEY,
  THEME_MODE_PREFERENCES,
  THEME_STORAGE_KEY,
  applyAppearance,
  applyDocumentTheme,
  readPalettePreference,
  readThemePreference,
  resolveTheme,
  syncAppearance,
  writePalettePreference,
  writeThemePreference,
  themePackUnlocked,
  type ThemeChoice,
} from '../src/theme.ts'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = { ...initial }
  return {
    getItem(key: string) {
      return values[key] ?? null
    },
    setItem(key: string, value: string) {
      values[key] = value
    },
    removeItem(key: string) {
      delete values[key]
    },
  }
}

function themeRoot() {
  const root = {
    dark: false,
    style: { colorScheme: '' },
    dataset: {} as { healthPalette?: string },
    classList: {
      toggle(name: string, force?: boolean) {
        if (name === 'dark') {
          root.dark = force === true
        }
      },
    },
  }
  return root
}

function shell(path: string, status: 'owner' | 'anonymous') {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider
        value={{
          status,
          email: null,
          refresh: async () => undefined,
          signOut: async () => undefined,
        }}
      >
        <Layout />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('theme preference', () => {
  it('uses a stored choice before the system preference', () => {
    const storage = memoryStorage({ 'health-theme': 'dark' })
    expect(readThemePreference(storage)).toBe('dark')
    expect(resolveTheme(readThemePreference(storage), false)).toBe('dark')
    storage.setItem('health-theme', 'light')
    expect(resolveTheme(readThemePreference(storage), true)).toBe('light')
  })

  it('follows the system preference when nothing is stored, and persists an explicit choice', () => {
    const storage = memoryStorage()
    expect(readThemePreference(storage)).toBe('system')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
    writeThemePreference(storage, 'dark')
    expect(readThemePreference(storage)).toBe('dark')
    writeThemePreference(storage, 'system')
    expect(storage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(readThemePreference(storage)).toBe('system')
  })

  it('applies the choice on the document root', () => {
    const root = {
      dark: false,
      style: { colorScheme: '' },
      classList: {
        toggle(name: string, force?: boolean) {
          if (name === 'dark') {
            root.dark = force === true
          }
        },
      },
    }
    applyDocumentTheme('dark', root)
    expect(root.dark).toBe(true)
    expect(root.style.colorScheme).toBe('dark')
    applyDocumentTheme('light' satisfies ThemeChoice, root)
    expect(root.dark).toBe(false)
  })

  it('keeps mode and palette independent and allowlisted', () => {
    expect(THEME_MODE_PREFERENCES).toEqual(['system', 'light', 'dark'])
    expect(HEALTH_PALETTES.slice(0, 5)).toEqual(['classic', 'forest', 'ocean', 'sunset', 'plum'])
    expect(HEALTH_PALETTES).toHaveLength(24)
    expect(HEALTH_PALETTES).toContain('aura')
    expect(HEALTH_PALETTES).toContain('silver-instinct')
    expect(HEALTH_PALETTES).toContain('cosmic-instinct')
    const storage = memoryStorage({ 'health-theme': 'nope', 'health-palette': 'rainbow' })
    expect(readThemePreference(storage)).toBe('system')
    expect(readPalettePreference(storage)).toBe('classic')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    for (const palette of HEALTH_PALETTES) {
      writePalettePreference(storage, palette)
      expect(readPalettePreference(storage)).toBe(palette)
    }
    const root = themeRoot()
    const applied = applyAppearance({ mode: 'dark', palette: 'forest' }, root)
    expect(applied.palette).toBe('forest')
    expect(root.dark).toBe(true)
    expect(root.style.colorScheme).toBe('dark')
    expect(root.dataset.healthPalette).toBe('forest')
    applyAppearance({ mode: 'light', palette: '<script>' }, root)
    expect(root.dark).toBe(false)
    expect(root.style.colorScheme).toBe('light')
    expect(root.dataset.healthPalette).toBe('classic')
    expect(HEALTH_PALETTES).not.toContain('<script>')
  })

  it('derives progression theme locks from Lifetime XP without invalidating legacy themes', () => {
    expect(THEME_PACKS.map((pack) => pack.id)).toEqual(HEALTH_PALETTES)
    for (const id of ['classic', 'forest', 'ocean', 'sunset', 'plum'] as const) {
      expect(themePackUnlocked(id, 0)).toBe(true)
    }
    expect(themePackUnlocked('aura', 99)).toBe(false)
    expect(themePackUnlocked('aura', 100)).toBe(true)
    expect(themePackUnlocked('silver-instinct', 3849)).toBe(false)
    expect(themePackUnlocked('silver-instinct', 3850)).toBe(true)
    expect(themePackUnlocked('cosmic-instinct', 10449)).toBe(false)
    expect(themePackUnlocked('cosmic-instinct', 10450)).toBe(true)
  })

  it('follows later system changes only while System is selected', () => {
    const storage = memoryStorage()
    const root = themeRoot()
    expect(syncAppearance({ storage, prefersDark: true, root, reason: 'media' })?.mode).toBe('dark')
    expect(syncAppearance({ storage, prefersDark: false, root, reason: 'media' })?.mode).toBe('light')
    writeThemePreference(storage, 'light')
    expect(syncAppearance({ storage, prefersDark: true, root, reason: 'media' })).toBeNull()
    expect(root.style.colorScheme).toBe('light')
    writeThemePreference(storage, 'dark')
    syncAppearance({ storage, prefersDark: false, root, reason: 'mount' })
    expect(root.dark).toBe(true)
    expect(syncAppearance({ storage, prefersDark: false, root, reason: 'media' })).toBeNull()
  })

  it('applies storage events for mode and palette, and treats a removed palette as Classic', () => {
    const storage = memoryStorage({ 'health-theme': 'light', 'health-palette': 'plum' })
    const root = themeRoot()
    syncAppearance({ storage, prefersDark: true, root, reason: 'storage', storageKey: 'health-palette' })
    expect(root.dataset.healthPalette).toBe('plum')
    expect(root.dark).toBe(false)
    storage.removeItem(PALETTE_STORAGE_KEY)
    syncAppearance({ storage, prefersDark: false, root, reason: 'storage', storageKey: PALETTE_STORAGE_KEY })
    expect(root.dataset.healthPalette).toBe('classic')
    storage.removeItem(THEME_STORAGE_KEY)
    syncAppearance({ storage, prefersDark: true, root, reason: 'storage', storageKey: THEME_STORAGE_KEY })
    expect(readThemePreference(storage)).toBe('system')
    expect(root.dark).toBe(true)
    expect(syncAppearance({ storage, prefersDark: false, root, reason: 'media' })?.mode).toBe('light')
    expect(syncAppearance({ storage, prefersDark: true, root, reason: 'storage', storageKey: 'unrelated' })).toBeNull()
  })
})

describe('theme shells', () => {
  it('uses the shared shell for the owner app and the public demo', () => {
    const owner = shell('/', 'owner')
    const demo = shell('/demo', 'anonymous')
    expect(owner).toContain('bg-zinc-50')
    expect(demo).toContain('bg-zinc-50')
    expect(demo).toContain('Demo data')
    expect(owner).not.toContain('Demo data')
  })

  it('offers mode, Theme Studio, unlocks, and trend personalization in Settings', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )
    expect(html).toContain('Theme Studio')
    expect(html).toContain('Color mode')
    expect(html).toContain('Theme packs')
    expect(html).toContain('Personalize trend colors')
    expect(html).toContain('Switch to dark mode')
    expect(html).toContain('Switch to light mode')
    expect(html).toContain('Use system appearance')
    expect(readFileSync('src/features/settings/SettingsPage.tsx', 'utf8')).toContain("resolvedMode === 'dark'")
    expect(readFileSync('src/features/settings/SettingsPage.tsx', 'utf8')).toContain("prefers-color-scheme: dark")
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('>System<')
    expect(html).toContain('>Classic<')
    expect(html).toContain('grid-cols-3')
    expect(html).toContain('min-w-0')
    expect(html).not.toContain('overflow-x-auto')
    expect(html).not.toContain('flex-nowrap')
    expect(html.match(/aria-pressed=/g)?.length ?? 0).toBeGreaterThan(THEME_MODE_PREFERENCES.length + HEALTH_PALETTES.length)
    expect(html).toContain('Data &amp; Backup')
    expect(readFileSync('src/features/settings/SettingsPage.tsx', 'utf8')).not.toContain("classList.contains('dark')")
    expect(readFileSync('src/features/settings/SettingsPage.tsx', 'utf8')).not.toContain('>Save<')
  })

  it('keeps the pre-render bootstrap, palettes, charts, and demo on the same contract', () => {
    const bootstrap = readFileSync('index.html', 'utf8')
    const css = readFileSync('src/index.css', 'utf8')
    const charts = readFileSync('src/features/progress/ProgressCharts.tsx', 'utf8')
    expect(bootstrap).toContain("stored === 'dark'")
    expect(bootstrap).toContain("stored !== 'light'")
    expect(bootstrap).toContain('health-palette')
    expect(bootstrap).toContain("setAttribute('data-health-palette', palette)")
    expect(bootstrap).not.toContain('className')
    for (const palette of HEALTH_PALETTES) {
      expect(bootstrap).toContain(palette)
      expect(css).toContain(`html[data-health-palette='${palette}']`)
      expect(css).toContain(`html.dark[data-health-palette='${palette}']`)
    }
    expect(css).toContain('--health-canvas:')
    expect(css).toContain('--health-surface:')
    expect(css).toContain('--health-reward:')
    expect(css).toContain('--health-hero-gradient:')
    expect(css).toContain('.app-shell')
    expect(css).toContain('background-image: var(--health-hero-gradient)')
    expect(css.match(/--health-danger:/g)).toHaveLength(2)
    expect(css.match(/--health-warning:/g)).toHaveLength(2)
    expect(css.match(/--health-success:/g)).toHaveLength(2)
    expect(css).toContain('--chart-ink: var(--health-accent)')
    expect(css).toContain('--chart-secondary: var(--health-accent-secondary)')
    expect(charts).toContain('var(--chart-ink)')
    expect(charts).not.toContain('health-palette')
    expect(readFileSync('src/theme.ts', 'utf8')).not.toContain('fetch(')
    expect(readFileSync('server/backup/inventory.ts', 'utf8')).not.toContain('health-palette')
    expect(readFileSync('src/main.tsx', 'utf8')).toContain('ThemeSync')
    expect(readFileSync('src/demo/dataset.ts', 'utf8')).not.toContain('health-palette')
    expect(readFileSync('src/index.css', 'utf8')).toContain('prefers-reduced-motion')
    expect(readFileSync('src/theme.ts', 'utf8')).not.toContain('animation')
    expect(readFileSync('src/theme-sync.tsx', 'utf8')).toContain("addEventListener('storage'")
  })
})
