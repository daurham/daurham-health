import type { HealthPalette } from '@/theme'

/** Indexed vertical atlas: eight 720x124 scenes within one ~50 KB WebP.
 * One HTTP asset and no per-theme image downloads. */
export const WORLD_SCENE_ROW: Record<HealthPalette, number> = {
  classic: 6, forest: 1, ocean: 0, sunset: 0, plum: 7,
  aura: 7, 'saiyan-dawn': 3, 'grand-line': 0, 'hidden-leaf': 1,
  'super-saiyan-gold': 3, spartan: 2, 'namek-sky': 3, wasteland: 4,
  bonfire: 6, 'clone-legion': 2, 'silver-instinct': 3, 'crimson-surge': 3,
  'sun-god': 0, 'sage-storm': 1, 'mjolnir-night': 2, 'vault-neon': 4,
  'abyss-knight': 6, 'republic-red': 5, 'cosmic-instinct': 3,
  'astral-ascension': 7, 'eclipse-sovereign': 7, 'prismatic-apex': 7,
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
