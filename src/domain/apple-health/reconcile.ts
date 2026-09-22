import {
  ACTIVITY_CALCULATION_VERSION,
  SOURCE_PRIORITY,
  sourcePriorityRank,
  type PrioritizedMetric,
} from './priority.js'

/**
 * Health-derived source-precedence reconciliation.
 *
 * This is not Apple's displayed Health total. Apple does not export an accepted
 * daily total for steps or walking/running distance, and summing every source
 * double-counts Watch, iPhone, and Nike Run Club.
 *
 * For one metric on one Health calendar day:
 * 1. Order sources by the explicit priority list. Unlisted sources sort after
 *    that list, by name. Nothing is deleted.
 * 2. Within a source, order samples by start, end, then value.
 * 3. Higher-priority samples claim their half-open [start, end) coverage.
 * 4. A later sample adds value only for time that is still uncovered.
 *    added = value * uncoveredDuration / sampleDuration.
 *    A zero-duration sample has no interval. It is retained as evidence and
 *    does not add value or claim time. Circular's distance export is one
 *    midnight point per day; adding it would double-count Watch intervals.
 * 5. The sample's own interval is then claimed, including the part that did
 *    not add value, so a lower-priority source cannot fill time a higher
 *    source already observed.
 * 6. Same-source overlap uses the same rule, so one source cannot double-count
 *    itself. There is no fuzzy timestamp match and no nearest-value heuristic.
 *
 * A higher-priority source that is silent for part of the day does not erase
 * the rest of the day. The lower-priority source fills only that uncovered time.
 *
 * Resting heart rate is not an interval sum. The highest-priority source with
 * at least one valid sample owns the day. One sample is used as-is. Several
 * samples from that source resolve to the latest end, then latest start, then
 * the lower bpm. They are not averaged.
 */

export type IntervalSample = {
  sourceName: string
  startMs: number
  endMs: number
  value: number
}

export type SourceContribution = {
  sourceName: string
  priorityRank: number
  rawSampleCount: number
  usedSampleCount: number
  addedValue: number
  ignoredZeroDurationCount: number
  ignoredZeroDurationValue: number
}

export type ReconciledInterval = {
  value: number | null
  basis: 'health_reconciled_source_priority' | 'unavailable'
  calculationVersion: string
  sourcesEncountered: string[]
  rawSampleCount: number
  selectedSources: string[]
  contributions: SourceContribution[]
}

export type RestingObservation = {
  sourceName: string
  startMs: number
  endMs: number
  value: number
}

export type ReconciledRestingHeartRate = {
  value: number | null
  basis: 'single_resting_observation' | 'latest_resting_observation' | 'unavailable'
  calculationVersion: string
  sourcesEncountered: string[]
  rawSampleCount: number
  selectedSource: string | null
  observationCount: number
  invalidCount: number
}

type Interval = [number, number]

function compareSamples(left: IntervalSample, right: IntervalSample): number {
  if (left.startMs !== right.startMs) {
    return left.startMs - right.startMs
  }
  if (left.endMs !== right.endMs) {
    return left.endMs - right.endMs
  }
  if (left.value !== right.value) {
    return left.value - right.value
  }
  return left.sourceName < right.sourceName ? -1 : left.sourceName > right.sourceName ? 1 : 0
}

function uncoveredDuration(start: number, end: number, covered: Interval[]): number {
  if (end <= start) {
    return 0
  }
  let duration = end - start
  let lo = 0
  let hi = covered.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (covered[mid]![1] <= start) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  for (let index = lo; index < covered.length && covered[index]![0] < end; index += 1) {
    const overlapStart = Math.max(start, covered[index]![0])
    const overlapEnd = Math.min(end, covered[index]![1])
    if (overlapEnd > overlapStart) {
      duration -= overlapEnd - overlapStart
    }
  }
  return duration
}

function claimInterval(covered: Interval[], start: number, end: number) {
  if (end <= start) {
    return
  }
  let lo = 0
  let hi = covered.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (covered[mid]![1] < start) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  let mergeStart = start
  let mergeEnd = end
  let remove = 0
  while (lo + remove < covered.length && covered[lo + remove]![0] <= mergeEnd) {
    mergeStart = Math.min(mergeStart, covered[lo + remove]![0])
    mergeEnd = Math.max(mergeEnd, covered[lo + remove]![1])
    remove += 1
  }
  covered.splice(lo, remove, [mergeStart, mergeEnd])
}

function emptyInterval(calculationVersion: string): ReconciledInterval {
  return {
    value: null,
    basis: 'unavailable',
    calculationVersion,
    sourcesEncountered: [],
    rawSampleCount: 0,
    selectedSources: [],
    contributions: [],
  }
}

