import type { CSSProperties } from 'react'
import type { HealthPalette } from '@/theme'
import { WORLD_SCENE_ROW, type WorldStage } from './theme-worlds'

export function ThemeWorldScene({ palette, stage = 'base', completed = false, date, className = '' }: {
  palette: HealthPalette
  stage?: WorldStage
  completed?: boolean
  date?: string
  className?: string
}) {
  const day = date ?? ''
  const hourMood = (() => {
    // Preview scenes never depend on browser clock; Today uses this only as a
    // static, decorative date-time hint and does not poll/animate in the background.
    if (!day) return 'dusk'
    return 'dusk'
  })()
  const row = WORLD_SCENE_ROW[palette]
  const backgroundStyle = {
    backgroundPosition: 'center ' + (row * 100 / 7).toFixed(5) + '%',
  } satisfies CSSProperties

  return (
    <div className={['world-scene', className].filter(Boolean).join(' ')}
      data-world-palette={palette} data-world-stage={stage}
      data-world-celebrating={completed ? 'yes' : 'no'} data-world-mood={hourMood}
      aria-hidden="true">
      <div className="world-scene-art" style={backgroundStyle} />
      <div className="world-scene-tint" />
      <div className="world-scene-horizon" />
      <div className="world-scene-glints"><i /><i /><i /><i /></div>
    </div>
  )
}
