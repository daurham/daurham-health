import type { HealthPalette } from '@/theme'

/** Individually exported 1600×533 worlds. Indexed lookup preserves theme associations,
 * while versioned URLs avoid stale browser caches of the old low-resolution images. */
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
  '/theme/worlds/v2/grand-line.webp',
  '/theme/worlds/v2/hidden-leaf.webp',
  '/theme/worlds/v2/clone-legion.webp',
  '/theme/worlds/v2/dragon.webp',
  '/theme/worlds/v2/wasteland.webp',
  '/theme/worlds/v2/republic-red.webp',
  '/theme/worlds/v2/bonfire.webp',
  '/theme/worlds/v2/astral.webp',
  '/theme/worlds/v2/halo.webp',
] as const

export function worldSceneImage(palette: HealthPalette): string {
  return WORLD_SCENE_IMAGES[WORLD_SCENE_ROW[palette]]
}

/** Art direction only. The DBZ packs share the dragon illustration, whose
 * head sits near the right edge of the 1600x533 source image. Other worlds
 * retain their original focal positioning and image composition. */
const DRAGON_PALETTES: ReadonlySet<HealthPalette> = new Set([
  'saiyan-dawn',
  'super-saiyan-gold',
  'namek-sky',
  'silver-instinct',
  'crimson-surge',
  'cosmic-instinct',
])

export function worldSceneFocus(palette: HealthPalette): 'dragon' | 'default' {
  return DRAGON_PALETTES.has(palette) ? 'dragon' : 'default'
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
/** Replay previously earned phases without changing the user's XP or theme unlocks. */
export type WorldStageChoice = WorldStage | 'latest'
export const WORLD_STAGE_CHANGE_EVENT = 'health-world-stage-change'
const WORLD_STAGE_CHOICE_KEY = 'health-world-stage:'
const STAGE_RANK: Record<WorldStage, number> = { base: 0, awakened: 1, ascended: 2 }

export function readWorldStageChoice(storage: Pick<Storage, 'getItem'> | null, palette: HealthPalette): WorldStageChoice {
  try {
    const saved = storage?.getItem(WORLD_STAGE_CHOICE_KEY + palette)
    return saved === 'base' || saved === 'awakened' || saved === 'ascended' ? saved : 'latest'
  } catch { return 'latest' }
}
export function resolveWorldStageChoice(choice: WorldStageChoice, maximum: WorldStage): WorldStage {
  return choice === 'latest' ? maximum : STAGE_RANK[choice] <= STAGE_RANK[maximum] ? choice : maximum
}
export function writeWorldStageChoice(storage: Pick<Storage, 'setItem'>, palette: HealthPalette, choice: WorldStageChoice): void {
  storage.setItem(WORLD_STAGE_CHOICE_KEY + palette, choice)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WORLD_STAGE_CHANGE_EVENT))
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
