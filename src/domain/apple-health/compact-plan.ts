import type { AppleActivitySummary } from './activity-summary.js'
import { addIsoDays, phoenixCalendarDate, splitSampleOnPhoenixDays } from './calendar.js'
import { buildActivityDailySummary, type ActivityDailySummary } from './daily.js'
import { ACTIVITY_CALCULATION_VERSION, SOURCE_PRIORITY } from './priority.js'
import type { NormalizedQuantitySample } from './parse.js'
import type { SourceContribution } from './reconcile.js'

export type CompactArchiveMetadata = {
  strategy: 'compact_canonical'
  parserVersion: string
  calculationVersion: string
  archive: {
    sha256: string
    zipBytes: number | null
    xmlBytes: number | null
    exportDate: string | null
  }
  supportedDateRange: { start: string; end: string } | null
  activitySamplesWritten: 0
}

export function compactImportMetadata(input: {
  parserVersion: string
  sha256: string
  zipBytes: number | null
  xmlBytes: number | null
  exportDate: string | null
  dateRange: { start: string; end: string } | null
}): CompactArchiveMetadata {
  return {
    strategy: 'compact_canonical',
    parserVersion: input.parserVersion,
    calculationVersion: ACTIVITY_CALCULATION_VERSION,
    archive: {
      sha256: input.sha256,
      zipBytes: input.zipBytes,
      xmlBytes: input.xmlBytes,
      exportDate: input.exportDate,
    },
    supportedDateRange: input.dateRange,
    activitySamplesWritten: 0,
  }
}

type StoredSample = {
  sourceId: number
  startMs: number
  endMs: number
  value: number
}

type DayParts = {
  steps: StoredSample[]
  distance: StoredSample[]
  resting: StoredSample[]
  summary: AppleActivitySummary | null
}

export type ActivitySummaryCoverage = {
  realDays: number
  sentinelDays: number
  malformedDays: number
  duplicateDays: number
  earliest: string | null
  latest: string | null
  daysWithActiveEnergy: number
  daysWithExerciseTime: number
  daysWithPositiveActiveEnergy: number
  daysWithPositiveExerciseTime: number
  spanDays: number
  missingDays: number
  longestGap: { start: string; end: string; days: number } | null
  firstMissing: string[]
  lastMissing: string[]
  metricDaysWithoutSummary: number
  metricDaysWithoutSummaryExamples: string[]
}

export type CompactStorageEstimate = {
  priorRawCanonicalRows: number
  dailyActivityRows: number
  sleepIntervalRows: number
  workoutRows: number
  granularActivitySampleRows: 0
  compactRows: number
  estimatedBytes: number
  estimatedRawSampleBytes: number
  notes: string
}

const PRIOR_RAW_ROWS = 1_697_273

export function estimateCompactStorage(input: {
  dailyRows: number
  sleepRows: number
  workoutRows: number
}): CompactStorageEstimate {
  const dailyBytes = input.dailyRows * 700
  const sleepBytes = input.sleepRows * 420
  const workoutBytes = input.workoutRows * 460
  const linkBytes = (input.dailyRows + input.sleepRows + input.workoutRows) * 180
  const compactRows = input.dailyRows + input.sleepRows + input.workoutRows
  return {
    priorRawCanonicalRows: PRIOR_RAW_ROWS,
    dailyActivityRows: input.dailyRows,
    sleepIntervalRows: input.sleepRows,
    workoutRows: input.workoutRows,
    granularActivitySampleRows: 0,
    compactRows,
    estimatedBytes: dailyBytes + sleepBytes + workoutBytes + linkBytes,
    estimatedRawSampleBytes: PRIOR_RAW_ROWS * 280,
    notes:
      'Heap, index, and source-link estimate from row width. Not measured with pg_relation_size, and not based on the normalized JSON upload.',
  }
}

function contribution(day: ActivityDailySummary, metric: 'steps' | 'walkingRunningDistance', sourceName: string) {
  const evidence = metric === 'steps' ? day.evidence.steps : day.evidence.walkingRunningDistance
  return evidence.contributions.find((item) => item.sourceName === sourceName) ?? null
}

function hasSource(day: ActivityDailySummary, metric: 'steps' | 'walkingRunningDistance', sourceName: string) {
  const evidence = metric === 'steps' ? day.evidence.steps : day.evidence.walkingRunningDistance
  return evidence.sourcesEncountered.includes(sourceName)
}

