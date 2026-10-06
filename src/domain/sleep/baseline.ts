import { addCalendarDays } from '../progress/dates.js'
import { median } from '../progress/statistics.js'
import {
  SLEEP_BASELINE_MIN_OBSERVATIONS,
  SLEEP_BASELINE_PRIOR_DAYS,
  SLEEP_PERSONAL_BASELINE_VERSION,
  SLEEP_TIMEZONE,
} from './config.js'
import type { SleepNightlySummary } from './summarize.js'
import {
  deriveOvernightVitals,
  SLEEP_VITAL_REGISTRY,
  type SleepVitalDefinition,
  type SleepVitalMetricKey,
  type SleepVitalObservation,
} from './vitals.js'

/**
 * Personal baselines are derived on read.
 * The window is the 30 Phoenix dates before the target sleep date.
 * The target night is not part of its own median.
 * Nights after the target date are ignored.
 */

export const SLEEP_BASELINE_VITAL_KEYS = ['heart_rate', 'hrv_sdnn', 'respiratory_rate', 'sleeping_wrist_temperature'] as const

export type SleepBaselineVitalKey = (typeof SLEEP_BASELINE_VITAL_KEYS)[number]

export type SleepBaselineMetricKey = 'sleep_duration' | SleepBaselineVitalKey

export type SleepBaselineState =
  | 'available'
  | 'insufficient_history'
  | 'current_night_ineligible'
  | 'current_observation_missing'
  | 'source_not_comparable'
  | 'metric_not_enabled'

export type SleepBaselineDirection = 'above' | 'below' | 'equal'

export type SleepPersonalBaseline = {
  metricKey: SleepBaselineMetricKey
  calculationVersion: typeof SLEEP_PERSONAL_BASELINE_VERSION
  state: SleepBaselineState
  currentValue: number | null
  unit: string
  baselineMedian: number | null
  deviation: number | null
  direction: SleepBaselineDirection | null
  baselineObservationCount: number
  baselineWindowStart: string
  baselineWindowEnd: string
  sourceFamily: string | null
  targetSleepDate: string
}

export function sleepBaselineWindow(sleepDate: string): { start: string; end: string } {
  return {
    start: addCalendarDays(sleepDate, -SLEEP_BASELINE_PRIOR_DAYS),
    end: addCalendarDays(sleepDate, -1),
  }
}

export function baselineVitalDefinitions(registry: readonly SleepVitalDefinition[] = SLEEP_VITAL_REGISTRY): SleepVitalDefinition[] {
  return registry.filter(
    (item) => item.enabled && (SLEEP_BASELINE_VITAL_KEYS as readonly string[]).includes(item.metricKey),
  )
}

function directionOf(deviation: number): SleepBaselineDirection {
  if (deviation > 0) {
    return 'above'
  }
  if (deviation < 0) {
    return 'below'
  }
  return 'equal'
}

function emptyResult(
  metricKey: SleepBaselineMetricKey,
  unit: string,
  sleepDate: string,
  state: SleepBaselineState,
  sourceFamily: string | null,
  extra: Partial<SleepPersonalBaseline> = {},
): SleepPersonalBaseline {
  const window = sleepBaselineWindow(sleepDate)
  return {
    metricKey,
    calculationVersion: SLEEP_PERSONAL_BASELINE_VERSION,
    state,
    currentValue: null,
    unit,
    baselineMedian: null,
    deviation: null,
    direction: null,
    baselineObservationCount: 0,
    baselineWindowStart: window.start,
    baselineWindowEnd: window.end,
    sourceFamily,
    targetSleepDate: sleepDate,
    ...extra,
  }
}

function priorNights(nights: readonly SleepNightlySummary[], target: SleepNightlySummary): SleepNightlySummary[] {
  const window = sleepBaselineWindow(target.sleepDate)
  const seen = new Set<string>()
  const rows: SleepNightlySummary[] = []
  for (const night of nights) {
    if (night.timezone !== target.timezone || night.sleepDate < window.start || night.sleepDate > window.end) {
      continue
    }
    if (night.sleepDate >= target.sleepDate || seen.has(night.sleepDate)) {
      continue
    }
    seen.add(night.sleepDate)
    rows.push(night)
  }
  return rows
}

function sourceComparable(night: SleepNightlySummary): boolean {
  const name = night.sourceName.trim()
  return night.logicalSourceKey !== 'unknown' && name !== '' && name !== 'Unknown' && name !== 'Unknown source'
}

function durationEvidence(night: SleepNightlySummary, sourceKey: string): boolean {
  return (
    night.analysisEligible &&
    night.observationStatus === 'analysis_eligible' &&
    night.logicalSourceKey === sourceKey &&
    night.totalSleepMinutes != null &&
    Number.isFinite(night.totalSleepMinutes)
  )
}

