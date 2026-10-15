import type { WorkoutSession } from '@/domain/training'

/**
 * In-memory content revision for the owner's editable saved workout.
 *
 * Deliberately excludes derived performance bests and exercise library display
 * changes: neither changes the session the owner is trying to edit.
 *
 * This is NOT a server-side CAS revision. Saving must re-fetch current canonical
 * state and reject a detected conflict, and there remains a narrow read/write
 * race until an atomic server-side precondition is implemented.
 */
export function workoutEditRevision(session: WorkoutSession): string {
  return JSON.stringify({
    id: session.id,
    date: session.workoutDate,
    type: session.sessionType,
    name: session.sessionName,
    templateId: session.workoutTemplateId,
    routine: session.routineCode,
    templateVersion: session.templateVersion,
    duration: session.durationMin,
    effort: session.effort,
    pain: session.painLevel,
    limitation: session.limitationKind,
    limitationNote: session.limitationNote,
    bodyweight: session.bodyweightKg,
    notes: session.notes,
    experimentId: session.experimentId,
    benchmarkVersion: session.benchmarkProtocolVersionId,
    exercises: session.exercises.map((exercise) => ({
      id: exercise.id,
      definitionId: exercise.exerciseDefinitionId,
      position: exercise.position,
      slot: exercise.slotId,
      notes: exercise.notes,
      sets: exercise.sets.map((set) => ({
        id: set.id,
        number: set.setNumber,
        type: set.setType,
        load: set.loadState,
        kg: set.weightKg,
        reps: set.reps,
        seconds: set.durationSec,
        leftReps: set.leftReps,
        rightReps: set.rightReps,
        leftSeconds: set.leftDurationSec,
        rightSeconds: set.rightDurationSec,
        distance: set.distanceM,
        completed: set.completed,
        rir: set.rir,
        rpe: set.rpe,
        failure: set.failureKind,
        leftFailure: set.leftFailureKind,
        rightFailure: set.rightFailureKind,
        notes: set.notes,
      })),
    })),
  })
}

/** Unknown baseline must never authorize a blind overwrite. */
export function workoutDraftIsStale(
  originalRevision: string | null | undefined,
  current: WorkoutSession | null,
): boolean {
  return !originalRevision || !current || workoutEditRevision(current) !== originalRevision
}
