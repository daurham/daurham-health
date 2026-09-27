import {
  emptyRequirementCriteria,
  type LabRequirementKind,
  type LabRequirementRole,
  type RequirementCriteria,
} from './lab.js'
import { sameProtocolValueDelta } from './lab-results.js'
import { addCalendarDays, inclusiveDayCount } from './progress/dates.js'
import { timedDurationSecForSet, volumeRepsForSet } from './progress/exercise-performance.js'
import type { CanonicalSetRecord, ProgressExerciseDefinition } from './progress/types.js'
import type { OccurrenceState } from './supplements/types.js'
import { isCalendarDate } from './training.js'

export const EXPERIMENT_RESULT_CLASSIFICATIONS = [
  'completed_interpretable',
  'completed_low_adherence',
  'incomplete',
  'inconclusive',
  'invalid_protocol',
  'stopped_safety',
] as const

export type ExperimentResultClassification = (typeof EXPERIMENT_RESULT_CLASSIFICATIONS)[number]

export const PROTOCOL_ATTESTATIONS = ['followed', 'not_followed', 'uncertain'] as const
export type ProtocolAttestation = (typeof PROTOCOL_ATTESTATIONS)[number]

export const REQUIREMENT_EVALUATION_STATUSES = ['available', 'missing', 'insufficient', 'unsupported', 'not_applicable'] as const
export type RequirementEvaluationStatus = (typeof REQUIREMENT_EVALUATION_STATUSES)[number]

export const CRITERION_STATUSES = ['pass', 'fail', 'not_configured', 'not_applicable'] as const
export type CriterionStatus = (typeof CRITERION_STATUSES)[number]

export const SAFETY_REASON_MAX = 500
export const OWNER_NOTE_MAX = 2000
export const INVALIDATION_REASON_MAX = 500

export type ExperimentRequirementSpec = {
  id: string
  role: LabRequirementRole | string
  requirementKind: LabRequirementKind | string
  selector: Record<string, string>
  label: string
  required: boolean
  criteria: RequirementCriteria
}

export type BenchmarkEvidenceResult = {
  id: string
  benchmarkDefinitionId: string
  benchmarkTitle: string
  protocolVersionId: string
  protocolVersion: number
  resultDate: string
  createdAt: string
  experimentId: string | null
  status: string
  primaryValues: Array<{ requirementId: string; label: string; value: number; unit: string }>
}

export type TrainingEvidenceSession = {
  id: string
  workoutDate: string
  experimentId: string | null
  exercises: Array<{
    exerciseDefinitionId: string
    measurementKind: string
    analyticsRepMode: 'standard' | 'per_side'
    sets: CanonicalSetRecord[]
  }>
}

export type BodyEvidencePoint = {
  measurementId: string
  calendarDate: string
  metricKey: string
  value: number
  unit: string
}

export type DailyMetricPoint = {
  date: string
  metricKey: string
  value: number | null
  eligible?: boolean
}

export type AdherenceDay = {
  date: string
  state: OccurrenceState
}

export type ContextDay = {
  date: string
  tags: string[]
}

export type ExperimentEvidence = {
  benchmarks: BenchmarkEvidenceResult[]
  training: TrainingEvidenceSession[]
  body: BodyEvidencePoint[]
  nutrition: DailyMetricPoint[]
  activity: DailyMetricPoint[]
  sleep: DailyMetricPoint[]
  adherence: Array<{ supplementId: string; name: string; days: AdherenceDay[] }>
  context: ContextDay[]
  contextControls: Array<{ tagKey: string }>
}

export type ResultEvidenceRecord = {
  evidenceKind: string
  evidenceRef: Record<string, unknown>
  evidenceSnapshot: Record<string, unknown>
  observationDate: string | null
}

export type RequirementEvaluation = {
  requirementId: string
  label: string
  required: boolean
  role: string
  requirementKind: string
  evaluationStatus: RequirementEvaluationStatus
  summaryKind: string
  summary: Record<string, unknown>
  criterionStatus: CriterionStatus
  evidence: ResultEvidenceRecord[]
}

export type ExperimentEvaluation = {
  state: 'window_in_progress' | 'ready'
  classification: ExperimentResultClassification | null
  windowStart: string
  plannedWindowEnd: string
  effectiveEndDate: string | null
  requirements: RequirementEvaluation[]
  descriptiveAdherence: RequirementEvaluation[]
  contextControls: Array<{ tagKey: string; recordedDates: string[]; recordedDayCount: number }>
  limitations: string[]
  protocolAttestation: ProtocolAttestation
  stoppedForSafety: boolean
  canCommit: boolean
  message: string | null
}

