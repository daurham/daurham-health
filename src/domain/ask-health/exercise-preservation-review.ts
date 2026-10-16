import { addCalendarDays } from '../training-plan.js'
import { assessMaintenancePerformanceSafety } from '../maintenance-performance.js'
import type { TrainingProgressionState } from '../training-progression.js'
import type { WeightEnergyCurrentSettings } from './weight-energy-current-settings.js'

/**
 * PIQ-4.2 — conservative read-only exercise PERFORMANCE risk screen.
 *
 * Uses the canonical matched-exercise progression and maintenance-safety
 * classifier, not unverified training-session counts. A single unversioned
 * live workout snapshot CANNOT establish muscle retention, protected strength,
 * safe calories, or the cause of a possible decline.
 */
export type ExercisePreservationReview = {
  state: 'not_checked' | 'unavailable' | 'limited_evidence' |
    'possible_decline_for_review' | 'no_qualified_decline_flag'
  qualifiedRecentSeries: number | null
  possibleDeclineExercises: number | null
}

export const UNCHECKED_EXERCISE_PRESERVATION: ExercisePreservationReview = {
  state: 'not_checked', qualifiedRecentSeries: null, possibleDeclineExercises: null,
}

export function screenExercisePreservationReview(input: {
  today: string
  asOf: string
  settings: WeightEnergyCurrentSettings
  training: TrainingProgressionState | null
}): ExercisePreservationReview {
  const unavailable: ExercisePreservationReview = {
    state:'unavailable', qualifiedRecentSeries:null, possibleDeclineExercises:null,
  }
  if (input.today !== input.asOf || input.settings.state !== 'consistent_read') return unavailable
  const training = input.training
  if (!training || training.asOf !== input.asOf || training.window.end !== input.asOf) return unavailable
  const assessment = assessMaintenancePerformanceSafety({
    asOf:input.asOf, training, goals:[],
  })
  if (assessment.status !== 'available') return unavailable

  const since = addCalendarDays(input.asOf,-14)
  const lastComplete = addCalendarDays(input.asOf,-1)
  const eligible = training.series.filter(item =>
    (item.metric === 'e1rm_kg' || item.metric === 'reps') &&
    (item.confidence === 'moderate' || item.confidence === 'high') &&
    item.exposureCount >= 4 &&
    item.exerciseId.length > 0 &&
    item.latestDate != null &&
    item.latestDate >= since && item.latestDate <= lastComplete,
  )
  // One exercise must not inflate coverage with duplicate metric rows.
  const qualified = new Set(eligible.map(item => item.exerciseId + ':' + item.metric)).size
  if (!qualified) return {
    state:'limited_evidence',qualifiedRecentSeries:0,possibleDeclineExercises:0,
  }
  // The existing assessor is authoritative for decline and effort-confounded
  // negative signals. The count is an attention flag, not a clinical outcome.
  const possibleDeclines = assessment.decliningExercises.length
  return {
    state:possibleDeclines > 0 ? 'possible_decline_for_review' : 'no_qualified_decline_flag',
    qualifiedRecentSeries:qualified,
    possibleDeclineExercises:possibleDeclines,
  }
}
