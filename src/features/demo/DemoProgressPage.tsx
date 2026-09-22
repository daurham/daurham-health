import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { trailingPeriod, type ProgressOverview, type ProgressRange } from '@/domain/progress'
import { DEMO_AS_OF } from '@/demo/constants'
import {
  demoActivity,
  demoCheckpoints,
  demoCompare,
  demoOverview,
  demoSinceCheckpoint,
  demoSleep,
  demoTimeline,
} from '@/demo/repository'
import { ActivitySleepCards } from '@/features/progress/ActivitySleepOverview'
import { ActivitySection } from '@/features/progress/ActivitySection'
import { BodySection } from '@/features/progress/BodySection'
import { EvidencePanel, type EvidenceTopic } from '@/features/progress/EvidencePanel'
import { OverviewSection } from '@/features/progress/OverviewSection'
import { ProgressRangeControl } from '@/features/progress/ProgressRangeControl'
import { SleepSection } from '@/features/progress/SleepSection'
import { StrengthLab, StrengthSection } from '@/features/progress/StrengthSection'
import { TimelineSection } from '@/features/progress/TimelineSection'
import { formatCoveragePct, formatCalendarDate, formatKgAsLb } from '@/features/progress/format'
import { formatGrams, formatKcal } from '@/features/nutrition/format'
import { formatSleepDuration } from '@/features/progress/activity-sleep-copy'
import { parseProgressRangeParam, progressSearch } from '@/features/progress/range'
import { cn } from '@/lib'

type DemoProgressContext = {
  overview: ProgressOverview
  range: ProgressRange
  onEvidence: (topic: EvidenceTopic) => void
}

const TABS = [
  { to: '/demo/progress', label: 'Overview', end: true },
  { to: '/demo/progress/activity', label: 'Activity', end: false },
  { to: '/demo/progress/sleep', label: 'Sleep', end: false },
  { to: '/demo/progress/strength', label: 'Strength', end: false },
  { to: '/demo/progress/body', label: 'Body', end: false },
  { to: '/demo/progress/timeline', label: 'Timeline', end: false },
  { to: '/demo/progress/compare', label: 'Compare', end: false },
] as const

