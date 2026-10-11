import { addCalendarDays, weekStartMonday } from './training-plan.js'

/**
 * One completed Health calendar day contributes at most one weekly credit.
 * The caller supplies only exercises that have actual performed-set evidence;
 * empty templates and warmup-only sets are not observations.
 */
export type PerformedExerciseEvidence = {
  date: string
  exerciseId: string
  routineCode: string | null
}

export type QualifiedTrainingDay = {
  date: string
  distinctExerciseCount: number
  qualifies: boolean
  routineExerciseCounts: Record<string, number>
}

export type TrainingWeekQualification = {
  completedDays: number
  days: QualifiedTrainingDay[]
}

export const MIN_EXERCISES_PER_TRAINING_DAY = 3

/**
 * Combines all saved Training sessions by local workout_date, rather than
 * counting session rows or limiting evidence to when a plan was created.
 * Routines are independently attributed, but the weekly count is per day.
 */
export function buildTrainingWeekQualification(
  evidence: readonly PerformedExerciseEvidence[],
  asOf: string,
): TrainingWeekQualification {
  const start = weekStartMonday(asOf)
  const end = addCalendarDays(start, 6)
  const perDay = new Map<string, { exercises: Set<string>; routines: Map<string, Set<string>> }>()

  for (const item of evidence) {
    if (item.date < start || item.date > end || item.date > asOf || !item.exerciseId) continue
    let state = perDay.get(item.date)
    if (!state) {
      state = { exercises: new Set(), routines: new Map() }
      perDay.set(item.date, state)
    }
    state.exercises.add(item.exerciseId)
    if (item.routineCode) {
      let exercises = state.routines.get(item.routineCode)
      if (!exercises) {
        exercises = new Set()
        state.routines.set(item.routineCode, exercises)
      }
      exercises.add(item.exerciseId)
    }
  }

  const days = Array.from({ length: 7 }, (_, index): QualifiedTrainingDay => {
    const date = addCalendarDays(start, index)
    const state = perDay.get(date)
    const distinctExerciseCount = state?.exercises.size ?? 0
    return {
      date,
      distinctExerciseCount,
      qualifies: date <= asOf && distinctExerciseCount >= MIN_EXERCISES_PER_TRAINING_DAY,
      routineExerciseCounts: Object.fromEntries(
        [...(state?.routines ?? new Map<string, Set<string>>())].map(([routine, exercises]) => [
          routine,
          exercises.size,
        ]),
      ),
    }
  })
  return { completedDays: days.filter((day) => day.qualifies).length, days }
}
