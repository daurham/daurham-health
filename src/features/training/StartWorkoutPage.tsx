import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatPrescription } from '@/domain/training'
import type { LoadState, MeasurementKind, WorkoutTemplate } from '@/domain/training'
import { cn } from '@/lib'
import { createSession, fetchTemplates } from './api'
import {
  addDraftSet,
  buildManualWorkoutPayload,
  draftFromTemplate,
  draftHasLoggedSets,
  type DraftExercise,
  type DraftSet,
  type WorkoutDraft,
} from './draft'

const inputClass =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-base text-zinc-900 disabled:bg-zinc-100'

export function StartWorkoutPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<WorkoutDraft | null>(null)
  const [saving, setSaving] = useState(false)

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
    setError(null)
    setSaving(true)
    try {
      const payload = buildManualWorkoutPayload(draft)
      const session = await createSession(payload)
      navigate(`/training/${session.id}`, { replace: true })
    } catch (caught) {
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
    <section className="space-y-6 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            <Link to="/training" className="hover:underline">
              Training
            </Link>
            {' / '}
            {draft.template?.name}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{draft.template?.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">Draft — not saved until you tap Save Workout.</p>
        </div>
        <button
          type="button"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
          onClick={() => setDraft(null)}
        >
          Change template
        </button>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <SessionMeta draft={draft} onChange={setDraft} />

      <div className="space-y-4">
        {draft.exercises.map((exercise, exerciseIndex) => (
          <ExerciseCard
            key={exercise.slotId ?? exercise.exerciseDefinitionId}
            exercise={exercise}
            onChange={(next) => {
              setDraft({
                ...draft,
                exercises: draft.exercises.map((item, index) =>
                  index === exerciseIndex ? next : item,
                ),
              })
            }}
          />
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl gap-3">
          <button
            type="button"
            className="min-h-11 flex-1 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
            disabled={saving || !draftHasLoggedSets(draft) || draft.workoutDate.trim() === ''}
            onClick={() => {
              void onSave()
            }}
          >
            {saving ? 'Saving…' : 'Save Workout'}
          </button>
        </div>
      </div>
    </section>
  )
}

function SessionMeta({
  draft,
  onChange,
}: {
  draft: WorkoutDraft
  onChange: (draft: WorkoutDraft) => void
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <label className="block text-sm font-medium text-zinc-700">
        Date
        <input
          type="date"
          required
          className={`${inputClass} mt-1`}
          value={draft.workoutDate}
          onChange={(event) => onChange({ ...draft, workoutDate: event.target.value })}
        />
      </label>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-zinc-700">
          Duration (min)
          <input
            type="number"
            min={1}
            inputMode="decimal"
            className={`${inputClass} mt-1`}
            value={draft.durationMin}
            onChange={(event) => onChange({ ...draft, durationMin: event.target.value })}
          />
        </label>
        <label className="block text-sm font-medium text-zinc-700">
          Bodyweight (lb)
          <input
            type="number"
            min={0}
            step="0.1"
            inputMode="decimal"
            className={`${inputClass} mt-1`}
            value={draft.bodyweightLb}
            onChange={(event) => onChange({ ...draft, bodyweightLb: event.target.value })}
          />
        </label>
      </div>
      <ScoreRow
        label="Effort"
        value={draft.effort}
        options={[1, 2, 3, 4, 5]}
        onChange={(effort) => onChange({ ...draft, effort })}
      />
      <ScoreRow
        label="Pain"
        value={draft.painLevel}
        options={[0, 1, 2, 3]}
        onChange={(painLevel) => onChange({ ...draft, painLevel })}
      />
      <label className="mt-4 block text-sm font-medium text-zinc-700">
        Notes
        <textarea
          rows={2}
          className={`${inputClass} mt-1 resize-y`}
          value={draft.notes}
          onChange={(event) => onChange({ ...draft, notes: event.target.value })}
        />
      </label>
    </div>
  )
}

function ScoreRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: number | null
  options: number[]
  onChange: (value: number | null) => void
}) {
  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-zinc-700">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={cn(
            'min-h-10 min-w-10 rounded-md border px-3 text-sm',
            value == null ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white',
          )}
          onClick={() => onChange(null)}
        >
          —
        </button>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={cn(
              'min-h-10 min-w-10 rounded-md border px-3 text-sm',
              value === option ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white',
            )}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function ExerciseCard({
  exercise,
  onChange,
}: {
  exercise: DraftExercise
  onChange: (exercise: DraftExercise) => void
}) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="font-semibold">{exercise.name}</h2>
      <p className="mt-1 text-sm text-zinc-500">
        {formatPrescription(exercise.plannedSets, exercise.prescription)}
      </p>
      <div className="mt-4 space-y-3">
        <SetHeader measurementKind={exercise.measurementKind} />
        {exercise.sets.map((set, setIndex) => (
          <SetRow
            key={set.setNumber}
            set={set}
            measurementKind={exercise.measurementKind}
            onChange={(next) => {
              onChange({
                ...exercise,
                sets: exercise.sets.map((item, index) => (index === setIndex ? next : item)),
              })
            }}
          />
        ))}
      </div>
      <button
        type="button"
        className="mt-4 text-sm font-medium text-zinc-700 hover:text-zinc-900"
        onClick={() => onChange(addDraftSet(exercise))}
      >
        Add set
      </button>
    </article>
  )
}