export type RepresentativeDay = {
  role: string
  date: string
  stepsCount: number | null
  walkingRunningDistanceM: number | null
  activeEnergyKcal: number | null
  exerciseMinutes: number | null
  stepsSources: string[]
  distanceSources: string[]
  stepsContributions: SourceContribution[]
  distanceContributions: SourceContribution[]
  activeEnergyBasis: string
  exerciseBasis: string
}

const WATCH = SOURCE_PRIORITY.steps[0]
const JACOBS_IPHONE = SOURCE_PRIORITY.steps[1]
const IPHONE = SOURCE_PRIORITY.steps[2]
const CIRCULAR = SOURCE_PRIORITY.steps[3]
const NIKE = SOURCE_PRIORITY.walking_running_distance[3]

function phoneOnly(day: ActivityDailySummary): boolean {
  if (day.stepsCount == null || day.stepsCount <= 0) {
    return false
  }
  const sources = day.evidence.steps.sourcesEncountered
  return (
    sources.length > 0 &&
    sources.every((source) => source === IPHONE || source === JACOBS_IPHONE) &&
    !hasSource(day, 'steps', WATCH)
  )
}

function phoneFill(day: ActivityDailySummary): SourceContribution | null {
  const fills = [IPHONE, JACOBS_IPHONE]
    .map((sourceName) => contribution(day, 'steps', sourceName))
    .filter((item): item is SourceContribution => item != null && item.usedSampleCount > 0)
  fills.sort((left, right) => right.addedValue - left.addedValue)
  return fills[0] ?? null
}

function watchAndPhoneFill(day: ActivityDailySummary): boolean {
  const watch = contribution(day, 'steps', WATCH)
  return Boolean(watch && watch.usedSampleCount > 0 && phoneFill(day))
}

export function selectRepresentativeDays(
  days: readonly ActivityDailySummary[],
  exportDate: string | null,
): RepresentativeDay[] {
  const used = new Set<string>()
  const take = (role: string, candidates: ActivityDailySummary[]): RepresentativeDay | null => {
    const candidate = candidates.find((day) => !used.has(day.date))
    if (!candidate) {
      return null
    }
    used.add(candidate.date)
    return {
      role,
      date: candidate.date,
      stepsCount: candidate.stepsCount,
      walkingRunningDistanceM: candidate.walkingRunningDistanceM,
      activeEnergyKcal: candidate.activeEnergyKcal,
      exerciseMinutes: candidate.exerciseMinutes,
      stepsSources: candidate.evidence.steps.sourcesEncountered,
      distanceSources: candidate.evidence.walkingRunningDistance.sourcesEncountered,
      stepsContributions: candidate.evidence.steps.contributions,
      distanceContributions: candidate.evidence.walkingRunningDistance.contributions,
      activeEnergyBasis: candidate.evidence.activeEnergy.basis,
      exerciseBasis: candidate.evidence.exerciseTime.basis,
    }
  }

  const phone = [...days].filter(phoneOnly).sort((left, right) => left.date.localeCompare(right.date))
  const watchPhone = [...days]
    .filter(watchAndPhoneFill)
    .sort((left, right) => {
      const leftPhone = phoneFill(left)?.addedValue ?? 0
      const rightPhone = phoneFill(right)?.addedValue ?? 0
      if (rightPhone !== leftPhone) {
        return rightPhone - leftPhone
      }
      return left.date.localeCompare(right.date)
    })
  const nike = [...days]
    .filter((day) => hasSource(day, 'walkingRunningDistance', NIKE))
    .sort((left, right) => {
      const count =
        (contribution(right, 'walkingRunningDistance', NIKE)?.rawSampleCount ?? 0) -
        (contribution(left, 'walkingRunningDistance', NIKE)?.rawSampleCount ?? 0)
      if (count !== 0) {
        return count
      }
      return left.date.localeCompare(right.date)
    })
  const modern = [...days]
    .filter((day) => {
      if (!day.date.startsWith('2026-') || day.activeEnergyKcal == null) {
        return false
      }
      if (exportDate && day.date >= exportDate.slice(0, 10)) {
        return false
      }
      return (contribution(day, 'steps', WATCH)?.usedSampleCount ?? 0) > 0
    })
    .sort((left, right) => right.date.localeCompare(left.date))
  const circular = [...days]
    .filter((day) => hasSource(day, 'steps', WATCH) && hasSource(day, 'steps', CIRCULAR))
    .sort((left, right) => {
      const leftUsed = contribution(left, 'steps', CIRCULAR)?.usedSampleCount ?? 0
      const rightUsed = contribution(right, 'steps', CIRCULAR)?.usedSampleCount ?? 0
      if (rightUsed !== leftUsed) {
        return rightUsed - leftUsed
      }
      return right.date.localeCompare(left.date)
    })
  const overlap = [...days]
    .filter((day) => day.evidence.steps.sourcesEncountered.length >= 2)
    .sort((left, right) => {
      if (right.evidence.steps.rawSampleCount !== left.evidence.steps.rawSampleCount) {
        return right.evidence.steps.rawSampleCount - left.evidence.steps.rawSampleCount
      }
      return left.date.localeCompare(right.date)
    })

  return [
    take('iphone_only_historical', phone),
    take('watch_and_iphone', watchPhone),
    take('nike_run_club_distance', nike),
    take('modern_watch', modern),
    take('watch_and_circular', circular),
    take('substantial_source_overlap', overlap),
  ].filter((day): day is RepresentativeDay => day != null)
}

