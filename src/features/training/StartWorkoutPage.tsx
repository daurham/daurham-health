import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ReviewFieldError } from '@/domain/paper-load'
import type { WorkoutTemplate } from '@/domain/training'
import { createSession, fetchTemplates } from './api'
import { WorkoutEditor } from './WorkoutEditor'
import {
  DraftValidationError,
  buildManualWorkoutPayload,
  draftFromTemplate,
  validateWorkoutDraft,
  type WorkoutDraft,
} from './draft'

export function StartWorkoutPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<WorkoutDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<ReviewFieldError[]>([])
  const [errorFocusKey, setErrorFocusKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchTemplates()
      .then((next) => {
        if (!cancelled) {
          setTemplates(next)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load templates')
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
  }, [])

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
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Choose Template</h1>
        </div>
        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="text-sm text-zinc-600">Loading templates…</p>
        ) : (
          <ul className="space-y-3">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-4 text-left"
                  onClick={() => setDraft(draftFromTemplate(template))}
                >
                  <p className="font-semibold">{template.name}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Routine {template.routineCode} · v{template.version}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <>
      <p className="mb-4 text-sm text-zinc-500">
        <Link to="/training" className="hover:underline">
          Training
        </Link>
        {' / '}
        {draft.template?.name}
      </p>
      <WorkoutEditor
        title={draft.template?.name ?? 'Workout'}
        subtitle="Draft — not saved until you tap Save Workout."
        draft={draft}
        onChange={(next) => {
          setDraft(next)
          setFieldErrors((current) => (current.length > 0 ? validateWorkoutDraft(next) : current))
        }}
        onCommit={() => {
          void onSave()
        }}
        onCancel={() => setDraft(null)}
        cancelLabel="Change template"
        commitLabel="Save Workout"
        saving={saving}
        error={error}
        fieldErrors={fieldErrors}
        errorFocusKey={errorFocusKey}
      />
    </>
  )
}