export function emptyCriteria(): RequirementCriteria {
  return emptyRequirementCriteria()
}

export const FINAL_OBSERVATION_DAY_MESSAGE =
  'Final observation day in progress. Result review will be available tomorrow.'

export function experimentNeedsReview(input: {
  status: string
  windowEnd: string | null
  today: string
  hasValidResult: boolean
}): boolean {
  return input.status === 'active' && input.windowEnd != null && input.today > input.windowEnd && !input.hasValidResult
}

export function experimentStatusForClassification(
  classification: ExperimentResultClassification,
): 'completed' | 'inconclusive' {
  if (classification === 'completed_interpretable' || classification === 'completed_low_adherence') {
    return 'completed'
  }
  return 'inconclusive'
}

export type FinalizationWindow = {
  windowStart: string
  plannedWindowEnd: string
  effectiveEndDate: string
  early: boolean
}

export function resolveFinalizationWindow(input: {
  windowStart: string | null
  windowEnd: string | null
  today: string
  protocolFollowed: ProtocolAttestation
  stoppedForSafety: boolean
  effectiveEndDate: string | null
}): FinalizationWindow | { state: 'window_in_progress'; finalDay: boolean } | { error: string } {
  if (!input.windowStart || !input.windowEnd) {
    return { error: 'This experiment has no observation window.' }
  }
  const early = input.stoppedForSafety || input.protocolFollowed === 'not_followed'
  if (!early && input.today <= input.windowEnd) {
    return { state: 'window_in_progress', finalDay: input.today === input.windowEnd }
  }
  if (!early) {
    return {
      windowStart: input.windowStart,
      plannedWindowEnd: input.windowEnd,
      effectiveEndDate: input.windowEnd,
      early: false,
    }
  }
  if (!input.effectiveEndDate || !isCalendarDate(input.effectiveEndDate)) {
    return { error: 'An early stop needs the date the experiment ended.' }
  }
  const latest = input.windowEnd < input.today ? input.windowEnd : input.today
  if (input.effectiveEndDate < input.windowStart || input.effectiveEndDate > latest) {
    return { error: 'The end date must fall inside the planned window and not after today.' }
  }
  return {
    windowStart: input.windowStart,
    plannedWindowEnd: input.windowEnd,
    effectiveEndDate: input.effectiveEndDate,
    early: true,
  }
}

export function summarizeAdherence(days: readonly AdherenceDay[]): {
  scheduledDays: number
  takenDays: number
  skippedDays: number
  unknownDays: number
  resolvedDays: number
  coveragePercent: number | null
  adherencePercent: number | null
} {
  let takenDays = 0
  let skippedDays = 0
  let unknownDays = 0
  for (const day of days) {
    if (day.state === 'taken') takenDays += 1
    else if (day.state === 'skipped') skippedDays += 1
    else if (day.state === 'unknown') unknownDays += 1
  }
  const scheduledDays = takenDays + skippedDays + unknownDays
  const resolvedDays = takenDays + skippedDays
  return {
    scheduledDays,
    takenDays,
    skippedDays,
    unknownDays,
    resolvedDays,
    coveragePercent: scheduledDays === 0 ? null : roundNumber((resolvedDays / scheduledDays) * 100),
    adherencePercent: resolvedDays === 0 ? null : roundNumber((takenDays / resolvedDays) * 100),
  }
}

export function classifyExperimentResult(input: {
  stoppedForSafety: boolean
  protocolFollowed: ProtocolAttestation
  windowOpen: boolean
  requirements: ReadonlyArray<{
    required: boolean
    role: string
    requirementKind: string
    evaluationStatus: RequirementEvaluationStatus
    criterionStatus: CriterionStatus
  }>
}): ExperimentResultClassification | 'window_in_progress' {
  if (input.stoppedForSafety) {
    return 'stopped_safety'
  }
  if (input.protocolFollowed === 'not_followed') {
    return 'invalid_protocol'
  }
  if (input.windowOpen) {
    return 'window_in_progress'
  }
  const gates = input.requirements.filter((item) => item.required && !isContextAnnotation(item))
  if (gates.some((item) => item.evaluationStatus === 'missing' || item.evaluationStatus === 'insufficient')) {
    return 'incomplete'
  }
  if (gates.some((item) => item.evaluationStatus === 'unsupported') || input.protocolFollowed === 'uncertain') {
    return 'inconclusive'
  }
  if (input.requirements.some((item) => item.requirementKind === 'supplement_adherence' && item.criterionStatus === 'fail')) {
    return 'completed_low_adherence'
  }
  return 'completed_interpretable'
}

