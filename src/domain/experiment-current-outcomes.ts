import { addCalendarDays } from './progress/dates.js'
import type { DailyMetricPoint } from './experiment-results.js'
import type { ExperimentComparisonSnapshot } from './experiment-comparison-snapshot.js'
import type { OutcomeFeedbackReadiness } from './experiment-outcome-feedback.js'

/** Read-only, on-demand arithmetic over currently verified observations.
 * These values are NOT part of the immutable result, cannot be replayed
 * as-known-at-finalization, and must never serve as an efficacy or ranking fact.
 */
export type CurrentOutcomeComparison = {
  state: 'available' | 'unavailable'
  reason: 'current_records' | 'not_ready' | 'unsupported_outcome' |
    'changed_coverage' | 'ambiguous_recording' | 'inconsistent_sleep_source' |
    'source_unavailable' | 'source_values_changed' | 'source_values_unverified'
  asOf: string
  baselineWindow: {start:string;end:string} | null
  followUpWindow: {start:string;end:string} | null
  metrics: Array<{
    requirementId: string
    metricKey: string
    outcomeKind: 'nutrition_metric' | 'sleep_metric'
    unit: string
    beforeDays: number
    afterDays: number
    beforeMean: number
    afterMean: number
    change: number
  }>
}
type Reason = Exclude<CurrentOutcomeComparison['reason'], 'current_records'>
export function unavailableCurrentComparison(reason: Reason, asOf: string): CurrentOutcomeComparison {
  return {state:'unavailable',reason,asOf,baselineWindow:null,followUpWindow:null,metrics:[]}
}

const unitAndMax: Record<string,{unit:string;max:number}> = {
  'nutrition_metric:calories':{unit:'kcal/day',max:10000},
  'nutrition_metric:protein':{unit:'g/day',max:1000},
  'nutrition_metric:carbs':{unit:'g/day',max:1500},
  'nutrition_metric:fat':{unit:'g/day',max:500},
  'sleep_metric:total_sleep_minutes':{unit:'min/night',max:1440},
}
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length
const round = (value: number) => Math.round(value * 10) / 10

/** Re-use the *prespecified* primary requirements from a verified stored
 * coverage snapshot. No post-hoc selection of favorable metrics, no implicit
 * missing=0, no mixing a device's sleep with another source.
 */
export function describeCurrentOutcomeComparison(input: {
  snapshot: ExperimentComparisonSnapshot | null
  readiness: OutcomeFeedbackReadiness
  nutrition: readonly DailyMetricPoint[]
  sleep: readonly DailyMetricPoint[]
  asOf: string
}): CurrentOutcomeComparison {
  const reject = (reason: Reason) => unavailableCurrentComparison(reason,input.asOf)
  if (input.readiness.state !== 'ready' || !input.snapshot) return reject('not_ready')
  const {review} = input.snapshot
  const before = review.baselineWindow
  const after = review.followUpWindow
  if (review.state !== 'descriptive_coverage' || !before || !after ||
      review.metrics.length < 1 || review.metrics.length > 8 ||
      before.end !== addCalendarDays(before.start,6) ||
      after.start !== addCalendarDays(before.end,1) ||
      after.end !== addCalendarDays(after.start,6) ||
      input.asOf <= after.end) return reject('not_ready')
  const used = new Set<string>()
  const metrics: CurrentOutcomeComparison['metrics'] = []
  for (const metric of review.metrics) {
    const key = metric.outcomeKind+':'+metric.metricKey
    const spec = unitAndMax[key]
    if (!spec || used.has(metric.requirementId) ||
        metric.beforeExpected !== 7 || metric.afterExpected !== 7) return reject('unsupported_outcome')
    used.add(metric.requirementId)
    const points = metric.outcomeKind === 'sleep_metric' ? input.sleep : input.nutrition
    const relevant = points.filter((point) => point.metricKey === metric.metricKey &&
      point.date >= before.start && point.date <= after.end)
    // Repeated dates are ambiguous, even if the duplicate numeric values agree.
    const dates = new Set<string>()
    for (const item of relevant) {
      if (dates.has(item.date) || !Number.isFinite(item.value) ||
          item.value === null || item.value < 0 || item.value > spec.max ||
          item.eligible === false) return reject('ambiguous_recording')
      dates.add(item.date)
    }
    if (metric.outcomeKind === 'sleep_metric') {
      const sources = new Set(relevant.map((p) => p.sourceKey))
      if (sources.size !== 1 || sources.has(undefined) || sources.has('')) {
        return reject('inconsistent_sleep_source')
      }
    }
    const baseline = relevant.filter((p) => p.date <= before.end)
    const followUp = relevant.filter((p) => p.date >= after.start)
    if (baseline.length !== metric.beforeDays || followUp.length !== metric.afterDays ||
        baseline.length < 4 || followUp.length < 4) return reject('changed_coverage')
    const beforeMean = round(mean(baseline.map((p) => p.value as number)))
    const afterMean = round(mean(followUp.map((p) => p.value as number)))
    metrics.push({
      requirementId: metric.requirementId, metricKey: metric.metricKey,
      outcomeKind: metric.outcomeKind, unit: spec.unit,
      beforeDays: baseline.length,afterDays:followUp.length,
      beforeMean,afterMean,change:round(afterMean-beforeMean),
    })
  }
  return {state:'available',reason:'current_records',asOf:input.asOf,
    baselineWindow:before,followUpWindow:after,metrics}
}

export function currentOutcomeComparisonCopy(result: CurrentOutcomeComparison): string {
  switch (result.reason) {
    case 'current_records':
      return 'Recalculated from currently eligible records. These values were not frozen with the original result. A difference does not prove that the intervention caused it; concurrent changes and later edits may matter.'
    case 'not_ready':
      return 'No mature, verified comparison is available for this saved experiment.'
    case 'unsupported_outcome':
      return 'A descriptive comparison is not available for this outcome configuration.'
    case 'changed_coverage':
      return 'Current verified recording coverage differs from the original saved screen, so no before/after values are shown.'
    case 'ambiguous_recording':
      return 'Duplicate, incomplete or out-of-range observations prevent a reliable descriptive comparison.'
    case 'inconsistent_sleep_source':
      return 'Sleep measurements cannot be compared across missing or changed recording sources.'
    case 'source_unavailable':
      return 'The current source observations could not be loaded. The saved result is unchanged.'
    case 'source_values_changed':
      return 'The original recorded values no longer match the sealed values at finalization. Before/after numbers are withheld until reviewed.'
    case 'source_values_unverified':
      return 'The original result lacks a verified source-value seal, or current observations cannot be sealed. A historical before/after value comparison cannot be confirmed.'
  }
}

/** Keep legacy or drifted source values out of the historical comparison UI.
 * The immutable result still exists; this gate affects the current projection.
 */
export function verifyCurrentOutcomeSourceSeal(
  comparison: CurrentOutcomeComparison,
  originalSeal: string | null | undefined,
  currentSeal: string | null,
): CurrentOutcomeComparison {
  if (comparison.state !== 'available') return comparison
  const reason: CurrentOutcomeComparison['reason'] =
    !originalSeal || !currentSeal ? 'source_values_unverified'
      : originalSeal !== currentSeal ? 'source_values_changed' : 'current_records'
  return reason === 'current_records' ? comparison :
    unavailableCurrentComparison(reason,comparison.asOf)
}
