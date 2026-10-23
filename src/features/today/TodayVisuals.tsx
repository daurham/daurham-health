import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { TodayViewModel } from '@/domain/today'
import { ThemeWorldScene } from './ThemeWorldScene'
import { worldStage, worldMoodForHour, isHydrationGoalMet, readWorldStageChoice, resolveWorldStageChoice, WORLD_STAGE_CHANGE_EVENT } from './theme-worlds'
import { useRewardSummary } from '@/features/rewards/useRewardSummary'
import { prefixedPath, useAppPathPrefix, useDemoReadOnly } from '@/lib/app-prefix'
import { addHydrationEvent } from '@/features/daily-signals'
import type { HydrationEvent } from '@/domain/daily-signals'
import { progressionState } from '@/domain/progression'
import { fallbackDailyQuote, loadDailyQuote } from './daily-quote'
import { readPalettePreference, themePackUnlockLevel, type HealthPalette } from '@/theme'

/** Scenic daily encouragement; nutrition, hydration, and training remain one tap away.
 * The image is the focal point; nothing waits for a quote API to render.
 */
export function TodayScenicHero({
  view, onAddFood, onWaterLogged,
}: {
  view: TodayViewModel
  onAddFood?: () => void
  onWaterLogged?: (event: HydrationEvent) => void
}) {
  const readOnly = useDemoReadOnly()
  const prefix = useAppPathPrefix()
  const [mood, setMood] = useState(() => worldMoodForHour(new Date().getHours()))
  const [dailyQuote, setDailyQuote] = useState(() => fallbackDailyQuote(view.date))
  const [, setStageRevision] = useState(0)
  const [waterBusy, setWaterBusy] = useState(false)
  const [waterError, setWaterError] = useState<string | null>(null)
  useEffect(() => {
    const update = () => setMood(worldMoodForHour(new Date().getHours()))
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    return () => { document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', update) }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setDailyQuote(fallbackDailyQuote(view.date))
    void loadDailyQuote(view.date, controller.signal).then((quote) => {
      if (!controller.signal.aborted) setDailyQuote(quote)
    })
    return () => controller.abort()
  }, [view.date])
  useEffect(() => {
    const refresh = () => setStageRevision((revision) => revision + 1)
    window.addEventListener(WORLD_STAGE_CHANGE_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(WORLD_STAGE_CHANGE_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  const { summary } = useRewardSummary(!readOnly)
  const palette: HealthPalette = typeof localStorage === 'undefined' ? 'classic' : readPalettePreference(localStorage)
  const currentLevel = progressionState(summary?.lifetimeXp ?? 0).level
  const highestStage = worldStage(themePackUnlockLevel(palette), currentLevel)
  const stage = resolveWorldStageChoice(readWorldStageChoice(typeof localStorage === 'undefined' ? null : localStorage, palette), highestStage)
  const hydration = view.dailySignals?.hydration
  const hydrated = isHydrationGoalMet(hydration?.totalOz, hydration?.goalOz)
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
      <div className="today-scenic-hero" aria-label="Daily encouragement">
        <ThemeWorldScene palette={palette} stage={stage} completed={view.training.logged} hydrated={hydrated} mood={mood} />
        <div className="today-scenic-content">
          <p className="today-scenic-eyebrow">TODAY'S PERSPECTIVE</p>
          <blockquote className="today-scenic-quote">“{dailyQuote.quote}”</blockquote>
          <p className="today-scenic-attribution">— {dailyQuote.author}</p>
        </div>
      </div>
      <nav className="today-command-shortcuts" data-has-supplements={view.supplements ? 'yes' : 'no'} aria-label="Quick logging">
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
        {view.supplements ? (
          <Link to={prefixedPath(prefix, '/supplements')} className="today-command-shortcut">
            <TodayDomainIcon domain="supplements" /><span>Supplements</span>
          </Link>
        ) : null}
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
