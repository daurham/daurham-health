import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HEALTH_PALETTES, THEME_PACKS } from '../src/theme.ts'
import { progressionState, xpThresholdForLevel } from '../src/domain/progression.ts'
import {
  IllustratedWorld, sceneForPalette, worldMoodAtHour, worldNextStageLevel,
  worldStageAtLevel, worldStageFromXp,
} from '../src/features/today/IllustratedWorld.tsx'

describe('Premium illustrated theme-world progression', () => {
  it('covers every existing palette with a cacheable scenery from the approved atlas', () => {
    for (const palette of HEALTH_PALETTES) {
      expect(sceneForPalette(palette)).toMatch(/^(grand-line|hidden-leaf|clone-legion|dragon|wasteland|republic-red|bonfire)$/)
      expect(renderToStaticMarkup(<IllustratedWorld palette={palette} />)).toContain('data-world="')
    }
    const sprite = readFileSync('public/theme-worlds/worlds.webp')
    expect(sprite.toString('ascii', 0, 4)).toBe('RIFF')
    expect(sprite.byteLength).toBeLessThan(80000)
  })

  it('holds art stages behind existing XP thresholds without changing unlocks', () => {
    const grand = THEME_PACKS.find((pack) => pack.id === 'grand-line')!
    expect(grand.unlockLevel).toBe(4)
    expect(worldStageAtLevel(grand.unlockLevel, 4)).toBe('base')
    expect(worldStageAtLevel(grand.unlockLevel, 5)).toBe('base')
    expect(worldStageAtLevel(grand.unlockLevel, 6)).toBe('awakened')
    expect(worldStageAtLevel(grand.unlockLevel, 8)).toBe('ascended')
    expect(worldStageFromXp(grand.unlockLevel, xpThresholdForLevel(6))).toBe('awakened')
    expect(worldNextStageLevel(grand.unlockLevel, 6)).toBe(8)
    expect(worldNextStageLevel(grand.unlockLevel, 8)).toBeNull()
    expect(progressionState(xpThresholdForLevel(6)).level).toBe(6)
  })

  it('responds to actual dayparts but does not depend on punitive health scoring', () => {
    expect(worldMoodAtHour(6)).toBe('daybreak')
    expect(worldMoodAtHour(12)).toBe('daylight')
    expect(worldMoodAtHour(19)).toBe('dusk')
    expect(worldMoodAtHour(23)).toBe('moonlit')
    const base = renderToStaticMarkup(<IllustratedWorld palette="bonfire" />)
    expect(base).toContain('data-world-trained="no"')
    const trained = renderToStaticMarkup(<IllustratedWorld palette="bonfire" stage="awakened" trained mood="dusk" />)
    expect(trained).toContain('data-world-trained="yes"')
    expect(trained).toContain('data-world-stage="awakened"')
  })

  it('keeps progression motion finite and respects reduced-motion preferences', () => {
    const css = readFileSync('src/index.css', 'utf8')
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")
    expect(css).toContain("animation: illustrated-world-awaken 2.8s ease-in-out 2 alternate")
    expect(css).toContain("background-image: url('/theme-worlds/worlds.webp')")
  })
})