export function summarizeActivityCoverage(input: {
  summaries: ReadonlyMap<string, AppleActivitySummary>
  sentinelDays: number
  malformedDays: number
  duplicateDays: number
  metricDates: readonly string[]
}): ActivitySummaryCoverage {
  const dates = [...input.summaries.keys()].sort()
  const earliest = dates[0] ?? null
  const latest = dates[dates.length - 1] ?? null
  let daysWithActiveEnergy = 0
  let daysWithExerciseTime = 0
  let daysWithPositiveActiveEnergy = 0
  let daysWithPositiveExerciseTime = 0
  for (const summary of input.summaries.values()) {
    if (summary.activeEnergyKcal != null) {
      daysWithActiveEnergy += 1
      if (summary.activeEnergyKcal > 0) {
        daysWithPositiveActiveEnergy += 1
      }
    }
    if (summary.exerciseMinutes != null) {
      daysWithExerciseTime += 1
      if (summary.exerciseMinutes > 0) {
        daysWithPositiveExerciseTime += 1
      }
    }
  }
  const missing: string[] = []
  let longest: { start: string; end: string; days: number } | null = null
  let spanDays = 0
  if (earliest && latest) {
    let cursor = earliest
    let gapStart: string | null = null
    let gapDays = 0
    while (cursor <= latest) {
      spanDays += 1
      if (!input.summaries.has(cursor)) {
        missing.push(cursor)
        if (!gapStart) {
          gapStart = cursor
          gapDays = 1
        } else {
          gapDays += 1
        }
      } else if (gapStart) {
        if (!longest || gapDays > longest.days) {
          longest = { start: gapStart, end: addIsoDays(cursor, -1), days: gapDays }
        }
        gapStart = null
        gapDays = 0
      }
      cursor = addIsoDays(cursor, 1)
    }
    if (gapStart && (!longest || gapDays > longest.days)) {
      longest = { start: gapStart, end: latest, days: gapDays }
    }
  }
  const metricWithout = input.metricDates.filter((date) => !input.summaries.has(date)).sort()
  return {
    realDays: input.summaries.size,
    sentinelDays: input.sentinelDays,
    malformedDays: input.malformedDays,
    duplicateDays: input.duplicateDays,
    earliest,
    latest,
    daysWithActiveEnergy,
    daysWithExerciseTime,
    daysWithPositiveActiveEnergy,
    daysWithPositiveExerciseTime,
    spanDays,
    missingDays: missing.length,
    longestGap: longest,
    firstMissing: missing.slice(0, 8),
    lastMissing: missing.slice(-8),
    metricDaysWithoutSummary: metricWithout.length,
    metricDaysWithoutSummaryExamples: metricWithout.slice(0, 8),
  }
}