export function isContextAnnotation(item: { role: string; requirementKind: string }): boolean {
  return item.requirementKind === 'context_tag' || item.role === 'context'
}

export function evaluateExperiment(input: {
  windowStart: string
  plannedWindowEnd: string
  effectiveEndDate: string | null
  windowOpen: boolean
  finalObservationDay?: boolean
  protocolFollowed: ProtocolAttestation
  stoppedForSafety: boolean
  requirements: readonly ExperimentRequirementSpec[]
  evidence: ExperimentEvidence
  descriptiveSupplements?: ReadonlyArray<{ supplementId: string; name: string; days: AdherenceDay[] }>
}): ExperimentEvaluation {
  const end = input.effectiveEndDate ?? input.plannedWindowEnd
  const requirements = input.requirements.map((requirement) =>
    evaluateRequirement(requirement, input.evidence, input.windowStart, end),
  )
  const describedIds = new Set(
    input.requirements.filter((item) => item.requirementKind === 'supplement_adherence').map((item) => item.selector.supplementId),
  )
  const descriptiveAdherence = (input.descriptiveSupplements ?? [])
    .filter((item) => !describedIds.has(item.supplementId))
    .map((item) => adherenceEvaluation(item.supplementId, item.name, item.days, emptyCriteria(), false))
  const classificationOrBlock = classifyExperimentResult({
    stoppedForSafety: input.stoppedForSafety,
    protocolFollowed: input.protocolFollowed,
    windowOpen: input.windowOpen,
    requirements,
  })
  const ready = classificationOrBlock !== 'window_in_progress'
  const contextControls = input.evidence.contextControls.map((control) => contextControlSummary(control.tagKey, input.evidence.context, input.windowStart, end))
  return {
    state: ready ? 'ready' : 'window_in_progress',
    classification: ready ? classificationOrBlock : null,
    windowStart: input.windowStart,
    plannedWindowEnd: input.plannedWindowEnd,
    effectiveEndDate: ready ? end : null,
    requirements,
    descriptiveAdherence,
    contextControls,
    limitations: ready ? limitationsFor(requirements, contextControls, descriptiveAdherence) : [],
    protocolAttestation: input.protocolFollowed,
    stoppedForSafety: input.stoppedForSafety,
    canCommit: ready,
    message: ready ? null : input.finalObservationDay ? FINAL_OBSERVATION_DAY_MESSAGE : 'The observation window is still open.',
  }
}

function evaluateRequirement(
  requirement: ExperimentRequirementSpec,
  evidence: ExperimentEvidence,
  start: string,
  end: string,
): RequirementEvaluation {
  if (isContextAnnotation(requirement)) {
    return contextRequirement(requirement, evidence.context, start, end)
  }
  if (requirement.requirementKind === 'benchmark_definition') {
    return benchmarkRequirement(requirement, evidence.benchmarks, start, end)
  }
  if (requirement.requirementKind === 'training_measure') {
    return trainingRequirement(requirement, evidence.training, start, end)
  }
  if (requirement.requirementKind === 'body_metric') {
    return bodyRequirement(requirement, evidence.body, start, end)
  }
  if (requirement.requirementKind === 'nutrition_metric') {
    return dailyRequirement(requirement, evidence.nutrition, start, end, 'nutrition', 'nutrition_day')
  }
  if (requirement.requirementKind === 'activity_metric') {
    return dailyRequirement(requirement, evidence.activity, start, end, 'activity', 'activity_day')
  }
  if (requirement.requirementKind === 'sleep_metric') {
    return dailyRequirement(requirement, evidence.sleep, start, end, 'sleep', 'sleep_night')
  }
  if (requirement.requirementKind === 'supplement_adherence') {
    const match = evidence.adherence.find((item) => item.supplementId === requirement.selector.supplementId)
    return adherenceEvaluation(
      requirement.selector.supplementId ?? '',
      match?.name ?? requirement.label,
      (match?.days ?? []).filter((day) => day.date >= start && day.date <= end),
      requirement.criteria,
      requirement.required,
      requirement,
    )
  }
  return baseEvaluation(requirement, 'unsupported', 'none', {}, 'not_applicable', [])
}

