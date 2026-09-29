import { activityRangeSummary, type ActivityDailyRow } from './activity/analytics.js'
import { MANUAL_BODY_METRICS, metricDefinition } from './body-manual.js'
import { isResultCapable } from './lab-results.js'
import { LAB_NUTRITION_METRICS, LAB_SLEEP_METRICS, LAB_TRAINING_MEASURES } from './lab.js'
import { addCalendarDays } from './progress/dates.js'
import { sessionStrengthHistory } from './progress/exercise-trend.js'
import type { CanonicalSetRecord, ProgressExerciseDefinition } from './progress/types.js'
import { aggregateOccurrenceStates, resolveScheduleRange } from './supplements/resolve.js'
import type { AdherenceWindow, ScheduleWindow, StatusEventWindow } from './supplements/types.js'
import { isCalendarDate } from './training.js'
import { centimetersToInches, formatPaceSecondsPerMile, kilogramsToPounds, metersToMiles } from './units.js'

export const GOAL_KINDS = [
  'body_metric',
  'strength_e1rm',
  'benchmark_result',
  'training_frequency',
  'activity_steps',
  'nutrition_protein',
  'sleep_duration',
  'supplement_adherence',
  'training_reps',
  'training_duration',
  'training_distance',
  'training_pace',
  'training_skill',
] as const
export type GoalKind = (typeof GOAL_KINDS)[number]

