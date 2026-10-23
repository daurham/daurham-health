import type { CSSProperties } from 'react'
import './theme-world-hydration.css'
import type { HealthPalette } from '@/theme'
import { worldSceneImage, WORLD_SCENE_ROW, type WorldMood, type WorldStage } from './theme-worlds'

export function ThemeWorldScene({ palette, stage = 'base', completed = false, hydrated = false, mood = 'dusk', className = '' }: {
  palette: HealthPalette
  stage?: WorldStage
  completed?: boolean
  hydrated?: boolean
  mood?: WorldMood
  className?: string
}) {
  // The parent supplies one stable local daypart; no scene timers or polling.
  const backgroundStyle = {
    backgroundImage: `url("${worldSceneImage(palette)}")`,
  } satisfies CSSProperties

  return (
    <div className={['world-scene', className].filter(Boolean).join(' ')}
      data-world-palette={palette} data-world-art-row={WORLD_SCENE_ROW[palette]} data-world-stage={stage}
      data-world-celebrating={completed ? 'yes' : 'no'} data-world-hydrated={hydrated ? 'yes' : 'no'} data-world-mood={mood}
      aria-hidden="true">
      <div className="world-scene-art" style={backgroundStyle} />
      <div className="world-scene-tint" />
      <div className="world-scene-horizon" />
      <div className="world-scene-hydration" />
      <div className="world-scene-glints"><i /><i /><i /><i /></div>
    </div>
  )
}
