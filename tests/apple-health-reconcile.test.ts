import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildCompactDailyStatement, buildCompactIntervalStatement, chunkCompactStatements, compactStatementIsIdempotent } from '../server/apple-health/compact-sql.ts'
import { parseActivitySummaryTag } from '../src/domain/apple-health/activity-summary.ts'
import { splitSampleOnPhoenixDays } from '../src/domain/apple-health/calendar.ts'
import { compactImportMetadata, createDailyAccumulator, estimateCompactStorage } from '../src/domain/apple-health/compact-plan.ts'
import { activityDailyFingerprint, buildActivityDailySummary } from '../src/domain/apple-health/daily.ts'
import { createAppleHealthXmlScanner } from '../src/domain/apple-health/parse.ts'
import type { NormalizedAppleHealthRecord } from '../src/domain/apple-health/parse.ts'
import { ACTIVITY_CALCULATION_VERSION, JACOBS_APPLE_WATCH, SOURCE_PRIORITY } from '../src/domain/apple-health/priority.ts'
import { reconcileIntervalMetric, reconcileRestingHeartRate } from '../src/domain/apple-health/reconcile.ts'
import { HEALTH_CALENDAR_TIME_ZONE } from '../src/domain/time.ts'

const HOUR = 60 * 60 * 1000
const DAY = '2026-09-01'
const START = Date.parse('2026-09-01T10:00:00-07:00')

function sample(sourceName: string, startMs: number, endMs: number, value: number) {
  return { sourceName, startMs, endMs, value }
}

describe('ActivitySummary parsing', () => {
  it('reads active energy and exercise minutes on the Health calendar date', () => {
    const parsed = parseActivitySummaryTag(
      '<ActivitySummary dateComponents="2026-09-01" activeEnergyBurned="492.652" activeEnergyBurnedGoal="420" activeEnergyBurnedUnit="Cal" appleExerciseTime="18" appleExerciseTimeGoal="30" appleStandHours="15" appleStandHoursGoal="9"/>',
    )
    expect(parsed.kind).toBe('summary')
    if (parsed.kind !== 'summary') {
      return
    }
    expect(parsed.summary.date).toBe('2026-09-01')
    expect(parsed.summary.activeEnergyKcal).toBeCloseTo(492.652)
    expect(parsed.summary.exerciseMinutes).toBe(18)
    expect(parsed.summary.sourceContext.activeEnergyGoalKcal).toBe(420)
    expect(parsed.summary.activeEnergyKcal).not.toBe(parsed.summary.sourceContext.activeEnergyGoalKcal)
  })

  it('keeps a missing value unavailable and an explicit zero as zero', () => {
    const missing = parseActivitySummaryTag(
      '<ActivitySummary dateComponents="2026-09-02" appleExerciseTime="4" appleExerciseTimeGoal="30"/>',
    )
    const zero = parseActivitySummaryTag(
      '<ActivitySummary dateComponents="2020-09-10" activeEnergyBurned="0" activeEnergyBurnedUnit="Cal" appleExerciseTime="0"/>',
    )
    expect(missing.kind).toBe('summary')
    expect(zero.kind).toBe('summary')
    if (missing.kind !== 'summary' || zero.kind !== 'summary') {
      return
    }
    expect(missing.summary.activeEnergyKcal).toBeNull()
    expect(missing.summary.exerciseMinutes).toBe(4)
    expect(zero.summary.activeEnergyKcal).toBe(0)
    expect(zero.summary.exerciseMinutes).toBe(0)
  })

  it('does not turn epoch sentinel dates into Health days', () => {
    const parsed = parseActivitySummaryTag(
      '<ActivitySummary dateComponents="1969-12-30" activeEnergyBurned="0" activeEnergyBurnedUnit="Cal" appleExerciseTime="0"/>',
    )
    expect(parsed).toEqual({ kind: 'skip', reason: 'sentinel' })
  })

  it('maps the summary date with the Health timezone and survives a split tag', () => {
    const xml =
      '<ActivitySummary dateComponents="2026-11-02" activeEnergyBurned="12" activeEnergyBurnedUnit="Cal" appleExerciseTime="3"/>'
    const scanner = createAppleHealthXmlScanner()
    scanner.push(xml.slice(0, 40))
    scanner.push(xml.slice(40))
    const parsed = scanner.finish()
    expect(parsed.activitySummaries).toHaveLength(1)
    expect(parsed.activitySummaries[0]?.date).toBe('2026-11-02')
    const day = buildActivityDailySummary({
      date: '2026-11-02',
      steps: [],
      distance: [],
      resting: [],
      summary: parsed.activitySummaries[0] ?? null,
    })
    expect(day?.timezone).toBe(HEALTH_CALENDAR_TIME_ZONE)
    expect(day?.timezone).toBe('America/Phoenix')
    expect(day?.activeEnergyKcal).toBe(12)
  })
})