export function createDailyAccumulator() {
  const names: string[] = []
  const nameIds = new Map<string, number>()
  const days = new Map<string, DayParts>()
  const summaries = new Map<string, AppleActivitySummary>()
  let sentinelDays = 0
  let malformedDays = 0
  let duplicateDays = 0
  let discardedActiveEnergy = 0
  let discardedExercise = 0
  let sleepIntervals = 0
  let workouts = 0
  let stepsKept = 0
  let distanceKept = 0
  let restingKept = 0

  function sourceId(name: string): number {
    const existing = nameIds.get(name)
    if (existing != null) {
      return existing
    }
    const id = names.length
    names.push(name)
    nameIds.set(name, id)
    return id
  }

  function parts(date: string): DayParts {
    const existing = days.get(date)
    if (existing) {
      return existing
    }
    const created: DayParts = { steps: [], distance: [], resting: [], summary: null }
    days.set(date, created)
    return created
  }

  return {
    addQuantity(record: NormalizedQuantitySample) {
      if (record.metric === 'active_energy') {
        discardedActiveEnergy += 1
        return
      }
      if (record.metric === 'exercise_time') {
        discardedExercise += 1
        return
      }
      const startMs = Date.parse(record.startAt)
      const endMs = Date.parse(record.endAt)
      if (record.metric === 'resting_heart_rate') {
        if (!Number.isFinite(startMs)) {
          return
        }
        const day = parts(phoenixCalendarDate(startMs))
        day.resting.push({
          sourceId: sourceId(record.sourceName),
          startMs,
          endMs: Number.isFinite(endMs) ? endMs : startMs,
          value: record.value,
        })
        restingKept += 1
        return
      }
      const pieces = splitSampleOnPhoenixDays({
        sourceName: record.sourceName,
        startMs,
        endMs,
        value: record.value,
      })
      for (const piece of pieces) {
        const date = phoenixCalendarDate(piece.startMs)
        const stored = {
          sourceId: sourceId(piece.sourceName),
          startMs: piece.startMs,
          endMs: piece.endMs,
          value: piece.value,
        }
        const day = parts(date)
        if (record.metric === 'steps') {
          day.steps.push(stored)
          stepsKept += 1
        } else {
          day.distance.push(stored)
          distanceKept += 1
        }
      }
    },
    addSummary(summary: AppleActivitySummary) {
      if (summaries.has(summary.date)) {
        duplicateDays += 1
      }
      summaries.set(summary.date, summary)
      parts(summary.date).summary = summary
    },
    skipSummary(reason: 'sentinel' | 'malformed') {
      if (reason === 'sentinel') {
        sentinelDays += 1
      } else {
        malformedDays += 1
      }
    },
    addSleep() {
      sleepIntervals += 1
    },
    addWorkout() {
      workouts += 1
    },
    finish(exportDate: string | null) {
      const built: ActivityDailySummary[] = []
      const metricDates: string[] = []
      for (const [date, day] of days) {
        const toSample = (sample: StoredSample) => ({
          sourceName: names[sample.sourceId] ?? 'Unknown',
          startMs: sample.startMs,
          endMs: sample.endMs,
          value: sample.value,
        })
        if (day.steps.length > 0 || day.distance.length > 0) {
          metricDates.push(date)
        }
        const summary = buildActivityDailySummary({
          date,
          steps: day.steps.map(toSample),
          distance: day.distance.map(toSample),
          resting: day.resting.map(toSample),
          summary: day.summary,
        })
        if (summary) {
          built.push(summary)
        }
      }
      built.sort((left, right) => left.date.localeCompare(right.date))
      const restingSingle = built.filter(
        (day) => day.evidence.restingHeartRate.basis === 'single_resting_observation',
      ).length
      const restingLatest = built.filter(
        (day) => day.evidence.restingHeartRate.basis === 'latest_resting_observation',
      ).length
      return {
        days: built,
        coverage: summarizeActivityCoverage({
          summaries,
          sentinelDays,
          malformedDays,
          duplicateDays,
          metricDates,
        }),
        representatives: selectRepresentativeDays(built, exportDate),
        storage: estimateCompactStorage({
          dailyRows: built.length,
          sleepRows: sleepIntervals,
          workoutRows: workouts,
        }),
        counts: {
          dailyRows: built.length,
          sleepIntervals,
          workouts,
          discardedActiveEnergy,
          discardedExercise,
          stepsKept,
          distanceKept,
          restingKept,
          restingSingleObservationDays: restingSingle,
          restingLatestObservationDays: restingLatest,
          granularActivitySampleRows: 0 as const,
        },
        calculationVersion: ACTIVITY_CALCULATION_VERSION,
        sourcePriority: SOURCE_PRIORITY,
      }
    },
  }
}
