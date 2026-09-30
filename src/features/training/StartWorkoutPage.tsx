import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { ReviewFieldError } from '@/domain/paper-load'
import { trainingSessionDisplayName } from '@/domain/training'
import type { ExerciseDefinition, ExerciseLibraryItem, WorkoutTemplate } from '@/domain/training'
import { interactiveCardClass } from '@/lib'
import { createOwnerExercise, createSession, fetchExerciseLibrary, fetchTemplates } from './api'
import { WorkoutEditor } from './WorkoutEditor'
import {
  DraftValidationError,
  buildManualWorkoutPayload,
  draftForAdHocWorkout,
  draftForExperimentWorkout,
  draftFromTemplate,
  validateWorkoutDraft,
  type WorkoutDraft,
} from './draft'

export function StartWorkoutPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const adHoc = params.get('type') === 'ad_hoc'
  const experimentWorkout = params.get('type') === 'experiment'
  const experimentId = params.get('experimentId')
  const benchmarkProtocolVersionId = params.get('benchmarkProtocolVersionId')
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [catalog, setCatalog] = useState<ExerciseDefinition[]>([])
  const [lastPerformedDates, setLastPerformedDates] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(!adHoc && !experimentWorkout)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<WorkoutDraft | null>(() => {
    if (adHoc) {
      return draftForAdHocWorkout()
    }
    if (experimentWorkout && (experimentId || benchmarkProtocolVersionId)) {
      return draftForExperimentWorkout({ experimentId, benchmarkProtocolVersionId })
    }
    return null
  })
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<ReviewFieldError[]>([])
  const [errorFocusKey, setErrorFocusKey] = useState(0)

  useEffect(() => {
    function applyLibrary(items: ExerciseLibraryItem[]) {
      setCatalog(items.filter((item) => item.exercise.isActive).map((item) => item.exercise))
      setLastPerformedDates(
        Object.fromEntries(items.map((item) => [item.exercise.id, item.lastPerformedDate])),
      )
    }

    if (adHoc || experimentWorkout) {
      let cancelled = false
      fetchExerciseLibrary()
        .then((items) => {
          if (!cancelled) applyLibrary(items)
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            setError(caught instanceof Error ? caught.message : 'Could not load exercises')
          }
        })
      return () => {
        cancelled = true
      }
    }
    let cancelled = false
    Promise.all([fetchTemplates(), fetchExerciseLibrary()])
      .then(([nextTemplates, items]) => {
        if (!cancelled) {
          setTemplates(nextTemplates)
          applyLibrary(items)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load Training')
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
  }, [adHoc, experimentWorkout])

  async function onSave() {
    if (!draft) {
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
      const payload = buildManualWorkoutPayload(draft)
      const session = await createSession(payload)
      navigate(`/training/${session.id}`, { replace: true })
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

  if (!draft) {
    if (experimentWorkout) {
      return (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">Experiment workout</h1>
          <p className="text-sm text-zinc-700">Start this workout from Personal Lab so it keeps its experiment or benchmark.</p>
          <Link to="/lab" className="text-sm text-zinc-500 hover:text-zinc-900">
            Open Lab
          </Link>
        </section>
      )
    }
    return (
      <section className="space-y-6">
        <div>
          <p className="text-sm text-zinc-500">
            <Link to="/training" className="hover:underline">
              Training
            </Link>
            {' / '}
            Start Workout
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Start workout</h1>
        </div>
        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="text-sm text-zinc-600">Loading routines…</p>
        ) : (
          <div className="space-y-6">
            <section>
              <h2 className="text-sm font-semibold text-zinc-700">Built-in routines</h2>
              <ul className="mt-3 space-y-3">
                {templates.filter((template) => template.originKind === 'seeded').map((template) => (
                  <li key={template.id}>
                    <button
                      type="button"
                      className={`w-full px-4 py-4 text-left ${interactiveCardClass}`}
                      onClick={() => setDraft(draftFromTemplate(template))}
                    >
                      <p className="font-semibold">{template.name}</p>
                      <p className="mt-1 text-sm text-zinc-500">Routine {template.routineCode} · v{template.version}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-zinc-700">Saved routines</h2>
                <Link to="/training/routines" className="text-sm text-zinc-500 hover:underline">Manage</Link>
              </div>
              {templates.some((template) => template.originKind === 'owner') ? (
                <ul className="mt-3 space-y-3">
                  {templates.filter((template) => template.originKind === 'owner').map((template) => (
                    <li key={template.id}>
                      <button
                        type="button"
                        className={`w-full px-4 py-4 text-left ${interactiveCardClass}`}
                        onClick={() => setDraft(draftFromTemplate(template))}
                      >
                        <p className="font-semibold">{template.name}</p>
                        <p className="mt-1 text-sm text-zinc-500">Saved routine · v{template.version}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-zinc-500">No Saved Routines yet.</p>}
            </section>
            <section>
              <h2 className="text-sm font-semibold text-zinc-700">Empty workout</h2>
              <button
                type="button"
                className={`mt-3 w-full px-4 py-4 text-left ${interactiveCardClass}`}
                onClick={() => setDraft(draftForAdHocWorkout())}
              >
                <p className="font-semibold">Empty workout</p>
                <p className="mt-1 text-sm text-zinc-500">Add exercises as you go.</p>
              </button>
            </section>
          </div>
        )}
      </section>
    )
  }

  const draftIsAdHoc = draft.sessionType === 'ad_hoc'
  const hasProgrammedExtras =
    draft.sessionType === 'programmed' && draft.exercises.some((exercise) => exercise.slotId == null)

  return (
    <>
      <p className="mb-4 text-sm text-zinc-500">
        <Link to="/training" className="hover:underline">
          Training
        </Link>
        {' / '}
        {experimentWorkout ? 'Experiment workout' : draftIsAdHoc ? 'Ad-hoc workout' : draft.template?.name}
      </p>
      <WorkoutEditor
        title={
          experimentWorkout
            ? trainingSessionDisplayName({ sessionType: 'experiment', sessionName: draft.sessionName })
            : draftIsAdHoc
              ? trainingSessionDisplayName({ sessionType: 'ad_hoc', sessionName: draft.sessionName })
              : `${draft.template?.name ?? 'Workout'}${hasProgrammedExtras ? '+' : ''}`
        }
        subtitle="Draft — not saved until you tap Save Workout."
        draft={draft}
        onChange={(next) => {
          setDraft(next)
          setFieldErrors((current) => (current.length > 0 ? validateWorkoutDraft(next) : current))
        }}
        onCommit={() => {
          void onSave()
        }}
        onCancel={experimentWorkout ? () => navigate('/lab') : draftIsAdHoc ? () => navigate('/training') : () => setDraft(null)}
        cancelLabel={draftIsAdHoc || experimentWorkout ? 'Cancel' : 'Change template'}
        allowExerciseManagement={draftIsAdHoc || experimentWorkout}
        allowExerciseAddition={draft.sessionType === 'programmed'}
        allowSessionName={draftIsAdHoc || experimentWorkout}
        exerciseCatalog={catalog}
        lastPerformedDates={lastPerformedDates}
        onCreateExercise={async (input) => {
          const created = await createOwnerExercise(input)
          setCatalog((current) => [...current.filter((exercise) => exercise.id !== created.id), created])
          setLastPerformedDates((current) => ({ ...current, [created.id]: null }))
          return created
        }}
        commitLabel="Save Workout"
        saving={saving}
        error={error}
        fieldErrors={fieldErrors}
        errorFocusKey={errorFocusKey}
      />
    </>
  )
}