describe('source-priority reconciliation', () => {
  it('sums a single source', () => {
    const result = reconcileIntervalMetric(
      [sample('iPhone', START, START + HOUR, 100), sample('iPhone', START + HOUR, START + 2 * HOUR, 40)],
      'steps',
    )
    expect(result.value).toBe(140)
    expect(result.basis).toBe('health_reconciled_source_priority')
    expect(result.calculationVersion).toBe(ACTIVITY_CALCULATION_VERSION)
    expect(result.selectedSources).toEqual(['iPhone'])
  })

  it('lets the higher-priority source own overlapping time', () => {
    const result = reconcileIntervalMetric(
      [
        sample(JACOBS_APPLE_WATCH, START, START + HOUR, 100),
        sample('iPhone', START, START + HOUR, 80),
      ],
      'steps',
    )
    expect(result.value).toBe(100)
    expect(result.contributions.find((item) => item.sourceName === 'iPhone')?.addedValue).toBe(0)
    expect(result.sourcesEncountered).toContain('iPhone')
  })

  it('lets a lower-priority source fill time the higher-priority source did not observe', () => {
    const result = reconcileIntervalMetric(
      [
        sample(JACOBS_APPLE_WATCH, START, START + HOUR, 60),
        sample('iPhone', START + HOUR, START + 2 * HOUR, 40),
      ],
      'steps',
    )
    expect(result.value).toBe(100)
    expect(result.selectedSources).toEqual([JACOBS_APPLE_WATCH, 'iPhone'])
  })

  it('prorates a partial overlap instead of dropping the whole lower-priority sample', () => {
    const result = reconcileIntervalMetric(
      [
        sample(JACOBS_APPLE_WATCH, START, START + HOUR, 60),
        sample('iPhone', START + HOUR / 2, START + HOUR + HOUR / 2, 60),
      ],
      'steps',
    )
    expect(result.value).toBe(90)
  })

  it('keeps a zero-duration total in evidence without adding it', () => {
    const result = reconcileIntervalMetric(
      [
        sample(JACOBS_APPLE_WATCH, START, START + HOUR, 1000),
        sample('Circular', START, START, 6801),
      ],
      'walking_running_distance',
    )
    expect(result.value).toBe(1000)
    expect(result.sourcesEncountered).toContain('Circular')
    expect(result.contributions.find((item) => item.sourceName === 'Circular')).toMatchObject({
      ignoredZeroDurationCount: 1,
      ignoredZeroDurationValue: 6801,
      addedValue: 0,
    })
    const onlyPoint = reconcileIntervalMetric([sample('Circular', START, START, 6801)], 'walking_running_distance')
    expect(onlyPoint.value).toBeNull()
    expect(onlyPoint.basis).toBe('unavailable')
  })

  it('does not double-count an exact duplicate and does not fuzzy-delete a near sample', () => {
    const duplicate = reconcileIntervalMetric(
      [
        sample(JACOBS_APPLE_WATCH, START, START + HOUR, 100),
        sample('Nike Run Club', START, START + HOUR, 100),
      ],
      'walking_running_distance',
    )
    expect(duplicate.value).toBe(100)
    expect(duplicate.sourcesEncountered).toContain('Nike Run Club')
    const near = reconcileIntervalMetric(
      [
        sample('iPhone', START, START + HOUR, 10),
        sample('iPhone', START + HOUR + 1, START + 2 * HOUR, 15),
      ],
      'steps',
    )
    expect(near.value).toBe(25)
  })

  it('resolves disagreeing overlap deterministically from source priority', () => {
    const forward = reconcileIntervalMetric(
      [
        sample('iPhone', START, START + HOUR, 80),
        sample(JACOBS_APPLE_WATCH, START, START + HOUR, 100),
      ],
      'steps',
    )
    const reverse = reconcileIntervalMetric(
      [
        sample(JACOBS_APPLE_WATCH, START, START + HOUR, 100),
        sample('iPhone', START, START + HOUR, 80),
      ],
      'steps',
    )
    expect(forward.value).toBe(reverse.value)
    expect(forward.value).toBe(100)
    expect(forward.calculationVersion).toBe(SOURCE_PRIORITY.steps.length > 0 ? ACTIVITY_CALCULATION_VERSION : '')
  })

  it('uses one resting observation and the latest observation when several exist', () => {
    const single = reconcileRestingHeartRate([
      sample('Circular', START, START + HOUR, 70),
      sample(JACOBS_APPLE_WATCH, START, START + HOUR, 52),
    ])
    expect(single.value).toBe(52)
    expect(single.basis).toBe('single_resting_observation')
    expect(single.sourcesEncountered).toContain('Circular')
    const multiple = reconcileRestingHeartRate([
      sample(JACOBS_APPLE_WATCH, START, START + HOUR, 60),
      sample(JACOBS_APPLE_WATCH, START + HOUR, START + 2 * HOUR, 48),
    ])
    expect(multiple.value).toBe(48)
    expect(multiple.basis).toBe('latest_resting_observation')
    expect(multiple.value).not.toBe(54)
  })
})

