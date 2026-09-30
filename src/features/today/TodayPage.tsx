import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AskHealthLink } from '@/features/ask-health/AskHealthLink'
import { formatBodyMass } from '@/domain/body-metrics'
import { bodyReminderCopy, measureHref } from '@/domain/body-cadence'
import { NUTRITION_CONFIG, type NutritionDayTotals, type NutritionFood } from '@/domain/nutrition'
import { formatWeekdayCalendarDate, formatCalendarRange } from '@/domain/calendar-format'
import { sessionIntentLabel } from '@/domain/training'
import { dailyContextTagLabel } from '@/domain/context'
import type { TodayViewModel } from '@/domain/today'
import { HEALTH_CALENDAR_TIME_ZONE } from '@/domain/time'
import {
  LoadErrorNotice,
  PendingLoadRegion,
  primaryButtonClass,
  quietButtonClass,
  useAtomicKeyedResource,
} from '@/lib'
import { AddFoodSheet } from '@/features/nutrition/panels'
import { createNutritionEntry, fetchNutritionDay } from '@/features/nutrition/api'
import { formatSleepDuration } from '@/features/progress/activity-sleep-copy'
import { formatCalendarDate, formatClockTime } from '@/features/progress/format'
import { caloriesHeadline, macroHeadline, remainingHeadline } from '@/features/nutrition/format'
import {
  aggregateOccurrenceStates,
  checkboxAdherenceAction,
  formatPlannedDose,
  supplementDaySummary,
  supplementSummaryText,
  type TodaySupplementItem,
} from '@/domain/supplements'
import { recordSupplementAdherence } from '@/features/supplements/api'
import { prefixedPath, useAppPathPrefix, useDemoReadOnly } from '@/lib/app-prefix'
import { fetchToday } from './api'
import { CoachCard } from '@/features/coach/CoachCard'
import { TrendSignal } from '@/components/TrendSignal'
import { DEFAULT_TREND_PREFERENCES, resolveTrendMeaning, type TrendMetric } from '@/domain/trend-intent'
import { useActiveTrendGoals } from '@/features/goals/useActiveTrendGoals'
import { useTrendPreferences } from '@/lib/use-trend-preferences'
import { ensureCoach } from '@/features/coach/api'
import type { CoachState } from '@/domain/coach'
import { todayShouldReloadAfterNutrition, type TodayNutritionOutcome } from './nutrition-refresh'
import { notifyHealthDataChanged, subscribeHealthDataChanges } from '@/lib/health-changes'