function contextRequirement(
  requirement: ExperimentRequirementSpec,
  days: readonly ContextDay[],
  start: string,
  end: string,
): RequirementEvaluation {
  const tag = requirement.selector.tagKey ?? ''
  const recordedDates = days
    .filter((day) => day.date >= start && day.date <= end && day.tags.includes(tag))
    .map((day) => day.date)
    .sort()
  return baseEvaluation(
    requirement,
    'available',
    'context',
    {
      tagKey: tag,
      recordedDates,
      recordedDayCount: recordedDates.length,
      note: recordedDates.length === 0 ? 'No matching context was recorded.' : null,
    },
    'not_applicable',
    recordedDates.map((date) => ({
      evidenceKind: 'daily_context',
      evidenceRef: { date, tagKey: tag },
      evidenceSnapshot: { date, tagKey: tag },
      observationDate: date,
    })),
  )
}

function contextControlSummary(tagKey: string, days: readonly ContextDay[], start: string, end: string) {
  const recordedDates = days
    .filter((day) => day.date >= start && day.date <= end && day.tags.includes(tagKey))
    .map((day) => day.date)
    .sort()
  return { tagKey, recordedDates, recordedDayCount: recordedDates.length }
}

function benchmarkRequirement(
  requirement: ExperimentRequirementSpec,
  results: readonly BenchmarkEvidenceResult[],
  start: string,
  end: string,
): RequirementEvaluation {
  const definitionId = requirement.selector.benchmarkDefinitionId
  const pinned = requirement.selector.benchmarkProtocolVersionId ?? null
  const linked = results.filter(
    (item) =>
      item.status === 'valid' &&
      item.benchmarkDefinitionId === definitionId &&
      item.experimentId != null &&
      item.resultDate >= start &&
      item.resultDate <= end,
  )
  const versions = [...new Set(linked.map((item) => item.protocolVersionId))]
  if (!pinned && versions.length > 1) {
    return baseEvaluation(requirement, 'unsupported', 'benchmark', { reason: 'multiple_protocol_versions' }, 'not_applicable', [])
  }
  const versionId = pinned ?? versions[0] ?? null
  const inWindow = versionId ? linked.filter((item) => item.protocolVersionId === versionId).sort(byResultOrder) : []
  const count = inWindow.length
  const gate = quantityGate(count, requirement.criteria.minimumObservations)
  if (gate !== 'available') {
    return baseEvaluation(requirement, gate, 'benchmark', { resultCount: count, protocolVersionId: versionId }, 'not_configured', [])
  }
  const first = inWindow[0]!
  const last = inWindow[inWindow.length - 1]!
  const priorPool = results
    .filter(
      (item) =>
        item.status === 'valid' &&
        item.benchmarkDefinitionId === definitionId &&
        item.protocolVersionId === first.protocolVersionId &&
        item.resultDate < start,
    )
    .sort(byResultOrder)
  const prior = priorPool[priorPool.length - 1] ?? null
  const deltas = prior ? deltasBetween(prior, last) : null
  const summary = {
    benchmarkTitle: last.benchmarkTitle,
    protocolVersionId: last.protocolVersionId,
    protocolVersion: last.protocolVersion,
    resultCount: count,
    first: briefResult(first),
    last: briefResult(last),
    prior: prior ? briefResult(prior) : null,
    deltas,
    comparisonNote: prior ? null : 'No prior same-protocol benchmark result was available.',
  }
  return baseEvaluation(
    requirement,
    'available',
    'benchmark',
    summary,
    'not_configured',
    inWindow.map((item) => ({
      evidenceKind: 'benchmark_result',
      evidenceRef: { benchmarkResultId: item.id, protocolVersionId: item.protocolVersionId },
      evidenceSnapshot: { benchmarkResultId: item.id, protocolVersionId: item.protocolVersionId, primaryValues: item.primaryValues },
      observationDate: item.resultDate,
    })),
  )
}