export function computeSleepDurationBaseline(
  nights: readonly SleepNightlySummary[],
  target: SleepNightlySummary,
): SleepPersonalBaseline {
  const sourceFamily = target.sourceName.trim() === '' ? 'Unknown source' : target.sourceName
  if (target.observationStatus !== 'analysis_eligible' || !target.analysisEligible) {
    return emptyResult('sleep_duration', 'min', target.sleepDate, 'current_night_ineligible', sourceFamily)
  }
  if (!sourceComparable(target)) {
    return emptyResult('sleep_duration', 'min', target.sleepDate, 'source_not_comparable', sourceFamily, {
      currentValue: target.totalSleepMinutes,
    })
  }
  if (target.totalSleepMinutes == null || !Number.isFinite(target.totalSleepMinutes)) {
    return emptyResult('sleep_duration', 'min', target.sleepDate, 'current_observation_missing', sourceFamily)
  }
  const history = priorNights(nights, target).filter((night) => durationEvidence(night, target.logicalSourceKey))
  const values = history.map((night) => night.totalSleepMinutes!)
  if (values.length < SLEEP_BASELINE_MIN_OBSERVATIONS) {
    return emptyResult('sleep_duration', 'min', target.sleepDate, 'insufficient_history', sourceFamily, {
      currentValue: target.totalSleepMinutes,
      baselineObservationCount: values.length,
    })
  }
  const baselineMedian = median(values)
  if (baselineMedian == null) {
    return emptyResult('sleep_duration', 'min', target.sleepDate, 'insufficient_history', sourceFamily, {
      currentValue: target.totalSleepMinutes,
      baselineObservationCount: values.length,
    })
  }
  const deviation = target.totalSleepMinutes - baselineMedian
  return emptyResult('sleep_duration', 'min', target.sleepDate, 'available', sourceFamily, {
    currentValue: target.totalSleepMinutes,
    baselineMedian,
    deviation,
    direction: directionOf(deviation),
    baselineObservationCount: values.length,
  })
}

function nightlyVitalMedian(
  night: SleepNightlySummary,
  samples: readonly SleepVitalObservation[],
  metricKey: SleepBaselineVitalKey,
  sourceFamily: string,
  registry: readonly SleepVitalDefinition[],
): number | null {
  if (!night.analysisEligible || night.observationStatus !== 'analysis_eligible') {
    return null
  }
  const readings = deriveOvernightVitals({
    observationStatus: night.observationStatus,
    episodeStart: night.startAt,
    episodeEnd: night.endAt,
    samples,
    registry,
  })
  const match = readings.find((item) => item.metricKey === metricKey && item.sourceFamily === sourceFamily)
  return match?.value ?? null
}

export function computeVitalBaseline(input: {
  nights: readonly SleepNightlySummary[]
  target: SleepNightlySummary
  samples: readonly SleepVitalObservation[]
  metricKey: SleepVitalMetricKey
  sourceFamily: string
  registry?: readonly SleepVitalDefinition[]
}): SleepPersonalBaseline {
  const registry = input.registry ?? SLEEP_VITAL_REGISTRY
  const definition = registry.find((item) => item.metricKey === input.metricKey)
  const supported = definition != null && (SLEEP_BASELINE_VITAL_KEYS as readonly string[]).includes(definition.metricKey)
  if (!definition || !definition.enabled || !supported) {
    return emptyResult(
      supported && definition ? (definition.metricKey as SleepBaselineVitalKey) : 'heart_rate',
      definition?.canonicalUnit ?? '',
      input.target.sleepDate,
      'metric_not_enabled',
      input.sourceFamily,
    )
  }
  const metricKey = definition.metricKey as SleepBaselineVitalKey
  if (input.target.observationStatus !== 'analysis_eligible' || !input.target.analysisEligible) {
    return emptyResult(metricKey, definition.canonicalUnit, input.target.sleepDate, 'current_night_ineligible', input.sourceFamily)
  }
  const current = nightlyVitalMedian(input.target, input.samples, metricKey, input.sourceFamily, registry)
  if (current == null) {
    return emptyResult(metricKey, definition.canonicalUnit, input.target.sleepDate, 'current_observation_missing', input.sourceFamily)
  }
  const values = priorNights(input.nights, input.target)
    .map((night) => nightlyVitalMedian(night, input.samples, metricKey, input.sourceFamily, registry))
    .filter((value): value is number => value != null)
  if (values.length < SLEEP_BASELINE_MIN_OBSERVATIONS) {
    return emptyResult(metricKey, definition.canonicalUnit, input.target.sleepDate, 'insufficient_history', input.sourceFamily, {
      currentValue: current,
      baselineObservationCount: values.length,
    })
  }
  const baselineMedian = median(values)
  if (baselineMedian == null) {
    return emptyResult(metricKey, definition.canonicalUnit, input.target.sleepDate, 'insufficient_history', input.sourceFamily, {
      currentValue: current,
      baselineObservationCount: values.length,
    })
  }
  const deviation = current - baselineMedian
  return emptyResult(metricKey, definition.canonicalUnit, input.target.sleepDate, 'available', input.sourceFamily, {
    currentValue: current,
    baselineMedian,
    deviation,
    direction: directionOf(deviation),
    baselineObservationCount: values.length,
  })
}

export function latestBaselineNight(
  nights: readonly SleepNightlySummary[],
  bounds: { start: string; end: string },
  timezone = SLEEP_TIMEZONE,
): SleepNightlySummary | null {
  const eligible = nights
    .filter(
      (night) =>
        night.timezone === timezone &&
        night.sleepDate >= bounds.start &&
        night.sleepDate <= bounds.end &&
        night.analysisEligible &&
        night.observationStatus === 'analysis_eligible' &&
        night.totalSleepMinutes != null,
    )
    .sort((left, right) => right.sleepDate.localeCompare(left.sleepDate))
  return eligible[0] ?? null
}