function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function TodayPage() {
  const readOnly = useDemoReadOnly()
  const [coach, setCoach] = useState<CoachState | null>(null)
  const [coachPending, setCoachPending] = useState(false)
  const [coachError, setCoachError] = useState<string | null>(null)
  const load = useCallback((_key: string, signal: AbortSignal) => fetchToday(signal), [])
  const resource = useAtomicKeyedResource({ requestedKey: 'today', load })
  const view = resource.data
  const coachRequests = useRef({ generation: 0 })
  const retryToday = useRef(resource.retry)
  retryToday.current = resource.retry

  const loadCoach = useCallback(async () => {
    if (readOnly) return
    const generation = ++coachRequests.current.generation
    setCoachPending(true)
    setCoachError(null)
    try {
      const next = await ensureCoach()
      if (generation === coachRequests.current.generation) setCoach(next)
    } catch (caught) {
      if (generation === coachRequests.current.generation) {
        setCoachError(caught instanceof Error ? caught.message : 'Coach is unavailable.')
      }
    } finally {
      if (generation === coachRequests.current.generation) setCoachPending(false)
    }
  }, [readOnly])

  useEffect(() => {
    if (readOnly) return
    const requests = coachRequests.current
    const unsubscribe = subscribeHealthDataChanges(() => {
      retryToday.current()
      void loadCoach()
    })
    return () => {
      unsubscribe()
      ++requests.generation
    }
  }, [readOnly, loadCoach])

  useEffect(() => {
    if (!readOnly) {
      void loadCoach()
    }
  }, [readOnly, loadCoach])

  return (
    <section className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {view ? formatWeekdayCalendarDate(view.date) : 'America/Phoenix'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AskHealthLink />
          <button
            type="button"
            onClick={() => {
              resource.retry()
              void loadCoach()
            }}
            className="motion-interactive inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            {resource.isPending && view ? 'Refreshing' : '↻ Refresh'}
          </button>
        </div>
      </div>
      <div className="mt-5">
        <PendingLoadRegion pending={resource.isPending} pendingVisible={resource.pendingVisible}>
          {view ? (
            <TodayBoard
              view={view}
              onNutritionChanged={notifyHealthDataChanged}
              onSupplementsChanged={notifyHealthDataChanged}
              coach={coach}
              coachPending={coachPending}
              coachError={coachError}
              onCoachState={(next) => {
                ++coachRequests.current.generation
                setCoach(next)
                setCoachPending(false)
                setCoachError(null)
                resource.retry()
              }}
            />
          ) : (
            <div className="h-64 animate-pulse rounded-lg bg-zinc-200" aria-busy="true" aria-label="Loading today" />
          )}
        </PendingLoadRegion>
        {resource.error ? (
          <div className="mt-3">
            <LoadErrorNotice
              message={view ? 'Could not refresh Today. Showing the last loaded day.' : resource.error.message}
              onRetry={() => resource.retry()}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function TodayBoard({
  view,
  onNutritionChanged,
  onSupplementsChanged,
  coach,
  coachPending,
  coachError,
  onCoachState,
}: {
  view: TodayViewModel
  onNutritionChanged?: () => void
  onSupplementsChanged?: () => void
  coach?: CoachState | null
  coachPending?: boolean
  coachError?: string | null
  onCoachState?: (state: CoachState) => void
}) {
  const prefix = useAppPathPrefix()
  const readOnly = useDemoReadOnly()
  const { goals: trendGoals, pending: trendGoalsPending } = useActiveTrendGoals(!readOnly)
  const storedTrendPreferences = useTrendPreferences()
  const trendPreferences = readOnly || trendGoalsPending ? DEFAULT_TREND_PREFERENCES : storedTrendPreferences

  function metricForChangedItem(id: string): TrendMetric | null {
    if (id === 'activity:steps:recent') return { kind: 'activity_steps' }
    if (id === 'body:weight_trend') return { kind: 'body', metricKey: 'weight' }
    return null
  }

  return (
    <div className="space-y-3">
      <div className="grid items-start gap-3 md:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <NutritionCard view={view} onNutritionChanged={onNutritionChanged} />
        <div className="space-y-3">
          {onCoachState ? (
            <CoachCard
              state={coach ?? null}
              pending={coachPending}
              error={coachError}
              onState={onCoachState}
            />
          ) : null}
          <TrainingCard view={view} />
        </div>
      </div>

      {view.pendingItems.length > 0 || view.goalAttention.length > 0 ? (
        <section className="rounded-lg border border-warning/30 bg-amber-50 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Needs attention</h2>
            <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
              {view.pendingItems.map((item) => (
                <li key={item.id} className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm text-zinc-800">{item.title}</span>
                  <Link to={prefixedPath(prefix, item.href)} className={quietButtonClass}>{item.action}</Link>
                </li>
              ))}
              {view.goalAttention.map((item) => (
                <li key={item.key} className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm text-zinc-800">{item.title}</span>
                  <Link to={prefixedPath(prefix, item.href)} className={quietButtonClass}>{item.action}</Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <SupplementsCard view={view} onChanged={onSupplementsChanged} />
      <div className="grid items-start gap-3 md:grid-cols-3">
        <ActivityCard view={view} />
        <SleepCard view={view} />
        <BodyCard view={view} />
      </div>
      <ContextCard view={view} />
      <LabCard view={view} />
      {view.changedItems.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What changed</h2>
          <ul className="mt-3 space-y-4">
            {view.changedItems.map((item) => {
              const metric = metricForChangedItem(item.id)
              const direction = item.direction ?? 'stable'
              const resolution = metric
                ? resolveTrendMeaning({ metric, direction, goals: trendGoals, preferences: trendPreferences })
                : { meaning: 'neutral' as const, source: 'neutral' as const }
              return (
                <li key={item.id}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-medium text-zinc-900">{item.headline}</p>
                    {item.direction ? <TrendSignal direction={direction} {...resolution} compact /> : null}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-zinc-600">{item.detail}</p>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
      {view.patterns.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Patterns</h2>
          <ul className="mt-2 space-y-2 text-sm text-zinc-700">
            {view.patterns.map((item) => (
              <li
                key={item.id}
                className={
                  item.tone === 'positive'
                    ? 'signal-positive-surface rounded-md px-3 py-2'
                    : item.tone === 'negative'
                      ? 'signal-negative-surface rounded-md px-3 py-2'
                      : 'px-1 py-1'
                }
              >
                <div className="flex items-start gap-2">
                  {item.tone !== 'neutral' ? (
                    <span className={item.tone === 'positive' ? 'trend-toward font-semibold' : 'trend-away font-semibold'}>
                      {item.tone === 'positive' ? '↑' : '↓'}
                    </span>
                  ) : null}
                  <span>{item.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

    </div>
  )
}

function LabCard({ view }: { view: TodayViewModel }) {
  const readOnly = useDemoReadOnly()
  const prefix = useAppPathPrefix()
  if (readOnly || view.lab.experiments.length === 0) {
    return null
  }
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Experiment</h2>
        <Link to={prefixedPath(prefix, '/lab')} className={quietButtonClass}>
          Open Lab
        </Link>
      </div>
      <ul className="mt-3 space-y-3">
        {view.lab.experiments.map((experiment) => (
          <li key={experiment.id}>
            <Link to={prefixedPath(prefix, `/lab/experiments/${experiment.id}`)} className="text-sm font-medium text-zinc-900 hover:underline">
              {experiment.title}
            </Link>
            <p className="mt-0.5 text-sm text-zinc-600">
              {experiment.reviewReady
                ? 'Ready to review'
                : experiment.status === 'active' && experiment.windowEnd === view.date
                  ? 'Ends today'
                  : `${experiment.status === 'active' ? 'Active' : 'Scheduled'} · ${formatCalendarRange(experiment.windowStart, experiment.windowEnd)}`}
            </p>
            {experiment.reviewReady ? (
              <Link to={prefixedPath(prefix, `/lab/experiments/${experiment.id}/result`)} className="mt-1 inline-flex min-h-11 items-center text-sm text-zinc-700 hover:underline">
                Review result
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ContextCard({ view }: { view: TodayViewModel }) {
  const readOnly = useDemoReadOnly()
  const prefix = useAppPathPrefix()
  if (readOnly && !view.context.recorded) {
    return null
  }
  const href = prefixedPath(prefix, `/context?date=${view.date}&from=today`)
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Context</h2>
      {view.context.recorded ? (
        <div className="mt-3 space-y-2">
          {view.context.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {view.context.tags.map((tag) => (
                <li key={tag} className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-800">
                  {dailyContextTagLabel(tag)}
                </li>
              ))}
            </ul>
          ) : null}
          {view.context.note ? <p className="text-sm text-zinc-700">{view.context.note}</p> : null}
          {readOnly ? null : (
            <Link to={href} className={quietButtonClass}>
              Edit
            </Link>
          )}
        </div>
      ) : (
        <Link to={href} className={`${quietButtonClass} mt-2`}>
          + Add context
        </Link>
      )}
    </section>
  )
}

function shownDose(item: TodaySupplementItem): string {
  if (item.actualDoseAmount != null && item.actualDoseUnit) {
    return formatPlannedDose(item.actualDoseAmount, item.actualDoseUnit)
  }
  return formatPlannedDose(item.plannedDoseAmount, item.plannedDoseUnit)
}

function SupplementsCard({ view, onChanged }: { view: TodayViewModel; onChanged?: () => void }) {
  const supplements = view.supplements
  const readOnly = useDemoReadOnly()
  const [items, setItems] = useState(supplements?.items ?? [])
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [expandedResolved, setExpandedResolved] = useState(false)

  useEffect(() => {
    setItems(supplements?.items ?? [])
  }, [supplements])

  if (!supplements) {
    return null
  }

  const counts = aggregateOccurrenceStates(items.map((item) => item.state))
  const summary = supplementDaySummary(counts)
  const summaryText = supplementSummaryText(summary)
  const resolved = items.length > 0 && counts.unknownCount === 0
  const showItems = !resolved || expandedResolved

  async function record(item: TodaySupplementItem, action: 'taken' | 'skipped' | 'clear') {
    const previous = items
    setError(null)
    setPendingId(item.scheduleId)
    setItems((current) =>
      current.map((row) =>
        row.scheduleId === item.scheduleId
          ? { ...row, state: action === 'clear' ? 'unknown' : action, actualDoseAmount: action === 'clear' ? null : row.actualDoseAmount, actualDoseUnit: action === 'clear' ? null : row.actualDoseUnit }
          : row,
      ),
    )
    try {
      await recordSupplementAdherence({
        scheduleId: item.scheduleId,
        supplementId: item.supplementId,
        scheduledDate: view.date,
        action,
      })
      onChanged?.()
    } catch (caught) {
      setItems(previous)
      setError(caught instanceof Error ? caught.message : 'Could not record that supplement')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Supplements</h2>
        <div className="flex items-center gap-2">
          <p className="text-sm text-zinc-600">{summary.kind === 'complete' ? `✓ ${summaryText}` : summaryText}</p>
          {resolved ? (
            <button type="button" className={quietButtonClass} onClick={() => setExpandedResolved((value) => !value)}>
              {expandedResolved ? 'Collapse' : 'Review'}
            </button>
          ) : null}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-800">Nothing scheduled today</p>
      ) : showItems ? (
        <ul className="motion-notice mt-2 space-y-1">
          {items.map((item) => (
            <li key={item.scheduleId} className="flex items-center gap-2" data-state={item.state}>
              {readOnly ? (
                <span className="inline-flex min-h-11 min-w-11 items-center justify-center text-lg" aria-hidden="true">
                  {item.state === 'taken' ? '☑' : '☐'}
                </span>
              ) : (
                <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    className="h-6 w-6"
                    checked={item.state === 'taken'}
                    disabled={pendingId === item.scheduleId}
                    aria-label={item.state === 'taken' ? `Clear ${item.name}` : `Mark ${item.name} taken`}
                    onChange={() => {
                      void record(item, checkboxAdherenceAction(item.state))
                    }}
                  />
                </label>
              )}
              <div className="min-w-0 flex-1">
                <p className={item.state === 'skipped' ? 'text-sm text-zinc-500' : 'text-sm text-zinc-900'}>
                  {item.name}
                  {item.slotLabel ? <span className="text-zinc-500"> · {item.slotLabel}</span> : null}
                </p>
                {item.state === 'skipped' ? <p className="text-sm text-zinc-500">Skipped</p> : null}
              </div>
              <p className="shrink-0 text-sm text-zinc-700">{shownDose(item)}</p>
              {readOnly ? null : item.state === 'unknown' ? (
                <button
                  type="button"
                  className={quietButtonClass}
                  disabled={pendingId === item.scheduleId}
                  onClick={() => {
                    void record(item, 'skipped')
                  }}
                >
                  Skip
                </button>
              ) : null}
              {readOnly ? null : item.state === 'skipped' ? (
                <button
                  type="button"
                  className={quietButtonClass}
                  disabled={pendingId === item.scheduleId}
                  onClick={() => {
                    void record(item, 'clear')
                  }}
                >
                  Clear
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-zinc-500">
          {counts.skippedCount > 0
            ? `${counts.takenCount} taken · ${counts.skippedCount} skipped`
            : `${counts.takenCount}/${counts.scheduledCount} taken`}
        </p>
      )}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {readOnly ? null : (
        <div className="mt-2">
          <QuietAction to="/supplements">Manage</QuietAction>
        </div>
      )}
    </section>
  )
}

function Card({ title, children, hero = false }: { title: string; children: ReactNode; hero?: boolean }) {
  return (
    <section className={hero ? 'health-hero-surface health-raised-surface min-w-0 rounded-xl border border-zinc-200 p-4 sm:p-5' : 'min-w-0 rounded-lg border border-zinc-200 bg-white p-4'}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="mt-2 text-sm text-zinc-800">{children}</div>
    </section>
  )
}

function PrimaryAction({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className={primaryButtonClass}>
      {children}
    </Link>
  )
}

function QuietAction({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className={quietButtonClass}>
      {children}
    </Link>
  )
}

function NutrientMeter({
  label,
  consumed,
  target,
}: {
  label: string
  consumed: number | null
  target: number | null
}) {
  if (consumed == null || target == null || target <= 0) {
    return null
  }
  const ratio = consumed / target
  const width = Math.min(ratio, 1) * 100
  return (
    <div
      className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={consumed}
    >
      <div className="motion-meter h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
    </div>
  )
}

function NutritionCard({
  view,
  onNutritionChanged,
}: {
  view: TodayViewModel
  onNutritionChanged?: () => void
}) {
  const nutrition = view.nutrition
  const readOnly = useDemoReadOnly()
  const dateHref = prefixedPath(useAppPathPrefix(), `/nutrition?date=${view.date}`)
  return (
    <Card title="Nutrition" hero>
      {nutrition.logged && nutrition.totals ? (
        <NutritionTotals totals={nutrition.totals} target={nutrition.target} />
      ) : (
        <p>No food logged yet today.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4">
        {readOnly ? null : (
          <TodayAddFoodAction date={view.date} onChanged={onNutritionChanged} />
        )}
        <QuietAction to={dateHref}>View nutrition</QuietAction>
      </div>
    </Card>
  )
}

function TodayAddFoodAction({ date, onChanged }: { date: string; onChanged?: () => void }) {
  const [open, setOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState<{
    recents: NutritionFood[]
    staples: NutritionFood[]
    recipes: NutritionFood[]
  }>({ recents: [], staples: [], recipes: [] })

  async function openSheet() {
    setOpen(true)
    try {
      const day = await fetchNutritionDay(date)
      setQuickAdd(day.quickAdd)
    } catch {
      setQuickAdd({ recents: [], staples: [], recipes: [] })
    }
  }

  function closeSheet() {
    setOpen(false)
  }

  function finish(outcome: TodayNutritionOutcome) {
    closeSheet()
    if (todayShouldReloadAfterNutrition(outcome)) {
      onChanged?.()
    }
  }

  return (
    <>
      <button type="button" className={primaryButtonClass} onClick={() => void openSheet()}>
        Add food
      </button>
      {open ? (
        <AddFoodSheet
          date={date}
          quickAdd={quickAdd}
          onClose={closeSheet}
          onLogged={() => finish('consumed')}
          onSavedFood={() => finish('saved_for_later')}
          onMealLogged={() => finish('consumed')}
          onQuickLog={(food) => {
            void createNutritionEntry({
              logDate: date,
              timezone: NUTRITION_CONFIG.calendarTimeZone,
              foodId: food.id,
              servingQuantity: 1,
            })
              .then(() => finish('consumed'))
              .catch(() => undefined)
          }}
          onOpenFood={() => undefined}
        />
      ) : null}
    </>
  )
}

function NutritionTotals({
  totals,
  target,
}: {
  totals: NutritionDayTotals
  target: TodayViewModel['nutrition']['target']
}) {
  const calories = totals.calories.status === 'available' ? totals.calories.value : null
  const calorieRemainder = remainingHeadline(totals.calories, target?.calories ?? null, 'kcal')
  const macros = [
    { label: 'Protein', total: totals.protein, target: target?.protein ?? null, unit: 'g' as const },
    { label: 'Carbs', total: totals.carbs, target: target?.carbs ?? null, unit: 'g' as const },
    { label: 'Fat', total: totals.fat, target: target?.fat ?? null, unit: 'g' as const },
  ]
  const secondary = [
    { label: 'Fiber', total: totals.fiber, target: target?.fiber ?? null, unit: 'g' as const },
    { label: 'Sodium', total: totals.sodium, target: target?.sodium ?? null, unit: 'mg' as const },
  ]
  return (
    <div>
      <p className="text-2xl font-semibold tracking-tight text-zinc-900">
        {caloriesHeadline(totals.calories, target?.calories ?? null)}
        {calorieRemainder ? <span className="ml-2 text-base font-medium text-zinc-500">{calorieRemainder}</span> : null}
      </p>
      <NutrientMeter label="Calories" consumed={calories} target={target?.calories ?? null} />
      <ul className="mt-3 space-y-2">
        {macros.map((row) => {
          const consumed = row.total.status === 'available' ? row.total.value : null
          const remainder = remainingHeadline(row.total, row.target, row.unit)
          return (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span>
                  {row.label} {macroHeadline(row.total, row.target, row.unit)}
                </span>
                {remainder ? <span className="shrink-0 text-zinc-500">{remainder}</span> : null}
              </div>
              <NutrientMeter label={row.label} consumed={consumed} target={row.target} />
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-zinc-500">
        {secondary.map((row) => `${row.label} ${macroHeadline(row.total, row.target, row.unit)}`).join(' · ')}
      </p>
    </div>
  )
}

function TrainingCard({ view }: { view: TodayViewModel }) {
  const prefix = useAppPathPrefix()
  const readOnly = useDemoReadOnly()
  return (
    <Card title="Training">
      {view.training.logged ? (
        <ul className="space-y-3">
          {view.training.sessions.map((session) => (
            <li key={session.id}>
              <p className="text-lg font-semibold tracking-tight text-zinc-900">{session.name}</p>
              <p className="text-sm text-zinc-500">{sessionIntentLabel(session.sessionType)}</p>
              <p className="text-zinc-600">
                {countLabel(session.exerciseCount, 'exercise', 'exercises')} · {countLabel(session.workingSetCount, 'working set', 'working sets')}
              </p>
              <div className="mt-2">
                <QuietAction to={prefixedPath(prefix, `/training/${session.id}`)}>View workout</QuietAction>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p>No training session logged today</p>
          {readOnly ? null : (
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryAction to={prefixedPath(prefix, '/training/import')}>Log workout</PrimaryAction>
              <QuietAction to={prefixedPath(prefix, '/training/new?type=ad_hoc')}>Ad-hoc workout</QuietAction>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function ActivityCard({ view }: { view: TodayViewModel }) {
  const activity = view.activity
  const synced = activity.updatedAt ? formatClockTime(activity.updatedAt, HEALTH_CALENDAR_TIME_ZONE) : null
  const secondary = [
    activity.activeEnergyKcal != null ? `${formatCount(activity.activeEnergyKcal)} active kcal` : null,
    activity.exerciseMinutes != null ? `${formatCount(activity.exerciseMinutes)} exercise min` : null,
    activity.restingHeartRateBpm != null ? `Resting HR ${formatCount(activity.restingHeartRateBpm)} bpm` : null,
  ].filter((line): line is string => line != null)
  return (
    <Card title="Activity">
      {activity.steps != null || secondary.length > 0 || activity.workouts.length > 0 ? (
        <>
          {activity.steps != null ? (
            <>
              <p className="text-2xl font-semibold tracking-tight text-zinc-900">{formatCount(activity.steps)}</p>
              <p className="text-zinc-600">steps so far</p>
            </>
          ) : null}
          {secondary.map((line) => (
            <p key={line} className="mt-1">
              {line}
            </p>
          ))}
          {activity.workouts.map((workout) => (
            <p key={workout.id} className="mt-1">
              {workout.line}
            </p>
          ))}
          {activity.additionalWorkoutCount > 0 ? (
            <p className="mt-1 text-zinc-600">{activity.additionalWorkoutCount} more</p>
          ) : null}
          <p className="mt-2 text-zinc-600">
            {synced ? `In progress · synced ${synced}` : 'Today is still in progress'}
          </p>
        </>
      ) : (
        <p>No activity data received yet today.</p>
      )}
      <div className="mt-2">
        <QuietAction to={prefixedPath(useAppPathPrefix(), '/progress/activity')}>View activity</QuietAction>
      </div>
    </Card>
  )
}

function SleepCard({ view }: { view: TodayViewModel }) {
  const sleep = view.sleep
  const prefix = useAppPathPrefix()
  const nightDate = sleep.kind === 'none' ? sleep.latestComplete?.date ?? null : view.date
  const nightHref = nightDate ? prefixedPath(prefix, `/progress/sleep/${nightDate}`) : null
  return (
    <Card title="Sleep">
      {sleep.kind === 'complete' && sleep.minutes != null ? (
        <>
          <p className="text-2xl font-semibold tracking-tight text-zinc-900">{formatSleepDuration(sleep.minutes)}</p>
          {sleep.sourceName ? <p className="text-zinc-600">{sleep.sourceName}</p> : null}
        </>
      ) : null}
      {sleep.kind === 'partial' && sleep.minutes != null ? (
        <>
          <p className="text-lg font-semibold tracking-tight text-zinc-900">{formatSleepDuration(sleep.minutes)} observed</p>
          <p className="text-zinc-600">Partial observation{sleep.sourceName ? ` · ${sleep.sourceName}` : ''}</p>
        </>
      ) : null}
      {sleep.kind === 'none' ? <p>No complete sleep record today</p> : null}
      {sleep.latestComplete ? (
        <div className="mt-2 text-zinc-600">
          <p>Latest complete</p>
          <p>
            {formatCalendarDate(sleep.latestComplete.date)} · {formatSleepDuration(sleep.latestComplete.minutes)}
          </p>
          {sleep.latestComplete.sourceName ? <p>{sleep.latestComplete.sourceName}</p> : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-3">
        {nightHref ? <QuietAction to={nightHref}>View night</QuietAction> : null}
        <QuietAction to={prefixedPath(prefix, '/progress/sleep')}>View sleep</QuietAction>
      </div>
    </Card>
  )
}

function BodyCard({ view }: { view: TodayViewModel }) {
  const body = view.body
  const readOnly = useDemoReadOnly()
  const prefix = useAppPathPrefix()
  const href = prefixedPath(prefix, '/body')
  const due = body.measurementDue
  const copy = due ? bodyReminderCopy(due) : null
  const measureTo = due ? prefixedPath(prefix, measureHref(due.metricKey)) : href
  return (
    <Card title="Body">
      {body.latest ? (
        <>
          <p className="text-2xl font-semibold tracking-tight text-zinc-900">
            {formatBodyMass(body.latest.value, body.latest.unit)}
          </p>
          <p className="text-zinc-600">{body.latest.measuredLabel}</p>
          {body.trendText ? <p className="mt-1 text-zinc-600">{body.trendText}</p> : null}
        </>
      ) : (
        <p>No body measurement recorded yet.</p>
      )}
      {copy && due ? (
        <div className="mt-3">
          <p className="font-semibold text-amber-800">{copy.title}</p>
          <p className="text-zinc-600">{copy.detail}</p>
          {copy.more ? <p className="text-zinc-600">{copy.more}</p> : null}
          {body.goalSupport ? <p className="text-zinc-600">{body.goalSupport}</p> : null}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-4">
        {readOnly ? null : due ? <PrimaryAction to={measureTo}>Measure</PrimaryAction> : <PrimaryAction to={href}>Add measurement</PrimaryAction>}
        <QuietAction to={href}>View body</QuietAction>
      </div>
    </Card>
  )
}