function trainingRequirement(
  requirement: ExperimentRequirementSpec,
  sessions: readonly TrainingEvidenceSession[],
  start: string,
  end: string,
): RequirementEvaluation {
  const exerciseId = requirement.selector.exerciseDefinitionId ?? ''
  const measure = requirement.selector.measure ?? ''
  const linked = sessions
    .filter((session) => session.experimentId != null && session.workoutDate >= start && session.workoutDate <= end)
    .sort((left, right) => (left.workoutDate === right.workoutDate ? (left.id < right.id ? -1 : 1) : left.workoutDate < right.workoutDate ? -1 : 1))
  const measured = linked.flatMap((session) => {
    const value = sessionMeasure(session, exerciseId, measure)
    return value == null ? [] : [{ sessionId: session.id, date: session.workoutDate, value }]
  })
  if (measured.length === 0 && linked.length === 0) {
    return baseEvaluation(requirement, 'missing', 'training', { sessionCount: 0, observationCount: 0 }, 'not_configured', [])
  }
  if (measured.length === 0) {
    return baseEvaluation(requirement, 'unsupported', 'training', { sessionCount: linked.length, observationCount: 0 }, 'not_applicable', [])
  }
  const gate = quantityGate(measured.length, requirement.criteria.minimumObservations)
  const unit = measure === 'working_sets' ? 'sets' : measure === 'duration' ? 'seconds' : 'reps'
  const first = measured[0]!
  const last = measured[measured.length - 1]!
  return baseEvaluation(
    requirement,
    gate,
    'training',
    { sessionCount: linked.length, observationCount: measured.length, unit, firstValue: first.value, lastValue: last.value },
    'not_configured',
    measured.map((item) => ({
      evidenceKind: 'training_session',
      evidenceRef: { sessionId: item.sessionId },
      evidenceSnapshot: { workoutDate: item.date, value: item.value, unit },
      observationDate: item.date,
    })),
  )
}

function sessionMeasure(session: TrainingEvidenceSession, exerciseId: string, measure: string): number | null {
  const exercise = session.exercises.find((item) => item.exerciseDefinitionId === exerciseId)
  if (!exercise) {
    return null
  }
  const shape: ProgressExerciseDefinition = {
    id: exerciseId,
    name: '',
    externalId: null,
    performanceType: 'other',
    analyticsLoadType: 'external',
    analyticsRepMode: exercise.analyticsRepMode,
    measurementKind: exercise.measurementKind,
    unilateral: false,
  }
  const working = exercise.sets.filter((set) => set.setType === 'working')
  if (measure === 'total_reps') {
    if (!exercise.measurementKind.startsWith('reps')) return null
    const reps = working.map((set) => volumeRepsForSet(set, shape)).filter((value): value is number => value != null)
    return reps.length === 0 ? null : reps.reduce((sum, value) => sum + value, 0)
  }
  if (measure === 'largest_set_reps') {
    if (!exercise.measurementKind.startsWith('reps')) return null
    const reps = working.map((set) => volumeRepsForSet(set, shape)).filter((value): value is number => value != null)
    return reps.length === 0 ? null : Math.max(...reps)
  }
  if (measure === 'working_sets') {
    const completed = working.filter((set) => volumeRepsForSet(set, shape) != null || timedDurationSecForSet(set, shape) != null)
    return completed.length === 0 ? null : completed.length
  }
  if (measure === 'duration') {
    if (!exercise.measurementKind.startsWith('duration')) return null
    const durations = working.map((set) => timedDurationSecForSet(set, shape)).filter((value): value is number => value != null)
    return durations.length === 0 ? null : durations.reduce((sum, value) => sum + value, 0)
  }
  return null
}

function bodyRequirement(
  requirement: ExperimentRequirementSpec,
  points: readonly BodyEvidencePoint[],
  start: string,
  end: string,
): RequirementEvaluation {
  const key = requirement.selector.metricKey ?? ''
  const matched = points
    .filter((item) => item.metricKey === key && item.calendarDate >= start && item.calendarDate <= end && Number.isFinite(item.value))
    .sort((left, right) => (left.calendarDate === right.calendarDate ? (left.measurementId < right.measurementId ? -1 : 1) : left.calendarDate < right.calendarDate ? -1 : 1))
  const gate = quantityGate(matched.length, requirement.criteria.minimumObservations)
  if (matched.length === 0) {
    return baseEvaluation(requirement, 'missing', 'body', { observationCount: 0 }, 'not_configured', [])
  }
  const first = matched[0]!
  const last = matched[matched.length - 1]!
  const summary: Record<string, unknown> = {
    observationCount: matched.length,
    unit: last.unit,
    first: { measurementId: first.measurementId, date: first.calendarDate, value: first.value, unit: first.unit },
    last: { measurementId: last.measurementId, date: last.calendarDate, value: last.value, unit: last.unit },
  }
  if (matched.length >= 2) {
    summary.absoluteChange = roundNumber(last.value - first.value)
  }
  return baseEvaluation(
    requirement,
    gate,
    'body',
    summary,
    'not_configured',
    matched.map((item) => ({
      evidenceKind: 'body_metric',
      evidenceRef: { measurementId: item.measurementId },
      evidenceSnapshot: { metricKey: item.metricKey, value: item.value, unit: item.unit },
      observationDate: item.calendarDate,
    })),
  )
}

