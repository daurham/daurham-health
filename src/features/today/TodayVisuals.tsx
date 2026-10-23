import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { TodayViewModel } from '@/domain/today'
import { ThemeWorldScene } from './ThemeWorldScene'
import { worldStage, worldMoodForHour, isHydrationGoalMet } from './theme-worlds'
import { useRewardSummary } from '@/features/rewards/useRewardSummary'
import { prefixedPath, useAppPathPrefix, useDemoReadOnly } from '@/lib/app-prefix'
import { addHydrationEvent } from '@/features/daily-signals'
import type { HydrationEvent } from '@/domain/daily-signals'
import { progressionState } from '@/domain/progression'
import { readPalettePreference, themePackUnlockLevel, type HealthPalette } from '@/theme'

/** A useful first action over collectible art; the remaining shortcuts use
 * existing Today APIs. No additional network calls for art or daily metrics. */
export function TodayScenicHero({
  view, featuredAction, onAddFood, onWaterLogged,
}: {
  view: TodayViewModel
  featuredAction?: ReactNode
  onAddFood?: () => void
  onWaterLogged?: (event: HydrationEvent) => void
}) {
  const readOnly = useDemoReadOnly()
  const prefix = useAppPathPrefix()
  const [mood, setMood] = useState(() => worldMoodForHour(new Date().getHours()))
  const [waterBusy, setWaterBusy] = useState(false)
  const [waterError, setWaterError] = useState<string | null>(null)
  useEffect(() => {
    const update = () => setMood(worldMoodForHour(new Date().getHours()))
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    return () => { document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', update) }
  }, [])
  const { summary } = useRewardSummary(!readOnly)
  const palette: HealthPalette = typeof localStorage === 'undefined' ? 'classic' : readPalettePreference(localStorage)
  const currentLevel = progressionState(summary?.lifetimeXp ?? 0).level
  const stage = worldStage(themePackUnlockLevel(palette), currentLevel)
  const hydration = view.dailySignals?.hydration
  const hydrated = isHydrationGoalMet(hydration?.totalOz, hydration?.goalOz)
  const waterLabel = hydration?.totalOz == null ? 'Water not logged'
    : Math.round(hydration.totalOz) + (hydration.goalOz && hydration.goalOz > 0 ? ' / ' + Math.round(hydration.goalOz) : '') + ' oz water'
  const calories = view.nutrition.totals?.calories
  const caloriesLabel = calories?.status === 'available'
    ? Math.round(calories.value).toLocaleString('en-US') + ' kcal logged'
    : 'Food not logged'
  const lastSession = view.training.sessions[0]
  const checkInHref = prefixedPath(prefix, '/check-in?date=' + view.date)
  const nutritionHref = prefixedPath(prefix, '/nutrition?date=' + view.date)

  async function logWater() {
    if (waterBusy || readOnly) return
    setWaterBusy(true)
    setWaterError(null)
    try {
      const event = await addHydrationEvent(view.date, 8)
      onWaterLogged?.(event)
    } catch (cause) {
      setWaterError(cause instanceof Error ? cause.message : 'Water could not be logged.')
    } finally {
      setWaterBusy(false)
    }
  }

  return (
    <section className="today-command-center" aria-label="Today quick actions">
      <div className="today-scenic-hero" aria-label="Your next action">
        <ThemeWorldScene palette={palette} stage={stage} completed={view.training.logged} hydrated={hydrated} mood={mood} />
        <div className="today-scenic-content">
          <p className="today-scenic-eyebrow">{view.training.logged ? 'TRAINING LOGGED TODAY' : 'NEXT IN ROTATION · OPTIONAL'}</p>
          {view.training.logged ? (
            <div className="today-command-next">
              <h2 className="today-scenic-heading">{lastSession?.name ?? 'Workout complete'}</h2>
              <p className="today-command-meta">Your workout is recorded. Recovery or more activity is your choice.</p>
              {lastSession ? <Link className="today-command-primary" to={prefixedPath(prefix, '/training/' + lastSession.id)}>View workout <span aria-hidden="true">→</span></Link> : null}
            </div>
          ) : (
            featuredAction ?? (
              <div className="today-command-next">
                <h2 className="today-scenic-heading">Your training options</h2>
                <Link className="today-command-primary" to={prefixedPath(prefix, '/training')}>Open training <span aria-hidden="true">→</span></Link>
              </div>
            )
          )}
          <p className="today-command-snapshot">{caloriesLabel} <span aria-hidden="true">·</span> {waterLabel}</p>
        </div>
      </div>
      <nav className="today-command-shortcuts" aria-label="Quick logging">
        {readOnly ? (
          <Link to={nutritionHref} className="today-command-shortcut">
            <TodayDomainIcon domain="nutrition" /><span>Nutrition</span>
          </Link>
        ) : (
          <button type="button" onClick={onAddFood} disabled={!onAddFood} className="today-command-shortcut">
            <TodayDomainIcon domain="nutrition" /><span>Add food</span>
          </button>
        )}
        {readOnly ? (
          <Link to={checkInHref} className="today-command-shortcut">
            <TodayDomainIcon domain="hydration" /><span>Water</span>
          </Link>
        ) : (
          <button type="button" disabled={waterBusy} onClick={() => void logWater()} className="today-command-shortcut">
            <TodayDomainIcon domain="hydration" /><span>{waterBusy ? 'Logging…' : '+8 oz water'}</span>
          </button>
        )}
        <Link to={checkInHref} className="today-command-shortcut">
          <TodayDomainIcon domain="wellness" /><span>Check-in</span>
        </Link>
        <Link to={prefixedPath(prefix, '/supplements')} className="today-command-shortcut">
          <TodayDomainIcon domain="supplements" /><span>Supplements</span>
        </Link>
      </nav>
      {waterError ? <p className="today-command-error" role="alert">{waterError}</p> : null}
    </section>
  )
}

/** Domain icons inherit the selected palette; meaning is also conveyed by text. */
export function TodayDomainIcon({ domain }: { domain: 'nutrition' | 'training' | 'hydration' | 'activity' | 'sleep' | 'body' | 'wellness' | 'supplements' }) {
  const paths: Record<typeof domain, ReactNode> = {
    nutrition: <><path d="M5 3v7a3 3 0 0 0 6 0V3M8 3v18M17 3v18M17 3c-4 4-4 9 0 11h3V3" /></>,
    training: <><path d="m6 7 11 11M4 10 10 4M14 20l6-6M2 13l5-5M16 22l6-6" /></>,
    hydration: <path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z" />,
    activity: <><path d="M3 17h4l3-10 4 13 3-8 2 5h2" /></>,
    sleep: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />,
    body: <><circle cx="12" cy="6" r="3" /><path d="M5 21v-4c0-4 3-7 7-7s7 3 7 7v4M9 16v5M15 16v5" /></>,
    wellness: <><path d="M12 21s-8-4.4-8-10a4.5 4.5 0 0 1 8-2.7A4.5 4.5 0 0 1 20 11c0 5.6-8 10-8 10Z" /><path d="M8 13h2l1-2 2 4 1-2h2" /></>,
    supplements: <><path d="m9 4 11 11a5 5 0 0 1-7 7L4 13a5 5 0 0 1 5-9ZM8 17l9-9" /></>,
  }
  return <span className={`today-domain-icon today-domain-icon--${domain}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[domain]}
    </svg>
  </span>
}
