import { useMemo, useState, useEffect } from 'react'
import { distanceToMeters, kilogramsToPounds, metersToMiles, secondsPerMile } from '@/domain/units'
import { formatPrescription } from '@/domain/training'
import type {
  ExerciseDefinition,
  ExerciseLibraryLastSession,
  ExerciseLibraryLastSet,
  LoadState,
  MeasurementKind,
  OwnerExerciseRequest,
  SetFailureKind,
  SideTrackingMode,
} from '@/domain/training'
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
import { ExerciseGuideButton, ExerciseGuideSheet } from './ExerciseGuideSheet'

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
  allowExerciseAddition = false,
  allowSessionName = false,
  exerciseCatalog = [],
  lastSessions = {},
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
  allowExerciseAddition?: boolean
  allowSessionName?: boolean
  exerciseCatalog?: ExerciseDefinition[]
  lastSessions?: Record<string, ExerciseLibraryLastSession | null>
  onCreateExercise?: (input: OwnerExerciseRequest) => Promise<ExerciseDefinition>
}) {
  const [guideExercise, setGuideExercise] = useState<ExerciseDefinition | null>(null)
  const catalogById = useMemo(
    () => new Map(exerciseCatalog.map((exercise) => [exercise.id, exercise] as const)),
    [exerciseCatalog],
  )
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
            definition={catalogById.get(exercise.exerciseDefinitionId) ?? null}
            sessionOnly={draft.sessionType === 'programmed' && exercise.slotId == null}
            lastSession={lastSessions[exercise.exerciseDefinitionId] ?? null}
            onOpenGuide={(definition) => setGuideExercise(definition)}
            showPrescription={!allowExerciseManagement && exercise.slotId != null}
            allowSetRemoval={allowExerciseManagement || (draft.sessionType === 'programmed' && exercise.slotId == null)}
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
              allowExerciseManagement || (draft.sessionType === 'programmed' && exercise.slotId == null)
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
      {allowExerciseManagement || allowExerciseAddition ? (
        <ExercisePicker
          catalog={exerciseCatalog.filter(
            (candidate) => !draft.exercises.some((exercise) => exercise.exerciseDefinitionId === candidate.id),
          )}
          disabled={saving}
          onSelect={(exercise) => {
            onChange({ ...draft, exercises: [...draft.exercises, draftExerciseFromDefinition(exercise)] })
          }}
          onCreateExercise={onCreateExercise}
        />
      ) : null}

      {guideExercise ? <ExerciseGuideSheet exercise={guideExercise} onClose={() => setGuideExercise(null)} /> : null}

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
      <details className="mt-4 rounded-md border border-zinc-200 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-zinc-700">
          Workout limitation <span className="font-normal text-zinc-500">(optional)</span>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <label className="block text-sm font-medium text-zinc-700">
            What affected it?
            <select
              className={`${inputClass} mt-1`}
              value={draft.limitationKind ?? ''}
              onChange={(event) => onChange({
                ...draft,
                limitationKind: event.target.value === '' ? null : event.target.value as WorkoutDraft['limitationKind'],
              })}
            >
              <option value="">No limitation recorded</option>
              <option value="pain">Pain</option>
              <option value="fatigue">Fatigue</option>
              <option value="illness">Illness</option>
              <option value="time">Time</option>
              <option value="equipment">Equipment</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            Context
            <input
              type="text"
              maxLength={500}
              className={`${inputClass} mt-1`}
              placeholder="Optional note about what changed the workout"
              value={draft.limitationNote}
              onChange={(event) => onChange({ ...draft, limitationNote: event.target.value })}
            />
          </label>
        </div>
        {draft.painLevel != null && draft.painLevel > 0 && draft.limitationKind == null ? (
          <p className="mt-2 text-xs text-zinc-500">Pain is recorded. Add a limitation only if it materially affected the workout.</p>
        ) : null}
      </details>
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

function compactPounds(valueKg: number): string {
  const pounds = kilogramsToPounds(valueKg)
  const rounded = Math.round(pounds * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function lastSetSummary(set: ExerciseLibraryLastSet): string {
  const load = set.loadState === 'external' && set.weightKg != null
    ? `${compactPounds(set.weightKg)} lb`
    : set.loadState === 'bodyweight'
      ? 'BW'
      : null
  if (set.reps != null) return load ? `${load} × ${set.reps}` : `${set.reps} reps`
  if (set.leftReps != null || set.rightReps != null) {
    const sides = `L ${set.leftReps ?? '—'} / R ${set.rightReps ?? '—'}`
    return load ? `${load} · ${sides}` : sides
  }
  if (set.durationSec != null && set.distanceM != null) {
    const miles = Math.round(metersToMiles(set.distanceM) * 100) / 100
    return `${miles} mi · ${set.durationSec}s`
  }
  if (set.distanceM != null) {
    const miles = Math.round(metersToMiles(set.distanceM) * 100) / 100
    return `${miles} mi`
  }
  if (set.durationSec != null) return load ? `${load} · ${set.durationSec}s` : `${set.durationSec}s`
  if (set.leftDurationSec != null || set.rightDurationSec != null) {
    return `L ${set.leftDurationSec ?? '—'}s / R ${set.rightDurationSec ?? '—'}s`
  }
  if (set.completed != null) return set.completed ? 'Achieved' : 'Not yet'
  return 'Recorded'
}

function lastSessionSummary(session: ExerciseLibraryLastSession): string {
  const sets = session.sets.slice(0, 3).map(lastSetSummary)
  return sets.length > 0 ? sets.join(' · ') : session.date
}

function ExerciseCard({
  exercise,
  exerciseIndex,
  highlighted,
  fieldErrors,
  definition,
  sessionOnly,
  lastSession,
  onOpenGuide,
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
  definition: ExerciseDefinition | null
  sessionOnly: boolean
  lastSession: ExerciseLibraryLastSession | null
  onOpenGuide: (exercise: ExerciseDefinition) => void
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
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{exercise.name}</h2>
            {sessionOnly ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                This workout only
              </span>
            ) : null}
            {definition ? <ExerciseGuideButton exercise={definition} onOpen={() => onOpenGuide(definition)} /> : null}
          </div>
          {lastSession ? (
            <p className="mt-1 text-xs text-zinc-500">Last time · {lastSessionSummary(lastSession)}</p>
          ) : null}
        </div>
        {onRemove ? (
          <div className="flex shrink-0 gap-2">
            {onMove ? (
              <>
                <button type="button" className="text-sm text-zinc-600" onClick={() => onMove(-1)}>Up</button>
                <button type="button" className="text-sm text-zinc-600" onClick={() => onMove(1)}>Down</button>
              </>
            ) : null}
            <button type="button" className="text-sm text-red-700" onClick={onRemove}>Remove</button>
          </div>
        ) : null}
      </div>
      {showPrescription ? (
        <p className="mt-1 text-sm text-zinc-500">
          {formatPrescription(exercise.plannedSets, exercise.prescription)}
        </p>
      ) : null}
      <div className="mt-4 space-y-3">
        <SetHeader measurementKind={exercise.measurementKind} sideTrackingMode={exercise.sideTrackingMode} />
        {interpreted.map((item, setIndex) => (
          <div key={item.set.setNumber}>
            <SetRow
              set={item.set}
              exerciseIndex={exerciseIndex}
              setIndex={setIndex}
              interpretation={item}
              measurementKind={exercise.measurementKind}
              sideTrackingMode={exercise.sideTrackingMode}
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

function isNoLoadMeasurement(kind: MeasurementKind): boolean {
  return kind === 'distance' || kind === 'distance_duration' || kind === 'completion'
}

function measurementLabel(kind: MeasurementKind, sideTrackingMode: SideTrackingMode = 'shared'): string {
  if (sideTrackingMode === 'independent' && kind === 'reps') return 'Left / Right reps'
  if (sideTrackingMode === 'independent' && kind === 'duration') return 'Left / Right seconds'
  if (kind === 'reps') return 'Reps'
  if (kind === 'duration') return 'Seconds'
  if (kind === 'reps_per_side') return 'Left / Right'
  if (kind === 'duration_per_side') return 'Left s / Right s'
  if (kind === 'distance') return 'Distance'
  if (kind === 'distance_duration') return 'Time + distance'
  return 'Skill'
}

function SetHeader({ measurementKind, sideTrackingMode }: { measurementKind: MeasurementKind; sideTrackingMode: SideTrackingMode }) {
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.4fr)] gap-2 text-xs uppercase tracking-wide text-zinc-500">
      <span>Set</span>
      <span>{isNoLoadMeasurement(measurementKind) ? '' : 'Weight'}</span>
      <span>{measurementLabel(measurementKind, sideTrackingMode)}</span>
    </div>
  )
}

function SetRow({
  set,
  exerciseIndex,
  setIndex,
  interpretation,
  measurementKind,
  sideTrackingMode,
  fieldErrors,
  onChange,
}: {
  set: DraftSet
  exerciseIndex: number
  setIndex: number
  interpretation: InterpretedPaperSet<DraftSet>
  measurementKind: MeasurementKind
  sideTrackingMode: SideTrackingMode
  fieldErrors: ReviewFieldError[]
  onChange: (set: DraftSet) => void
}) {
  const sharedHistorical =
    sideTrackingMode === 'independent' &&
    ((measurementKind === 'reps' && set.reps.trim() !== '') ||
      (measurementKind === 'duration' && set.durationSec.trim() !== ''))
  const displayMeasurementKind: MeasurementKind =
    !sharedHistorical && sideTrackingMode === 'independent' && measurementKind === 'reps'
      ? 'reps_per_side'
      : !sharedHistorical && sideTrackingMode === 'independent' && measurementKind === 'duration'
        ? 'duration_per_side'
        : measurementKind
  const noLoad = isNoLoadMeasurement(displayMeasurementKind)
  const loadPath = `exercises.${exerciseIndex}.sets.${setIndex}.weightLb`
  const measurementPath =
    displayMeasurementKind === 'duration' || displayMeasurementKind === 'distance_duration'
      ? `exercises.${exerciseIndex}.sets.${setIndex}.durationSec`
      : displayMeasurementKind === 'distance'
        ? `exercises.${exerciseIndex}.sets.${setIndex}.distance`
        : displayMeasurementKind === 'completion'
          ? `exercises.${exerciseIndex}.sets.${setIndex}.completed`
          : displayMeasurementKind === 'reps_per_side'
            ? `exercises.${exerciseIndex}.sets.${setIndex}.leftReps`
            : displayMeasurementKind === 'duration_per_side'
              ? `exercises.${exerciseIndex}.sets.${setIndex}.leftDurationSec`
              : `exercises.${exerciseIndex}.sets.${setIndex}.reps`
  const loadMessage = noLoad ? null : fieldError(fieldErrors, loadPath)
  const measurementMessage = fieldError(fieldErrors, measurementPath)
  const inherited = !noLoad && interpretation.source === 'inherited' && interpretation.resolvedLoad != null
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
    patch({ loadState, weightLb: loadState === 'external' ? set.weightLb : '' })
  }

  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.4fr)] items-start gap-2">
      <span className="mt-3 text-sm font-medium text-zinc-700">{set.setNumber}</span>
      {noLoad ? <div className="min-h-11" aria-hidden="true" /> : (
        <div data-field-path={loadPath} tabIndex={-1} className="min-w-0 outline-none">
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
        </div>
      )}
      <div data-field-path={measurementPath} tabIndex={-1} className="min-w-0 outline-none">
        <MeasurementInputs
          set={set}
          measurementKind={displayMeasurementKind}
          invalid={Boolean(measurementMessage)}
          onChange={onChange}
        />
        {measurementMessage ? <p className="mt-0.5 text-xs text-red-700">{measurementMessage}</p> : null}
      </div>
      <SetEffortDetails
        set={set}
        independent={sideTrackingMode === 'independent'}
        onChange={onChange}
      />
    </div>
  )
}


