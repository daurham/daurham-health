import { addCalendarDays } from './training-plan.js'
import type { TrainingProgressionState } from './training-progression.js'

export type MaintenancePerformanceGoal = {
  label: string
  kind: string
  lifecycle: string
  targetState: string
  deadlineState: string
}

export type MaintenancePerformanceSafety = {
  status: 'available' | 'unavailable'
  asOf: string
  /** Recent, comparable exact-exercise strength trends; never a diagnosis. */
  decliningExercises: string[]
  /** Active time-sensitive performance goals whose target is not yet met. */
  competingGoals: string[]
}

/** Reuses canonical training progression; never guesses from skipped workouts. */
export function assessMaintenancePerformanceSafety(input: {
  asOf: string
  training: TrainingProgressionState | null
  goals: readonly MaintenancePerformanceGoal[] | null
}): MaintenancePerformanceSafety {
  const { asOf, training, goals } = input
  if (!training || !goals || training.asOf !== asOf || training.window.end !== asOf) {
    return { status: 'unavailable', asOf, decliningExercises: [], competingGoals: [] }
  }
  const freshSince = addCalendarDays(asOf, -14)
  const latestCompleted = addCalendarDays(asOf, -1)
  const decliningExercises = [...new Set(training.series.filter((item) =>
    (item.metric === 'e1rm_kg' || item.metric === 'reps') &&
    (item.state === 'declining' || (item.state === 'confounded' && (item.changePct ?? 0) <= -2.5)) &&
    (item.confidence === 'moderate' || item.confidence === 'high') &&
    item.exposureCount >= 4 &&
    item.latestDate != null && item.latestDate >= freshSince && item.latestDate <= asOf
  ).map((item) => item.exerciseName))]
  const performanceKinds = new Set([
    'strength_e1rm', 'training_reps', 'training_duration',
    'training_distance', 'training_pace', 'training_skill',
  ])
  const concerningDeadlines = new Set([
    'due_today', 'passed_unmet', 'projected_after_deadline', 'projected_overlaps_deadline',
  ])
  const competingGoals = [...new Set(goals.filter((goal) =>
    goal.lifecycle === 'active' && performanceKinds.has(goal.kind) &&
    goal.targetState !== 'satisfied' && concerningDeadlines.has(goal.deadlineState)
  ).map((goal) => goal.label))]
  return { status: 'available', asOf, decliningExercises, competingGoals }
}
