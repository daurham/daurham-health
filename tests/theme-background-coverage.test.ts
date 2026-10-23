import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('progression theme background coverage', () => {
  const css = readFileSync('src/index.css', 'utf8')

  it('uses a nontransparent semantic-color wash beneath each progression theme scene', () => {
    // Both standard and late-game theme groups share the same full-height fill.
    expect(css.match(/background-image:\s*var\(--health-hero-gradient\),\s*linear-gradient\(/g)).toHaveLength(2)
    expect(css.match(/color-mix\(in srgb, var\(--health-accent-secondary\) 8%, var\(--health-canvas\)\)/g)).toHaveLength(2)
    expect(css.match(/background-size: 100% 100%/g)?.length).toBeGreaterThanOrEqual(2)
    expect(css).toContain("html[data-health-palette='grand-line']")
    expect(css).toContain("html[data-health-palette='astral-ascension']")
  })

  it('extends the semantic canvas behind the shell without fixed background layers', () => {
    expect(css).toContain('html, body, #root {')
    expect(css).toContain('background-color: var(--health-canvas);')
    expect(css).toContain('background-attachment: scroll;')
    expect(css).not.toContain('background-attachment: fixed;')
  })
})