describe('canonical daily activity', () => {
  it('keeps one day and leaves an unobserved metric null', () => {
    const day = buildActivityDailySummary({
      date: DAY,
      steps: [sample('iPhone', START, START + HOUR, 8421)],
      distance: [],
      resting: [],
      summary: null,
    })
    expect(day?.stepsCount).toBe(8421)
    expect(day?.activeEnergyKcal).toBeNull()
    expect(day?.exerciseMinutes).toBeNull()
    expect(day?.walkingRunningDistanceM).toBeNull()
    expect(day?.restingHeartRateBpm).toBeNull()
    expect(day?.evidence.activeEnergy.reason).toBe('no_activity_summary')
  })

  it('does not turn a day with no observations into zeros', () => {
    expect(
      buildActivityDailySummary({
        date: DAY,
        steps: [],
        distance: [],
        resting: [],
        summary: null,
      }),
    ).toBeNull()
  })

  it('splits a sample that crosses a Phoenix midnight', () => {
    const pieces = splitSampleOnPhoenixDays({
      sourceName: 'iPhone',
      startMs: Date.parse('2026-11-02T06:30:00.000Z'),
      endMs: Date.parse('2026-11-02T08:30:00.000Z'),
      value: 120,
    })
    expect(pieces.map((piece) => [new Date(piece.startMs).toISOString(), piece.value])).toEqual([
      ['2026-11-02T06:30:00.000Z', 30],
      ['2026-11-02T07:00:00.000Z', 90],
    ])
    const accumulator = createDailyAccumulator()
    accumulator.addQuantity({
      kind: 'quantity',
      metric: 'steps',
      appleType: 'HKQuantityTypeIdentifierStepCount',
      startAt: '2026-11-02T06:30:00.000Z',
      endAt: '2026-11-02T08:30:00.000Z',
      value: 120,
      sourceValue: '120',
      canonicalUnit: 'count',
      sourceUnit: 'count',
      sourceName: 'iPhone',
      sourceVersion: null,
      deviceName: null,
      fingerprint: 'midnight',
    })
    const plan = accumulator.finish(null)
    const byDate = Object.fromEntries(plan.days.map((day) => [day.date, day.stepsCount]))
    expect(byDate['2026-11-01']).toBe(30)
    expect(byDate['2026-11-02']).toBe(90)
    expect(plan.days.every((day) => day.timezone === 'America/Phoenix')).toBe(true)
  })
})