function SetEffortDetails({
  set,
  independent,
  onChange,
}: {
  set: DraftSet
  independent: boolean
  onChange: (set: DraftSet) => void
}) {
  const patch = (partial: Partial<DraftSet>) => onChange({ ...set, ...partial })
  const failureOptions: Array<{ value: SetFailureKind; label: string }> = [
    { value: 'reached_failure', label: 'Reached failure' },
    { value: 'failed_rep', label: 'Failed rep' },
  ]
  const selectFailure = (
    value: string,
    key: 'failureKind' | 'leftFailureKind' | 'rightFailureKind',
  ) => patch({ [key]: value === '' ? null : value as SetFailureKind })
  const hasEvidence =
    (set.rir?.trim() ?? '') !== '' ||
    (set.rpe?.trim() ?? '') !== '' ||
    set.failureKind != null ||
    set.leftFailureKind != null ||
    set.rightFailureKind != null

  return (
    <details className="col-start-2 col-span-2 rounded-md border border-zinc-100 px-2 py-1" open={hasEvidence || undefined}>
      <summary className="cursor-pointer text-xs font-medium text-zinc-500">Effort / failure</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium text-zinc-600">
          RIR
          <input
            type="number"
            min={0}
            max={10}
            inputMode="numeric"
            className={`${inputClass} mt-1`}
            value={set.rir ?? ''}
            disabled={(set.rpe?.trim() ?? '') !== ''}
            placeholder="0–10"
            onChange={(event) => patch({ rir: event.target.value })}
          />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          RPE
          <input
            type="number"
            min={1}
            max={10}
            step="0.5"
            inputMode="decimal"
            className={`${inputClass} mt-1`}
            value={set.rpe ?? ''}
            disabled={(set.rir?.trim() ?? '') !== ''}
            placeholder="1–10"
            onChange={(event) => patch({ rpe: event.target.value })}
          />
        </label>
      </div>
      {independent ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-zinc-600">
            Left failure
            <select className={`${inputClass} mt-1`} value={set.leftFailureKind ?? ''} onChange={(event) => selectFailure(event.target.value, 'leftFailureKind')}>
              <option value="">None</option>
              {failureOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Right failure
            <select className={`${inputClass} mt-1`} value={set.rightFailureKind ?? ''} onChange={(event) => selectFailure(event.target.value, 'rightFailureKind')}>
              <option value="">None</option>
              {failureOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <label className="mt-2 block text-xs font-medium text-zinc-600">
          Failure evidence
          <select className={`${inputClass} mt-1`} value={set.failureKind ?? ''} onChange={(event) => selectFailure(event.target.value, 'failureKind')}>
            <option value="">None</option>
            {failureOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      )}
      <p className="mt-2 text-[11px] text-zinc-500">Optional. “Hard” is not automatically failure.</p>
    </details>
  )
}

function pacePreview(set: DraftSet): string | null {
  const distance = Number(set.distance ?? '')
  const duration = Number(set.durationSec)
  if (!Number.isFinite(distance) || !Number.isFinite(duration) || distance <= 0 || duration <= 0) return null
  const pace = secondsPerMile(distanceToMeters(distance, set.distanceUnit ?? 'mi'), duration)
  if (pace == null) return null
  const rounded = Math.round(pace)
  const minutes = Math.floor(rounded / 60)
  const seconds = String(rounded % 60).padStart(2, '0')
  return `${minutes}:${seconds}/mi`
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
    return <input type="number" min={0} inputMode="numeric" className={fieldClass} value={set.reps} aria-label={`Set ${set.setNumber} reps`} onChange={(event) => onChange({ ...set, reps: event.target.value })} />
  }
  if (measurementKind === 'duration') {
    return <input type="number" min={0} inputMode="numeric" className={fieldClass} value={set.durationSec} aria-label={`Set ${set.setNumber} seconds`} onChange={(event) => onChange({ ...set, durationSec: event.target.value })} />
  }
  if (measurementKind === 'reps_per_side') {
    return <div className="grid grid-cols-2 gap-1">
      <input type="number" min={0} inputMode="numeric" className={fieldClass} value={set.leftReps} aria-label={`Set ${set.setNumber} left reps`} onChange={(event) => onChange({ ...set, leftReps: event.target.value })} />
      <input type="number" min={0} inputMode="numeric" className={fieldClass} value={set.rightReps} aria-label={`Set ${set.setNumber} right reps`} onChange={(event) => onChange({ ...set, rightReps: event.target.value })} />
    </div>
  }
  if (measurementKind === 'duration_per_side') {
    return <div className="grid grid-cols-2 gap-1">
      <input type="number" min={0} inputMode="numeric" className={fieldClass} value={set.leftDurationSec} aria-label={`Set ${set.setNumber} left seconds`} onChange={(event) => onChange({ ...set, leftDurationSec: event.target.value })} />
      <input type="number" min={0} inputMode="numeric" className={fieldClass} value={set.rightDurationSec} aria-label={`Set ${set.setNumber} right seconds`} onChange={(event) => onChange({ ...set, rightDurationSec: event.target.value })} />
    </div>
  }
  if (measurementKind === 'completion') {
    return <div className="grid grid-cols-2 gap-1">
      <button type="button" className={cn('min-h-11 rounded-md border px-2 text-sm', set.completed === true ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300')} onClick={() => onChange({ ...set, loadState: 'bodyweight', weightLb: '', completed: true })}>Achieved</button>
      <button type="button" className={cn('min-h-11 rounded-md border px-2 text-sm', set.completed === false ? 'border-zinc-900 bg-zinc-100' : 'border-zinc-300')} onClick={() => onChange({ ...set, loadState: 'bodyweight', weightLb: '', completed: false })}>Not yet</button>
    </div>
  }
  if (measurementKind === 'distance') {
    return <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
      <input type="number" min="0" step="0.01" inputMode="decimal" className={fieldClass} value={set.distance ?? ''} aria-label={`Set ${set.setNumber} distance`} onChange={(event) => onChange({ ...set, loadState: 'bodyweight', weightLb: '', distance: event.target.value })} />
      <select className="min-h-11 rounded-md border border-zinc-300 bg-white px-2 text-sm" value={set.distanceUnit ?? 'mi'} aria-label={`Set ${set.setNumber} distance unit`} onChange={(event) => onChange({ ...set, distanceUnit: event.target.value as 'mi' | 'km' })}><option value="mi">mi</option><option value="km">km</option></select>
    </div>
  }
  const preview = pacePreview(set)
  return <div className="space-y-1">
    <input type="number" min="0" inputMode="numeric" className={fieldClass} value={set.durationSec} aria-label={`Set ${set.setNumber} seconds`} placeholder="seconds" onChange={(event) => onChange({ ...set, loadState: 'bodyweight', weightLb: '', durationSec: event.target.value })} />
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
      <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={set.distance ?? ''} aria-label={`Set ${set.setNumber} optional distance`} placeholder="distance (optional)" onChange={(event) => onChange({ ...set, loadState: 'bodyweight', weightLb: '', distance: event.target.value })} />
      <select className="min-h-11 rounded-md border border-zinc-300 bg-white px-2 text-sm" value={set.distanceUnit ?? 'mi'} aria-label={`Set ${set.setNumber} distance unit`} onChange={(event) => onChange({ ...set, distanceUnit: event.target.value as 'mi' | 'km' })}><option value="mi">mi</option><option value="km">km</option></select>
    </div>
    {preview ? <p className="text-xs text-zinc-500">Pace {preview}</p> : null}
  </div>
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
  const noLoad = isNoLoadMeasurement(measurementKind)

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
        loadType: noLoad ? 'none' : loadType,
        unilateral: perSide,
        sideTrackingMode: perSide ? 'paired' : 'shared',
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
              {noLoad ? <p className="text-sm text-zinc-500">No external load is recorded for this measurement.</p> : (
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
              )}
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