function dailyRequirement(
  requirement: ExperimentRequirementSpec,
  points: readonly DailyMetricPoint[],
  start: string,
  end: string,
  summaryKind: string,
  evidenceKind: string,
): RequirementEvaluation {
  const key = requirement.selector.metricKey ?? ''
  const windowDays = inclusiveDayCount(start, end)
  const observed = points.filter((item) => {
    if (item.date < start || item.date > end || item.metricKey !== key) return false
    if (summaryKind === 'sleep' && item.eligible === false) return false
    return item.value != null && Number.isFinite(item.value)
  })
  const values = observed.map((item) => item.value as number)
  if (values.length === 0) {
    return baseEvaluation(requirement, 'missing', summaryKind, { observedDays: 0, windowDays, coveragePercent: 0 }, 'not_configured', [])
  }
  const coveragePercent = roundNumber((values.length / windowDays) * 100)
  let status: RequirementEvaluationStatus = 'available'
  if (requirement.criteria.minimumObservations != null && values.length < requirement.criteria.minimumObservations) {
    status = 'insufficient'
  }
  if (requirement.criteria.minimumCoveragePercent != null && coveragePercent < requirement.criteria.minimumCoveragePercent) {
    status = 'insufficient'
  }
  const average = roundNumber(values.reduce((sum, value) => sum + value, 0) / values.length)
  return baseEvaluation(
    requirement,
    status,
    summaryKind,
    {
      observedDays: values.length,
      windowDays,
      coveragePercent,
      average,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      unit: dailyUnit(summaryKind, key),
    },
    'not_configured',
    observed.map((item) => ({
      evidenceKind,
      evidenceRef: { date: item.date, metricKey: key },
      evidenceSnapshot: { date: item.date, metricKey: key, value: item.value },
      observationDate: item.date,
    })),
  )
}

function adherenceEvaluation(
  supplementId: string,
  name: string,
  days: readonly AdherenceDay[],
  criteria: RequirementCriteria,
  required: boolean,
  requirement?: ExperimentRequirementSpec,
): RequirementEvaluation {
  const counts = summarizeAdherence(days)
  const spec = requirement ?? {
    id: `descriptive:${supplementId}`,
    role: 'adherence',
    requirementKind: 'supplement_adherence',
    selector: { supplementId },
    label: name,
    required,
    criteria,
  }
  if (counts.scheduledDays === 0) {
    return baseEvaluation(spec, required ? 'insufficient' : 'missing', 'adherence', { ...counts, name }, 'not_configured', [
      adherenceEvidence(supplementId, counts),
    ])
  }
  const coverageFloor = criteria.minimumAdherencePercent != null && criteria.minimumCoveragePercent == null ? 100 : criteria.minimumCoveragePercent
  if (coverageFloor != null && (counts.coveragePercent ?? 0) < coverageFloor) {
    return baseEvaluation(spec, 'insufficient', 'adherence', { ...counts, name, coverageFloor }, 'not_configured', [
      adherenceEvidence(supplementId, counts),
    ])
  }
  let criterion: CriterionStatus = 'not_configured'
  if (criteria.minimumAdherencePercent != null) {
    criterion = (counts.adherencePercent ?? 0) >= criteria.minimumAdherencePercent ? 'pass' : 'fail'
  }
  return baseEvaluation(spec, 'available', 'adherence', { ...counts, name, minimumAdherencePercent: criteria.minimumAdherencePercent }, criterion, [
    adherenceEvidence(supplementId, counts),
  ])
}

function adherenceEvidence(supplementId: string, counts: ReturnType<typeof summarizeAdherence>): ResultEvidenceRecord {
  return {
    evidenceKind: 'supplement_adherence',
    evidenceRef: { supplementId },
    evidenceSnapshot: {
      scheduledDays: counts.scheduledDays,
      takenDays: counts.takenDays,
      skippedDays: counts.skippedDays,
      unknownDays: counts.unknownDays,
    },
    observationDate: null,
  }
}

function quantityGate(count: number, minimum: number | null): RequirementEvaluationStatus {
  if (count === 0) {
    return 'missing'
  }
  if (minimum != null && count < minimum) {
    return 'insufficient'
  }
  return 'available'
}

function baseEvaluation(
  requirement: ExperimentRequirementSpec,
  evaluationStatus: RequirementEvaluationStatus,
  summaryKind: string,
  summary: Record<string, unknown>,
  criterionStatus: CriterionStatus,
  evidence: ResultEvidenceRecord[],
): RequirementEvaluation {
  return {
    requirementId: requirement.id,
    label: requirement.label,
    required: requirement.required,
    role: requirement.role,
    requirementKind: requirement.requirementKind,
    evaluationStatus,
    summaryKind,
    summary,
    criterionStatus,
    evidence,
  }
}

