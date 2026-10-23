import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { THEME_PACKS } from '../src/theme.ts'
import { ThemeWorldScene } from '../src/features/today/ThemeWorldScene.tsx'
import { WORLD_SCENE_ROW, WORLD_SCENE_IMAGES, worldSceneImage, worldStage, worldNextStageLevel, isHydrationGoalMet } from '../src/features/today/theme-worlds.ts'

describe('Premium theme-world progression', () => {
  it('maps every theme to an independent, valid, and optimized WebP scene', () => {
    expect(WORLD_SCENE_IMAGES).toHaveLength(9)
    expect(new Set(WORLD_SCENE_IMAGES).size).toBe(9)
    expect(Object.keys(WORLD_SCENE_ROW)).toHaveLength(THEME_PACKS.length)
    let total = 0
    for (const path of WORLD_SCENE_IMAGES) {
      expect(path.startsWith('/theme/worlds/v2/')).toBe(true)
      expect(path.endsWith('.webp')).toBe(true)
      const file = readFileSync('public' + path)
      expect(file.toString('ascii', 0, 4)).toBe('RIFF')
      expect(file.toString('ascii', 8, 12)).toBe('WEBP')
      expect(file.byteLength).toBeGreaterThan(30_000)
      expect(file.byteLength).toBeLessThan(190_000)
      expect(file.toString('ascii', 12, 16)).toBe('VP8 ')
      expect(file.readUInt16LE(26) & 0x3fff).toBe(1600)
      expect(file.readUInt16LE(28) & 0x3fff).toBe(533)
      total += file.byteLength
    }
    expect(total).toBeLessThan(1_300_000)
    for (const pack of THEME_PACKS) {
      expect(WORLD_SCENE_ROW[pack.id]).toBeGreaterThanOrEqual(0)
      expect(WORLD_SCENE_ROW[pack.id]).toBeLessThan(9)
      expect(WORLD_SCENE_IMAGES).toContain(worldSceneImage(pack.id))
      expect(renderToStaticMarkup(<ThemeWorldScene palette={pack.id} />)).toContain(worldSceneImage(pack.id))
    }
  })
  it('uses the iconic Halo ring scene only for Halo-related packs', () => {
    expect(worldSceneImage('spartan')).toBe('/theme/worlds/v2/halo.webp')
    expect(worldSceneImage('mjolnir-night')).toBe('/theme/worlds/v2/halo.webp')
    expect(worldSceneImage('aura')).toBe('/theme/worlds/v2/astral.webp')
    const css = readFileSync('src/index.css', 'utf8')
    expect(css).not.toContain('background-size: auto 116%')
    expect(css).not.toContain('world-scene[data-world-palette="spartan"]::before')
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
  it('only rewards completed, positive hydration goals', () => {
    expect(isHydrationGoalMet(64, 64)).toBe(true)
    expect(isHydrationGoalMet(70, 64)).toBe(true)
    expect(isHydrationGoalMet(63, 64)).toBe(false)
    expect(isHydrationGoalMet(null, 64)).toBe(false)
    expect(isHydrationGoalMet(64, null)).toBe(false)
    expect(isHydrationGoalMet(0, 0)).toBe(false)
    expect(isHydrationGoalMet(Number.NaN, 64)).toBe(false)
    const html = renderToStaticMarkup(<ThemeWorldScene palette="bonfire" hydrated />)
    expect(html).toContain('data-world-hydrated="yes"')
    expect(html).toContain('world-scene-hydration')
  })

  it('keeps motion finite and accessible and avoids runtime image generation', () => {
    const css = readFileSync('src/index.css','utf8')
    expect(css).toContain('background-size: cover;')
    expect(css).not.toContain('worlds-v1.webp')
    expect(css).not.toContain('background-size: auto 800%')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation: world-reward-drift 3s ease-in-out 2')
    expect(css).not.toContain('animation-iteration-count: infinite')
  })
})
