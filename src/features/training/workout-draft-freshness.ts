import type { WorkoutSession } from '@/domain/training'

/**
 * In-memory content revision for the owner's editable saved workout.
 *
 * Deliberately excludes derived performance bests and exercise library display
 * changes: neither changes the session the owner is trying to edit.
 *
 * This is not a server-side revision. The separate opaque editRevision from
 * PostgreSQL guards PATCH and DELETE atomically; this content fingerprint only
 * informs the owner-facing draft and confirmation UX.
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

/** The exact saved workout the owner approved for deletion. Never refresh its
 * token silently while a confirmation dialog is open. */
export type WorkoutDeleteIntent = {
  sessionId: string
  editRevision: string
  contentRevision: string
}

type WorkoutDraftOrigin = {
  id: string
  revision: string
  editRevision: string | null
}

/** Unknown, stale, or mismatched saved versions cannot open a valid dialog. */
export function createWorkoutDeleteIntent(
  session: WorkoutSession | null,
  editing: boolean,
  draftOrigin: WorkoutDraftOrigin | null,
  staleDraft: boolean,
): WorkoutDeleteIntent | null {
  if (!session || staleDraft) return null
  const origin = editing ? draftOrigin : {
    id: session.id,
    revision: workoutEditRevision(session),
    editRevision: session.editRevision ?? null,
  }
  if (!origin?.editRevision || origin.id !== session.id ||
      origin.editRevision !== session.editRevision ||
      workoutDraftIsStale(origin.revision, session)) return null
  return {
    sessionId: origin.id,
    editRevision: origin.editRevision,
    contentRevision: origin.revision,
  }
}

/** A background refetch cannot silently change the deletion authorization. */
export function workoutDeleteIntentIsCurrent(
  intent: WorkoutDeleteIntent | null,
  session: WorkoutSession | null,
): boolean {
  return !!intent && !!session && intent.sessionId === session.id &&
    intent.editRevision === session.editRevision &&
    !workoutDraftIsStale(intent.contentRevision, session)
}
