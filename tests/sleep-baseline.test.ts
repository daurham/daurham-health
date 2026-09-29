import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DEMO_AS_OF } from '../src/demo/constants.ts'
import { demoDataset } from '../src/demo/dataset.ts'
import { demoSleep, demoSleepNightDetail } from '../src/demo/repository.ts'
import { addCalendarDays } from '../src/domain/progress/dates.ts'
import { median } from '../src/domain/progress/statistics.ts'
import {
  baselineVitalDefinitions,
  buildSleepNightDetail,
  buildSleepProgressView,
  computeSleepDurationBaseline,
  computeVitalBaseline,
  SLEEP_BASELINE_MIN_OBSERVATIONS,
  SLEEP_PERSONAL_BASELINE_VERSION,
  SLEEP_VITAL_REGISTRY,
  sleepBaselineWindow,
} from '../src/domain/sleep/index.ts'
import type { SleepNightlySummary } from '../src/domain/sleep/summarize.ts'
import type { SleepVitalDefinition, SleepVitalMetricKey, SleepVitalObservation } from '../src/domain/sleep/vitals.ts'
import { durationDeviationCopy, vitalDeviationCopy } from '../src/features/progress/activity-sleep-copy.ts'
import { SleepNightDetailView } from '../src/features/progress/SleepNightPage.tsx'
import { SleepSection } from '../src/features/progress/SleepSection.tsx'
import { LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.ts'

const TARGET = '2026-09-30'

function evidence(sourceKey: string, sourceName: string, minutes: number | null, status: SleepNightlySummary['observationStatus']) {
  return {
    selectedLogicalSource: sourceKey,
    selectedSourceName: sourceName,
    selectedDurationMinutes: minutes,
    selectedStatus: status,
    alternatives: [],
    sourcePriority: ['apple_watch', 'circular'],
    completenessOverride: false,
    intervalCount: 4,
    stageCoveragePct: 95,
    additionalEpisodeCount: 0,
    calculationVersion: 'sleep-night-v1',
  }
}

function night(
  date: string,
  minutes: number | null,
  options: {
    key?: string
    name?: string
    status?: SleepNightlySummary['observationStatus']
  } = {},
): SleepNightlySummary {
  const key = options.key ?? 'apple_watch'
  const name = options.name ?? 'Apple Watch'
  const status = options.status ?? 'analysis_eligible'
  return {
    sleepDate: date,
    timezone: 'America/Phoenix',
    logicalSourceKey: key,
    sourceName: name,
    startAt: `${date}T07:00:00.000Z`,
    endAt: `${date}T15:00:00.000Z`,
    totalSleepMinutes: minutes,
    timeInBedMinutes: minutes == null ? 400 : minutes + 20,
    awakeMinutes: 10,
    coreMinutes: 200,
    deepMinutes: 60,
    remMinutes: 80,
    unspecifiedSleepMinutes: 20,
    stageCoveragePct: 95,
    stageConflictMinutes: 0,
    observationStatus: status,
    analysisEligible: status === 'analysis_eligible',
    stageAnalysisEligible: status === 'analysis_eligible',
    selectionReason: status === 'analysis_eligible' ? 'source_priority' : status === 'partial_observation' ? 'partial_only' : 'in_bed_only',
    calculationVersion: 'sleep-night-v1',
    evidence: evidence(key, name, minutes, status),
  }
}

function priorDates(count: number, target = TARGET): string[] {
  return Array.from({ length: count }, (_, index) => addCalendarDays(target, -(count - index)))
}

function series(values: number[], source: { key: string; name: string } = { key: 'apple_watch', name: 'Apple Watch' }, target = TARGET) {
  const dates = priorDates(values.length, target)
  return dates.map((date, index) => night(date, values[index]!, { key: source.key, name: source.name }))
}

function sample(
  date: string,
  metricKey: SleepVitalMetricKey,
  value: number,
  unit: string,
  source: { key: string; name: string },
  minute = 0,
): SleepVitalObservation {
  const hour = 8 + Math.floor(minute / 60)
  const min = minute % 60
  const observedAt = `${date}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`
  return {
    id: `${metricKey}-${date}-${minute}-${source.key}`,
    metricKey,
    value,
    unit,
    observedAt,
    startAt: null,
    endAt: null,
    sourceFamily: source.name,
    sourceFamilyKey: source.key,
    fingerprint: `${metricKey}-${date}-${minute}-${source.key}-${value}`,
  }
}

function enabled(keys: readonly string[]): SleepVitalDefinition[] {
  return SLEEP_VITAL_REGISTRY.map((item) => ({ ...item, enabled: keys.includes(item.metricKey) }))
}

function htmlNight(detail: ReturnType<typeof buildSleepNightDetail>): string {
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(SleepNightDetailView, { detail })))
}

