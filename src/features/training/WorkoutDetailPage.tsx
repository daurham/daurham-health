import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  sessionIntentLabel,
  trainingSessionDisplayName,
  type ExerciseDefinition,
  type WorkoutSession,
  type WorkoutTemplate,
} from '@/domain/training'
import type { ReviewFieldError } from '@/domain/paper-load'
import {
  dangerButtonClass,
  primaryButtonClass,
  quietButtonClass,
  secondaryButtonClass,
} from '@/lib'
import { createOwnerExercise, deleteSession, fetchExerciseLibrary, fetchSession, fetchTemplates, updateSession, WorkoutEditConflictError } from './api'
import { subscribeHealthDataChanges } from '@/lib/health-changes'
import {
  DraftValidationError,
  buildManualWorkoutPayload,
  draftFromSession,
  validateWorkoutDraft,
  type WorkoutDraft,
} from './draft'
import { formatLoad, formatPounds, formatSetPerformance, formatTrainingPerformanceBest, formatWorkoutDate } from './format'
import { WorkoutEditor } from './WorkoutEditor'
import { workoutDraftIsStale, workoutEditRevision } from './workout-draft-freshness'

export function WorkoutDetailPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [catalog, setCatalog] = useState<ExerciseDefinition[]>([])
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<WorkoutDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<ReviewFieldError[]>([])
  const [errorFocusKey, setErrorFocusKey] = useState(0)
  const loadedId = useRef<string | null>(null)
  const refreshGeneration = useRef(0)
  const draftOrigin = useRef<{ id: string; revision: string; editRevision: string | null } | null>(null)
  const [staleDraft, setStaleDraft] = useState(false)

  // Refresh a saved workout after another tab edits it, or when returning
  // from a different device. Keep the unsaved edit draft untouched.
  useEffect(() => subscribeHealthDataChanges(
    () => setReloadToken((current) => current + 1),
    { revalidateOnFocus: true },
  ), [])

  useEffect(() => {
    if (!sessionId) {
      setError('Workout was not found')
      setLoading(false)
      return
    }
    let cancelled = false
    const request = ++refreshGeneration.current
    const sameWorkout = loadedId.current === sessionId
    if (!sameWorkout) {
      setSession(null)
      setLoading(true)
      setEditing(false)
      setDraft(null)
      draftOrigin.current = null
      setStaleDraft(false)
    }
    setError(null)
    Promise.all([fetchSession(sessionId), fetchTemplates().catch(() => [] as WorkoutTemplate[])])
      .then(([next, templates]) => {
        if (cancelled || request !== refreshGeneration.current) {
          return
        }
        loadedId.current = sessionId
        if (draftOrigin.current?.id === sessionId &&
            workoutDraftIsStale(draftOrigin.current.revision, next)) {
          setStaleDraft(true)
        }
        setSession(next)
        setTemplate(templates.find((item) => item.id === next.workoutTemplateId) ?? null)
      })
      .catch((caught: unknown) => {
        if (!cancelled && request === refreshGeneration.current) {
          setError(caught instanceof Error ? caught.message : 'Could not load workout')
        }
      })
      .finally(() => {
        if (!cancelled && request === refreshGeneration.current) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
      refreshGeneration.current += 1
    }
  }, [sessionId, reloadToken])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    fetchExerciseLibrary()
      .then((items) => {
        if (cancelled) return
        setCatalog(items.filter((item) => item.exercise.isActive).map((item) => item.exercise))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [session?.id])

  async function onSave() {
    if (!sessionId || !draft) {
      return
    }
    const nextErrors = validateWorkoutDraft(draft)
    if (nextErrors.length > 0) {
      setFieldErrors(nextErrors)
      setErrorFocusKey((current) => current + 1)
      setError(null)
      return
    }
    if (staleDraft || !draftOrigin.current || draftOrigin.current.id !== sessionId) {
      setStaleDraft(true)
      return
    }
    setFieldErrors([])
    setError(null)
    setSaving(true)
    try {
      // Recheck at the point of action. This is optimistic client protection,
      // not an atomic database compare-and-swap with the PATCH below.
      const fresh = await fetchSession(sessionId)
      if (workoutDraftIsStale(draftOrigin.current?.revision, fresh)) {
        refreshGeneration.current += 1
        setSession(fresh)
        setStaleDraft(true)
        return
      }
      const version = draftOrigin.current?.editRevision
      if (!version) {
        setStaleDraft(true)
        return
      }
      const next = await updateSession(sessionId, buildManualWorkoutPayload(draft), version)
      refreshGeneration.current += 1
      setSession(next)
      setEditing(false)
      setDraft(null)
      draftOrigin.current = null
      setStaleDraft(false)
    } catch (caught) {
      if (caught instanceof WorkoutEditConflictError) {
        // A committed conflict is a server-owned, authoritative veto. Keep
        // the entire in-progress draft until the owner explicitly reloads it.
        setStaleDraft(true)
        setError(null)
        return
      }
      if (caught instanceof DraftValidationError) {
        setFieldErrors(caught.fields)
        setErrorFocusKey((current) => current + 1)
        setError(null)
        return
      }
      setError(caught instanceof Error ? caught.message : 'Could not save workout')
    } finally {
      setSaving(false)
    }
  }

  async function reloadSavedVersion() {
    if (!sessionId || saving) return
    setSaving(true)
    setError(null)
    const request = ++refreshGeneration.current
    try {
      const [fresh, templates] = await Promise.all([
        fetchSession(sessionId), fetchTemplates().catch(() => [] as WorkoutTemplate[]),
      ])
      if (request !== refreshGeneration.current) return
      const currentTemplate = templates.find((item) => item.id === fresh.workoutTemplateId) ?? null
      setSession(fresh)
      setTemplate(currentTemplate)
      setDraft(draftFromSession(fresh, currentTemplate))
      draftOrigin.current = { id: sessionId, revision: workoutEditRevision(fresh), editRevision: fresh.editRevision ?? null }
      setStaleDraft(false)
      setFieldErrors([])
    } catch (caught) {
      if (request === refreshGeneration.current) setError(caught instanceof Error ? caught.message : 'Could not reload the saved workout')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!sessionId || deleting) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      await deleteSession(sessionId)
      navigate('/training', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete workout')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <section className="space-y-6">
      <p className="text-sm text-zinc-500">
        <Link to="/training" className={quietButtonClass}>
          Training
        </Link>
        {' / '}
        Workout
      </p>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {session ? 'Could not refresh this workout. Showing the last loaded session.' : error}
          {sessionId ? (
            <button type="button" className="ml-3 font-medium underline" onClick={() => setReloadToken((value) => value + 1)}>
              Retry
            </button>
          ) : null}
        </p>
      ) : null}
      {loading && !session ? <p className="text-sm text-zinc-600">Loading workout…</p> : null}
      {editing && draft ? (
        <>
        {staleDraft ? (
          <WorkoutDraftConflictNotice onReload={() => void reloadSavedVersion()} busy={saving} />
        ) : null}
        <WorkoutEditor
          title={session ? trainingSessionDisplayName(session) : 'Edit workout'}
          subtitle="Changes update this workout. They are not saved until you tap Save workout."
          draft={draft}
          allowExerciseManagement={session?.sessionType === 'ad_hoc' || session?.sessionType === 'experiment'}
          allowExerciseAddition={session?.sessionType === 'programmed'}
          allowSessionName={session?.sessionType === 'ad_hoc' || session?.sessionType === 'experiment'}
          exerciseCatalog={catalog}
          onCreateExercise={async (input) => {
            const created = await createOwnerExercise(input)
            setCatalog((current) => [...current.filter((exercise) => exercise.id !== created.id), created])
            return created
          }}
          onChange={(next) => {
            setDraft(next)
            setFieldErrors((current) => (current.length > 0 ? validateWorkoutDraft(next) : current))
          }}
          onCommit={() => {
            void onSave()
          }}
          onCancel={() => {
            setEditing(false)
            setDraft(null)
            draftOrigin.current = null
            setStaleDraft(false)
            setConfirmDelete(false)
          }}
          cancelLabel="Cancel"
          commitLabel={staleDraft ? 'Review saved changes first' : 'Save workout' }
          onDelete={() => setConfirmDelete(true)}
          saving={saving || staleDraft}
          error={null}
          fieldErrors={fieldErrors}
          errorFocusKey={errorFocusKey}
        />
        </>
      ) : session ? (
        <SessionDetail
          session={session}
          onEdit={() => {
            draftOrigin.current = { id: session.id, revision: workoutEditRevision(session), editRevision: session.editRevision ?? null }
            setStaleDraft(false)
            setDraft(draftFromSession(session, template))
            setEditing(true)
            setConfirmDelete(false)
          }}
          onDelete={() => setConfirmDelete(true)}
        />
      ) : null}
      {confirmDelete ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-zinc-950/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">
            <h2 className="text-lg font-semibold tracking-tight">Delete workout?</h2>
            <p className="mt-2 text-sm text-zinc-600">
              This permanently removes this workout and its recorded exercises and sets. This cannot be undone.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className={secondaryButtonClass} onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className={dangerButtonClass} onClick={() => void onDelete()} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete workout'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

/** Explicit owner choice only: this operation discards the unsaved draft. */
export function WorkoutDraftConflictNotice({
  onReload,
  busy,
}: {
  onReload: () => void
  busy: boolean
}) {
  return (
    <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">Saved workout changed while you were editing</p>
      <p className="mt-1">
        Your unsaved draft is still here. Saving it now could overwrite changes
        made in another tab or device, so saving is paused.
      </p>
      <button
        type="button"
        className={secondaryButtonClass + ' mt-3'}
        disabled={busy}
        onClick={onReload}
      >
        Discard my draft and load latest saved workout
      </button>
    </div>
  )
}

function SessionDetail({
  session,
  onEdit,
  onDelete,
}: {
  session: WorkoutSession
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {formatWorkoutDate(session.workoutDate)}
            {' · '}
            {trainingSessionDisplayName(session)}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {session.sessionType === 'programmed' && session.routineCode
              ? `Routine ${session.routineCode}${session.hasProgrammedExtras ? '+' : ''}${session.templateVersion ? ` · v${session.templateVersion}` : ''} · Programmed`
              : sessionIntentLabel(session.sessionType)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryButtonClass} onClick={onEdit}>
            Edit workout
          </button>
          {session.benchmarkProtocolVersionId ? (
            <Link to={`/lab/results/review?protocolVersionId=${session.benchmarkProtocolVersionId}&workoutSessionId=${session.id}`} className={secondaryButtonClass}>
              Review benchmark result
            </Link>
          ) : null}
          <button type="button" className={dangerButtonClass} onClick={onDelete}>
            Delete workout
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm sm:grid-cols-4">
        <Meta label="Duration" value={session.durationMin == null ? '—' : `${session.durationMin} min`} />
        <Meta label="Effort" value={session.effort == null ? '—' : String(session.effort)} />
        <Meta label="Pain" value={session.painLevel == null ? '—' : String(session.painLevel)} />
        <Meta
          label="Bodyweight"
          value={session.bodyweightKg == null ? '—' : `${formatPounds(session.bodyweightKg)} lb`}
        />
      </dl>
      {session.notes ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">{session.notes}</p>
      ) : null}
      <div className="space-y-4">
        {session.exercises.map((exercise) => (
          <article key={exercise.id} className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="font-semibold">{exercise.exerciseName}</h2>
            {exercise.notes ? <p className="mt-1 text-sm text-zinc-600">{exercise.notes}</p> : null}
            <ul className="mt-3 space-y-2">
              {exercise.sets.map((set) => (
                <li key={set.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-zinc-500">Set {set.setNumber}</span>
                  <span className="font-medium">
                    {exercise.measurementKind === 'distance' || exercise.measurementKind === 'distance_duration' || exercise.measurementKind === 'completion'
                      ? formatSetPerformance(set)
                      : `${formatLoad(set.loadState, set.weightKg)} · ${formatSetPerformance(set)}`}
                  </span>
                </li>
              ))}
            </ul>
            {exercise.performanceBests.length > 0 ? (
              <div className="mt-4 border-t border-zinc-100 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Training bests</p>
                <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                  {exercise.performanceBests.map((best) => (
                    <li key={best.kind} className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span>{formatTrainingPerformanceBest(best)}</span>
                      <Link to={`/training/${best.sessionId}`} className="min-h-11 inline-flex items-center text-xs text-zinc-500 hover:underline">
                        {best.date}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  )
}