describe('compact historical import plan', () => {
  const day = buildActivityDailySummary({
    date: DAY,
    steps: [sample('iPhone', START, START + HOUR, 10)],
    distance: [],
    resting: [sample(JACOBS_APPLE_WATCH, START, START, 55)],
    summary: {
      date: DAY,
      activeEnergyKcal: 20,
      exerciseMinutes: 5,
      sourceContext: {
        activeEnergyGoalKcal: 400,
        exerciseGoalMinutes: 30,
        moveTimeMinutes: null,
        moveTimeGoalMinutes: null,
        standHours: null,
        standHoursGoal: null,
      },
    },
  })

  const sleep: NormalizedAppleHealthRecord = {
    kind: 'sleep',
    appleType: 'HKCategoryTypeIdentifierSleepAnalysis',
    startAt: '2026-09-01T22:00:00-07:00',
    endAt: '2026-09-02T06:00:00-07:00',
    stage: 'core',
    sourceCategory: 'HKCategoryValueSleepAnalysisAsleepCore',
    sourceName: JACOBS_APPLE_WATCH,
    sourceVersion: '10',
    deviceName: 'Watch',
    fingerprint: 'sleep-fingerprint',
  }

  it('does not write raw activity samples, records archive metadata, and can be rerun', () => {
    expect(day).not.toBeNull()
    const first = buildCompactDailyStatement({ sourceId: 'source', jobId: 'job', day: day! })
    const second = buildCompactDailyStatement({ sourceId: 'source', jobId: 'job-2', day: day! })
    expect(first.sql).not.toContain('activity_samples')
    expect(first.sql).toContain('ON CONFLICT (summary_date, timezone)')
    expect(first.fingerprint).toBe(activityDailyFingerprint(DAY, 'America/Phoenix'))
    expect(second.fingerprint).toBe(first.fingerprint)
    expect(compactStatementIsIdempotent(first.sql)).toBe(true)
    expect(() =>
      buildCompactIntervalStatement({
        sourceId: 'source',
        jobId: 'job',
        record: {
          kind: 'quantity',
          metric: 'steps',
          appleType: 'HKQuantityTypeIdentifierStepCount',
          startAt: '2026-09-01T10:00:00-07:00',
          endAt: '2026-09-01T11:00:00-07:00',
          value: 10,
          sourceValue: '10',
          canonicalUnit: 'count',
          sourceUnit: 'count',
          sourceName: 'iPhone',
          sourceVersion: null,
          deviceName: null,
          fingerprint: 'quantity',
        },
      }),
    ).toThrow(/does not write activity samples/)
    const metadata = compactImportMetadata({
      parserVersion: '1.1.0',
      sha256: 'abc',
      zipBytes: 100,
      xmlBytes: 200,
      exportDate: '2026-09-21T18:17:26-07:00',
      dateRange: { start: '2016-11-12', end: '2026-09-21' },
    })
    expect(metadata.archive.sha256).toBe('abc')
    expect(metadata.activitySamplesWritten).toBe(0)
    expect(metadata.strategy).toBe('compact_canonical')
  })

  it('keeps sleep intervals and workout summaries on the existing claim path', () => {
    const sleepStatement = buildCompactIntervalStatement({ sourceId: 'source', jobId: 'job', record: sleep })
    expect(sleepStatement.sql).toContain('sleep_intervals')
    expect(sleepStatement.sql).not.toContain('activity_samples')
    expect(sleepStatement.params).toContain('core')
    const workoutStatement = buildCompactIntervalStatement({
      sourceId: 'source',
      jobId: 'job',
      record: {
        kind: 'workout',
        appleType: 'HKWorkoutActivityTypeRunning',
        activityType: 'HKWorkoutActivityTypeRunning',
        startAt: '2026-09-01T06:00:00-07:00',
        endAt: '2026-09-01T06:30:00-07:00',
        durationMin: 30,
        energyKcal: 200,
        distanceM: 5000,
        sourceName: JACOBS_APPLE_WATCH,
        sourceVersion: null,
        deviceName: 'Watch',
        fingerprint: 'workout-fingerprint',
      },
    })
    expect(workoutStatement.sql).toContain('activity_workouts')
    expect(workoutStatement.params).toContain(5000)
  })

  it('is safe to rerun after an interrupted batch', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03'].map((date) => {
      const built = buildActivityDailySummary({
        date,
        steps: [sample('iPhone', Date.parse(`${date}T10:00:00-07:00`), Date.parse(`${date}T11:00:00-07:00`), 10)],
        distance: [],
        resting: [],
        summary: null,
      })
      if (!built) {
        throw new Error('expected a day')
      }
      return built
    })
    const statements = days.map((item) => buildCompactDailyStatement({ sourceId: 'source', jobId: 'job', day: item }))
    const chunks = chunkCompactStatements(statements, 2)
    expect(chunks.map((chunk) => chunk.map((statement) => statement.fingerprint))).toEqual([
      [statements[0]!.fingerprint, statements[1]!.fingerprint],
      [statements[2]!.fingerprint],
    ])
    const rerun = days.map((item) => buildCompactDailyStatement({ sourceId: 'source', jobId: 'job', day: item }))
    expect(rerun.map((statement) => statement.fingerprint)).toEqual(statements.map((statement) => statement.fingerprint))
    expect(rerun.every((statement) => compactStatementIsIdempotent(statement.sql))).toBe(true)
  })

  it('estimates a compact footprint far below the raw sample backfill', () => {
    const estimate = estimateCompactStorage({ dailyRows: 3000, sleepRows: 14712, workoutRows: 846 })
    expect(estimate.granularActivitySampleRows).toBe(0)
    expect(estimate.compactRows).toBe(3000 + 14712 + 846)
    expect(estimate.estimatedBytes).toBeLessThan(estimate.estimatedRawSampleBytes / 10)
  })
})

describe('compact CLI boundary', () => {
  const source = readFileSync('server/apple-health/compact-cli.ts', 'utf8')
  const service = readFileSync('server/apple-health/compact-service.ts', 'utf8')

  it('does not upload historical batches through Vercel', () => {
    expect(source).not.toContain('APPLE_HEALTH_COMMIT_BATCH')
    expect(source).not.toContain('fetch(')
    expect(source).not.toContain('vercel')
    expect(source).toContain('commitCompactAppleHealth')
    expect(source).not.toContain("from './compact-service.js'")
    expect(service).toContain('getSql')
    expect(service).not.toContain('activity_samples')
    expect(service).toContain('FIND_COMPACT_JOB_BY_ARCHIVE_SQL')
    expect(service).toContain("calculationVersion: 'xml_sleep_workouts'")
    expect(service).toContain('resumed ? 0 : input.sleep.length + input.workouts.length')
    expect(service).toContain('reconcileCommitted: false')
  })
})
