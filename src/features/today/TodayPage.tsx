import { useCallback, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatBodyMass } from '@/domain/body-metrics'
import type { NutritionDayTotals } from '@/domain/nutrition'
import { formatWeekdayCalendarDate } from '@/domain/calendar-format'
import type { TodayViewModel } from '@/domain/today'
import { HEALTH_CALENDAR_TIME_ZONE } from '@/domain/time'
import { LoadErrorNotice, PendingLoadRegion, useAtomicKeyedResource } from '@/lib'
import { formatSleepDuration } from '@/features/progress/activity-sleep-copy'
import { formatCalendarDate, formatClockTime } from '@/features/progress/format'
import { caloriesHeadline, macroHeadline, remainingHeadline } from '@/features/nutrition/format'
import { prefixedPath, useAppPathPrefix, useDemoReadOnly } from '@/lib/app-prefix'
import { fetchToday } from './api'

function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function TodayPage() {
  const load = useCallback((_key: string, signal: AbortSignal) => fetchToday(signal), [])
  const resource = useAtomicKeyedResource({ requestedKey: 'today', load })
  const view = resource.data
  return (
    <section className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {view ? formatWeekdayCalendarDate(view.date) : 'America/Phoenix'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => resource.retry()}
          className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-zinc-600 hover:text-zinc-900"
        >
          {resource.isPending && view ? 'Refreshing' : '↻ Refresh'}
        </button>
      </div>
      <div className="mt-5">
        <PendingLoadRegion pending={resource.isPending} pendingVisible={resource.pendingVisible}>
          {view ? (
            <TodayBoard view={view} />
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

export function TodayBoard({ view }: { view: TodayViewModel }) {
  const prefix = useAppPathPrefix()
  return (
    <div className="space-y-3">
      {view.pendingItems.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Needs attention</h2>
          <ul className="mt-3 space-y-2">
            {view.pendingItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-sm text-zinc-800">{item.title}</p>
                <Link
                  to={prefixedPath(prefix, item.href)}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white"
                >
                  {item.action}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="grid items-start gap-3 md:grid-cols-2">
        <NutritionCard view={view} />
        <TrainingCard view={view} />
      </div>
      <div className="grid items-start gap-3 md:grid-cols-3">
        <ActivityCard view={view} />
        <SleepCard view={view} />
        <BodyCard view={view} />
      </div>
      {view.changedItems.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What changed</h2>
          <ul className="mt-3 space-y-4">
            {view.changedItems.map((item) => (
              <li key={item.id}>
                <p className="text-sm font-medium text-zinc-900">
                  {item.direction === 'higher' ? '↑ ' : item.direction === 'lower' ? '↓ ' : ''}
                  {item.headline}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-zinc-600">{item.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {view.patterns.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Patterns</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            {view.patterns.map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="mt-2 text-sm text-zinc-800">{children}</div>
    </section>
  )
}

function PrimaryAction({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
    >
      {children}
    </Link>
  )
}

function QuietAction({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center text-sm text-zinc-500">
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
      <div className="h-full rounded-full bg-zinc-800" style={{ width: `${width}%` }} />
    </div>
  )
}

function NutritionCard({ view }: { view: TodayViewModel }) {
  const nutrition = view.nutrition
  const readOnly = useDemoReadOnly()
  const dateHref = prefixedPath(useAppPathPrefix(), `/nutrition?date=${view.date}`)
  return (
    <Card title="Nutrition">
      {nutrition.logged && nutrition.totals ? (
        <NutritionTotals totals={nutrition.totals} target={nutrition.target} />
      ) : (
        <p>No food logged yet today.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4">
        {readOnly ? null : <PrimaryAction to={dateHref}>Add food</PrimaryAction>}
        <QuietAction to={dateHref}>View nutrition</QuietAction>
      </div>
    </Card>
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
    { label: 'Protein', total: totals.protein, target: target?.protein ?? null },
    { label: 'Carbs', total: totals.carbs, target: target?.carbs ?? null },
    { label: 'Fat', total: totals.fat, target: target?.fat ?? null },
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
          const remainder = remainingHeadline(row.total, row.target, 'g')
          return (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span>
                  {row.label} {macroHeadline(row.total, row.target, 'g')}
                </span>
                {remainder ? <span className="shrink-0 text-zinc-500">{remainder}</span> : null}
              </div>
              <NutrientMeter label={row.label} consumed={consumed} target={row.target} />
            </li>
          )
        })}
      </ul>
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
          <p>No workout logged today</p>
          {readOnly ? null : (
            <div className="mt-3">
              <PrimaryAction to={prefixedPath(prefix, '/training/new')}>Log workout</PrimaryAction>
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
      {activity.steps != null || secondary.length > 0 ? (
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
      <div className="mt-2">
        <QuietAction to={prefixedPath(useAppPathPrefix(), '/progress/sleep')}>View sleep</QuietAction>
      </div>
    </Card>
  )
}

function BodyCard({ view }: { view: TodayViewModel }) {
  const body = view.body
  const readOnly = useDemoReadOnly()
  const href = prefixedPath(useAppPathPrefix(), '/body')
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
      <div className="mt-3 flex flex-wrap items-center gap-x-4">
        {readOnly ? null : <PrimaryAction to={href}>Add measurement</PrimaryAction>}
        <QuietAction to={href}>View body</QuietAction>
      </div>
    </Card>
  )
}