export function DemoProgressPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const range = parseProgressRangeParam(params.get('range'))
  const compareView = location.pathname.endsWith('/compare')
  const healthView = location.pathname.endsWith('/activity') || location.pathname.endsWith('/sleep')
  const overview = useMemo(() => demoOverview(range), [range])
  const [evidence, setEvidence] = useState<EvidenceTopic | null>(null)

  function setRange(next: ProgressRange) {
    const copy = new URLSearchParams(params)
    copy.set('range', next)
    setParams(copy, { replace: true })
  }

  const outletContext: DemoProgressContext = { overview, range, onEvidence: setEvidence }

  return (
    <section className="space-y-3 md:space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Progress</h1>
        <p className="mt-1 hidden text-sm text-zinc-600 md:block">What changed in training and body — from recorded work, not guesses.</p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white px-2 py-2 md:px-3">
        {compareView || healthView ? null : <ProgressRangeControl range={range} onChange={setRange} />}
        <nav className={cn('flex flex-wrap gap-1', compareView || healthView ? '' : 'mt-2 border-t border-zinc-100 pt-2')} aria-label="Progress sections">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={`${tab.to}${progressSearch(range)}`}
              end={tab.end}
              className={({ isActive }) =>
                cn('rounded-md px-3 py-1.5 text-sm font-medium', isActive ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900')
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet context={outletContext} />
      {evidence ? <EvidencePanel topic={evidence} onClose={() => setEvidence(null)} /> : null}
    </section>
  )
}

export function DemoProgressOverviewRoute() {
  const { overview, range, onEvidence } = useOutletContext<DemoProgressContext>()
  const activity = demoActivity(range)
  const sleep = demoSleep(range)
  return (
    <div className="space-y-5 md:space-y-6">
      <OverviewSection overview={overview} onEvidence={onEvidence} />
      <ActivitySleepCards range={range} activity={activity} sleep={sleep} />
    </div>
  )
}

export function DemoProgressActivityRoute() {
  const [params, setParams] = useSearchParams()
  const range = parseProgressRangeParam(params.get('range'))
  return (
    <div className="space-y-4">
      <ProgressRangeControl
        range={range}
        onChange={(next) => {
          const copy = new URLSearchParams(params)
          copy.set('range', next)
          setParams(copy, { replace: true })
        }}
      />
      <ActivitySection view={demoActivity(range)} />
    </div>
  )
}

export function DemoProgressSleepRoute() {
  const [params, setParams] = useSearchParams()
  const range = parseProgressRangeParam(params.get('range'))
  return (
    <div className="space-y-4">
      <ProgressRangeControl
        range={range}
        onChange={(next) => {
          const copy = new URLSearchParams(params)
          copy.set('range', next)
          setParams(copy, { replace: true })
        }}
      />
      <SleepSection view={demoSleep(range)} />
    </div>
  )
}

export function DemoProgressStrengthRoute() {
  const { overview, range, onEvidence } = useOutletContext<DemoProgressContext>()
  return <StrengthSection overview={overview} range={range} onEvidence={onEvidence} />
}

export function DemoProgressStrengthLabRoute() {
  const { exerciseId } = useParams()
  const { overview, range, onEvidence } = useOutletContext<DemoProgressContext>()
  return <StrengthLab overview={overview} range={range} exerciseId={exerciseId ?? ''} onEvidence={onEvidence} />
}

export function DemoProgressBodyRoute() {
  const { overview, onEvidence } = useOutletContext<DemoProgressContext>()
  return <BodySection overview={overview} onEvidence={onEvidence} />
}

export function DemoProgressTimelineRoute() {
  const { range, onEvidence } = useOutletContext<DemoProgressContext>()
  const timeline = demoTimeline(range)
  return <TimelineSection timeline={timeline} range={range} onEvidence={onEvidence} />
}

export function DemoProgressCompareRoute() {
  return <DemoCompare />
}

function DemoCompare() {
  const [params, setParams] = useSearchParams()
  const defaults = trailingPeriod('30d', DEMO_AS_OF)
  const checkpointId = params.get('checkpoint') ?? ''
  const startA = params.get('startA') ?? defaults.comparisonStart ?? defaults.start
  const endA = params.get('endA') ?? defaults.comparisonEnd ?? defaults.start
  const startB = params.get('startB') ?? defaults.start
  const endB = params.get('endB') ?? defaults.end
  const checkpoints = demoCheckpoints()

  function update(next: Record<string, string>) {
    const copy = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value) {
        copy.set(key, value)
      } else {
        copy.delete(key)
      }
    }
    setParams(copy, { replace: true })
  }

  let compare = null as ReturnType<typeof demoCompare> | null
  let error: string | null = null
  if (checkpointId) {
    compare = demoSinceCheckpoint(checkpointId)
    if (!compare) {
      error = 'That checkpoint is not in the demo dataset.'
    }
  } else {
    try {
      compare = demoCompare(startA, endA, startB, endB)
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Those periods cannot be compared.'
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
        <label className="block text-sm font-medium" htmlFor="demo-checkpoint">
          Checkpoint
        </label>
        <select
          id="demo-checkpoint"
          className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm"
          value={checkpointId}
          onChange={(event) => update({ checkpoint: event.target.value })}
        >
          <option value="">Two periods</option>
          {checkpoints.map((checkpoint) => (
            <option key={checkpoint.id} value={checkpoint.id}>
              {checkpoint.label} · {formatCalendarDate(checkpoint.checkpointDate)}
            </option>
          ))}
        </select>
        {checkpointId ? null : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <PeriodFields label="Earlier period" start={startA} end={endA} onStart={(value) => update({ startA: value })} onEnd={(value) => update({ endA: value })} />
            <PeriodFields label="Later period" start={startB} end={endB} onStart={(value) => update({ startB: value })} onEnd={(value) => update({ endB: value })} />
          </div>
        )}
      </div>
      {error ? <p className="text-sm text-zinc-700">{error}</p> : null}
      {compare ? <CompareSummary compare={compare} /> : null}
    </div>
  )
}

function PeriodFields({
  label,
  start,
  end,
  onStart,
  onEnd,
}: {
  label: string
  start: string
  end: string
  onStart: (value: string) => void
  onEnd: (value: string) => void
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <label className="block text-xs text-zinc-500">
        Start
        <input type="date" value={start} min="2026-01-06" max={DEMO_AS_OF} onChange={(event) => onStart(event.target.value)} className="mt-1 block min-h-11 w-full rounded-md border border-zinc-300 px-2 text-sm" />
      </label>
      <label className="block text-xs text-zinc-500">
        End
        <input type="date" value={end} min="2026-01-06" max={DEMO_AS_OF} onChange={(event) => onEnd(event.target.value)} className="mt-1 block min-h-11 w-full rounded-md border border-zinc-300 px-2 text-sm" />
      </label>
    </fieldset>
  )
}