function briefResult(result: BenchmarkEvidenceResult) {
  return {
    id: result.id,
    resultDate: result.resultDate,
    protocolVersion: result.protocolVersion,
    primaryValues: result.primaryValues,
  }
}

function deltasBetween(previous: BenchmarkEvidenceResult, next: BenchmarkEvidenceResult) {
  const deltas = []
  for (const value of next.primaryValues) {
    const prior = previous.primaryValues.find((item) => item.requirementId === value.requirementId)
    if (!prior) continue
    const delta = sameProtocolValueDelta(prior.value, value.value)
    deltas.push({
      requirementId: value.requirementId,
      label: value.label,
      unit: value.unit,
      previousValue: prior.value,
      nextValue: value.value,
      absolute: delta.absolute,
      percent: delta.percent,
    })
  }
  return deltas
}

function byResultOrder(left: BenchmarkEvidenceResult, right: BenchmarkEvidenceResult): number {
  if (left.resultDate !== right.resultDate) return left.resultDate < right.resultDate ? -1 : 1
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

function limitationsFor(
  requirements: readonly RequirementEvaluation[],
  controls: ReadonlyArray<{ tagKey: string; recordedDayCount: number }>,
  descriptive: readonly RequirementEvaluation[],
): string[] {
  const lines: string[] = []
  for (const requirement of requirements) {
    if (requirement.summaryKind === 'benchmark' && requirement.summary.comparisonNote) {
      lines.push(String(requirement.summary.comparisonNote))
    }
    if (requirement.summaryKind === 'adherence') {
      const unknown = Number(requirement.summary.unknownDays ?? 0)
      if (unknown > 0) {
        lines.push(`${unknown} scheduled supplement days had unknown adherence.`)
      }
    }
    if (requirement.summaryKind === 'sleep' || requirement.summaryKind === 'nutrition' || requirement.summaryKind === 'activity') {
      const observed = Number(requirement.summary.observedDays ?? 0)
      const windowDays = Number(requirement.summary.windowDays ?? 0)
      if (windowDays > 0 && observed < windowDays) {
        lines.push(`${requirement.label} was recorded on ${observed} of ${windowDays} days.`)
      }
    }
  }
  for (const item of descriptive) {
    const unknown = Number(item.summary.unknownDays ?? 0)
    if (unknown > 0) {
      lines.push(`${unknown} scheduled supplement days had unknown adherence.`)
    }
  }
  for (const control of controls) {
    if (control.recordedDayCount > 0) {
      lines.push(`${controlLabel(control.tagKey)} was recorded during the experiment.`)
    }
  }
  return lines
}

function controlLabel(tagKey: string): string {
  const words = tagKey.split('_').join(' ')
  return words.replace(/^\w/, (letter) => letter.toUpperCase())
}

function dailyUnit(kind: string, metricKey: string): string {
  if (kind === 'sleep') return 'minutes'
  if (metricKey === 'steps_count') return 'count'
  if (metricKey === 'resting_heart_rate_bpm') return 'bpm'
  if (metricKey === 'exercise_minutes') return 'minutes'
  if (metricKey === 'active_energy_kcal' || metricKey === 'calories') return 'kcal'
  if (metricKey === 'protein' || metricKey === 'carbs' || metricKey === 'fat') return 'g'
  return metricKey
}

export function classificationCopy(classification: ExperimentResultClassification): { title: string; detail: string } {
  if (classification === 'completed_interpretable') {
    return { title: 'Completed · Interpretable', detail: 'The protocol was completed with the required evidence recorded.' }
  }
  if (classification === 'completed_low_adherence') {
    return {
      title: 'Completed · Low adherence',
      detail: "Outcome evidence was recorded, but adherence was below the protocol's configured threshold.",
    }
  }
  if (classification === 'incomplete') {
    return {
      title: 'Incomplete',
      detail: "One or more required measurements were missing or did not meet the protocol's evidence requirement.",
    }
  }
  if (classification === 'inconclusive') {
    return { title: 'Inconclusive', detail: 'The recorded evidence could not be interpreted under the protocol as configured.' }
  }
  if (classification === 'invalid_protocol') {
    return { title: 'Invalid protocol', detail: 'A material protocol deviation was reported.' }
  }
  return { title: 'Stopped for safety', detail: 'The experiment was stopped because of pain or another safety concern.' }
}

export const RESULT_CAUSALITY_FOOTER =
  'These are recorded personal observations under the protocol. They do not establish causality.'

export function parseResultAttestation(body: unknown):
  | {
      protocolFollowed: ProtocolAttestation
      stoppedForSafety: boolean
      safetyReason: string | null
      ownerNote: string | null
      effectiveEndDate: string | null
      supersedesResultId: string | null
    }
  | { error: string } {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Result review needs an attestation.' }
  }
  const record = body as Record<string, unknown>
  const forbidden = ['classification', 'outcomes', 'adherencePercent', 'values', 'summary', 'fingerprint']
  for (const key of forbidden) {
    if (key in record) {
      return { error: 'Experiment result values come from canonical evidence.' }
    }
  }
  const protocolFollowed = record.protocolFollowed
  if (typeof protocolFollowed !== 'string' || !(PROTOCOL_ATTESTATIONS as readonly string[]).includes(protocolFollowed)) {
    return { error: 'Say whether the protocol was followed.' }
  }
  const stoppedForSafety = record.stoppedForSafety === true
  const safetyReason = optionalBounded(record.safetyReason, 'Safety reason', SAFETY_REASON_MAX)
  if (safetyReason && typeof safetyReason === 'object') return safetyReason
  if (stoppedForSafety && !safetyReason) {
    return { error: 'A safety stop needs a short reason.' }
  }
  const ownerNote = optionalBounded(record.ownerNote, 'Owner note', OWNER_NOTE_MAX)
  if (ownerNote && typeof ownerNote === 'object') return ownerNote
  const effectiveEndDate = record.effectiveEndDate == null || record.effectiveEndDate === '' ? null : String(record.effectiveEndDate)
  if (effectiveEndDate != null && !isCalendarDate(effectiveEndDate)) {
    return { error: 'Use a calendar date for the end date.' }
  }
  const supersedesResultId = record.supersedesResultId == null || record.supersedesResultId === '' ? null : String(record.supersedesResultId)
  return {
    protocolFollowed: protocolFollowed as ProtocolAttestation,
    stoppedForSafety,
    safetyReason,
    ownerNote,
    effectiveEndDate,
    supersedesResultId,
  }
}