export const GOAL_STATUSES = ['active', 'paused', 'completed'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const GOAL_TARGET_MODES = ['at_least', 'at_most', 'range'] as const
export type GoalTargetMode = (typeof GOAL_TARGET_MODES)[number]

export const GOAL_LIFECYCLE_ACTIONS = ['pause', 'resume', 'complete', 'reopen'] as const
export type GoalLifecycleAction = (typeof GOAL_LIFECYCLE_ACTIONS)[number]

export const GOAL_BODY_METRIC_KEYS = MANUAL_BODY_METRICS.map((item) => item.key)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NOTES_MAX = 2000

const ACTIVITY_RESULT_UNITS: Record<string, string> = {
  steps_count: 'count',
  active_energy_kcal: 'kcal',
  exercise_minutes: 'minutes',
  resting_heart_rate_bpm: 'bpm',
}

const NUTRITION_RESULT_UNITS: Record<string, string> = {
  calories: 'kcal',
  protein: 'g',
  carbs: 'g',
  fat: 'g',
}

export type GoalSelector = {
  goalKind: GoalKind
  bodyMetricKey: string | null
  exerciseDefinitionId: string | null
  benchmarkDefinitionId: string | null
  benchmarkProtocolVersionId: string | null
  benchmarkRequirementId: string | null
  supplementId: string | null
  trainingMinDistanceM?: number | null
}

export type GoalTarget = {
  targetMode: GoalTargetMode
  targetMin: number | null
  targetMax: number | null
  targetUnit: string
  targetDate: string | null
  evaluationWindowDays: number | null
  notes: string | null
}

export type GoalDraft = GoalSelector & GoalTarget & { startedOn: string }

export type GoalKindDefinition = {
  kind: GoalKind
  displayName: string
  modes: readonly GoalTargetMode[]
  windows: readonly number[] | null
  defaultWindow: number | null
  unit: string | null
  pointMetric: boolean
}

const KIND_DEFINITIONS: Record<GoalKind, GoalKindDefinition> = {
  body_metric: {
    kind: 'body_metric',
    displayName: 'Body metric',
    modes: ['at_least', 'at_most', 'range'],
    windows: null,
    defaultWindow: null,
    unit: null,
    pointMetric: true,
  },
  strength_e1rm: {
    kind: 'strength_e1rm',
    displayName: 'Strength e1RM',
    modes: ['at_least'],
    windows: null,
    defaultWindow: null,
    unit: 'lb',
    pointMetric: true,
  },
  benchmark_result: {
    kind: 'benchmark_result',
    displayName: 'Benchmark result',
    modes: ['at_least', 'at_most', 'range'],
    windows: null,
    defaultWindow: null,
    unit: null,
    pointMetric: true,
  },
  training_frequency: {
    kind: 'training_frequency',
    displayName: 'Training frequency',
    modes: ['at_least'],
    windows: [7],
    defaultWindow: 7,
    unit: 'sessions/week',
    pointMetric: false,
  },
  activity_steps: {
    kind: 'activity_steps',
    displayName: 'Daily steps',
    modes: ['at_least', 'range'],
    windows: [7, 14, 30],
    defaultWindow: 7,
    unit: 'steps/day',
    pointMetric: false,
  },
  nutrition_protein: {
    kind: 'nutrition_protein',
    displayName: 'Protein',
    modes: ['at_least', 'range'],
    windows: [7, 14, 30],
    defaultWindow: 7,
    unit: 'g/day',
    pointMetric: false,
  },
  sleep_duration: {
    kind: 'sleep_duration',
    displayName: 'Sleep duration',
    modes: ['at_least', 'range'],
    windows: [7, 14, 30],
    defaultWindow: 7,
    unit: 'min/night',
    pointMetric: false,
  },
  supplement_adherence: {
    kind: 'supplement_adherence',
    displayName: 'Supplement adherence',
    modes: ['at_least'],
    windows: [7, 30, 90],
    defaultWindow: 30,
    unit: '%',
    pointMetric: false,
  },
  training_reps: {
    kind: 'training_reps',
    displayName: 'Training reps',
    modes: ['at_least'],
    windows: null,
    defaultWindow: null,
    unit: 'reps',
    pointMetric: true,
  },
  training_duration: {
    kind: 'training_duration',
    displayName: 'Training duration',
    modes: ['at_least'],
    windows: null,
    defaultWindow: null,
    unit: 'sec',
    pointMetric: true,
  },
  training_distance: {
    kind: 'training_distance',
    displayName: 'Training distance',
    modes: ['at_least'],
    windows: null,
    defaultWindow: null,
    unit: 'mi',
    pointMetric: true,
  },
  training_pace: {
    kind: 'training_pace',
    displayName: 'Training pace',
    modes: ['at_most'],
    windows: null,
    defaultWindow: null,
    unit: 'sec/mi',
    pointMetric: true,
  },
  training_skill: {
    kind: 'training_skill',
    displayName: 'Training skill',
    modes: ['at_least'],
    windows: null,
    defaultWindow: null,
    unit: 'completion',
    pointMetric: true,
  },
}

export function goalKindDefinition(kind: string): GoalKindDefinition | null {
  if (!(GOAL_KINDS as readonly string[]).includes(kind)) {
    return null
  }
  return KIND_DEFINITIONS[kind as GoalKind]
}

export function bodyGoalUnit(metricKey: string): string | null {
  const definition = metricDefinition(metricKey)
  if (!definition) {
    return null
  }
  if (definition.family === 'mass') {
    return 'lb'
  }
  if (definition.family === 'circumference') {
    return 'in'
  }
  return '%'
}

export function bodyGoalDisplayName(metricKey: string): string {
  const definition = metricDefinition(metricKey)
  if (!definition) {
    return 'Body metric'
  }
  if (definition.key === 'weight') {
    return 'Bodyweight'
  }
  if (definition.family === 'circumference') {
    return `${definition.label} circumference`
  }
  return definition.label
}

/** Unit stored on a Benchmark Result for this outcome. Matches the existing evaluator. */
export function benchmarkOutcomeUnit(requirementKind: string, selector: Record<string, string>): string | null {
  if (!isResultCapable(requirementKind)) {
    return null
  }
  if (requirementKind === 'training_measure') {
    const measure = selector.measure
    if (!(LAB_TRAINING_MEASURES as readonly string[]).includes(measure ?? '')) {
      return null
    }
    if (measure === 'working_sets') {
      return 'sets'
    }
    if (measure === 'duration') {
      return 'seconds'
    }
    return 'reps'
  }
  if (requirementKind === 'body_metric') {
    return metricDefinition(selector.metricKey ?? '')?.canonicalUnit ?? null
  }
  if (requirementKind === 'nutrition_metric') {
    const key = selector.metricKey ?? ''
    if (!(LAB_NUTRITION_METRICS as readonly string[]).includes(key)) {
      return null
    }
    return NUTRITION_RESULT_UNITS[key] ?? null
  }
  if (requirementKind === 'activity_metric') {
    return ACTIVITY_RESULT_UNITS[selector.metricKey ?? ''] ?? null
  }
  if (requirementKind === 'sleep_metric') {
    const key = selector.metricKey ?? ''
    if (!(LAB_SLEEP_METRICS as readonly string[]).includes(key)) {
      return null
    }
    return 'minutes'
  }
  return null
}

export type BenchmarkPin = {
  definitionId: string
  protocolVersionId: string
  versionProtocolId: string
  requirementId: string
  protocolId: string
  requirementProtocolVersionId: string
  role: string
  requirementKind: string
  selector: Record<string, string>
  label: string
  title: string
  active: boolean
}

export type GoalValidationContext = {
  today: string
  exercise: {
    id: string
    name: string
    active: boolean
    measurementKind?: string
    performanceType?: string
    analyticsLoadType?: string
  } | null
  supplement: { id: string; name: string; active: boolean } | null
  benchmark: BenchmarkPin | null
}

type Fail = { error: string }

function fail(error: string): Fail {
  return { error }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function optionalUuid(value: unknown): string | null | Fail {
  if (value == null || value === '') {
    return null
  }
  if (typeof value !== 'string' || !UUID.test(value)) {
    return fail('A selector id is not valid.')
  }
  return value
}

function finiteNumber(value: unknown): number | null | Fail {
  if (value == null || value === '') {
    return null
  }
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  if (!Number.isFinite(number)) {
    return fail('Target values must be finite numbers.')
  }
  return number
}

function notesOf(value: unknown): string | null | Fail {
  if (value == null || value === '') {
    return null
  }
  if (typeof value !== 'string') {
    return fail('Notes must be text.')
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (trimmed.length > NOTES_MAX) {
    return fail('Notes are limited to 2000 characters.')
  }
  return trimmed
}

function dateOf(value: unknown, label: string): string | null | Fail {
  if (value == null || value === '') {
    return null
  }
  if (typeof value !== 'string' || !isCalendarDate(value)) {
    return fail(`${label} must be a calendar date.`)
  }
  return value
}

function selectorOf(record: Record<string, unknown>, kind: GoalKind): GoalSelector | Fail {
  const bodyMetricKey = record.bodyMetricKey == null || record.bodyMetricKey === '' ? null : record.bodyMetricKey
  if (bodyMetricKey != null && typeof bodyMetricKey !== 'string') {
    return fail('Choose a body metric.')
  }
  const exerciseDefinitionId = optionalUuid(record.exerciseDefinitionId)
  if (exerciseDefinitionId && typeof exerciseDefinitionId === 'object') {
    return exerciseDefinitionId
  }
  const benchmarkDefinitionId = optionalUuid(record.benchmarkDefinitionId)
  if (benchmarkDefinitionId && typeof benchmarkDefinitionId === 'object') {
    return benchmarkDefinitionId
  }
  const benchmarkProtocolVersionId = optionalUuid(record.benchmarkProtocolVersionId)
  if (benchmarkProtocolVersionId && typeof benchmarkProtocolVersionId === 'object') {
    return benchmarkProtocolVersionId
  }
  const benchmarkRequirementId = optionalUuid(record.benchmarkRequirementId)
  if (benchmarkRequirementId && typeof benchmarkRequirementId === 'object') {
    return benchmarkRequirementId
  }
  const rawMinDistance = finiteNumber(record.trainingMinDistanceM)
  if (rawMinDistance && typeof rawMinDistance === 'object') return rawMinDistance
  const trainingMinDistanceM = rawMinDistance == null ? null : rawMinDistance
  const supplementId = optionalUuid(record.supplementId)
  if (supplementId && typeof supplementId === 'object') {
    return supplementId
  }
  const selector: GoalSelector = {
    goalKind: kind,
    bodyMetricKey: typeof bodyMetricKey === 'string' ? bodyMetricKey : null,
    exerciseDefinitionId,
    benchmarkDefinitionId,
    benchmarkProtocolVersionId,
    benchmarkRequirementId,
    supplementId,
    trainingMinDistanceM,
  }
  if (kind === 'body_metric') {
    if (!selector.bodyMetricKey || !GOAL_BODY_METRIC_KEYS.includes(selector.bodyMetricKey)) {
      return fail('Choose a supported body metric.')
    }
    if (selector.exerciseDefinitionId || selector.benchmarkDefinitionId || selector.benchmarkProtocolVersionId || selector.benchmarkRequirementId || selector.supplementId) {
      return fail('A body goal uses only its body metric.')
    }
  } else if (kind === 'strength_e1rm') {
    if (!selector.exerciseDefinitionId) return fail('Choose an exercise.')
    if (selector.trainingMinDistanceM != null) return fail('A strength goal does not use a minimum distance.')
    if (selector.bodyMetricKey || selector.benchmarkDefinitionId || selector.benchmarkProtocolVersionId || selector.benchmarkRequirementId || selector.supplementId) {
      return fail('A strength goal uses only its exercise.')
    }
  } else if (kind === 'training_reps' || kind === 'training_duration' || kind === 'training_distance' || kind === 'training_pace' || kind === 'training_skill') {
    if (!selector.exerciseDefinitionId) return fail('Choose an exercise.')
    if (kind === 'training_pace') {
      if (selector.trainingMinDistanceM == null || selector.trainingMinDistanceM <= 0) return fail('A pace goal needs a positive minimum distance.')
    } else if (selector.trainingMinDistanceM != null) {
      return fail('Only a pace goal uses a minimum distance.')
    }
    if (selector.bodyMetricKey || selector.benchmarkDefinitionId || selector.benchmarkProtocolVersionId || selector.benchmarkRequirementId || selector.supplementId) {
      return fail('A Training performance goal uses only its exercise.')
    }
  } else if (kind === 'benchmark_result') {
    if (!selector.benchmarkDefinitionId || !selector.benchmarkProtocolVersionId || !selector.benchmarkRequirementId) {
      return fail('Choose a benchmark, protocol version, and outcome.')
    }
    if (selector.bodyMetricKey || selector.exerciseDefinitionId || selector.supplementId) {
      return fail('A benchmark goal uses only its pinned outcome.')
    }
  } else if (kind === 'supplement_adherence') {
    if (!selector.supplementId) {
      return fail('Choose a supplement.')
    }
    if (selector.bodyMetricKey || selector.exerciseDefinitionId || selector.benchmarkDefinitionId || selector.benchmarkProtocolVersionId || selector.benchmarkRequirementId) {
      return fail('An adherence goal uses only its supplement.')
    }
  } else if (selector.bodyMetricKey || selector.exerciseDefinitionId || selector.benchmarkDefinitionId || selector.benchmarkProtocolVersionId || selector.benchmarkRequirementId || selector.supplementId || selector.trainingMinDistanceM != null) {
    return fail('This goal kind does not take a selector.')
  }
  return selector
}

function targetOf(
  record: Record<string, unknown>,
  kind: GoalKind,
  unit: string,
  startedOn: string,
  today: string,
  revision: boolean,
): GoalTarget | Fail {
  const definition = KIND_DEFINITIONS[kind]
  const mode = record.targetMode
  if (typeof mode !== 'string' || !(definition.modes as readonly string[]).includes(mode)) {
    return fail('Choose a supported target mode for this goal.')
  }
  const targetMode = mode as GoalTargetMode
  const targetMin = finiteNumber(record.targetMin)
  if (targetMin && typeof targetMin === 'object') {
    return targetMin
  }
  const targetMax = finiteNumber(record.targetMax)
  if (targetMax && typeof targetMax === 'object') {
    return targetMax
  }
  if (targetMode === 'at_least' && (targetMin == null || targetMax != null)) {
    return fail('An at-least target needs one minimum and no maximum.')
  }
  if (targetMode === 'at_most' && (targetMax == null || targetMin != null)) {
    return fail('An at-most target needs one maximum and no minimum.')
  }
  if (targetMode === 'range' && (targetMin == null || targetMax == null || targetMin > targetMax)) {
    return fail('A range needs a minimum that is less than or equal to the maximum.')
  }
  const low = targetMin ?? targetMax ?? 0
  const high = targetMax ?? targetMin ?? 0
  if (low <= 0 || high <= 0) {
    return fail('Target values must be greater than zero.')
  }
  if (kind === 'training_skill' && (targetMode !== 'at_least' || targetMin !== 1 || targetMax != null)) {
    return fail('A skill goal target is one completed milestone.')
  }
  if (kind === 'training_reps' && targetMin != null && !Number.isInteger(targetMin)) {
    return fail('A reps target must be a whole number.')
  }
  if (unit === '%' && high > 100) {
    return fail('Adherence is a percent from above 0 through 100.')
  }
  if (kind !== 'benchmark_result' && record.targetUnit != null && record.targetUnit !== unit) {
    return fail('The target unit is fixed for this goal.')
  }
  const targetDate = dateOf(record.targetDate, 'Target date')
  if (targetDate && typeof targetDate === 'object') {
    return targetDate
  }
  if (targetDate && targetDate < startedOn) {
    return fail('The target date cannot be earlier than the start date.')
  }
  if (revision && targetDate && targetDate < today) {
    return fail('A revised target date is today or later.')
  }
  let window = record.evaluationWindowDays
  if (window == null || window === '') {
    window = definition.defaultWindow
  }
  if (definition.pointMetric) {
    if (record.evaluationWindowDays != null && record.evaluationWindowDays !== '') {
      return fail('This goal refers to an observation, not a rolling window.')
    }
    window = null
  } else {
    const days = typeof window === 'number' ? window : typeof window === 'string' ? Number(window) : Number.NaN
    if (!definition.windows?.includes(days)) {
      return fail('Choose a supported evaluation window.')
    }
    window = days
  }
  const notes = notesOf(record.notes)
  if (notes && typeof notes === 'object') {
    return notes
  }
  return {
    targetMode,
    targetMin: targetMode === 'at_most' ? null : targetMin,
    targetMax: targetMode === 'at_least' ? null : targetMax,
    targetUnit: unit,
    targetDate,
    evaluationWindowDays: typeof window === 'number' ? window : null,
    notes,
  }
}

function unitFor(kind: GoalKind, selector: GoalSelector, context: GoalValidationContext): string | Fail {
  if (kind === 'body_metric') {
    const unit = bodyGoalUnit(selector.bodyMetricKey ?? '')
    return unit ?? fail('Choose a supported body metric.')
  }
  if (kind === 'benchmark_result') {
    const pin = context.benchmark
    if (!pin || pin.definitionId !== selector.benchmarkDefinitionId) {
      return fail('Choose a benchmark.')
    }
    if (pin.protocolVersionId !== selector.benchmarkProtocolVersionId || pin.versionProtocolId !== pin.protocolId) {
      return fail('That protocol version does not belong to this benchmark.')
    }
    if (pin.requirementId !== selector.benchmarkRequirementId || pin.requirementProtocolVersionId !== selector.benchmarkProtocolVersionId) {
      return fail('That outcome does not belong to the pinned protocol version.')
    }
    if (pin.role !== 'primary_outcome' && pin.role !== 'secondary_outcome') {
      return fail('A benchmark goal targets a primary or secondary outcome.')
    }
    if (!pin.active) {
      return fail('That benchmark is archived.')
    }
    const unit = benchmarkOutcomeUnit(pin.requirementKind, pin.selector)
    if (!unit) {
      return fail('That outcome is not a supported benchmark result.')
    }
    return unit
  }
  if (kind === 'strength_e1rm') {
    if (!context.exercise || context.exercise.id !== selector.exerciseDefinitionId) return fail('Choose an exercise.')
    if (!context.exercise.active) return fail('That exercise is archived.')
    return 'lb'
  }
  if (kind.startsWith('training_')) {
    const exercise = context.exercise
    if (!exercise || exercise.id !== selector.exerciseDefinitionId) return fail('Choose an exercise.')
    if (!exercise.active) return fail('That exercise is archived.')
    const measurement = exercise.measurementKind ?? ''
    if (kind === 'training_reps') {
      if (!['reps','reps_per_side'].includes(measurement) || (exercise.performanceType === 'loaded_reps' && exercise.analyticsLoadType === 'external')) {
        return fail('Choose an exercise where reps alone are the performance measure.')
      }
      return 'reps'
    }
    if (kind === 'training_duration') {
      if (!['duration','duration_per_side','distance_duration'].includes(measurement)) return fail('Choose a duration exercise.')
      return 'sec'
    }
    if (kind === 'training_distance') {
      if (!['distance','distance_duration'].includes(measurement)) return fail('Choose a distance exercise.')
      return 'mi'
    }
    if (kind === 'training_pace') {
      if (measurement !== 'distance_duration') return fail('Choose a distance + duration exercise.')
      return 'sec/mi'
    }
    if (kind === 'training_skill') {
      if (measurement !== 'completion') return fail('Choose a skill/milestone exercise.')
      return 'completion'
    }
  }
  if (kind === 'supplement_adherence') {
    if (!context.supplement || context.supplement.id !== selector.supplementId) {
      return fail('Choose a supplement.')
    }
    if (!context.supplement.active) {
      return fail('That supplement is discontinued.')
    }
    return '%'
  }
  return KIND_DEFINITIONS[kind].unit ?? fail('This goal has no unit.')
}

export function validateGoalCreate(body: unknown, context: GoalValidationContext): GoalDraft | Fail {
  if (!isRecord(body)) {
    return fail('Goal details are required.')
  }
  const definition = goalKindDefinition(typeof body.goalKind === 'string' ? body.goalKind : '')
  if (!definition) {
    return fail('Choose a supported goal kind.')
  }
  const startedOn = dateOf(body.startedOn, 'Start date')
  if (startedOn == null) {
    return fail('A start date is required.')
  }
  if (typeof startedOn !== 'string') {
    return startedOn
  }
  if (startedOn > context.today) {
    return fail('The start date cannot be in the future.')
  }
  const selector = selectorOf(body, definition.kind)
  if ('error' in selector) {
    return selector
  }
  const unit = unitFor(definition.kind, selector, context)
  if (typeof unit !== 'string') {
    return unit
  }
  const target = targetOf(body, definition.kind, unit, startedOn, context.today, false)
  if ('error' in target) {
    return target
  }
  return { ...selector, ...target, startedOn }
}

export function validateGoalRevision(
  current: GoalTarget & { startedOn: string },
  body: unknown,
  context: Pick<GoalValidationContext, 'today'> & { goalKind: GoalKind; unit: string },
): GoalTarget | Fail {
  if (!isRecord(body)) {
    return fail('Revised target details are required.')
  }
  return targetOf(body, context.goalKind, context.unit, current.startedOn, context.today, true)
}

export function sameGoalTarget(left: GoalTarget, right: GoalTarget): boolean {
  return (
    left.targetMode === right.targetMode &&
    left.targetMin === right.targetMin &&
    left.targetMax === right.targetMax &&
    left.targetUnit === right.targetUnit &&
    left.targetDate === right.targetDate &&
    left.evaluationWindowDays === right.evaluationWindowDays &&
    left.notes === right.notes
  )
}

export function sameGoalSelector(left: GoalSelector, right: GoalSelector): boolean {
  return (
    left.goalKind === right.goalKind &&
    left.bodyMetricKey === right.bodyMetricKey &&
    left.exerciseDefinitionId === right.exerciseDefinitionId &&
    left.benchmarkDefinitionId === right.benchmarkDefinitionId &&
    left.benchmarkProtocolVersionId === right.benchmarkProtocolVersionId &&
    left.benchmarkRequirementId === right.benchmarkRequirementId &&
    left.supplementId === right.supplementId &&
    (left.trainingMinDistanceM ?? null) === (right.trainingMinDistanceM ?? null)
  )
}

export function goalDisplayName(input: {
  goalKind: GoalKind
  bodyMetricKey: string | null
  exerciseName: string | null
  benchmarkLabel: string | null
  supplementName: string | null
}): string {
  if (input.goalKind === 'body_metric') {
    return bodyGoalDisplayName(input.bodyMetricKey ?? '')
  }
  if (input.goalKind === 'strength_e1rm') return `${input.exerciseName ?? 'Exercise'} e1RM`
  if (input.goalKind === 'training_reps') return `${input.exerciseName ?? 'Exercise'} reps`
  if (input.goalKind === 'training_duration') return `${input.exerciseName ?? 'Exercise'} duration`
  if (input.goalKind === 'training_distance') return `${input.exerciseName ?? 'Exercise'} distance`
  if (input.goalKind === 'training_pace') return `${input.exerciseName ?? 'Exercise'} pace`
  if (input.goalKind === 'training_skill') return `Achieve ${input.exerciseName ?? 'skill'}`
  if (input.goalKind === 'benchmark_result') {
    return input.benchmarkLabel ?? 'Benchmark result'
  }
  if (input.goalKind === 'supplement_adherence') {
    return `${input.supplementName ?? 'Supplement'} adherence`
  }
  return KIND_DEFINITIONS[input.goalKind].displayName
}

export function formatGoalQuantity(value: number, unit: string): string {
  if (unit === 'sec/mi') return formatPaceSecondsPerMile(value)
  if (unit === 'completion') return value >= 1 ? 'achieved' : 'not achieved'
  if (unit === 'sec') {
    const whole = Math.round(value)
    const minutes = Math.floor(whole / 60)
    const seconds = whole % 60
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds} sec`
  }
  if (unit === 'mi') return `${value.toFixed(value < 10 ? 2 : 1)} mi`
  if (unit === 'min/night' || unit === 'minutes') {
    const whole = Math.round(value)
    const hours = Math.floor(whole / 60)
    const minutes = whole % 60
    if (hours === 0) {
      return `${minutes} min`
    }
    if (minutes === 0) {
      return `${hours} h`
    }
    return `${hours} h ${minutes} min`
  }
  const rounded = Math.round(value * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${text} ${unit}`
}

export function formatGoalTarget(target: Pick<GoalTarget, 'targetMode' | 'targetMin' | 'targetMax' | 'targetUnit'>): string {
  if (target.targetMode === 'at_least' && target.targetMin != null) {
    return `≥ ${formatGoalQuantity(target.targetMin, target.targetUnit)}`
  }
  if (target.targetMode === 'at_most' && target.targetMax != null) {
    return `≤ ${formatGoalQuantity(target.targetMax, target.targetUnit)}`
  }
  if (target.targetMin != null && target.targetMax != null) {
    return `${formatGoalQuantity(target.targetMin, target.targetUnit)}–${formatGoalQuantity(target.targetMax, target.targetUnit)}`
  }
  return formatGoalQuantity(target.targetMin ?? target.targetMax ?? 0, target.targetUnit)
}

export type GoalLifecycleState = {
  status: GoalStatus
  pausedAt: string | null
  completedAt: string | null
}

export function nextGoalLifecycle(
  current: GoalStatus,
  action: GoalLifecycleAction,
  now: string,
): GoalLifecycleState | Fail {
  if (action === 'pause' && current === 'active') {
    return { status: 'paused', pausedAt: now, completedAt: null }
  }
  if (action === 'resume' && current === 'paused') {
    return { status: 'active', pausedAt: null, completedAt: null }
  }
  if (action === 'complete' && (current === 'active' || current === 'paused')) {
    return { status: 'completed', pausedAt: null, completedAt: now }
  }
  if (action === 'reopen' && current === 'completed') {
    return { status: 'active', pausedAt: null, completedAt: null }
  }
  return fail('That lifecycle change is not available.')
}

export type GoalEvidence = {
  current: number | null
  unit: string
  observedOn: string | null
  difference: number | null
  relation: 'above_range' | 'below_range' | 'inside_range' | null
  provisional: { value: number; unit: string; label: 'so far' } | null
  strengthSource: {
    loadLb: number
    reps: number
    formula: 'epley'
    sessionId: string
    setId: string
  } | null
  trainingSource: {
    sessionId: string
    sessionExerciseId: string
    setId: string
    exerciseId: string
    reps: number | null
    durationSec: number | null
    distanceM: number | null
    completed: boolean | null
    secondsPerMile: number | null
  } | null
  coverage: {
    observedDays: number
    windowDays: number
    takenDays: number
    skippedDays: number
    unknownDays: number
    partialNights: number
  } | null
}

function emptyCoverage(windowDays: number): NonNullable<GoalEvidence['coverage']> {
  return {
    observedDays: 0,
    windowDays,
    takenDays: 0,
    skippedDays: 0,
    unknownDays: 0,
    partialNights: 0,
  }
}

function differenceFor(current: number | null, target: GoalTarget): Pick<GoalEvidence, 'difference' | 'relation'> {
  if (current == null) {
    return { difference: null, relation: null }
  }
  if (target.targetMode === 'range' && target.targetMin != null && target.targetMax != null) {
    if (current < target.targetMin) {
      return { difference: target.targetMin - current, relation: 'below_range' }
    }
    if (current > target.targetMax) {
      return { difference: current - target.targetMax, relation: 'above_range' }
    }
    return { difference: 0, relation: 'inside_range' }
  }
  const anchor = target.targetMode === 'at_most' ? target.targetMax : target.targetMin
  if (anchor == null) {
    return { difference: null, relation: null }
  }
  return { difference: current - anchor, relation: null }
}

export function observationToGoalUnit(value: number, storedUnit: string, goalUnit: string): number | null {
  if (storedUnit === goalUnit) {
    return value
  }
  if (storedUnit === 'kg' && goalUnit === 'lb') {
    return kilogramsToPounds(value)
  }
  if (storedUnit === 'cm' && goalUnit === 'in') {
    return centimetersToInches(value)
  }
  if ((storedUnit === 'percent' || storedUnit === '%') && goalUnit === '%') {
    return value
  }
  return null
}

export function goalEvidence(input: {
  goalKind: GoalKind
  target: GoalTarget
  asOf: string
  body: { value: number; unit: string; observedOn: string } | null
  strength: {
    e1rmKg: number
    observedOn: string
    sourceLoadKg: number
    sourceReps: number
    sourceSessionId: string
    sourceSetId: string
  } | null
  benchmark: { value: number; unit: string; observedOn: string } | null
  sessionDates: readonly string[]
  activityRows: readonly ActivityDailyRow[]
  proteinDays: readonly { date: string; protein: number | null; logged: boolean }[]
  sleepNights: readonly { date: string; minutes: number | null; analysisEligible: boolean; partial: boolean }[]
  training?: {
    value: number
    observedOn: string
    sessionId: string
    sessionExerciseId: string
    setId: string
    exerciseId: string
    reps: number | null
    durationSec: number | null
    distanceM: number | null
    completed: boolean | null
    secondsPerMile: number | null
  } | null
  adherence: {
    schedules: readonly ScheduleWindow[]
    events: readonly StatusEventWindow[]
    rows: readonly AdherenceWindow[]
  } | null
}): GoalEvidence {
  const unit = input.target.targetUnit
  const base = {
    current: null as number | null,
    unit,
    observedOn: null as string | null,
    provisional: null as GoalEvidence['provisional'],
    strengthSource: null as GoalEvidence['strengthSource'],
    trainingSource: null as GoalEvidence['trainingSource'],
    coverage: null as GoalEvidence['coverage'],
  }
  if (input.goalKind === 'body_metric') {
    if (input.body) {
      base.current = observationToGoalUnit(input.body.value, input.body.unit, unit)
      base.observedOn = input.body.observedOn
    }
  } else if (input.goalKind === 'strength_e1rm') {
    if (input.strength) {
      base.current = kilogramsToPounds(input.strength.e1rmKg)
      base.observedOn = input.strength.observedOn
      base.strengthSource = {
        loadLb: kilogramsToPounds(input.strength.sourceLoadKg),
        reps: input.strength.sourceReps,
        formula: 'epley',
        sessionId: input.strength.sourceSessionId,
        setId: input.strength.sourceSetId,
      }
    }
  } else if (input.goalKind === 'training_reps' || input.goalKind === 'training_duration' || input.goalKind === 'training_distance' || input.goalKind === 'training_pace' || input.goalKind === 'training_skill') {
    if (input.training) {
      base.current = input.goalKind === 'training_distance' ? metersToMiles(input.training.value) : input.training.value
      base.observedOn = input.training.observedOn
      base.trainingSource = {
        sessionId: input.training.sessionId,
        sessionExerciseId: input.training.sessionExerciseId,
        setId: input.training.setId,
        exerciseId: input.training.exerciseId,
        reps: input.training.reps,
        durationSec: input.training.durationSec,
        distanceM: input.training.distanceM,
        completed: input.training.completed,
        secondsPerMile: input.training.secondsPerMile,
      }
    }
  } else if (input.goalKind === 'benchmark_result') {
    if (input.benchmark && input.benchmark.unit === unit) {
      base.current = input.benchmark.value
      base.observedOn = input.benchmark.observedOn
    }
  } else if (input.goalKind === 'training_frequency') {
    const start = addCalendarDays(input.asOf, -6)
    const dates = new Set(input.sessionDates.filter((date) => date >= start && date <= input.asOf))
    base.current = dates.size
    base.coverage = { ...emptyCoverage(7), observedDays: dates.size }
  } else if (input.goalKind === 'activity_steps') {
    const days = input.target.evaluationWindowDays ?? 7
    const start = addCalendarDays(input.asOf, -days)
    const summary = activityRangeSummary(input.activityRows, start, input.asOf, 'America/Phoenix', input.asOf)
    base.current = summary.steps.status === 'available' ? summary.steps.value : null
    base.coverage = {
      ...emptyCoverage(summary.steps.completedCalendarDays),
      observedDays: summary.steps.observedDays,
    }
    const today = input.activityRows.find((row) => row.date === input.asOf)
    if (today?.stepsCount != null) {
      base.provisional = { value: today.stepsCount, unit: 'steps/day', label: 'so far' }
    }
  } else if (input.goalKind === 'nutrition_protein') {
    const days = input.target.evaluationWindowDays ?? 7
    const start = addCalendarDays(input.asOf, -(days - 1))
    const known = input.proteinDays.filter((day) => day.date >= start && day.date <= input.asOf && day.logged && day.protein != null)
    base.coverage = { ...emptyCoverage(days), observedDays: known.length }
    if (known.length > 0) {
      base.current = known.reduce((sum, day) => sum + (day.protein ?? 0), 0) / known.length
    }
  } else if (input.goalKind === 'sleep_duration') {
    const days = input.target.evaluationWindowDays ?? 7
    const start = addCalendarDays(input.asOf, -(days - 1))
    const inWindow = input.sleepNights.filter((night) => night.date >= start && night.date <= input.asOf)
    const eligible = inWindow.filter((night) => night.analysisEligible && !night.partial && night.minutes != null)
    const partial = inWindow.filter((night) => night.partial).length
    base.coverage = { ...emptyCoverage(days), observedDays: eligible.length, partialNights: partial }
    if (eligible.length > 0) {
      base.current = eligible.reduce((sum, night) => sum + (night.minutes ?? 0), 0) / eligible.length
    }
  } else if (input.goalKind === 'supplement_adherence' && input.adherence) {
    const days = input.target.evaluationWindowDays ?? 30
    const end = addCalendarDays(input.asOf, -1)
    const start = addCalendarDays(end, -(days - 1))
    const states = end < start
      ? []
      : resolveScheduleRange({
          schedules: input.adherence.schedules,
          events: input.adherence.events,
          adherence: input.adherence.rows,
          start,
          end,
        })
    const summary = aggregateOccurrenceStates(states)
    base.coverage = {
      ...emptyCoverage(days),
      observedDays: summary.recordedCount,
      takenDays: summary.takenCount,
      skippedDays: summary.skippedCount,
      unknownDays: summary.unknownCount,
    }
    base.current = summary.recordedCount === 0 ? null : (summary.takenCount / summary.recordedCount) * 100
  }
  return { ...base, ...differenceFor(base.current, input.target) }
}

export function latestSessionE1rm(
  setsBySession: ReadonlyArray<readonly CanonicalSetRecord[]>,
  exercise: ProgressExerciseDefinition,
): {
  e1rmKg: number
  observedOn: string
  sourceLoadKg: number
  sourceReps: number
  sourceSessionId: string
  sourceSetId: string
} | null {
  const points = sessionStrengthHistory(setsBySession, exercise)
  const latest = points.length === 0 ? null : points[points.length - 1]
  if (!latest) {
    return null
  }
  return {
    e1rmKg: latest.estimated1RmKg,
    observedOn: latest.date,
    sourceLoadKg: latest.sourceSet.weightKg,
    sourceReps: latest.sourceSet.reps,
    sourceSessionId: latest.sessionId,
    sourceSetId: latest.sourceSet.setId,
  }
}

export const FUTURE_GOAL_KINDS = [
  'nutrition_consistency',
  'sleep_consistency',
  'activity_general',
] as const
