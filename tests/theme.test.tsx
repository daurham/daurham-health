import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthContext } from '../src/auth/context.ts'
import { Layout } from '../src/components/Layout.tsx'
import { SettingsPage } from '../src/features/settings/SettingsPage.tsx'
import {
  applyDocumentTheme,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
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
  }
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
    expect(readThemePreference(storage)).toBeNull()
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
    writeThemePreference(storage, 'dark')
    expect(readThemePreference(storage)).toBe('dark')
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

  it('offers light and dark controls in Settings', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )
    expect(html).toContain('Appearance')
    expect(html).toContain('Switch to dark mode')
    expect(html).toContain('Switch to light mode')
    expect(html).toContain('Data &amp; Backup')
  })
})
