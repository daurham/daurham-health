import type { HealthIntelligenceSnapshot, IntelligenceObservation } from '../intelligence/shared.js'
import { digestDateSelection } from './focused-digestive.js'

/**
 * PIQ-4.2: a user-requested inclusive historical calendar window, not an
 * inferred deficit or trailing maintenance estimate.
 * The returned figures come only from the existing as-of, revision-gated
 * intelligence frame. No SQL, AI invocation, or source-ID exposure.
 */
export type HistoricalWeightEnergyWindow = {
  scope: 'in_range' | 'out_of_range' | 'invalid_or_ambiguous' | 'unsupported_period'
  start: string
  end: string
  label: string
  calendarDays: number
  completedDays: number
  provisionalTodayExcluded: boolean
  verifiedCalorieDays: number
  verifiedCalorieMeanKcal: number | null
  /** Counts in fixed halves of completed selected dates, not clinical diet coverage. */
  verifiedEarlyHalfDays: number
  verifiedLateHalfDays: number
  intakeCoverage: 'no_verified_days' | 'single_verified_day' | 'sparse_or_clustered' | 'distributed_observations'
  recordedWeightDays: number
  comparableWeightDays: number
  /** Endpoints of 3+ usual-condition measurements spanning >=6d and
   * sampled within 2d of BOTH boundaries. It is NOT a fat-mass change.
   */
  observedWeightChangeKg: number | null
  observedWeightSpanDays: number
  boundaryCoverage: 'both_endpoints_covered' | 'incomplete_or_incomparable'
}

const SUBJECT = /\b(?:weight|weigh\w*|scale|calor\w*|deficit|maintenance|metaboli\w*|plateau\w*|fat[ -]?loss|losing fat|intake|eat|eaten|consum\w*)\b/i

function dateDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)
}
function uniqueSourceIds(row: IntelligenceObservation): boolean {
  return row.sourceIds.length > 0 &&
    row.sourceIds.every(id => typeof id === 'string' && id.length > 0) &&
    new Set(row.sourceIds).size === row.sourceIds.length
}
function present(row: IntelligenceObservation | undefined): row is IntelligenceObservation {
  return row != null && Number.isFinite(row.value) &&
    row.value > 0 && uniqueSourceIds(row)
}

export function focusHistoricalWeightEnergyWindow(input: {
  question: string
  snapshot: HealthIntelligenceSnapshot
  today: string
}): HistoricalWeightEnergyWindow | null {
  if (!SUBJECT.test(input.question)) return null
  const { snapshot, today } = input
  const selection = digestDateSelection(input.question, today, snapshot.asOf)
  if (!selection.window && !selection.issue) return null
  const scope: HistoricalWeightEnergyWindow['scope'] = selection.issue
    ? selection.issue
    : selection.window!.start < snapshot.period.start ||
      selection.window!.end > snapshot.period.end ||
      selection.window!.end > snapshot.asOf ||
      selection.window!.end > today
      ? 'out_of_range' : 'in_range'
  const start = selection.window?.start ?? snapshot.period.start
  const end = selection.window?.end ?? snapshot.period.end
  const days = selection.window?.calendarDays ?? 0
  const label = selection.window?.label ?? 'Unresolved historical interval'
  const empty = {
    scope,start,end,label,calendarDays:days,completedDays:0,
    provisionalTodayExcluded:false,
    verifiedCalorieDays:0,verifiedCalorieMeanKcal:null,
    verifiedEarlyHalfDays:0,verifiedLateHalfDays:0,
    intakeCoverage:'no_verified_days' as const,
    recordedWeightDays:0,comparableWeightDays:0,
    observedWeightChangeKg:null,observedWeightSpanDays:0,
    boundaryCoverage:'incomplete_or_incomparable' as const,
  }
  if (scope !== 'in_range') return empty
  // Exclude today even if an imported event is marked "complete".
  const completed = snapshot.frame.filter(d => d.date >= start &&
    d.date <= end && d.date < today)
  const calorieVerification = snapshot.coverage.some(item =>
    item.key === 'nutrition.calories' && item.completenessCheck === 'available')
  const calories = calorieVerification ? completed.flatMap(d => {
    const row = d.signals['nutrition.calories']
    return present(row) && row.dayCompleteness === 'verified_complete' &&
      row.quality === 'high_confidence' ? [{date:d.date,value:row.value}] : []
  }) : []
  const completedDays = days - (start <= today && today <= end ? 1 : 0)
  // Calendar halves, not observation-density halves; today never counts.
  const earlyHalfDays = Math.ceil(completedDays / 2)
  const verifiedEarlyHalfDays = calories.filter(row =>
    dateDiff(start,row.date) < earlyHalfDays).length
  const verifiedLateHalfDays = calories.length - verifiedEarlyHalfDays
  const distributed = calories.length >= 4 &&
    calories.length * 2 >= completedDays &&
    verifiedEarlyHalfDays >= 2 && verifiedLateHalfDays >= 2
  const intakeCoverage: HistoricalWeightEnergyWindow['intakeCoverage'] =
    calories.length === 0 ? 'no_verified_days' :
    calories.length === 1 ? 'single_verified_day' :
    distributed ? 'distributed_observations' : 'sparse_or_clustered'
  const weights = completed.flatMap(d => {
    const row = d.signals['body.weight_kg']
    return present(row) ? [row] : []
  }).sort((a,b)=>a.date.localeCompare(b.date))
  const usual = weights.filter(row => row.quality === 'usual')
  const first = usual[0], last = usual[usual.length - 1]
  const span = first && last ? dateDiff(first.date,last.date) : 0
  const covered = first != null && last != null && usual.length >= 3 &&
    span >= 6 && dateDiff(start,first.date) <= 2 &&
    dateDiff(last.date,end) <= 2 &&
    first.date !== last.date
  return {
    scope,start,end,label,calendarDays:days,
    completedDays,
    provisionalTodayExcluded:start <= today && today <= end,
    verifiedCalorieDays:calories.length,
    verifiedCalorieMeanKcal:calories.length > 0
      ? calories.reduce((total,row)=>total+row.value,0)/calories.length : null,
    verifiedEarlyHalfDays,verifiedLateHalfDays,intakeCoverage,
    recordedWeightDays:weights.length,comparableWeightDays:usual.length,
    observedWeightChangeKg:covered ? last!.value-first!.value : null,
    observedWeightSpanDays:covered?span:0,
    boundaryCoverage:covered?'both_endpoints_covered':'incomplete_or_incomparable',
  }
}
