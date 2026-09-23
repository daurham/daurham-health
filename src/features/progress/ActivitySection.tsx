import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ActivityProgressView } from '@/domain/activity'
import type { ProgressRange } from '@/domain/progress'
import { cn, LoadErrorNotice, PendingLoadRegion, useAtomicKeyedResource } from '@/lib'
import {
  ACTIVITY_METRIC_OPTIONS,
  activityChangeLine,
  activityCoverageLine,
  activityHeadline,
  activityMetricOf,
  activityTodayLine,
  rangeHeading,
  type ActivityMetricOptionId,
} from './activity-sleep-copy'
import { ActivityMetricChart } from './ActivitySleepCharts'
import { fetchProgressActivity } from './api'
import { formatCalendarRange } from './format'
import { ProgressRangeControl } from './ProgressRangeControl'
import { parseProgressRangeParam } from './range'

function valueLabel(id: ActivityMetricOptionId, value: number): string {
  const formatted = Math.round(value).toLocaleString('en-US')
  if (id === 'activeEnergy') {
    return `${formatted} kcal`
  }
  if (id === 'exercise') {
    return `${formatted} min`
  }
  if (id === 'restingHeartRate') {
    return `${formatted} bpm`
  }
  return `${formatted} steps`
}

export function ActivitySection({ view }: { view: ActivityProgressView }) {
  const [metricId, setMetricId] = useState<ActivityMetricOptionId>('steps')
  const option = ACTIVITY_METRIC_OPTIONS.find((item) => item.id === metricId) ?? ACTIVITY_METRIC_OPTIONS[0]
  const metric = activityMetricOf(view, option.id)
  const headline = activityHeadline(metric)
  const change = activityChangeLine(metric)
  return (
    <div className="min-w-0 space-y-4" data-range={view.range}>
      <div>
        <p className="text-sm text-zinc-600">{rangeHeading(view.range)}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">{headline ?? option.empty}</p>
        <p className="mt-1 text-sm text-zinc-600">{activityCoverageLine(metric)}</p>
        {activityTodayLine(view, option.id) ? <p className="mt-1 text-sm text-zinc-700">{activityTodayLine(view, option.id)}</p> : null}
        {change ? <p className="mt-1 text-sm text-zinc-700">{change}</p> : null}
      </div>
      <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Activity metric">
        {ACTIVITY_METRIC_OPTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMetricId(item.id)}
            className={cn(
              'min-h-10 shrink-0 rounded-md px-3 py-1.5 text-sm font-medium',
              item.id === option.id ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50',
            )}
            aria-pressed={item.id === option.id}
          >
            {item.label}
          </button>
        ))}
      </div>
      <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
        <h3 className="text-sm font-semibold tracking-tight">{option.label}</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Daily observations from {formatCalendarRange(view.start, view.end)}. Missing days stay empty.
        </p>
        {headline ? (
          <ActivityMetricChart points={metric.series} valueLabel={(value) => valueLabel(option.id, value)} />
        ) : (
          <p className="mt-4 text-sm text-zinc-600">{option.empty}</p>
        )}
      </section>
    </div>
  )
}

export function ActivityProgressPage() {
  const [params, setParams] = useSearchParams()
  const urlRange = parseProgressRangeParam(params.get('range'))
  const [intentRange, setIntentRange] = useState(urlRange)
  const urlRangeRef = useRef(urlRange)
  const load = useCallback((range: ProgressRange, signal: AbortSignal) => fetchProgressActivity(range, signal), [])
  const resource = useAtomicKeyedResource({ requestedKey: intentRange, load })
  const range = resource.committedKey ?? intentRange
  const view = resource.data && resource.data.range === range ? resource.data : null

  useEffect(() => {
    if (urlRange !== urlRangeRef.current) {
      urlRangeRef.current = urlRange
      setIntentRange(urlRange)
    }
  }, [urlRange])

  useEffect(() => {
    if (!resource.committedKey || params.get('range') === resource.committedKey) {
      return
    }
    const copy = new URLSearchParams(params)
    copy.set('range', resource.committedKey)
    urlRangeRef.current = resource.committedKey
    setParams(copy, { replace: true })
  }, [params, resource.committedKey, setParams])

  useEffect(() => {
    if (resource.error && resource.committedKey && intentRange !== resource.committedKey) {
      setIntentRange(resource.committedKey)
    }
  }, [intentRange, resource.committedKey, resource.error])

  return (
    <div className="min-w-0 space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
      <ProgressRangeControl range={range} onChange={setIntentRange} />
      <PendingLoadRegion pending={resource.isPending} pendingVisible={resource.pendingVisible}>
        {view ? (
          <ActivitySection view={view} />
        ) : (
          <div className="h-40 animate-pulse rounded-lg bg-zinc-200" aria-busy="true" aria-label="Loading activity" />
        )}
      </PendingLoadRegion>
      {resource.error ? (
        <LoadErrorNotice
          message={
            view
              ? 'Could not refresh Activity. Showing the last loaded range.'
              : `${resource.error.message} Values are not shown as zero when a request fails.`
          }
          onRetry={() => resource.retry()}
        />
      ) : null}
    </div>
  )
}