function htmlProgress(nights: SleepNightlySummary[], asOf = TARGET) {
  const view = buildSleepProgressView(nights, { range: '30d', asOf })
  const page = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(SleepSection, { view })))
  return { view, page }
}

describe('sleep personal baselines', () => {
  it('uses the prior 30 Phoenix dates and excludes the target and later nights', () => {
    expect(sleepBaselineWindow(TARGET)).toEqual({ start: '2026-08-31', end: '2026-09-29' })
    const values = [390, 400, 410, 420, 430, 440, 600]
    const priors = series(values)
    const target = night(TARGET, 397)
    const outside = night('2026-08-30', 111)
    const future = night('2026-10-01', 999)
    const result = computeSleepDurationBaseline([...priors, outside, target, future], target)
    expect(result.calculationVersion).toBe(SLEEP_PERSONAL_BASELINE_VERSION)
    expect(result.calculationVersion).not.toBe('sleep-night-v1')
    expect(result.state).toBe('available')
    expect(result.baselineWindowStart).toBe('2026-08-31')
    expect(result.baselineWindowEnd).toBe('2026-09-29')
    expect(result.baselineMedian).toBe(420)
    expect(result.baselineObservationCount).toBe(7)
    expect(result.currentValue).toBe(397)
    expect(result.deviation).toBe(-23)
    expect(result.direction).toBe('below')
    expect(median(values)).toBe(420)
  })

  it('requires seven comparable observations and keeps an even-count median on the shared helper', () => {
    const six = computeSleepDurationBaseline([...series([390, 400, 410, 420, 430, 440]), night(TARGET, 397)], night(TARGET, 397))
    expect(six.state).toBe('insufficient_history')
    expect(six.baselineMedian).toBeNull()
    expect(six.deviation).toBeNull()
    expect(six.baselineObservationCount).toBe(6)
    const evenValues = [390, 400, 410, 420, 430, 440, 450, 460]
    const eight = computeSleepDurationBaseline([...series(evenValues), night(TARGET, 397)], night(TARGET, 397))
    expect(eight.state).toBe('available')
    expect(eight.baselineMedian).toBe(median(evenValues))
    expect(eight.baselineMedian).toBe(425)
    expect(SLEEP_BASELINE_MIN_OBSERVATIONS).toBe(7)
  })

  it('does not let the target night or a later night change the median', () => {
    const priors = series([390, 400, 410, 420, 430, 440, 600])
    const first = computeSleepDurationBaseline([...priors, night(TARGET, 397)], night(TARGET, 397))
    const changed = computeSleepDurationBaseline([...priors, night(TARGET, 250)], night(TARGET, 250))
    expect(changed.baselineMedian).toBe(first.baselineMedian)
    expect(changed.currentValue).toBe(250)
    expect(changed.deviation).not.toBe(first.deviation)
    const withFuture = computeSleepDurationBaseline([...priors, night(TARGET, 397), night('2026-10-02', 100)], night(TARGET, 397))
    expect(withFuture).toEqual(first)
  })

  it('excludes partial and in-bed nights from duration evidence', () => {
    const eligible = series([390, 400, 410, 420, 430, 440])
    const partialPrior = night('2026-09-20', 500, { status: 'partial_observation' })
    const inBedPrior = night('2026-09-21', null, { status: 'in_bed_only' })
    const short = computeSleepDurationBaseline([...eligible, partialPrior, inBedPrior, night(TARGET, 397)], night(TARGET, 397))
    expect(short.state).toBe('insufficient_history')
    expect(short.baselineObservationCount).toBe(6)
    const partialTarget = night(TARGET, 151, { status: 'partial_observation' })
    const partial = computeSleepDurationBaseline([...series([390, 400, 410, 420, 430, 440, 450]), partialTarget], partialTarget)
    expect(partial.state).toBe('current_night_ineligible')
    expect(partial.deviation).toBeNull()
    const inBedTarget = night(TARGET, null, { status: 'in_bed_only' })
    const inBed = computeSleepDurationBaseline(series([390, 400, 410, 420, 430, 440, 450]), inBedTarget)
    expect(inBed.state).toBe('current_night_ineligible')
    expect(inBed.deviation).toBeNull()
    const page = htmlNight(buildSleepNightDetail(partialTarget))
    expect(page).toContain('Personal baseline comparison unavailable for a partial Sleep observation.')
    expect(page).not.toContain('below recent median')
    const inBedPage = htmlNight(buildSleepNightDetail(inBedTarget))
    expect(inBedPage).not.toContain('recent median')
    expect(inBedPage).not.toContain('Personal baseline comparison')
  })

  it('compares sleep duration only within the selected source', () => {
    const circular = series(
      [300, 310, 320, 330, 340, 350, 360, 370, 380, 390],
      { key: 'circular', name: 'Circular' },
      '2026-09-20',
    )
    const apple = series([500, 510, 520, 530, 540, 550, 560, 570, 580, 590], { key: 'apple_watch', name: 'Apple Watch' })
    const target = night(TARGET, 397, { key: 'circular', name: 'Circular' })
    const result = computeSleepDurationBaseline([...circular, ...apple, target], target)
    expect(result.state).toBe('available')
    expect(result.sourceFamily).toBe('Circular')
    expect(result.baselineObservationCount).toBe(10)
    expect(result.baselineMedian).toBe(median([300, 310, 320, 330, 340, 350, 360, 370, 380, 390]))
    const fewCircular = series([300, 310, 320], { key: 'circular', name: 'Circular' }, '2026-09-05')
    const manyApple = series(
      Array.from({ length: 20 }, (_, index) => 400 + index),
      { key: 'apple_watch', name: 'Apple Watch' },
      '2026-09-29',
    )
    const switched = computeSleepDurationBaseline([...fewCircular, ...manyApple, target], target)
    expect(switched.state).toBe('insufficient_history')
    expect(switched.baselineObservationCount).toBe(3)
    expect(switched.baselineMedian).toBeNull()
  })

  it('does not merge unknown-source nights', () => {
    const priors = series([390, 400, 410, 420, 430, 440, 450], { key: 'unknown', name: 'Unknown source' })
    const target = night(TARGET, 397, { key: 'unknown', name: 'Unknown source' })
    const otherDevice = priors.map((item, index) => (index === 0 ? night(item.sleepDate, 900, { key: 'unknown', name: 'Unknown source' }) : item))
    const result = computeSleepDurationBaseline([...otherDevice, target], target)
    expect(result.state).toBe('source_not_comparable')
    expect(result.baselineMedian).toBeNull()
    expect(result.deviation).toBeNull()
  })

  it('recomputes after a historical duration correction and stores nothing', () => {
    const priors = series([390, 400, 410, 420, 430, 440, 600])
    const target = night(TARGET, 397)
    const first = computeSleepDurationBaseline([...priors, target], target)
    const again = computeSleepDurationBaseline([...priors, target], target)
    expect(again).toEqual(first)
    const corrected = priors.map((item, index) => (index === 6 ? night(item.sleepDate, 410) : item))
    const next = computeSleepDurationBaseline([...corrected, target], target)
    expect(next.baselineMedian).toBe(410)
    expect(next.baselineMedian).not.toBe(first.baselineMedian)
    expect(next.deviation).toBe(397 - 410)
    expect(readFileSync('src/domain/sleep/baseline.ts', 'utf8')).not.toMatch(/INSERT|UPDATE|sleep_baselines|sleep_deviations/)
    expect(LATEST_SCHEMA_MIGRATION).toBe('0037_coach_lab_snoozes.sql')
    expect(readFileSync('server/backup/inventory.ts', 'utf8')).not.toContain('sleep_baselines')
    expect(readFileSync('server/backup/format.ts', 'utf8')).not.toContain('sleep_baselines')
  })

  it('keeps goals, today, and cross-domain intelligence independent', () => {
    expect(readFileSync('src/domain/sleep/baseline.ts', 'utf8')).not.toMatch(/from ['"].*goals|resting_heart_rate|activity_daily/)
    expect(readFileSync('src/domain/goals.ts', 'utf8')).not.toMatch(/personalBaseline|sleep-personal-baseline/)
    expect(readFileSync('src/domain/intelligence/analyze.ts', 'utf8')).not.toMatch(/personalBaseline|sleep-personal-baseline/)
    expect(readFileSync('src/domain/today/view.ts', 'utf8')).not.toMatch(/personalBaseline|sleep-personal-baseline|below recent median/)
    expect(readFileSync('src/features/today/TodayPage.tsx', 'utf8')).not.toContain('Personal baseline')
    const result = computeSleepDurationBaseline([...series([390, 400, 410, 420, 430, 440, 450]), night(TARGET, 397)], night(TARGET, 397))
    expect(JSON.stringify(result)).not.toMatch(/readiness|recovery|health_score|sleep_score|severity|normal_range|zScore|anomaly|needs_attention/)
  })
})

describe('future vital baselines', () => {
  const watch = { key: 'apple_watch', name: 'Apple Watch' }
  const circular = { key: 'circular', name: 'Circular' }

  function vitalNights(count: number, currentMinutes = 420) {
    const priors = series(Array.from({ length: count }, () => currentMinutes))
    const target = night(TARGET, currentMinutes)
    return { priors, target, nights: [...priors, target] }
  }

  it('counts an explicit zero and leaves a missing night out', () => {
    const { nights, target } = vitalNights(7)
    const zeros = nights.map((item) => sample(item.sleepDate, 'respiratory_rate', 0, 'breaths/min', watch))
    const present = computeVitalBaseline({
      nights,
      target,
      samples: zeros,
      metricKey: 'respiratory_rate',
      sourceFamily: 'Apple Watch',
      registry: enabled(['respiratory_rate']),
    })
    expect(present.state).toBe('available')
    expect(present.baselineMedian).toBe(0)
    expect(present.currentValue).toBe(0)
    const missing = zeros.filter((item) => !item.observedAt.startsWith(nights[0]!.sleepDate))
    const absent = computeVitalBaseline({
      nights,
      target,
      samples: missing,
      metricKey: 'respiratory_rate',
      sourceFamily: 'Apple Watch',
      registry: enabled(['respiratory_rate']),
    })
    expect(absent.state).toBe('insufficient_history')
    expect(absent.baselineObservationCount).toBe(6)
    expect(absent.baselineMedian).toBeNull()
  })

  it('baselines HRV by nightly median and source, without weighting dense samples', () => {
    const { priors, target, nights } = vitalNights(7)
    const samples: SleepVitalObservation[] = []
    for (const [index, item] of priors.entries()) {
      if (index === 0) {
        for (let minute = 0; minute < 50; minute += 1) {
          samples.push(sample(item.sleepDate, 'hrv_sdnn', 100, 'ms', watch, minute))
        }
      } else {
        samples.push(sample(item.sleepDate, 'hrv_sdnn', 40, 'ms', watch, 0))
        samples.push(sample(item.sleepDate, 'hrv_sdnn', 40, 'ms', watch, 5))
      }
    }
    samples.push(sample(target.sleepDate, 'hrv_sdnn', 46, 'ms', watch))
    const apple = computeVitalBaseline({
      nights,
      target,
      samples,
      metricKey: 'hrv_sdnn',
      sourceFamily: 'Apple Watch',
      registry: enabled(['hrv_sdnn']),
    })
    expect(apple.state).toBe('available')
    expect(apple.baselineMedian).toBe(40)
    expect(apple.currentValue).toBe(46)
    expect(apple.deviation).toBe(6)
    expect(apple.baselineObservationCount).toBe(7)
    const circularSamples = [...samples, sample(target.sleepDate, 'hrv_sdnn', 39, 'ms', circular)]
    const other = computeVitalBaseline({
      nights,
      target,
      samples: circularSamples,
      metricKey: 'hrv_sdnn',
      sourceFamily: 'Circular',
      registry: enabled(['hrv_sdnn']),
    })
    expect(other.state).toBe('insufficient_history')
    expect(other.baselineMedian).toBeNull()
    expect(other.currentValue).toBe(39)
    const detail = buildSleepNightDetail(target, { previousSleepDate: null, nextSleepDate: null }, null, circularSamples.filter((item) => item.observedAt.startsWith(target.sleepDate)), enabled(['hrv_sdnn']), nights, circularSamples)
    const page = htmlNight(detail)
    expect(page).toContain('HRV (SDNN)')
    expect(page).toContain('6 ms above recent median')
    expect(page).toContain('Recent median unavailable')
    expect(page).not.toMatch(/improved|recovery|better|worse/i)
  })

  it('withholds a vital deviation on a partial night and keeps temperature relative to the personal median', () => {
    const priors = series([420, 420, 420, 420, 420, 420, 420])
    const partial = night(TARGET, 151, { status: 'partial_observation' })
    const samples = [
      ...priors.map((item) => sample(item.sleepDate, 'heart_rate', 58, 'bpm', watch)),
      sample(partial.sleepDate, 'heart_rate', 70, 'bpm', watch),
    ]
    const withheld = computeVitalBaseline({
      nights: [...priors, partial],
      target: partial,
      samples,
      metricKey: 'heart_rate',
      sourceFamily: 'Apple Watch',
      registry: enabled(['heart_rate']),
    })
    expect(withheld.state).toBe('current_night_ineligible')
    expect(withheld.deviation).toBeNull()
    const shown = buildSleepNightDetail(partial, { previousSleepDate: null, nextSleepDate: null }, null, samples.filter((item) => item.observedAt.startsWith(partial.sleepDate)), enabled(['heart_rate']))
    expect(shown.overnightVitals).toHaveLength(1)
    expect(shown.overnightVitals[0]?.baseline?.state).toBe('current_night_ineligible')
    expect(htmlNight(shown)).toContain('70 bpm')
    expect(htmlNight(shown)).not.toContain('above recent median')

    const current = night(TARGET, 420)
    const temperatures = [
      ...priors.map((item) => sample(item.sleepDate, 'sleeping_wrist_temperature', 35.5, '°C', watch)),
      sample(current.sleepDate, 'sleeping_wrist_temperature', 35.8, '°C', watch),
    ]
    const temperature = computeVitalBaseline({
      nights: [...priors, current],
      target: current,
      samples: temperatures,
      metricKey: 'sleeping_wrist_temperature',
      sourceFamily: 'Apple Watch',
      registry: enabled(['sleeping_wrist_temperature']),
    })
    expect(temperature.state).toBe('available')
    expect(temperature.baselineMedian).toBe(35.5)
    expect(temperature.deviation).toBeCloseTo(0.3)
    expect(vitalDeviationCopy(temperature.deviation!, '°C')).toBe('0.3 °C above recent median')
    const tempPage = htmlNight(
      buildSleepNightDetail(
        current,
        { previousSleepDate: null, nextSleepDate: null },
        null,
        temperatures.filter((item) => item.observedAt.startsWith(current.sleepDate)),
        enabled(['sleeping_wrist_temperature']),
        [...priors, current],
        temperatures,
      ),
    )
    expect(tempPage).toContain('0.3 °C above recent median')
    expect(tempPage).not.toMatch(/fever|illness|elevated|normal range/i)
  })

  it('does not let activity resting heart rate or a disabled registry create vital cards', () => {
    const { nights, target } = vitalNights(7)
    const blocked = computeVitalBaseline({
      nights,
      target,
      samples: [],
      metricKey: 'heart_rate',
      sourceFamily: 'Apple Watch',
    })
    expect(blocked.state).toBe('metric_not_enabled')
    expect(baselineVitalDefinitions()).toEqual([])
    expect(baselineVitalDefinitions(enabled(['oxygen_saturation']))).toEqual([])
    const oxygen = computeVitalBaseline({
      nights,
      target,
      samples: [sample(target.sleepDate, 'oxygen_saturation', 97, '%', watch)],
      metricKey: 'oxygen_saturation',
      sourceFamily: 'Apple Watch',
      registry: enabled(['oxygen_saturation']),
    })
    expect(oxygen.state).toBe('metric_not_enabled')
    expect(readFileSync('src/domain/sleep/baseline.ts', 'utf8')).not.toMatch(/resting_heart_rate|activity_daily_summaries/)
    expect(readFileSync('server/sleep/queries.ts', 'utf8')).not.toMatch(/resting_heart_rate/)
    const detail = buildSleepNightDetail(target, { previousSleepDate: null, nextSleepDate: null }, null, [
      sample(target.sleepDate, 'hrv_sdnn', 46, 'ms', watch),
      sample(target.sleepDate, 'heart_rate', 58, 'bpm', watch),
    ])
    expect(detail.overnightVitals).toEqual([])
    expect(htmlNight(detail)).not.toContain('HRV')
    expect(htmlNight(detail)).not.toContain('Heart rate')
    expect(SLEEP_VITAL_REGISTRY.every((item) => item.enabled === false)).toBe(true)
  })
})

describe('personal baseline presentation', () => {
  it('shows a duration baseline on Progress and Night Detail without a score', () => {
    const priors = series([390, 400, 410, 420, 430, 440, 600])
    const target = night(TARGET, 397)
    const { view, page } = htmlProgress([...priors, target])
    expect(view.personalBaseline?.state).toBe('available')
    expect(view.personalBaseline?.targetSleepDate).toBe(TARGET)
    expect(page).toContain('Personal baseline')
    expect(page).toContain('Latest complete night')
    expect(page).toContain('Recent median')
    expect(page).toContain('7h')
    expect(page).toContain(durationDeviationCopy(-23))
    expect(page).toContain('Based on 7 prior Apple Watch nights')
    expect(page).toContain('Previous 30 days')
    expect(page).not.toMatch(/better|worse|healthy|optimal|readiness|anomaly|normal range/i)
    const sleepPage = readFileSync('src/features/progress/SleepSection.tsx', 'utf8')
    const durationHeading = sleepPage.indexOf('>Sleep duration<')
    const baselineCall = sleepPage.indexOf('<PersonalBaselineSection')
    const stageSection = sleepPage.indexOf('<SleepStageSection')
    expect(durationHeading).toBeGreaterThan(-1)
    expect(durationHeading).toBeLessThan(baselineCall)
    expect(baselineCall).toBeLessThan(stageSection)
    const detail = buildSleepNightDetail(target, { previousSleepDate: null, nextSleepDate: null }, null, [], undefined, [...priors, target])
    const nightPage = htmlNight(detail)
    expect(nightPage).toContain('6h 37m')
    expect(nightPage).toContain('Recent baseline')
    expect(nightPage).toContain('7h median')
    expect(nightPage).toContain('23m below recent median')
    expect(nightPage).toContain('7 prior Apple Watch nights')
    expect(nightPage).toContain(SLEEP_PERSONAL_BASELINE_VERSION)
    const nightSource = readFileSync('src/features/progress/SleepNightPage.tsx', 'utf8')
    expect(nightSource.indexOf('text-2xl')).toBeLessThan(nightSource.indexOf('durationBaselineDetail('))
    const empty = htmlProgress([])
    expect(empty.view.personalBaseline).toBeNull()
    expect(empty.page).toContain('No complete Sleep observation available for baseline comparison.')
    const futureOnly = htmlProgress([night('2026-10-05', 480)], TARGET)
    expect(futureOnly.view.personalBaseline).toBeNull()
  })

  it('bounds a historical as-of date and keeps the demo duration-only', () => {
    const historical = buildSleepProgressView(demoDataset().sleep, { range: '30d', asOf: '2026-08-15' })
    const bounded = buildSleepProgressView(
      demoDataset().sleep.filter((item) => item.sleepDate <= '2026-08-15'),
      { range: '30d', asOf: '2026-08-15' },
    )
    expect(historical.personalBaseline).toEqual(bounded.personalBaseline)
    expect(historical.personalBaseline?.targetSleepDate <= '2026-08-15').toBe(true)
    const view = demoSleep('30d')
    expect(view.asOf).toBe(DEMO_AS_OF)
    expect(view.personalBaseline?.state).toBe('available')
    expect(view.personalBaseline?.sourceFamily).toBe('Wrist tracker')
    expect(view.personalBaseline?.metricKey).toBe('sleep_duration')
    const page = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(SleepSection, { view })))
    expect(page).toContain('Personal baseline')
    expect(page).toContain('Recent median')
    expect(page).toContain('16m below recent median')
    expect(page).toContain('Based on 26 prior Wrist tracker nights')
    expect(page).not.toContain('Overnight vitals')
    expect(page).not.toContain('HRV (SDNN)')
    expect(page).not.toContain('Heart rate')
    const detail = demoSleepNightDetail(DEMO_AS_OF)
    expect(detail?.durationBaseline.state).toBe('available')
    expect(detail?.durationBaseline.calculationVersion).toBe(SLEEP_PERSONAL_BASELINE_VERSION)
    expect(detail?.overnightVitals).toEqual([])
    const nightPage = htmlNight(detail!)
    expect(nightPage).toContain('Recent baseline')
    expect(nightPage).not.toContain('Overnight vitals')
    expect(JSON.stringify(detail?.durationBaseline)).not.toMatch(/readiness|recovery|health_score|sleep_score|severity|normal_range/)
  })
})
