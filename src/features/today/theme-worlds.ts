import type { HealthPalette } from '@/theme'

/** Stable scene selection across premium world art; each optimized WebP is
 * 1600×533 so iPhone high-density displays remain crisp. */
export const WORLD_SCENE_ROW: Record<HealthPalette, number> = {
  classic: 6, forest: 1, ocean: 0, sunset: 0, plum: 7,
  aura: 7, 'saiyan-dawn': 3, 'grand-line': 0, 'hidden-leaf': 1,
  'super-saiyan-gold': 3, spartan: 8, 'namek-sky': 3, wasteland: 4,
  bonfire: 6, 'clone-legion': 2, 'silver-instinct': 3, 'crimson-surge': 3,
  'sun-god': 0, 'sage-storm': 1, 'mjolnir-night': 8, 'vault-neon': 4,
  'abyss-knight': 6, 'republic-red': 5, 'cosmic-instinct': 3,
  'astral-ascension': 7, 'eclipse-sovereign': 7, 'prismatic-apex': 7,
}

/** Isolated images guarantee that no neighboring scene can bleed into a card,
 * even when CSS sizes change between Today, theme tiles and tiny previews. */
export const WORLD_SCENE_IMAGES = [
  '/theme/worlds/grand-line-v2.webp',
  '/theme/worlds/hidden-leaf-v2.webp',
  '/theme/worlds/clone-legion-v2.webp',
  '/theme/worlds/dragon-v2.webp',
  '/theme/worlds/wasteland-v2.webp',
  '/theme/worlds/republic-red-v2.webp',
  '/theme/worlds/bonfire-v2.webp',
  '/theme/worlds/astral-v2.webp',
  '/theme/worlds/halo-v2.webp',
] as const

export function worldSceneImage(palette: HealthPalette): string {
  return WORLD_SCENE_IMAGES[WORLD_SCENE_ROW[palette]]
}

export type WorldStage = 'base' | 'awakened' | 'ascended'

/** Permanent evolution follows the existing level/XP economy, never spendable XP.
 * Locked themes remain at base even if their thumbnails are previewed.
 */
export function worldStage(unlockLevel: number | null, currentLevel: number, unlocked = true): WorldStage {
  if (!unlocked || !Number.isFinite(currentLevel)) return 'base'
  const floor = unlockLevel ?? 1
  const levelsEarned = Math.max(0, currentLevel - floor)
  return levelsEarned >= 5 ? 'ascended' : levelsEarned >= 2 ? 'awakened' : 'base'
}
export function worldNextStageLevel(unlockLevel: number | null, stage: WorldStage): number | null {
  const floor = unlockLevel ?? 1
  return stage === 'base' ? floor + 2 : stage === 'awakened' ? floor + 5 : null
}

export type WorldMood = 'daybreak' | 'day' | 'dusk' | 'night'
/** Device-local presentation only; does not infer mood from health data. */
export function worldMoodForHour(hour: number): WorldMood {
  if (hour >= 5 && hour < 10) return 'daybreak'
  if (hour >= 10 && hour < 17) return 'day'
  if (hour >= 17 && hour < 21) return 'dusk'
  return 'night'
}

/** A hydration effect requires a real positive goal and valid observations. */
export function isHydrationGoalMet(totalOz: number | null | undefined, goalOz: number | null | undefined): boolean {
  return typeof totalOz === 'number' && Number.isFinite(totalOz)
    && typeof goalOz === 'number' && Number.isFinite(goalOz)
    && goalOz > 0 && totalOz >= goalOz
}
