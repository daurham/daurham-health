export const PROGRESSION_VERSION = 'progression-v1' as const

export const PROGRESSION_THEME_UNLOCKS = [
  { id: 'aura', level: 2 },
  { id: 'saiyan-dawn', level: 3 },
  { id: 'grand-line', level: 4 },
  { id: 'hidden-leaf', level: 5 },
  { id: 'super-saiyan-gold', level: 6 },
  { id: 'spartan', level: 7 },
  { id: 'namek-sky', level: 8 },
  { id: 'wasteland', level: 9 },
  { id: 'bonfire', level: 10 },
  { id: 'clone-legion', level: 11 },
  { id: 'silver-instinct', level: 12 },
] as const

export type ProgressionThemeId = (typeof PROGRESSION_THEME_UNLOCKS)[number]['id']

export type ProgressionState = {
  version: typeof PROGRESSION_VERSION
  lifetimeXp: number
  level: number
  levelFloorXp: number
  nextLevelXp: number
  xpIntoLevel: number
  xpNeededForNextLevel: number
  progressPct: number
  newlyAvailableThemeIds: ProgressionThemeId[]
  nextThemeUnlock: { id: ProgressionThemeId; level: number; thresholdXp: number } | null
}

export function xpThresholdForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level))
  if (safeLevel <= 1) return 0
  return 25 * (safeLevel - 1) * (safeLevel + 2)
}

export function levelFromLifetimeXp(lifetimeXp: number): number {
  const xp = Math.max(0, Math.floor(lifetimeXp))
  let level = 1
  while (xp >= xpThresholdForLevel(level + 1)) {
    level += 1
  }
  return level
}

export function progressionState(lifetimeXp: number): ProgressionState {
  const xp = Math.max(0, Math.floor(lifetimeXp))
  const level = levelFromLifetimeXp(xp)
  const levelFloorXp = xpThresholdForLevel(level)
  const nextLevelXp = xpThresholdForLevel(level + 1)
  const span = Math.max(1, nextLevelXp - levelFloorXp)
  const xpIntoLevel = Math.max(0, xp - levelFloorXp)
  const xpNeededForNextLevel = Math.max(0, nextLevelXp - xp)
  const progressPct = Math.max(0, Math.min(100, (xpIntoLevel / span) * 100))
  const newlyAvailableThemeIds = PROGRESSION_THEME_UNLOCKS
    .filter((unlock) => unlock.level === level)
    .map((unlock) => unlock.id)
  const next = PROGRESSION_THEME_UNLOCKS.find((unlock) => unlock.level > level) ?? null

  return {
    version: PROGRESSION_VERSION,
    lifetimeXp: xp,
    level,
    levelFloorXp,
    nextLevelXp,
    xpIntoLevel,
    xpNeededForNextLevel,
    progressPct,
    newlyAvailableThemeIds,
    nextThemeUnlock: next
      ? { id: next.id, level: next.level, thresholdXp: xpThresholdForLevel(next.level) }
      : null,
  }
}

export function themeUnlockLevel(id: string): number | null {
  return PROGRESSION_THEME_UNLOCKS.find((unlock) => unlock.id === id)?.level ?? null
}

export function progressionThemeUnlocked(id: string, lifetimeXp: number): boolean {
  const level = themeUnlockLevel(id)
  return level == null || levelFromLifetimeXp(lifetimeXp) >= level
}
