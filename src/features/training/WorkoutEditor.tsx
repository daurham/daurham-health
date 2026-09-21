import { formatPrescription } from '@/domain/training'
import type { LoadState, MeasurementKind } from '@/domain/training'
import type { TranscriptionGuidance } from '@/domain/training-transcription'
import { cn } from '@/lib'
import { addDraftSet, draftHasLoggedSets, type DraftExercise, type DraftSet, type WorkoutDraft } from './draft'

const inputClass =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-base text-zinc-900 disabled:bg-zinc-100'

export function WorkoutEditor({
  title,
  subtitle,
  draft,
  onChange,
  onCommit,
  onCancel,
  cancelLabel,
  commitLabel,
  saving,
  error,
  guidance = [],
  disclaimer,
}: {
  title: string
  subtitle?: string
  draft: WorkoutDraft
  onChange: (draft: WorkoutDraft) => void
  onCommit: () => void
  onCancel?: () => void
  cancelLabel?: string
  commitLabel: string
  saving: boolean
  error: string | null
  guidance?: TranscriptionGuidance[]
  disclaimer?: string
}) {
  const highlightDate = guidance.some((item) => item.path === 'workoutDate')
  const dateMissing = draft.workoutDate.trim() === ''
  return (
    <section className="space-y-6 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
        {onCancel ? (
          <button
            type="button"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
            onClick={onCancel}
          >
            {cancelLabel ?? 'Cancel'}
          </button>
        ) : null}
      </div>

      {disclaimer ? <p className="text-sm text-zinc-600">{disclaimer}</p> : null}

      {guidance.length > 0 ? (
        <ul className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          {guidance.map((item) => (
            <li key={`${item.code}:${item.path ?? ''}:${item.message}`}>{item.message}</li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <SessionMeta draft={draft} highlightDate={highlightDate} onChange={onChange} />

      <div className="space-y-4">
        {draft.exercises.map((exercise, exerciseIndex) => (
          <ExerciseCard
            key={exercise.slotId ?? exercise.exerciseDefinitionId}
            exercise={exercise}
            highlighted={guidance.some((item) => item.path === `exercises.${exercise.slotId}`)}
            onChange={(next) => {
              onChange({
                ...draft,
                exercises: draft.exercises.map((item, index) => (index === exerciseIndex ? next : item)),
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
            disabled={saving || !draftHasLoggedSets(draft) || dateMissing}
            onClick={onCommit}
          >
            {saving ? 'Saving…' : commitLabel}
          </button>
        </div>
      </div>
    </section>
  )
}

function SessionMeta({
  draft,
  highlightDate,
  onChange,
}: {
  draft: WorkoutDraft
  highlightDate: boolean
  onChange: (draft: WorkoutDraft) => void
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <label className="block text-sm font-medium text-zinc-700">
        Date
        {highlightDate || draft.workoutDate.trim() === '' ? (
          <span className="ml-2 text-xs font-normal text-amber-800">Needs a complete date</span>
        ) : null}
        <input
          type="date"
          required
          className={cn(inputClass, 'mt-1', (highlightDate || draft.workoutDate.trim() === '') && 'border-amber-400 bg-amber-50')}
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
  highlighted,
  onChange,
}: {
  exercise: DraftExercise
  highlighted: boolean
  onChange: (exercise: DraftExercise) => void
}) {
  return (
    <article
      className={cn(
        'rounded-lg border bg-white p-4',
        highlighted ? 'border-amber-300 bg-amber-50/40' : 'border-zinc-200',
      )}
    >
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
