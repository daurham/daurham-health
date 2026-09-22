import { useCallback, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { NutritionDayTotals } from '@/domain/nutrition'
import type { TodayViewModel } from '@/domain/today'
import { PendingLoadRegion, useAtomicKeyedResource } from '@/lib'
import { formatSleepDuration } from '@/features/progress/activity-sleep-copy'
import { formatCalendarDate } from '@/features/progress/format'
import { macroHeadline, remainingHeadline } from '@/features/nutrition/format'
import { fetchToday } from './api'

function formatMeasure(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? rounded.toLocaleString('en-US') : rounded.toFixed(1)
}

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
          <p className="mt-1 text-sm text-zinc-600">{view ? formatCalendarDate(view.date) : 'America/Phoenix'}</p>
        </div>
        <button
          type="button"
          onClick={() => resource.retry()}
          className="min-h-11 shrink-0 rounded-md px-3 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-white"
        >
          Refresh
        </button>
      </div>
      <div className="mt-4">
        <PendingLoadRegion pending={resource.isPending} pendingVisible={resource.pendingVisible}>
          {view ? (
            <TodayBoard view={view} />
          ) : (
            <div className="h-64 animate-pulse rounded-lg bg-zinc-200" aria-busy="true" aria-label="Loading today" />
          )}
        </PendingLoadRegion>
        {resource.error && !view ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{resource.error.message}</p>
        ) : null}
      </div>
    </section>
  )
}

export function TodayBoard({ view }: { view: TodayViewModel }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {view.pendingItems.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 md:col-span-2">
          <h2 className="text-sm font-semibold tracking-tight">Needs attention</h2>
          <ul className="mt-3 space-y-2">
            {view.pendingItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-sm text-zinc-800">{item.title}</p>
                <Link to={item.href} className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium underline">
                  {item.action}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <NutritionCard view={view} />
      <TrainingCard view={view} />
      <ActivityCard view={view} />
      {view.changedItems.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 md:col-span-2">
          <h2 className="text-sm font-semibold tracking-tight">What changed</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            {view.changedItems.map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <SleepCard view={view} />
      <BodyCard view={view} />
      {view.patterns.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 md:col-span-2">
          <h2 className="text-sm font-semibold tracking-tight">Patterns</h2>
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
    <section className="flex h-full min-w-0 flex-col rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 flex-1 text-sm text-zinc-800">{children}</div>
    </section>
  )
}

function ActionLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center text-sm font-medium underline">
      {children}
    </Link>
  )
}

function NutritionCard({ view }: { view: TodayViewModel }) {
  const nutrition = view.nutrition
  const dateHref = `/nutrition?date=${view.date}`
  return (
    <Card title="Nutrition">
      {nutrition.logged && nutrition.totals ? (
        <NutritionTotals totals={nutrition.totals} target={nutrition.target} />
      ) : (
        <p>No food logged yet today.</p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4">
        <ActionLink to={dateHref}>Add food</ActionLink>
        <ActionLink to={dateHref}>View Nutrition</ActionLink>
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
  const rows = [
    { label: 'Calories', total: totals.calories, target: target?.calories ?? null, unit: 'kcal' as const },
    { label: 'Protein', total: totals.protein, target: target?.protein ?? null, unit: 'g' as const },
    { label: 'Carbs', total: totals.carbs, target: target?.carbs ?? null, unit: 'g' as const },
    { label: 'Fat', total: totals.fat, target: target?.fat ?? null, unit: 'g' as const },
  ]
  return (
    <ul className="space-y-1">
      {rows.map((row) => {
        const remainder = remainingHeadline(row.total, row.target, row.unit)
        return (
          <li key={row.label} className="flex items-baseline justify-between gap-3">
            <span>
              {row.label} {macroHeadline(row.total, row.target, row.unit)}
            </span>
            {remainder ? <span className="shrink-0 text-zinc-500">{remainder}</span> : null}
          </li>
        )
      })}
    </ul>
  )
}

function TrainingCard({ view }: { view: TodayViewModel }) {
  return (
    <Card title="Training">
      {view.training.logged ? (
        <ul className="space-y-3">
          {view.training.sessions.map((session) => (
            <li key={session.id}>
              <p className="font-medium">{session.name}</p>
              <p className="text-zinc-600">
                {countLabel(session.exerciseCount, 'exercise', 'exercises')} · {countLabel(session.workingSetCount, 'working set', 'working sets')}
              </p>
              <ActionLink to={`/training/${session.id}`}>View workout</ActionLink>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p>No workout logged today</p>
          <ActionLink to="/training/new">Log workout</ActionLink>
        </>
      )}
    </Card>
  )
}

function ActivityCard({ view }: { view: TodayViewModel }) {
  const activity = view.activity
  const lines = [
    activity.steps != null ? `${formatCount(activity.steps)} steps so far` : null,
    activity.activeEnergyKcal != null ? `${formatCount(activity.activeEnergyKcal)} active kcal` : null,
    activity.exerciseMinutes != null ? `${formatCount(activity.exerciseMinutes)} exercise min so far` : null,
    activity.restingHeartRateBpm != null ? `Resting HR ${formatCount(activity.restingHeartRateBpm)} bpm so far` : null,
  ].filter((line): line is string => line != null)
  return (
    <Card title="Activity">
      {lines.length > 0 ? (
        <>
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className="mt-1 text-zinc-600">Today is still in progress</p>
        </>
      ) : (
        <p>No activity data received yet today.</p>
      )}
      <ActionLink to="/progress/activity">View Activity</ActionLink>
    </Card>
  )
}

function SleepCard({ view }: { view: TodayViewModel }) {
  const sleep = view.sleep
  return (
    <Card title="Sleep">
      {sleep.kind === 'complete' && sleep.minutes != null ? (
        <>
          <p className="font-medium">{formatSleepDuration(sleep.minutes)}</p>
          {sleep.sourceName ? <p className="text-zinc-600">{sleep.sourceName}</p> : null}
        </>
      ) : null}
      {sleep.kind === 'partial' && sleep.minutes != null ? (
        <>
          <p className="font-medium">{formatSleepDuration(sleep.minutes)} observed</p>
          <p className="text-zinc-600">Partial observation{sleep.sourceName ? ` · ${sleep.sourceName}` : ''}</p>
        </>
      ) : null}
      {sleep.kind === 'none' ? <p>No complete sleep observation for today.</p> : null}
      {sleep.latestComplete ? (
        <p className="mt-1 text-zinc-600">
          Latest complete: {formatCalendarDate(sleep.latestComplete.date)} · {formatSleepDuration(sleep.latestComplete.minutes)}
        </p>
      ) : null}
      <ActionLink to="/progress/sleep">View Sleep</ActionLink>
    </Card>
  )
}

function BodyCard({ view }: { view: TodayViewModel }) {
  const body = view.body
  return (
    <Card title="Body">
      {body.latest ? (
        <>
          <p className="font-medium">
            {formatMeasure(body.latest.value)} {body.latest.unit}
          </p>
          <p className="text-zinc-600">{body.latest.measuredLabel}</p>
          {body.trendText ? <p className="mt-1 text-zinc-600">{body.trendText}</p> : null}
        </>
      ) : (
        <p>No body measurement recorded yet.</p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4">
        <ActionLink to="/body">Add measurement</ActionLink>
        <ActionLink to="/body">View Body</ActionLink>
      </div>
    </Card>
  )
}
