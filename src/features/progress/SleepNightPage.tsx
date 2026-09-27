import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { OvernightVital, SleepNightDetail } from '@/domain/sleep'
import { LoadErrorNotice, quietButtonClass } from '@/lib'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'
import { durationBaselineDetail, formatSleepDuration, recentMedianCopy, vitalDeviationCopy } from './activity-sleep-copy'
import { fetchSleepNight } from './api'
import { formatCalendarDate } from './format'

function formatEpisodeInstant(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso))
}

function durationOrNull(minutes: number | null): string | null {
  if (minutes == null) {
    return null
  }
  return formatSleepDuration(minutes)
}

function coverageText(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
}

function formatVitalQuantity(value: number): string {
  if (Number.isInteger(value)) {
    return String(value)
  }
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function formatVitalValue(vital: OvernightVital): string {
  const quantity = formatVitalQuantity(vital.value)
  if (vital.unit === '%') {
    return `${quantity}%`
  }
  if (vital.unit === '°C') {
    return `${quantity} °C`
  }
  return `${quantity} ${vital.unit}`
}

function vitalSourceNote(detail: SleepNightDetail): string | null {
  const sleepSource = detail.sourceAttribution.selectedSourceName
  const differing = detail.overnightVitals.filter((vital) => vital.sourceFamily !== sleepSource)
  if (differing.length === 0) {
    return null
  }
  if (differing.length === 1) {
    const vital = differing[0]!
    return `Sleep stages were observed by ${sleepSource}. ${vital.label} was observed separately by ${vital.sourceFamily}.`
  }
  const groups = differing.map((vital) => `${vital.label} · ${vital.sourceFamily}`).join(', ')
  return `Sleep was observed by ${sleepSource}. Vital readings keep their own sources: ${groups}.`
}

function stageLine(label: string, minutes: number | null, percent: number | null, observed: boolean): string | null {
  const duration = durationOrNull(minutes)
  if (duration == null) {
    return null
  }
  if (percent != null) {
    return `${label} ${duration} · ${percent.toFixed(1)}%`
  }
  return observed ? `${label} ${duration} observed` : `${label} ${duration}`
}

export function SleepNightDetailView({ detail }: { detail: SleepNightDetail }) {
  const prefix = useAppPathPrefix()
  const nightPath = (date: string) => prefixedPath(prefix, `/progress/sleep/${date}`)
  const actual = durationOrNull(detail.totalSleepMinutes)
  const inBed = durationOrNull(detail.timeInBedMinutes)
  const awake = durationOrNull(detail.awakeMinutes)
  const observedStages = !detail.stageAnalysisEligible
  const stages = [
    stageLine('Awake', detail.awakeMinutes, null, false),
    stageLine('REM', detail.remMinutes, detail.stageShares?.remPct ?? null, observedStages),
    stageLine('Core', detail.coreMinutes, detail.stageShares?.corePct ?? null, observedStages),
    stageLine('Deep', detail.deepMinutes, detail.stageShares?.deepPct ?? null, observedStages),
    stageLine('Unspecified sleep', detail.unspecifiedSleepMinutes, null, observedStages),
  ].filter((line): line is string => line != null)
  return (
    <div className="min-w-0 space-y-4">
      <div>
        <p className="text-sm text-zinc-500">Sleep</p>
        <h2 className="text-xl font-semibold tracking-tight">
          {formatCalendarDate(detail.sleepDate)} · {detail.sourceName}
        </h2>
        {detail.observationStatus === 'in_bed_only' ? (
          <p className="mt-2 text-lg font-semibold tracking-tight">No actual-sleep intervals observed</p>
        ) : actual ? (
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {actual} {detail.observationStatus === 'partial_observation' ? 'observed sleep' : 'actual sleep'}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-zinc-700">
          {formatEpisodeInstant(detail.episodeStart, detail.timezone)} → {formatEpisodeInstant(detail.episodeEnd, detail.timezone)}
        </p>
        <p className="mt-1 text-sm text-zinc-600">Sleep date {formatCalendarDate(detail.sleepDate)}</p>
        <p className="mt-2 text-sm text-zinc-800">{detail.observationLabel}</p>
        <p className="text-sm text-zinc-600">{detail.eligibilityNote}</p>
        {detail.observationStatus === 'in_bed_only' ? null : (
          <div className="mt-3 space-y-1 text-sm text-zinc-700">
            {durationBaselineDetail(detail.durationBaseline).map((line) => (
              <p key={line}>{line}</p>
            ))}
            {detail.baselineSeparationNote ? <p>{detail.baselineSeparationNote}</p> : null}
          </div>
        )}
      </div>
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold">Night</h3>
        <dl className="mt-2 space-y-1 text-sm">
          {actual && detail.observationStatus !== 'in_bed_only' ? (
            <div>
              <dt className="text-zinc-500">Actual sleep</dt>
              <dd>{actual}</dd>
            </div>
          ) : null}
          {inBed ? (
            <div>
              <dt className="text-zinc-500">Time in bed</dt>
              <dd>{inBed}</dd>
            </div>
          ) : null}
          {awake ? (
            <div>
              <dt className="text-zinc-500">Awake observed</dt>
              <dd>{awake}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-zinc-500">Episode start</dt>
            <dd>{formatEpisodeInstant(detail.episodeStart, detail.timezone)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Episode end</dt>
            <dd>{formatEpisodeInstant(detail.episodeEnd, detail.timezone)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Selected source</dt>
            <dd>{detail.sourceName}</dd>
          </div>
        </dl>
      </section>
      {stages.length > 0 || detail.stageCoveragePct != null || detail.stageNote ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold">{detail.stageAnalysisEligible ? 'Stages' : 'Stage detail incomplete'}</h3>
          {stages.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-zinc-800">
              {stages.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {detail.stageCoveragePct != null ? <p className="mt-2 text-sm text-zinc-700">Stage coverage {coverageText(detail.stageCoveragePct)}</p> : null}
          {detail.stageNote ? <p className="mt-2 text-sm text-zinc-600">{detail.stageNote}</p> : null}
        </section>
      ) : null}
      {detail.overnightVitals.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold">Overnight vitals</h3>
          {detail.overnightVitalNote ? <p className="mt-2 text-sm text-zinc-600">{detail.overnightVitalNote}</p> : null}
          <div className="mt-3 space-y-3">
            {detail.overnightVitals.map((vital) => (
              <div key={`${vital.metricKey}:${vital.sourceFamily}`}>
                <p className="text-sm font-medium text-zinc-900">{vital.label}</p>
                <p className="text-sm text-zinc-800">
                  {formatVitalValue(vital)}
                  {vital.sampleCount > 1 ? ' median' : ''}
                </p>
                <p className="text-sm text-zinc-600">
                  {vital.sampleCount} {vital.sampleCount === 1 ? 'reading' : 'readings'} · {vital.sourceFamily}
                </p>
                {vital.baseline?.state === 'available' && vital.baseline.baselineMedian != null && vital.baseline.deviation != null ? (
                  <div className="text-sm text-zinc-700">
                    <p>Recent median {recentMedianCopy(vital.baseline.baselineMedian, vital.baseline.unit)}</p>
                    <p>{vitalDeviationCopy(vital.baseline.deviation, vital.baseline.unit)}</p>
                    <p>
                      {vital.baseline.baselineObservationCount} prior {vital.sourceFamily}{' '}
                      {vital.baseline.baselineObservationCount === 1 ? 'night' : 'nights'}
                    </p>
                  </div>
                ) : vital.baseline?.state === 'insufficient_history' ? (
                  <div className="text-sm text-zinc-600">
                    <p>Recent median unavailable</p>
                    <p>
                      {vital.baseline.baselineObservationCount} prior {vital.baseline.baselineObservationCount === 1 ? 'night' : 'nights'}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold">Source</h3>
        <dl className="mt-2 space-y-1 text-sm">
          <div>
            <dt className="text-zinc-500">Observed by</dt>
            <dd>{detail.sourceAttribution.selectedSourceName}</dd>
          </div>
          {detail.transportName ? (
            <div>
              <dt className="text-zinc-500">Received through</dt>
              <dd>Received through {detail.transportName}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-zinc-500">Selection</dt>
            <dd>{detail.sourceAttribution.selectionLabel}</dd>
          </div>
        </dl>
        {detail.sourceAttribution.selectionExplanation ? <p className="mt-2 text-sm text-zinc-700">{detail.sourceAttribution.selectionExplanation}</p> : null}
        {detail.alternatives.length > 0 ? (
          <div className="mt-3">
            <p className="text-sm text-zinc-700">Why this source?</p>
            <ul className="mt-1 space-y-1 text-sm text-zinc-800">
              {detail.alternatives.map((item) => (
                <li key={item.logicalSourceKey}>
                  {item.sourceName}
                  {item.totalSleepMinutes != null ? ` ${formatSleepDuration(item.totalSleepMinutes)}` : ''}
                  {item.selected ? ' · selected' : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {vitalSourceNote(detail) ? <p className="mt-2 text-sm text-zinc-600">{vitalSourceNote(detail)}</p> : null}
      </section>
      <details className="text-sm text-zinc-500">
        <summary className="cursor-pointer">Evidence</summary>
        <p className="mt-1">{detail.calculationVersion}</p>
        <p className="mt-1">{detail.durationBaseline.calculationVersion}</p>
        <p className="mt-1">{detail.sourceAttribution.calculationVersion}</p>
        {detail.vitalCalculationVersion ? <p className="mt-1">{detail.vitalCalculationVersion}</p> : null}
      </details>
      <div className="flex flex-wrap gap-3 text-sm">
        {detail.previousSleepDate ? (
          <Link to={nightPath(detail.previousSleepDate)} className={quietButtonClass}>
            Previous observed night
          </Link>
        ) : null}
        {detail.nextSleepDate ? (
          <Link to={nightPath(detail.nextSleepDate)} className={quietButtonClass}>
            Next observed night
          </Link>
        ) : null}
        <Link to={prefixedPath(prefix, '/progress/sleep')} className="inline-flex min-h-11 items-center text-zinc-600 underline">
          All sleep
        </Link>
        <Link to={prefixedPath(prefix, '/progress/sleep#stage-analytics')} className="inline-flex min-h-11 items-center text-zinc-600 underline">
          View stage trends
        </Link>
      </div>
    </div>
  )
}

export function SleepNightPage() {
  const { sleepDate = '' } = useParams()
  const [detail, setDetail] = useState<SleepNightDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setDetail(null)
    setError(null)
    fetchSleepNight(sleepDate, controller.signal)
      .then((next) => {
        if (active) {
          setDetail(next)
        }
      })
      .catch((caught: unknown) => {
        if (!active || controller.signal.aborted) {
          return
        }
        setError(caught instanceof Error ? caught.message : 'Could not load this sleep night')
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [sleepDate, reload])

  if (error) {
    return <LoadErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} />
  }
  if (!detail) {
    return <p className="text-sm text-zinc-600">Loading sleep night…</p>
  }
  return <SleepNightDetailView detail={detail} />
}
