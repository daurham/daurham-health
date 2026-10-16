import { compareSetChronology, sessionStrengthPoint } from '../progress/exercise-performance.js'
import type { CanonicalSetRecord, ProgressExerciseDefinition } from '../progress/types.js'

/** The selected question calls for exercise-specific records, not every set
 * from every workout. Uses already-loaded canonical rows; never generic SQL.
 */
export type FocusedTrainingAppearance = {
  setId: string
  date: string
  weightKg: number
  reps: number
  estimated1RmKg: number
}

export type FocusedTrainingEvidence = {
  exerciseId: string
  exerciseName: string
  eligibleAppearances: number
  /** Most recent six eligible appearances, oldest first. */
  appearances: FocusedTrainingAppearance[]
}

const WORK_SET_QUESTION = /\b(?:bench|squat|deadlift|press|row|curl|pull.?up|lift|sets?|reps?|strength|stronger|progress|progression|performance|[0-9]+\s*(?:kg|lb))\b/i
const EQUIPMENT_PREFIX = /^(?:barbell|dumbbell|smith machine|machine|cable)\s+/
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const phraseIncluded = (question: string, phrase: string) =>
  Boolean(phrase) && (' ' + question + ' ').includes(' ' + phrase + ' ')

/** Multiple equally plausible saved exercises mean NO set-level selection.
 * In particular, "bench" must not arbitrarily mean barbell or dumbbell.
 */
export function matchFocusedExercise(
  question: string,
  exercises: readonly ProgressExerciseDefinition[],
): ProgressExerciseDefinition | null {
  if (!WORK_SET_QUESTION.test(question)) return null
  const words = normalize(question)
  if (!words) return null
  const candidates = exercises.flatMap((exercise) => {
    if (exercise.performanceType !== 'loaded_reps' || exercise.analyticsLoadType !== 'external') return []
    const full = normalize(exercise.name)
    const concise = full.replace(EQUIPMENT_PREFIX, '')
    const score = phraseIncluded(words, full) ? 100 + full.split(' ').length
      : phraseIncluded(words, concise) ? 50 + concise.split(' ').length
        : concise.split(' ').some((word) => word.length >= 5 && phraseIncluded(words, word)) ? 1
          : 0
    return score ? [{ exercise, score }] : []
  }).sort((a, b) => b.score - a.score)
  if (candidates.length === 0) return null
  if (candidates[1]?.score === candidates[0]!.score) return null
  return candidates[0]!.exercise
}

/** Reuse the canonical progress analytics estimator and its confidence
 * eligibility. Warmups, mismatched equipment families, incomplete bilateral
 * side-rep sets and >high-confidence-rep sets are not "comparable strength".
 * No backdated future sessions or records outside the chosen period.
 */
export function focusTrainingWorkingSets(input: {
  question: string
  exercises: readonly ProgressExerciseDefinition[]
  sets: readonly CanonicalSetRecord[]
  start: string
  end: string
}): FocusedTrainingEvidence | null {
  const exercise = matchFocusedExercise(input.question, input.exercises)
  if (!exercise) return null
  const selected = input.sets.filter((set) => (
    set.exerciseId === exercise.id && set.sessionDate >= input.start && set.sessionDate <= input.end
  ))
  const groups = new Map<string, CanonicalSetRecord[]>()
  for (const set of selected) {
    const group = groups.get(set.sessionId)
    if (group) group.push(set)
    else groups.set(set.sessionId, [set])
  }
  const appearances = [...groups.values()].flatMap((sets) => {
    const point = sessionStrengthPoint(sets, exercise)
    return point == null ? [] : [{
      setId: point.sourceSet.setId,
      date: point.date,
      weightKg: point.sourceSet.weightKg,
      reps: point.sourceSet.reps,
      estimated1RmKg: Math.round(point.estimated1RmKg * 10) / 10,
      chronology: point.sourceSet,
    }]
  }).sort((a, b) => compareSetChronology(a.chronology, b.chronology))
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    eligibleAppearances: appearances.length,
    appearances: appearances.slice(-6).map(({ setId, date, weightKg, reps, estimated1RmKg }) =>
      ({ setId, date, weightKg, reps, estimated1RmKg })),
  }
}