function metricText(status: string, value: number | undefined, suffix: string): string {
  if (status !== 'available' || value == null || !Number.isFinite(value)) {
    return '—'
  }
  return `${Math.round(value).toLocaleString('en-US')}${suffix}`
}

function CompareSummary({ compare }: { compare: NonNullable<ReturnType<typeof demoCompare>> }) {
  const nutritionA = compare.nutrition.a
  const nutritionB = compare.nutrition.b
  const weight = compare.body.weight
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <article className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Training</h2>
        <p className="mt-2 text-sm text-zinc-700">
          Workouts {sideValue(compare.training.workoutCount.a)} → {sideValue(compare.training.workoutCount.b)}
        </p>
        <p className="text-sm text-zinc-700">
          Volume {sideKg(compare.training.externalVolumeKg.a)} → {sideKg(compare.training.externalVolumeKg.b)}
        </p>
        <p className="text-sm text-zinc-700">
          Performance bests {sideValue(compare.training.performanceBestCount.a)} → {sideValue(compare.training.performanceBestCount.b)}
        </p>
      </article>
      <article className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Body</h2>
        <p className="mt-2 text-sm text-zinc-700">
          Earlier {formatKgAsLb(weight.aEnd?.value ?? weight.aStart?.value)} · Later {formatKgAsLb(weight.bEnd?.value ?? weight.bStart?.value)}
        </p>
        <p className="text-sm text-zinc-600">
          Coverage follows the measurements recorded in each period.
        </p>
      </article>
      <article className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Nutrition</h2>
        <p className="mt-2 text-sm text-zinc-700">
          Logged days {nutritionA.loggedDays}/{nutritionA.calendarDays} ({formatCoveragePct(nutritionA.coveragePct)}) → {nutritionB.loggedDays}/{nutritionB.calendarDays} ({formatCoveragePct(nutritionB.coveragePct)})
        </p>
        <p className="text-sm text-zinc-700">
          Calories {nutritionA.calories.averageOnLoggedDays == null ? '—' : formatKcal(nutritionA.calories.averageOnLoggedDays)} → {nutritionB.calories.averageOnLoggedDays == null ? '—' : formatKcal(nutritionB.calories.averageOnLoggedDays)}
        </p>
        <p className="text-sm text-zinc-700">
          Protein {nutritionA.protein.averageOnObservedDays == null ? '—' : formatGrams(nutritionA.protein.averageOnObservedDays)} → {nutritionB.protein.averageOnObservedDays == null ? '—' : formatGrams(nutritionB.protein.averageOnObservedDays)}
        </p>
      </article>
      <article className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Activity and sleep</h2>
        <p className="mt-2 text-sm text-zinc-700">
          Steps {metricText(compare.health.activity.a.steps.status, compare.health.activity.a.steps.status === 'available' ? compare.health.activity.a.steps.value : undefined, '')} → {metricText(compare.health.activity.b.steps.status, compare.health.activity.b.steps.status === 'available' ? compare.health.activity.b.steps.value : undefined, '')}
        </p>
        <p className="text-sm text-zinc-700">
          Sleep {sleepAverage(compare.health.sleep.a.averageTotalSleepMinutes)} → {sleepAverage(compare.health.sleep.b.averageTotalSleepMinutes)}
        </p>
        <p className="text-sm text-zinc-600">
          Activity coverage {Math.round(compare.health.activity.a.steps.coveragePct)}% → {Math.round(compare.health.activity.b.steps.coveragePct)}%. Sleep coverage {Math.round(compare.health.sleep.a.coveragePct)}% → {Math.round(compare.health.sleep.b.coveragePct)}%.
        </p>
      </article>
    </div>
  )
}

function sideValue(side: { status: string; value?: { value: number } }): string {
  if (side.status !== 'available' || side.value == null) {
    return '—'
  }
  return String(side.value.value)
}

function sideKg(side: { status: string; value?: { value: number } }): string {
  if (side.status !== 'available' || side.value == null) {
    return '—'
  }
  return `${Math.round(side.value.value).toLocaleString('en-US')} kg`
}

function sleepAverage(result: { status: string; value?: number }): string {
  if (result.status !== 'available' || result.value == null) {
    return '—'
  }
  return formatSleepDuration(result.value)
}
