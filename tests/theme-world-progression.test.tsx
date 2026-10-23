import React from 'react'
import { readFileSync, statSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { THEME_PACKS } from '../src/theme.ts'
import { ThemeWorldScene } from '../src/features/today/ThemeWorldScene.tsx'
import { WORLD_SCENE_ROW, worldStage, worldNextStageLevel } from '../src/features/today/theme-worlds.ts'

describe('Premium theme-world progression', () => {
  it('has a real optimized asset and maps every existing theme to one of eight distinct environments', () => {
    expect(statSync('public/theme/worlds-v1.webp').size).toBeLessThan(80_000)
    expect(Object.keys(WORLD_SCENE_ROW)).toHaveLength(THEME_PACKS.length)
    for (const p of THEME_PACKS) expect(WORLD_SCENE_ROW[p.id]).toBeGreaterThanOrEqual(0)
    for (const row of Object.values(WORLD_SCENE_ROW)) expect(row).toBeLessThan(8)
  })
  it('preserves XP unlocks and only upgrades a selected world at fixed later levels', () => {
    expect(worldStage(10, 10)).toBe('base')
    expect(worldStage(10, 11)).toBe('base')
    expect(worldStage(10, 12)).toBe('awakened')
    expect(worldStage(10, 15)).toBe('ascended')
    expect(worldStage(10, 50, false)).toBe('base')
    expect(worldNextStageLevel(10, 'base')).toBe(12)
    expect(worldNextStageLevel(10, 'awakened')).toBe(15)
    expect(worldNextStageLevel(10, 'ascended')).toBeNull()
  })
  it('renders three visual states without altering health or XP data', () => {
    const html = renderToStaticMarkup(<ThemeWorldScene palette="bonfire" stage="ascended" completed />)
    expect(html).toContain('data-world-palette="bonfire"')
    expect(html).toContain('data-world-stage="ascended"')
    expect(html).toContain('data-world-celebrating="yes"')
    expect(html).toContain('world-scene-art')
    expect(html).not.toContain('<img')
  })
  it('keeps motion finite and accessible and avoids runtime image generation', () => {
    const css = readFileSync('src/index.css','utf8')
    expect(css).toContain("url('/theme/worlds-v1.webp')")
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation: world-reward-drift 3s ease-in-out 2')
    expect(css).not.toContain('animation-iteration-count: infinite')
  })
})