export function reconcileIntervalMetric(
  samples: readonly IntervalSample[],
  metric: Extract<PrioritizedMetric, 'steps' | 'walking_running_distance'>,
  calculationVersion = ACTIVITY_CALCULATION_VERSION,
): ReconciledInterval {
  const valid = samples.filter(
    (sample) =>
      Number.isFinite(sample.startMs) &&
      Number.isFinite(sample.endMs) &&
      sample.endMs >= sample.startMs &&
      Number.isFinite(sample.value),
  )
  if (valid.length === 0) {
    return emptyInterval(calculationVersion)
  }
  const grouped = new Map<string, IntervalSample[]>()
  for (const sample of valid) {
    const list = grouped.get(sample.sourceName)
    if (list) {
      list.push(sample)
    } else {
      grouped.set(sample.sourceName, [sample])
    }
  }
  const sourceNames = [...grouped.keys()].sort((left, right) => {
    const rank = sourcePriorityRank(metric, left) - sourcePriorityRank(metric, right)
    if (rank !== 0) {
      return rank
    }
    return left < right ? -1 : left > right ? 1 : 0
  })
  const covered: Interval[] = []
  const contributions: SourceContribution[] = []
  let intervalSamples = 0
  for (const sourceName of sourceNames) {
    const list = grouped.get(sourceName) ?? []
    list.sort(compareSamples)
    let addedValue = 0
    let usedSampleCount = 0
    let ignoredZeroDurationCount = 0
    let ignoredZeroDurationValue = 0
    for (const sample of list) {
      const duration = sample.endMs - sample.startMs
      if (duration === 0) {
        ignoredZeroDurationCount += 1
        ignoredZeroDurationValue += sample.value
        continue
      }
      intervalSamples += 1
      const open = uncoveredDuration(sample.startMs, sample.endMs, covered)
      claimInterval(covered, sample.startMs, sample.endMs)
      if (open <= 0) {
        continue
      }
      addedValue += open === duration ? sample.value : (sample.value * open) / duration
      usedSampleCount += 1
    }
    contributions.push({
      sourceName,
      priorityRank: sourcePriorityRank(metric, sourceName),
      rawSampleCount: list.length,
      usedSampleCount,
      addedValue,
      ignoredZeroDurationCount,
      ignoredZeroDurationValue,
    })
  }
  const selectedSources = contributions
    .filter((contribution) => contribution.usedSampleCount > 0)
    .map((contribution) => contribution.sourceName)
  if (intervalSamples === 0) {
    return {
      ...emptyInterval(calculationVersion),
      sourcesEncountered: sourceNames,
      rawSampleCount: valid.length,
      contributions,
    }
  }
  return {
    value: contributions.reduce((sum, contribution) => sum + contribution.addedValue, 0),
    basis: 'health_reconciled_source_priority',
    calculationVersion,
    sourcesEncountered: sourceNames,
    rawSampleCount: valid.length,
    selectedSources,
    contributions,
  }
}

function validHeartRate(sample: RestingObservation): boolean {
  return Number.isFinite(sample.value) && sample.value > 0 && sample.value < 250
}

export function reconcileRestingHeartRate(
  samples: readonly RestingObservation[],
  calculationVersion = ACTIVITY_CALCULATION_VERSION,
): ReconciledRestingHeartRate {
  const invalidCount = samples.filter((sample) => !validHeartRate(sample)).length
  const valid = samples.filter(validHeartRate)
  const sourcesEncountered = [...new Set(valid.map((sample) => sample.sourceName))].sort((left, right) => {
    const rank =
      sourcePriorityRank('resting_heart_rate', left) - sourcePriorityRank('resting_heart_rate', right)
    if (rank !== 0) {
      return rank
    }
    return left < right ? -1 : left > right ? 1 : 0
  })
  if (valid.length === 0) {
    return {
      value: null,
      basis: 'unavailable',
      calculationVersion,
      sourcesEncountered: [],
      rawSampleCount: samples.length,
      selectedSource: null,
      observationCount: 0,
      invalidCount,
    }
  }
  const selectedSource = sourcesEncountered[0] ?? null
  const owned = valid
    .filter((sample) => sample.sourceName === selectedSource)
    .sort((left, right) => {
      if (left.endMs !== right.endMs) {
        return right.endMs - left.endMs
      }
      if (left.startMs !== right.startMs) {
        return right.startMs - left.startMs
      }
      return left.value - right.value
    })
  const chosen = owned[0]
  return {
    value: chosen ? chosen.value : null,
    basis: owned.length === 1 ? 'single_resting_observation' : 'latest_resting_observation',
    calculationVersion,
    sourcesEncountered,
    rawSampleCount: samples.length,
    selectedSource,
    observationCount: owned.length,
    invalidCount,
  }
}

export function configuredSourcePriority(): typeof SOURCE_PRIORITY {
  return SOURCE_PRIORITY
}
