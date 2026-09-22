import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ProgressRange } from '@/domain/progress'
import type { SleepProgressNight, SleepProgressView } from '@/domain/sleep'
import { LoadErrorNotice, PendingLoadRegion, useAtomicKeyedResource } from '@/lib'
import {
  formatSleepDuration,
  rangeHeading,
  sleepAvailabilityCopy,
  sleepAverageHeadline,
  sleepChangeLine,
  sleepCoverageLine,
  sleepNightDurationLine,
  sleepNightStatusLabel,
  stageAverageLine,
} from './activity-sleep-copy'
import { SleepDurationChart } from './ActivitySleepCharts'
import { fetchProgressSleep } from './api'
import { formatCalendarDate, formatClockTime } from './format'
import { ProgressRangeControl } from './ProgressRangeControl'
import { parseProgressRangeParam } from './range'

export function SleepSection({ view }: { view: SleepProgressView }) {
  const headline = sleepAverageHeadline(view)
  const availability = sleepAvailabilityCopy(view)
  const change = sleepChangeLine(view)
  const stages = [
    stageAverageLine('Core', view.averageCoreMinutes),
    stageAverageLine('Deep', view.averageDeepMinutes),
    stageAverageLine('REM', view.averageRemMinutes),
    stageAverageLine('Unspecified', view.averageUnspecifiedMinutes),
  ].filter((line): line is string => line != null)
  return (
    <div className="min-w-0 space-y-4" data-range={view.range}>
      <div>
        <p className="text-sm text-zinc-600">{rangeHeading(view.range)}</p>
        {headline ? <p className="mt-2 text-2xl font-semibold tracking-tight">{headline}</p> : null}
        {availability ? <p className="mt-2 text-lg font-semibold tracking-tight">{availability.message}</p> : null}
        {availability?.latest ? <p className="mt-1 text-sm text-zinc-700">{availability.latest}</p> : null}
        <p className="mt-1 text-sm text-zinc-600">{sleepCoverageLine(view)}</p>
        {change ? <p className="mt-1 text-sm text-zinc-700">{change}</p> : null}
      </div>
      <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
        <h3 className="text-sm font-semibold tracking-tight">Sleep duration</h3>
        <p className="mt-1 text-sm text-zinc-600">Complete nights only. Partial observations are marked separately and are not part of the average.</p>
        <SleepDurationChart points={view.series} />
        {!view.series.some((point) => point.eligibleMinutes != null || point.partialMinutes != null) ? (
          <p className="mt-4 text-sm text-zinc-600">{availability?.message ?? 'No complete sleep observations in this range.'}</p>
        ) : null}
      </section>
      {view.stageEligibleNights > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
          <h3 className="text-sm font-semibold tracking-tight">Sleep stages</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Based on {view.stageEligibleNights} night{view.stageEligibleNights === 1 ? '' : 's'} with complete stage data.
          </p>
          {stages.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-zinc-800">
              {stages.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-600">Stage durations are unavailable.</p>
          )}
        </section>
      ) : null}
      <section className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight">Recent nights</h3>
        {view.recentNights.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No sleep observations in this range.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {view.recentNights.map((night) => (
              <li key={night.sleepDate}>
                <SleepNightRow night={night} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export function SleepProgressPage() {
  const [params, setParams] = useSearchParams()
  const urlRange = parseProgressRangeParam(params.get('range'))
  const [intentRange, setIntentRange] = useState(urlRange)
  const urlRangeRef = useRef(urlRange)
  const load = useCallback((range: ProgressRange, signal: AbortSignal) => fetchProgressSleep(range, signal), [])
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
      <h2 className="text-lg font-semibold tracking-tight">Sleep</h2>
      <ProgressRangeControl range={range} onChange={setIntentRange} />
      <PendingLoadRegion pending={resource.isPending} pendingVisible={resource.pendingVisible}>
        {view ? (
          <SleepSection view={view} />
        ) : (
          <div className="h-40 animate-pulse rounded-lg bg-zinc-200" aria-busy="true" aria-label="Loading sleep" />
        )}
      </PendingLoadRegion>
      {resource.error ? (
        <LoadErrorNotice
          message={
            view
              ? 'Could not refresh Sleep. Showing the last loaded range.'
              : `${resource.error.message} Values are not shown as zero when a request fails.`
          }
          onRetry={() => resource.retry()}
        />
      ) : null}
    </div>
  )
}

function SleepNightRow({ night }: { night: SleepProgressNight }) {
  return (
    <details className="group min-w-0 px-3 py-2">
      <summary className="cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <p className="text-sm font-medium">{formatCalendarDate(night.sleepDate)}</p>
          <p className="shrink-0 text-sm text-zinc-800">{sleepNightDurationLine(night)}</p>
        </div>
        <p className="mt-0.5 text-sm text-zinc-500">
          {night.sourceName} · {sleepNightStatusLabel(night)}
        </p>
      </summary>
      <SleepNightDetail night={night} />
    </details>
  )
}

function SleepNightDetail({ night }: { night: SleepProgressNight }) {
  const stagesReady = night.stageAnalysisEligible
  return (
    <div className="mt-2 space-y-1 border-t border-zinc-100 pt-2 text-sm text-zinc-700">
      <p>
        {formatClockTime(night.startAt, night.timezone)} – {formatClockTime(night.endAt, night.timezone)}
      </p>
      {night.status !== 'in_bed_only' && night.totalSleepMinutes != null ? (
        <p>Total sleep {formatSleepDuration(night.totalSleepMinutes)}</p>
      ) : null}
      {night.timeInBedMinutes != null ? <p>Time in bed {formatSleepDuration(night.timeInBedMinutes)}</p> : null}
      {night.awakeMinutes != null ? <p>Awake {formatSleepDuration(night.awakeMinutes)}</p> : null}
      {stagesReady ? (
        <>
          {night.coreMinutes != null ? <p>Core {formatSleepDuration(night.coreMinutes)}</p> : null}
          {night.deepMinutes != null ? <p>Deep {formatSleepDuration(night.deepMinutes)}</p> : null}
          {night.remMinutes != null ? <p>REM {formatSleepDuration(night.remMinutes)}</p> : null}
          {night.unspecifiedSleepMinutes != null ? <p>Unspecified {formatSleepDuration(night.unspecifiedSleepMinutes)}</p> : null}
          {night.stageCoveragePct != null ? <p>Stage coverage {Math.round(night.stageCoveragePct)}%</p> : null}
        </>
      ) : (
        <p>Detailed sleep stages weren&apos;t complete enough for analysis.</p>
      )}
      {night.overrideExplanation ? <p>{night.overrideExplanation}</p> : null}
    </div>
  )
}
