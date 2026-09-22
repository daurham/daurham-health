import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthContext, type AuthContextValue } from '../src/auth/context.ts'
import { Layout } from '../src/components/Layout.tsx'

const ownerAuth: AuthContextValue = {
  status: 'owner',
  email: 'owner@example.com',
  refresh: async () => undefined,
  signOut: async () => undefined,
}

function renderLayout() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AuthContext.Provider value={ownerAuth}>
        <Layout />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('mobile application shell', () => {
  it('uses a five-column bottom nav that cannot wrap primary destinations', () => {
    const html = renderLayout()
    expect(html).toContain('max-w-[1200px]')
    expect(html).toContain('grid-cols-5')
    expect(html).toContain('whitespace-nowrap')
    expect(html).toContain('md:hidden')
    expect(html).toContain('flex-nowrap')
    expect(html).toContain('Today')
    expect(html).toContain('Nutrition')
    expect(html).toContain('Training')
    expect(html).toContain('Body')
    expect(html).toContain('Progress')
    expect(html).not.toContain('flex-wrap gap-1')
  })

  it('keeps Sign out out of the primary nav row and reserves safe bottom space', () => {
    const html = renderLayout()
    expect(html).toContain('Menu')
    expect(html).toContain('Sign out')
    expect(html).toContain('pt-[env(safe-area-inset-top)]')
    expect(html).toContain('pb-[var(--shell-main-pad)]')
    expect(html).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(html).toContain('fixed inset-x-0 bottom-0')
    expect(html).toContain('md:hidden')
    expect(html).toContain('md:block')
  })

  it('enables iOS safe-area viewport covering', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
    expect(html).toContain('viewport-fit=cover')
  })

  it('places review actions above the bottom nav and keeps desktop nav offset at zero', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
    const editor = readFileSync(join(process.cwd(), 'src/features/training/WorkoutEditor.tsx'), 'utf8')
    const sheet = readFileSync(join(process.cwd(), 'src/features/nutrition/Sheet.tsx'), 'utf8')
    expect(css).toContain('--shell-nav-offset: calc(var(--shell-nav-row) + var(--shell-safe-bottom))')
    expect(css).toContain('env(safe-area-inset-bottom, 0px)')
    expect(css).toContain('--shell-nav-offset: 0px')
    expect(css).toContain('bottom: var(--shell-nav-offset)')
    expect(editor).toContain('shell-action-bar')
    expect(editor).toContain('shell-action-reserve')
    expect(editor).not.toContain('fixed inset-x-0 bottom-0')
    expect(sheet).toContain('var(--shell-safe-bottom)')
  })
})
