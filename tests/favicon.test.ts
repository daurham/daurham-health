import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('health favicon', () => {
  it('references a static heart icon without adding a PWA manifest', () => {
    const html = readFileSync('index.html', 'utf8')
    const svg = readFileSync('public/favicon.svg', 'utf8')
    expect(html).toContain('rel="icon"')
    expect(html).toContain('href="/favicon.svg"')
    expect(html).toContain('rel="apple-touch-icon"')
    expect(html).toContain('href="/apple-touch-icon.png"')
    expect(html).not.toContain('manifest')
    expect(html).not.toContain('serviceWorker')
    expect(html).not.toContain('/vite.svg')
    expect(svg).toContain('<svg')
    expect(svg).toContain('#ffffff')
    expect(svg).toContain('#1e3a5f')
    expect(existsSync('public/apple-touch-icon.png')).toBe(true)
  })
})
