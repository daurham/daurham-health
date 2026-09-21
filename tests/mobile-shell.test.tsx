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
    expect(html).toContain('grid-cols-5')
    expect(html).toContain('whitespace-nowrap')
    expect(html).toContain('md:hidden')
    expect(html).toContain('mx-auto hidden max-w-5xl px-4 pb-3 md:block')
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
    expect(html).toContain('pb-[calc(5.5rem+env(safe-area-inset-bottom))]')
    expect(html).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(html).toContain('fixed inset-x-0 bottom-0')
  })

  it('enables iOS safe-area viewport covering', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
    expect(html).toContain('viewport-fit=cover')
  })
})
