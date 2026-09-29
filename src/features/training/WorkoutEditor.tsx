import { useMemo, useState, useEffect } from 'react'
import { formatPrescription } from '@/domain/training'
import type { ExerciseDefinition, LoadState, MeasurementKind, OwnerExerciseRequest } from '@/domain/training'
import { OWNER_EXERCISE_LOAD_TYPES, MEASUREMENT_KINDS } from '@/domain/training'
import type { TranscriptionGuidance } from '@/domain/training-transcription'
import {
  interpretPaperSets,
  resolvedLoadState,
  resolvedWeightLb,
  type InterpretedPaperSet,
  type ReviewFieldError,
} from '@/domain/paper-load'
import { cn, dangerButtonClass, primaryButtonClass, quietButtonClass, SHELL_MAX_WIDTH_CLASS } from '@/lib'
import { addDraftSet, draftExerciseFromDefinition, type DraftExercise, type DraftSet, type WorkoutDraft } from './draft'
import { distanceToMeters, formatPaceSecondsPerMile, secondsPerMile } from '@/domain/units'

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
  onDelete,
  cancelLabel,
  commitLabel,
  saving,
  error,
  fieldErrors = [],
  errorFocusKey = 0,
  guidance = [],
  disclaimer,
  allowExerciseManagement = false,
  allowSessionName = false,
  exerciseCatalog = [],
  onCreateExercise,
}: {
  title: string
  subtitle?: string
  draft: WorkoutDraft
  onChange: (draft: WorkoutDraft) => void
  onCommit: () => void
  onCancel?: () => void
  onDelete?: () => void
  cancelLabel?: string
  commitLabel: string
  saving: boolean
  error: string | null
  fieldErrors?: ReviewFieldError[]
  errorFocusKey?: number
  guidance?: TranscriptionGuidance[]
  disclaimer?: string
  allowExerciseManagement?: boolean
  allowSessionName?: boolean
  exerciseCatalog?: ExerciseDefinition[]
  onCreateExercise?: (input: OwnerExerciseRequest) => Promise<ExerciseDefinition>
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
    <section className="shell-action-reserve space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
        {onCancel ? (
          <button
            type="button"
            className={quietButtonClass}
            disabled={saving}
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
        allowSessionName={allowSessionName}
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
            key={`${exercise.exerciseDefinitionId}-${exerciseIndex}`}
            exercise={exercise}
            exerciseIndex={exerciseIndex}
            highlighted={guidance.some((item) => item.path === `exercises.${exercise.slotId}`)}
            fieldErrors={fieldErrors}
            showPrescription={!allowExerciseManagement}
            allowSetRemoval={allowExerciseManagement}
            onMove={
              allowExerciseManagement
                ? (direction) => {
                    const target = exerciseIndex + direction
                    if (target < 0 || target >= draft.exercises.length) {
                      return
                    }
                    const next = [...draft.exercises]
                    const [item] = next.splice(exerciseIndex, 1)
                    if (!item) {
                      return
                    }
                    next.splice(target, 0, item)
                    onChange({ ...draft, exercises: next })
                  }
                : undefined
            }
            onRemove={
              allowExerciseManagement
                ? () => {
                    onChange({
                      ...draft,
                      exercises: draft.exercises.filter((_, index) => index !== exerciseIndex),
                    })
                  }
                : undefined
            }
            onChange={(next) => {
              onChange({
                ...draft,
                exercises: draft.exercises.map((item, index) => (index === exerciseIndex ? next : item)),
              })
            }}
          />
        ))}
      </div>
      {allowExerciseManagement ? (
        <ExercisePicker
          catalog={exerciseCatalog}
          disabled={saving}
          onSelect={(exercise) => {
            onChange({ ...draft, exercises: [...draft.exercises, draftExerciseFromDefinition(exercise)] })
          }}
          onCreateExercise={onCreateExercise}
        />
      ) : null}

      <div className="shell-action-bar border-t border-zinc-200 bg-white px-4 py-3">
        <div className={cn('mx-auto flex gap-3', SHELL_MAX_WIDTH_CLASS)}>
          {onDelete ? (
            <button type="button" className={dangerButtonClass} disabled={saving} onClick={onDelete}>
              Delete workout
            </button>
          ) : null}
          <button
            type="button"
            className={cn(primaryButtonClass, 'flex-1')}
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
  allowSessionName,
  onChange,
}: {
  draft: WorkoutDraft
  highlightDate: boolean
  dateError?: string
  allowSessionName: boolean
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
      {allowSessionName ? (
        <label className="mt-4 block text-sm font-medium text-zinc-700">
          Workout name
          <input
            type="text"
            className={cn(inputClass, 'mt-1')}
            value={draft.sessionName}
            placeholder="Push-up volume"
            onChange={(event) => onChange({ ...draft, sessionName: event.target.value })}
          />
        </label>
      ) : null}
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
  showPrescription,
  allowSetRemoval,
  onMove,
  onRemove,
  onChange,
}: {
  exercise: DraftExercise
  exerciseIndex: number
  highlighted: boolean
  fieldErrors: ReviewFieldError[]
  showPrescription: boolean
  allowSetRemoval: boolean
  onMove?: (direction: -1 | 1) => void
  onRemove?: () => void
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
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold">{exercise.name}</h2>
        {onRemove ? (
          <div className="flex shrink-0 gap-2">
            <button type="button" className="text-sm text-zinc-600" onClick={() => onMove?.(-1)}>
              Up
            </button>
            <button type="button" className="text-sm text-zinc-600" onClick={() => onMove?.(1)}>
              Down
            </button>
            <button type="button" className="text-sm text-red-700" onClick={onRemove}>
              Remove
            </button>
          </div>
        ) : null}
      </div>
      {showPrescription ? (
        <p className="mt-1 text-sm text-zinc-500">
          {formatPrescription(exercise.plannedSets, exercise.prescription)}
        </p>
      ) : null}
      <div className="mt-4 space-y-3">
        <SetHeader measurementKind={exercise.measurementKind} />
        {interpreted.map((item, setIndex) => (
          <div key={item.set.setNumber}>
            <SetRow
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
            {allowSetRemoval ? (
              <button
                type="button"
                className="mt-1 text-sm text-zinc-500"
                onClick={() => {
                  onChange({
                    ...exercise,
                    sets: exercise.sets.filter((_, index) => index !== setIndex),
                  })
                }}
              >
                Remove set
              </button>
            ) : null}
          </div>
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
  const noLoad = ['distance', 'distance_duration', 'completion'].includes(measurementKind)
  const measurement =
    measurementKind === 'reps' ? 'Reps'
      : measurementKind === 'duration' ? 'Seconds'
        : measurementKind === 'reps_per_side' ? 'Left / Right'
          : measurementKind === 'duration_per_side' ? 'Left s / Right s'
            : measurementKind === 'distance' ? 'Distance'
              : measurementKind === 'distance_duration' ? 'Distance + time'
                : 'Result'
  return (
    <div className={cn('grid gap-2 text-xs uppercase tracking-wide text-zinc-500', noLoad ? 'grid-cols-[2.5rem_minmax(0,1fr)]' : 'grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.2fr)]')}>
      <span>Set</span>
      {noLoad ? null : <span>Weight</span>}
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
    measurementKind === 'duration' || measurementKind === 'distance_duration'
      ? `exercises.${exerciseIndex}.sets.${setIndex}.durationSec`
      : measurementKind === 'distance'
        ? `exercises.${exerciseIndex}.sets.${setIndex}.distance`
        : measurementKind === 'completion'
          ? `exercises.${exerciseIndex}.sets.${setIndex}.completed`
          : measurementKind === 'reps_per_side'
            ? `exercises.${exerciseIndex}.sets.${setIndex}.leftReps`
            : measurementKind === 'duration_per_side'
              ? `exercises.${exerciseIndex}.sets.${setIndex}.leftDurationSec`
              : `exercises.${exerciseIndex}.sets.${setIndex}.reps`
  const noLoad = ['distance', 'distance_duration', 'completion'].includes(measurementKind)
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
    <div className={cn('grid items-start gap-2', noLoad ? 'grid-cols-[2.5rem_minmax(0,1fr)]' : 'grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.2fr)]')}>
      <span className="mt-3 text-sm font-medium text-zinc-700">{set.setNumber}</span>
      {noLoad ? null : <div data-field-path={loadPath} tabIndex={-1} className="min-w-0 outline-none">
        <div className="flex gap-1">
          <select
            className={cn(
              'min-h-11 rounded-md border bg-white px-1 text-base md:text-sm',
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
      </div>}
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
        <input type="number" min={0} inputMode="numeric" className={fieldClass} value={set.leftReps}
          aria-label={`Set ${set.setNumber} left reps`} onChange={(event) => onChange({ ...set, leftReps: event.target.value })} />
        <input type="number" min={0} inputMode="numeric" className={fieldClass} value={set.rightReps}
          aria-label={`Set ${set.setNumber} right reps`} onChange={(event) => onChange({ ...set, rightReps: event.target.value })} />
      </div>
    )
  }
  if (measurementKind === 'duration_per_side') {
    return (
      <div className="grid grid-cols-2 gap-1">
        <input type="number" min={0} inputMode="numeric" className={fieldClass} value={set.leftDurationSec}
          aria-label={`Set ${set.setNumber} left seconds`} onChange={(event) => onChange({ ...set, leftDurationSec: event.target.value })} />
        <input type="number" min={0} inputMode="numeric" className={fieldClass} value={set.rightDurationSec}
          aria-label={`Set ${set.setNumber} right seconds`} onChange={(event) => onChange({ ...set, rightDurationSec: event.target.value })} />
      </div>
    )
  }
  if (measurementKind === 'distance') {
    return (
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input type="number" min={0} step="0.01" inputMode="decimal" className={fieldClass} value={set.distance}
          aria-label={`Set ${set.setNumber} distance`} onChange={(event) => onChange({ ...set, distance: event.target.value })} />
        <select className={fieldClass} value={set.distanceUnit} aria-label={`Set ${set.setNumber} distance unit`}
          onChange={(event) => onChange({ ...set, distanceUnit: event.target.value as 'mi' | 'km' })}>
          <option value="mi">mi</option><option value="km">km</option>
        </select>
      </div>
    )
  }
  if (measurementKind === 'distance_duration') {
    const distance = Number(set.distance)
    const duration = Number(set.durationSec)
    const pace = set.distance.trim() && set.durationSec.trim() && distance > 0 && duration > 0
      ? secondsPerMile(distanceToMeters(distance, set.distanceUnit), duration)
      : null
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-zinc-500">Seconds
            <input type="number" min={0} inputMode="numeric" className={fieldClass} value={set.durationSec}
              aria-label={`Set ${set.setNumber} seconds`} onChange={(event) => onChange({ ...set, durationSec: event.target.value })} />
          </label>
          <label className="text-xs text-zinc-500">Distance (optional)
            <div className="grid grid-cols-[1fr_auto] gap-1">
              <input type="number" min={0} step="0.01" inputMode="decimal" className={fieldClass} value={set.distance}
                aria-label={`Set ${set.setNumber} distance`} onChange={(event) => onChange({ ...set, distance: event.target.value })} />
              <select className={fieldClass} value={set.distanceUnit} aria-label={`Set ${set.setNumber} distance unit`}
                onChange={(event) => onChange({ ...set, distanceUnit: event.target.value as 'mi' | 'km' })}>
                <option value="mi">mi</option><option value="km">km</option>
              </select>
            </div>
          </label>
        </div>
        {pace != null ? <p className="text-xs text-zinc-500">Pace {formatPaceSecondsPerMile(pace)}</p> : null}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className={cn('min-h-11 rounded-md border px-3 text-sm', set.completed === true ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300')} onClick={() => onChange({ ...set, completed: true })}>Achieved</button>
      <button type="button" className={cn('min-h-11 rounded-md border px-3 text-sm', set.completed === false ? 'border-zinc-900 bg-zinc-100' : 'border-zinc-300')} onClick={() => onChange({ ...set, completed: false })}>Not yet</button>
    </div>
  )
}

const MEASUREMENT_LABELS: Record<MeasurementKind, string> = {
  reps: 'Reps',
  duration: 'Duration',
  reps_per_side: 'Reps each side',
  duration_per_side: 'Duration each side',
  distance: 'Distance',
  distance_duration: 'Distance + duration',
  completion: 'Skill / milestone',
}

function ExercisePicker({
  catalog,
  disabled,
  onSelect,
  onCreateExercise,
}: {
  catalog: ExerciseDefinition[]
  disabled: boolean
  onSelect: (exercise: ExerciseDefinition) => void
  onCreateExercise?: (input: OwnerExerciseRequest) => Promise<ExerciseDefinition>
}) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [measurementKind, setMeasurementKind] = useState<MeasurementKind>('reps')
  const [loadType, setLoadType] = useState<(typeof OWNER_EXERCISE_LOAD_TYPES)[number]>('bodyweight')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const active = catalog.filter((exercise) => exercise.isActive)
    if (!needle) {
      return active.slice(0, 8)
    }
    return active.filter((exercise) => exercise.name.toLowerCase().includes(needle)).slice(0, 8)
  }, [catalog, query])
  const perSide = measurementKind === 'reps_per_side' || measurementKind === 'duration_per_side'

  async function createExercise() {
    if (!onCreateExercise || name.trim() === '') {
      setError('Exercise name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await onCreateExercise({
        name: name.trim(),
        measurementKind,
        loadType: ['distance', 'distance_duration', 'completion'].includes(measurementKind) ? 'none' : loadType,
        unilateral: perSide,
      })
      onSelect(created)
      setCreating(false)
      setName('')
      setQuery('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create exercise')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="font-semibold">Add exercise</h2>
      <label className="mt-3 block text-sm font-medium text-zinc-700">
        Search
        <input
          type="search"
          className={cn(inputClass, 'mt-1')}
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <ul className="mt-3 space-y-2">
        {matches.map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              className="min-h-11 w-full rounded-md border border-zinc-200 px-3 text-left"
              disabled={disabled}
              onClick={() => onSelect(exercise)}
            >
              {exercise.name}
            </button>
          </li>
        ))}
      </ul>
      {matches.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No matching exercises.</p> : null}
      {onCreateExercise ? (
        <div className="mt-4">
          <p className="text-sm text-zinc-600">Can&apos;t find it?</p>
          {creating ? (
            <div className="mt-3 space-y-3">
              <label className="block text-sm font-medium text-zinc-700">
                Name
                <input
                  type="text"
                  className={cn(inputClass, 'mt-1')}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-zinc-700">
                Measurement
                <select
                  className={cn(inputClass, 'mt-1')}
                  value={measurementKind}
                  onChange={(event) => setMeasurementKind(event.target.value as MeasurementKind)}
                >
                  {MEASUREMENT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {MEASUREMENT_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-zinc-700">
                Load
                <select
                  className={cn(inputClass, 'mt-1')}
                  value={loadType}
                  onChange={(event) => setLoadType(event.target.value as (typeof OWNER_EXERCISE_LOAD_TYPES)[number])}
                >
                  {OWNER_EXERCISE_LOAD_TYPES.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind.split('_').join(' ')}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm text-zinc-500">{perSide ? 'Each side is recorded separately.' : 'Both sides share one count.'}</p>
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
              <div className="flex gap-2">
                <button type="button" className={primaryButtonClass} disabled={saving} onClick={() => void createExercise()}>
                  {saving ? 'Saving…' : 'Create exercise'}
                </button>
                <button type="button" className={quietButtonClass} disabled={saving} onClick={() => setCreating(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={cn(quietButtonClass, 'mt-2')} disabled={disabled} onClick={() => setCreating(true)}>
              Create exercise
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
