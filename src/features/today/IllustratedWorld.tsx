import { useEffect, useState, type CSSProperties } from 'react'
import { isHealthPalette, type HealthPalette } from '@/theme'
import { levelFromLifetimeXp } from '@/domain/progression'

export type SceneWorld = 'grand-line' | 'hidden-leaf' | 'clone-legion' | 'dragon' | 'wasteland' | 'republic-red' | 'bonfire'
export type WorldStage = 'base' | 'awakened' | 'ascended'
export type WorldMood = 'daybreak' | 'daylight' | 'dusk' | 'moonlit'

/** One small 7-scene WebP atlas, shared and cached across all 27 app palettes. */
const SCENES: Record<HealthPalette, SceneWorld> = {
  classic: 'bonfire',
  forest: 'hidden-leaf',
  ocean: 'grand-line',
  sunset: 'wasteland',
  plum: 'dragon',
  aura: 'republic-red',
  'saiyan-dawn': 'dragon',
  'grand-line': 'grand-line',
  'hidden-leaf': 'hidden-leaf',
  'super-saiyan-gold': 'dragon',
  spartan: 'clone-legion',
  'namek-sky': 'dragon',
  wasteland: 'wasteland',
  bonfire: 'bonfire',
  'clone-legion': 'clone-legion',
  'silver-instinct': 'dragon',
  'crimson-surge': 'dragon',
  'sun-god': 'grand-line',
  'sage-storm': 'hidden-leaf',
  'mjolnir-night': 'clone-legion',
  'vault-neon': 'wasteland',
  'abyss-knight': 'bonfire',
  'republic-red': 'republic-red',
  'cosmic-instinct': 'dragon',
  'astral-ascension': 'republic-red',
  'eclipse-sovereign': 'bonfire',
  'prismatic-apex': 'republic-red',
}

const ORDER: readonly SceneWorld[] = [
  'grand-line', 'hidden-leaf', 'clone-legion', 'dragon', 'wasteland', 'republic-red', 'bonfire',
]

export function sceneForPalette(palette: HealthPalette): SceneWorld {
  return SCENES[palette]
}

/** Unlock is already owned by progression-v1; visual evolution never spends XP.
 * Existing level thresholds remain exactly the same.
 */
export function worldStageAtLevel(unlockLevel: number | null, currentLevel: number): WorldStage {
  const level = Number.isFinite(currentLevel) ? Math.max(1, Math.floor(currentLevel)) : 1
  const base = unlockLevel ?? 1
  if (level < base + 2) return 'base'
  if (level < base + 4) return 'awakened'
  return 'ascended'
}

export function worldStageFromXp(unlockLevel: number | null, lifetimeXp: number): WorldStage {
  return worldStageAtLevel(unlockLevel, levelFromLifetimeXp(lifetimeXp))
}

export function worldNextStageLevel(unlockLevel: number | null, currentLevel: number): number | null {
  const stage = worldStageAtLevel(unlockLevel, currentLevel)
  return stage === 'base' ? (unlockLevel ?? 1) + 2 : stage === 'awakened' ? (unlockLevel ?? 1) + 4 : null
}

export function worldMoodAtHour(hour: number): WorldMood {
  if (hour >= 5 && hour < 10) return 'daybreak'
  if (hour >= 10 && hour < 17) return 'daylight'
  if (hour >= 17 && hour < 21) return 'dusk'
  return 'moonlit'
}

function browserPalette(): HealthPalette {
  if (typeof document === 'undefined') return 'classic'
  const value = document.documentElement.dataset.healthPalette
  return isHealthPalette(value ?? null) ? value : 'classic'
}

export function useSelectedWorldPalette(): HealthPalette {
  const [palette, setPalette] = useState<HealthPalette>(browserPalette)
  useEffect(() => {
    // Theme changes are synchronous; this observer only tracks the root's palette.
    const root = document.documentElement
    const observer = new MutationObserver(() => setPalette(browserPalette()))
    observer.observe(root, { attributes: true, attributeFilter: ['data-health-palette'] })
    return () => observer.disconnect()
  }, [])
  return palette
}

export function useWorldMood(): WorldMood {
  const [mood, setMood] = useState<WorldMood>('daylight')
  useEffect(() => {
    const refresh = () => setMood(worldMoodAtHour(new Date().getHours()))
    refresh()
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  return mood
}

/** Decorative composition: cached picture + semantic CSS light/accent layers.
 * Motion is short and respects OS reduced-motion; no canvas or infinite loops.
 */
export function IllustratedWorld({
  palette, stage = 'base', mood = 'dusk', trained = false,
}: {
  palette: HealthPalette
  stage?: WorldStage
  mood?: WorldMood
  trained?: boolean
}) {
  const scene = sceneForPalette(palette)
  const index = ORDER.indexOf(scene)
  const style = {
    '--world-row': String((index / (ORDER.length - 1)) * 100) + '%',
    '--world-focus': scene === 'dragon' ? '79%' : scene === 'bonfire' ? '77%' : '71%',
  } as CSSProperties
  return (
    <div className="illustrated-world" data-world={scene} data-palette={palette}
      data-world-stage={stage} data-world-mood={mood}
      data-world-trained={trained ? 'yes' : 'no'} style={style} aria-hidden="true">
      <span className="illustrated-world__image" />
      <span className="illustrated-world__wash" />
      <span className="illustrated-world__accent" />
      <span className="illustrated-world__stars">
        <i /><i /><i /><i /><i />
      </span>
      <span className="illustrated-world__shade" />
    </div>
  )
}
