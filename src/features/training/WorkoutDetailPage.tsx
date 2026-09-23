import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { WorkoutSession, WorkoutTemplate } from '@/domain/training'
import type { ReviewFieldError } from '@/domain/paper-load'
import {
  dangerButtonClass,
  primaryButtonClass,
  quietButtonClass,
  secondaryButtonClass,
} from '@/lib'
import { deleteSession, fetchSession, fetchTemplates, updateSession } from './api'
import {
  DraftValidationError,
  buildManualWorkoutPayload,
  draftFromSession,
  validateWorkoutDraft,
  type WorkoutDraft,
} from './draft'
import { formatLoad, formatPounds, formatSetPerformance, formatWorkoutDate } from './format'
import { WorkoutEditor } from './WorkoutEditor'

export function WorkoutDetailPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<WorkoutSession | null>(null)
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

  useEffect(() => {
    if (!sessionId) {
      setError('Workout was not found')
      setLoading(false)
      return
    }
    let cancelled = false
    const sameWorkout = loadedId.current === sessionId
    if (!sameWorkout) {
      setSession(null)
      setLoading(true)
      setEditing(false)
      setDraft(null)
    }
    setError(null)
    Promise.all([fetchSession(sessionId), fetchTemplates().catch(() => [] as WorkoutTemplate[])])
      .then(([next, templates]) => {
        if (cancelled) {
          return
        }
        loadedId.current = sessionId
        setSession(next)
        setTemplate(templates.find((item) => item.id === next.workoutTemplateId) ?? null)
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load workout')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, reloadToken])

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
    setFieldErrors([])
    setError(null)
    setSaving(true)
    try {
      const next = await updateSession(sessionId, buildManualWorkoutPayload(draft))
      setSession(next)
      setEditing(false)
      setDraft(null)
    } catch (caught) {
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
        <WorkoutEditor
          title={session?.templateName ?? 'Edit workout'}
          subtitle="Changes update this workout. They are not saved until you tap Save workout."
          draft={draft}
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
            setConfirmDelete(false)
          }}
          cancelLabel="Cancel"
          commitLabel="Save workout"
          onDelete={() => setConfirmDelete(true)}
          saving={saving}
          error={null}
          fieldErrors={fieldErrors}
          errorFocusKey={errorFocusKey}
        />
      ) : session ? (
        <SessionDetail
          session={session}
          onEdit={() => {
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
            {session.templateName ?? 'Workout'}
          </h1>
          {session.routineCode ? (
            <p className="mt-1 text-sm text-zinc-500">
              Routine {session.routineCode}
              {session.templateVersion ? ` · v${session.templateVersion}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryButtonClass} onClick={onEdit}>
            Edit workout
          </button>
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
                    {formatLoad(set.loadState, set.weightKg)}
                    {' · '}
                    {formatSetPerformance(set)}
                  </span>
                </li>
              ))}
            </ul>
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