function SetHeader({ measurementKind }: { measurementKind: MeasurementKind }) {
  const measurement =
    measurementKind === 'reps'
      ? 'Reps'
      : measurementKind === 'duration'
        ? 'Seconds'
        : measurementKind === 'reps_per_side'
          ? 'Left / Right'
          : 'Left s / Right s'
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.2fr)] gap-2 text-xs uppercase tracking-wide text-zinc-500">
      <span>Set</span>
      <span>Weight</span>
      <span>{measurement}</span>
    </div>
  )
}

function SetRow({
  set,
  measurementKind,
  onChange,
}: {
  set: DraftSet
  measurementKind: MeasurementKind
  onChange: (set: DraftSet) => void
}) {
  function patch(partial: Partial<DraftSet>) {
    onChange({ ...set, ...partial })
  }

  function onLoadState(loadState: LoadState) {
    patch({
      loadState,
      weightLb: loadState === 'external' ? set.weightLb : '',
    })
  }

  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2">
      <span className="text-sm font-medium text-zinc-700">{set.setNumber}</span>
      <div className="flex gap-1">
        <select
          className="min-h-11 rounded-md border border-zinc-300 bg-white px-1 text-sm"
          value={set.loadState}
          onChange={(event) => onLoadState(event.target.value as LoadState)}
          aria-label={`Set ${set.setNumber} load`}
        >
          <option value="external">lb</option>
          <option value="bodyweight">BW</option>
          <option value="unknown">?</option>
        </select>
        <input
          type="number"
          min={0}
          step="0.5"
          inputMode="decimal"
          disabled={set.loadState !== 'external'}
          className={inputClass}
          value={set.weightLb}
          aria-label={`Set ${set.setNumber} weight`}
          onChange={(event) => patch({ weightLb: event.target.value })}
        />
      </div>
      <MeasurementInputs set={set} measurementKind={measurementKind} onChange={onChange} />
    </div>
  )
}

function MeasurementInputs({
  set,
  measurementKind,
  onChange,
}: {
  set: DraftSet
  measurementKind: MeasurementKind
  onChange: (set: DraftSet) => void
}) {
  if (measurementKind === 'reps') {
    return (
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className={inputClass}
        value={set.reps}
        aria-label={`Set ${set.setNumber} reps`}
        onChange={(event) => onChange({ ...set, reps: event.target.value })}
      />
    )
  }
  if (measurementKind === 'duration') {
    return (
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className={inputClass}
        value={set.durationSec}
        aria-label={`Set ${set.setNumber} seconds`}
        onChange={(event) => onChange({ ...set, durationSec: event.target.value })}
      />
    )
  }
  if (measurementKind === 'reps_per_side') {
    return (
      <div className="grid grid-cols-2 gap-1">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className={inputClass}
          value={set.leftReps}
          aria-label={`Set ${set.setNumber} left reps`}
          onChange={(event) => onChange({ ...set, leftReps: event.target.value })}
        />
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className={inputClass}
          value={set.rightReps}
          aria-label={`Set ${set.setNumber} right reps`}
          onChange={(event) => onChange({ ...set, rightReps: event.target.value })}
        />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-1">
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className={inputClass}
        value={set.leftDurationSec}
        aria-label={`Set ${set.setNumber} left seconds`}
        onChange={(event) => onChange({ ...set, leftDurationSec: event.target.value })}
      />
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className={inputClass}
        value={set.rightDurationSec}
        aria-label={`Set ${set.setNumber} right seconds`}
        onChange={(event) => onChange({ ...set, rightDurationSec: event.target.value })}
      />
    </div>
  )
}