function optionalBounded(value: unknown, name: string, max: number): string | null | { error: string } {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return { error: `${name} must be text.` }
  const text = value.trim()
  if (text.length === 0) return null
  if (text.length > max) return { error: `${name} must be ${max} characters or fewer.` }
  return text
}

export async function experimentEvidenceFingerprint(material: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(stableJson(material)))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function fingerprintMaterial(input: {
  experimentId: string
  protocolVersionId: string
  windowStart: string
  plannedWindowEnd: string
  effectiveEndDate: string
  requirements: readonly ExperimentRequirementSpec[]
  evaluation: ExperimentEvaluation
  protocolFollowed: ProtocolAttestation
  stoppedForSafety: boolean
  safetyReason: string | null
}): unknown {
  return {
    experimentId: input.experimentId,
    protocolVersionId: input.protocolVersionId,
    window: {
      windowStart: input.windowStart,
      plannedWindowEnd: input.plannedWindowEnd,
      effectiveEndDate: input.effectiveEndDate,
    },
    requirements: [...input.requirements]
      .map((item) => ({
        id: item.id,
        kind: item.requirementKind,
        required: item.required,
        selector: item.selector,
        criteria: item.criteria,
      }))
      .sort((left, right) => (left.id < right.id ? -1 : 1)),
    evaluations: input.evaluation.requirements.map((item) => ({
      requirementId: item.requirementId,
      evaluationStatus: item.evaluationStatus,
      criterionStatus: item.criterionStatus,
      summary: item.summary,
      evidence: item.evidence.map((evidence) => ({
        kind: evidence.evidenceKind,
        ref: evidence.evidenceRef,
        snapshot: evidence.evidenceSnapshot,
        date: evidence.observationDate,
      })),
    })),
    protocolFollowed: input.protocolFollowed,
    stoppedForSafety: input.stoppedForSafety,
    safetyReason: input.safetyReason,
  }
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableJson(item))
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      sorted[key] = stableJson(record[key])
    }
    return sorted
  }
  if (typeof value === 'number') return roundNumber(value)
  return value
}

function roundNumber(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export function datesThrough(start: string, end: string): string[] {
  const dates: string[] = []
  let cursor = start
  while (cursor <= end) {
    dates.push(cursor)
    cursor = addCalendarDays(cursor, 1)
    if (dates.length > 3660) break
  }
  return dates
}
