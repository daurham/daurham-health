import { useEffect } from 'react'
import { formatPrescription } from '@/domain/training'
import type { LoadState, MeasurementKind } from '@/domain/training'
import type { TranscriptionGuidance } from '@/domain/training-transcription'
import {
  interpretPaperSets,
  resolvedLoadState,
  resolvedWeightLb,
  type InterpretedPaperSet,
  type ReviewFieldError,
} from '@/domain/paper-load'
import { cn, SHELL_MAX_WIDTH_CLASS } from '@/lib'
import { addDraftSet, type DraftExercise, type DraftSet, type WorkoutDraft } from './draft'

const inputClass =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-base text-zinc-900 disabled:bg-zinc-100'

const errorInputClass = 'border-red-500 bg-red-50'

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
  fieldErrors = [],
  errorFocusKey = 0,
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
  fieldErrors?: ReviewFieldError[]
  errorFocusKey?: number
  guidance?: TranscriptionGuidance[]
  disclaimer?: string
}) {
  const highlightDate = guidance.some((item) => item.path === 'workoutDate')
  const dateError = fieldError(fieldErrors, 'workoutDate')
  const firstErrorPath = fieldErrors[0]?.path

  useEffect(() => {
    if (!firstErrorPath || errorFocusKey === 0) {
      return
    }
    const root = document.querySelector(`[data-field-path="${CSS.escape(firstErrorPath)}"]`)
    if (!(root instanceof HTMLElement)) {
      return
    }
    root.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const focusable = root.matches('input,select,textarea,button')
      ? root
      : root.querySelector('input:not([disabled]),select:not([disabled]),textarea,button')
    if (focusable instanceof HTMLElement) {
      focusable.focus()
      return
    }
    root.focus()
  }, [errorFocusKey, firstErrorPath])

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

      {fieldErrors.length > 0 ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {fieldErrors.length === 1 ? '1 field needs attention' : `${fieldErrors.length} fields need attention`}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <SessionMeta
        draft={draft}
        highlightDate={highlightDate}
        dateError={dateError}
        onChange={onChange}
      />

      {fieldError(fieldErrors, 'exercises') ? (
        <p data-field-path="exercises" tabIndex={-1} className="text-sm text-red-700 outline-none">
          {fieldError(fieldErrors, 'exercises')}
        </p>
      ) : null}

      <div className="space-y-4">
        {draft.exercises.map((exercise, exerciseIndex) => (
          <ExerciseCard
            key={exercise.slotId ?? exercise.exerciseDefinitionId}
            exercise={exercise}
            exerciseIndex={exerciseIndex}
            highlighted={guidance.some((item) => item.path === `exercises.${exercise.slotId}`)}
            fieldErrors={fieldErrors}
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
        <div className={cn('mx-auto flex gap-3', SHELL_MAX_WIDTH_CLASS)}>
          <button
            type="button"
            className="min-h-11 flex-1 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
            disabled={saving}
            onClick={onCommit}
          >
            {saving ? 'Saving…' : commitLabel}
          </button>
        </div>
      </div>
    </section>
  )
}

function fieldError(errors: ReviewFieldError[], path: string): string | undefined {
  return errors.find((item) => item.path === path)?.message
}

function SessionMeta({
  draft,
  highlightDate,
  dateError,
  onChange,
}: {
  draft: WorkoutDraft
  highlightDate: boolean
  dateError?: string
  onChange: (draft: WorkoutDraft) => void
}) {
  const dateInvalid = Boolean(dateError)
  const dateNeedsConfirm = highlightDate || draft.workoutDate.trim() === ''
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <label className="block text-sm font-medium text-zinc-700">
        Date
        {dateNeedsConfirm && !dateInvalid ? (
          <span className="ml-2 text-xs font-normal text-amber-800">Needs a complete date</span>
        ) : null}
        <input
          type="date"
          required
          data-field-path="workoutDate"
          className={cn(
            inputClass,
            'mt-1',
            dateInvalid && errorInputClass,
            !dateInvalid && dateNeedsConfirm && 'border-amber-400 bg-amber-50',
          )}
          value={draft.workoutDate}
          onChange={(event) => onChange({ ...draft, workoutDate: event.target.value })}
        />
        {dateError ? <p className="mt-1 text-xs text-red-700">{dateError}</p> : null}
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
  exerciseIndex,
  highlighted,
  fieldErrors,
  onChange,
}: {
  exercise: DraftExercise
  exerciseIndex: number
  highlighted: boolean
  fieldErrors: ReviewFieldError[]
  onChange: (exercise: DraftExercise) => void
}) {
  const interpreted = interpretPaperSets(exercise.sets)
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
        {interpreted.map((item, setIndex) => (
          <SetRow
            key={item.set.setNumber}
            set={item.set}
            exerciseIndex={exerciseIndex}
            setIndex={setIndex}
            interpretation={item}
            measurementKind={exercise.measurementKind}
            fieldErrors={fieldErrors}
            onChange={(next) => {
              onChange({
                ...exercise,
                sets: exercise.sets.map((row, index) => (index === setIndex ? next : row)),
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
  exerciseIndex,
  setIndex,
  interpretation,
  measurementKind,
  fieldErrors,
  onChange,
}: {
  set: DraftSet
  exerciseIndex: number
  setIndex: number
  interpretation: InterpretedPaperSet<DraftSet>
  measurementKind: MeasurementKind
  fieldErrors: ReviewFieldError[]
  onChange: (set: DraftSet) => void
}) {
  const loadPath = `exercises.${exerciseIndex}.sets.${setIndex}.weightLb`
  const measurementPath =
    measurementKind === 'duration'
      ? `exercises.${exerciseIndex}.sets.${setIndex}.durationSec`
      : measurementKind === 'reps_per_side'
        ? `exercises.${exerciseIndex}.sets.${setIndex}.leftReps`
        : measurementKind === 'duration_per_side'
          ? `exercises.${exerciseIndex}.sets.${setIndex}.leftDurationSec`
          : `exercises.${exerciseIndex}.sets.${setIndex}.reps`
  const loadMessage = fieldError(fieldErrors, loadPath)
  const measurementMessage = fieldError(fieldErrors, measurementPath)
  const inherited = interpretation.source === 'inherited' && interpretation.resolvedLoad != null
  const displayLoadState = inherited ? resolvedLoadState(interpretation.resolvedLoad) : set.loadState
  const resolvedWeight = resolvedWeightLb(interpretation.resolvedLoad)
  const displayWeight =
    inherited && interpretation.resolvedLoad?.kind === 'external' && set.weightLb.trim() === ''
      ? String(resolvedWeight)
      : set.weightLb

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
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.2fr)] items-start gap-2">
      <span className="mt-3 text-sm font-medium text-zinc-700">{set.setNumber}</span>
      <div data-field-path={loadPath} tabIndex={-1} className="min-w-0 outline-none">
        <div className="flex gap-1">
          <select
            className={cn(
              'min-h-11 rounded-md border bg-white px-1 text-sm',
              loadMessage ? 'border-red-500 bg-red-50' : 'border-zinc-300',
              inherited && 'text-zinc-500',
            )}
            value={displayLoadState}
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
            disabled={displayLoadState !== 'external'}
            className={cn(inputClass, loadMessage && errorInputClass, inherited && 'text-zinc-500')}
            value={displayWeight}
            aria-label={`Set ${set.setNumber} weight`}
            onChange={(event) => patch({ loadState: 'external', weightLb: event.target.value })}
          />
        </div>
        {inherited ? <p className="mt-0.5 text-[11px] leading-tight text-zinc-500">inherited</p> : null}
        {loadMessage ? <p className="mt-0.5 text-xs text-red-700">{loadMessage}</p> : null}
      </div>
      <div data-field-path={measurementPath} tabIndex={-1} className="min-w-0 outline-none">
        <MeasurementInputs
          set={set}
          measurementKind={measurementKind}
          invalid={Boolean(measurementMessage)}
          onChange={onChange}
        />
        {measurementMessage ? <p className="mt-0.5 text-xs text-red-700">{measurementMessage}</p> : null}
      </div>
    </div>
  )
}

function MeasurementInputs({
  set,
  measurementKind,
  invalid,
  onChange,
}: {
  set: DraftSet
  measurementKind: MeasurementKind
  invalid: boolean
  onChange: (set: DraftSet) => void
}) {
  const fieldClass = cn(inputClass, invalid && errorInputClass)
  if (measurementKind === 'reps') {
    return (
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className={fieldClass}
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
        className={fieldClass}
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
          className={fieldClass}
          value={set.leftReps}
          aria-label={`Set ${set.setNumber} left reps`}
          onChange={(event) => onChange({ ...set, leftReps: event.target.value })}
        />
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className={fieldClass}
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
        className={fieldClass}
        value={set.leftDurationSec}
        aria-label={`Set ${set.setNumber} left seconds`}
        onChange={(event) => onChange({ ...set, leftDurationSec: event.target.value })}
      />
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className={fieldClass}
        value={set.rightDurationSec}
        aria-label={`Set ${set.setNumber} right seconds`}
        onChange={(event) => onChange({ ...set, rightDurationSec: event.target.value })}
      />
    </div>
  )
}
