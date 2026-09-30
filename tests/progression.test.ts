import { describe, expect, it } from 'vitest'
import {
  PROGRESSION_THEME_UNLOCKS,
  levelFromLifetimeXp,
  progressionState,
  progressionThemeUnlocked,
  xpThresholdForLevel,
} from '../src/domain/progression.ts'

describe('H4 Lifetime XP progression', () => {
  it('uses the versioned increasing level curve', () => {
    expect(xpThresholdForLevel(1)).toBe(0)
    expect(xpThresholdForLevel(2)).toBe(100)
    expect(xpThresholdForLevel(3)).toBe(250)
    expect(xpThresholdForLevel(4)).toBe(450)
    expect(xpThresholdForLevel(5)).toBe(700)
    expect(xpThresholdForLevel(6)).toBe(1000)
    expect(xpThresholdForLevel(12)).toBe(3850)
    expect(xpThresholdForLevel(13)).toBe(4500)
  })

  it('derives level and progress only from Lifetime XP', () => {
    expect(levelFromLifetimeXp(0)).toBe(1)
    expect(levelFromLifetimeXp(99)).toBe(1)
    expect(levelFromLifetimeXp(100)).toBe(2)
    expect(levelFromLifetimeXp(249)).toBe(2)
    expect(levelFromLifetimeXp(250)).toBe(3)

    expect(progressionState(175)).toMatchObject({
      lifetimeXp: 175,
      level: 2,
      levelFloorXp: 100,
      nextLevelXp: 250,
      xpIntoLevel: 75,
      xpNeededForNextLevel: 75,
      progressPct: 50,
    })
  })

  it('unlocks theme packs without spending wallet XP', () => {
    expect(PROGRESSION_THEME_UNLOCKS[0]).toEqual({ id: 'aura', level: 2 })
    expect(progressionThemeUnlocked('aura', 99)).toBe(false)
    expect(progressionThemeUnlocked('aura', 100)).toBe(true)
    expect(progressionThemeUnlocked('super-saiyan-gold', 999)).toBe(false)
    expect(progressionThemeUnlocked('super-saiyan-gold', 1000)).toBe(true)
    expect(progressionState(1000).nextThemeUnlock).toMatchObject({ id: 'spartan', level: 7 })
  })
})
