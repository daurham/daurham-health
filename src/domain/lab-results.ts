import { isCalendarDate } from './training.js'
import {
  canonicalNumber,
  evaluateOutcome,
  type Evaluation,
  type EvidencePiece,
  type EvidencePool,
  type OutcomeRequirement,
  type TrainingSource,
} from './lab-evaluators.js'

export const RESULT_CAPABLE_KINDS = [
  'training_measure',
  'body_metric',
  'nutrition_metric',
  'activity_metric',
  'sleep_metric',
] as const

export const PREVIEW_STATES = [
  'eligible',
  'missing_primary',
  'ambiguous',
  'unsupported',
  'duplicate',
  'conflicting_dates',
] as const
export type PreviewState = (typeof PREVIEW_STATES)[number]

export const INVALIDATION_REASON_MAX = 500

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FORBIDDEN_RESULT_FIELDS = ['resultDate', 'totalReps', 'largestSet', 'values', 'value', 'unit']

export type ResultRequest = {
  protocolVersionId: string
  workoutSessionId: string | null
  measurementId: string | null
  date: string | null
  evidenceSelections: Record<string, string>
  ownerAttested: boolean
  experimentId: string | null
  supersedesResultId: string | null
}

export type PreviewOutcome = {
  requirementId: string
  role: string
  label: string
  status: Evaluation['status']
  reason: string | null
  value: number | null
  unit: string | null
  valueKind: 'observed' | 'derived' | null
  resultDate: string | null
  candidates: Array<{ id: string; label: string; resultDate: string }>
  evidence: EvidencePiece[]
}

type EvaluatedOutcome = PreviewOutcome & { training: TrainingSource[] }

export type ResultContextView = {
  recorded: boolean
  tags: string[]
  note: string | null
  controls: Array<{ tagKey: string; recorded: boolean }>
}

export type BenchmarkPreview = {
  state: PreviewState
  canCommit: boolean
  resultDate: string | null
  protocolVersionId: string
  protocolVersion: number
  confirmation: 'linked_protocol' | 'owner_attested' | null
  attestationRequired: boolean
  protocolMismatch: boolean
  experimentConflict: boolean
  experimentId: string | null
  outcomes: PreviewOutcome[]
  context: ResultContextView | null
  existingResultId: string | null
  message: string | null
  fingerprintMaterial: FingerprintMaterial | null
}

export type FingerprintMaterial = {
  benchmarkDefinitionId: string
  protocolVersionId: string
  resultDate: string
  outcomes: Array<{
    requirementId: string
    value: string
    unit: string
    evidence: Array<{
      evidenceKind: string
      observationDate: string
      ref: Record<string, unknown>
      values: Record<string, unknown>
    }>
  }>
}

export type StoredBenchmarkResult = {
  id: string
  benchmarkDefinitionId: string
  protocolVersionId: string
  protocolVersion: number
  resultDate: string
  status: 'valid' | 'invalidated'
  createdAt: string
  values: Array<{ requirementId: string; label: string; role: string; value: number; unit: string }>
}

export function benchmarkOutcomeRoleError(
  requirements: ReadonlyArray<{ role: string; requirementKind: string }>,
): string | null {
  const outcomes = requirements.filter((item) => item.role === 'primary_outcome' || item.role === 'secondary_outcome')
  if (!outcomes.some((item) => item.role === 'primary_outcome' && isResultCapable(item.requirementKind))) {
    return 'A benchmark protocol needs a primary outcome Health can calculate.'
  }
  if (outcomes.some((item) => !isResultCapable(item.requirementKind))) {
    return 'Benchmark outcomes must be a training, body, nutrition, activity, or sleep measurement.'
  }
  return null
}

export function isResultCapable(kind: string): boolean {
  return (RESULT_CAPABLE_KINDS as readonly string[]).includes(kind)
}

export function parseResultRequest(body: unknown): ResultRequest | { error: string } {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Result evidence is required.' }
  }
  const record = body as Record<string, unknown>
  for (const key of FORBIDDEN_RESULT_FIELDS) {
    if (key in record) {
      return { error: 'Benchmark values and the result date come from canonical evidence.' }
    }
  }
  if (typeof record.protocolVersionId !== 'string' || !UUID.test(record.protocolVersionId)) {
    return { error: 'Choose a protocol version.' }
  }
  const workoutSessionId = optionalUuid(record.workoutSessionId, 'Workout')
  if (typeof workoutSessionId !== 'string' && workoutSessionId !== null) {
    return workoutSessionId
  }
  const measurementId = optionalUuid(record.measurementId, 'Measurement')
  if (typeof measurementId !== 'string' && measurementId !== null) {
    return measurementId
  }
  const experimentId = optionalUuid(record.experimentId, 'Experiment')
  if (typeof experimentId !== 'string' && experimentId !== null) {
    return experimentId
  }
  const supersedesResultId = optionalUuid(record.supersedesResultId, 'Replaced result')
  if (typeof supersedesResultId !== 'string' && supersedesResultId !== null) {
    return supersedesResultId
  }
  if (record.date != null && (typeof record.date !== 'string' || !isCalendarDate(record.date))) {
    return { error: 'Use a calendar date as YYYY-MM-DD.' }
  }
  if (record.ownerAttested != null && typeof record.ownerAttested !== 'boolean') {
    return { error: 'Protocol confirmation must be explicit.' }
  }
  const selections = parseSelections(record.evidenceSelections)
  if ('error' in selections) {
    return selections
  }
  return {
    protocolVersionId: record.protocolVersionId,
    workoutSessionId,
    measurementId,
    date: typeof record.date === 'string' ? record.date : null,
    evidenceSelections: selections.selections,
    ownerAttested: record.ownerAttested === true,
    experimentId,
    supersedesResultId,
  }
}

export function selectionFor(
  requirementId: string,
  request: Pick<ResultRequest, 'evidenceSelections' | 'workoutSessionId' | 'measurementId'>,
  kind: string,
): string | undefined {
  const selected = request.evidenceSelections[requirementId]
  if (selected) {
    return selected
  }
  if (kind === 'training_measure' && request.workoutSessionId) {
    return request.workoutSessionId
  }
  return undefined
}

export function composeBenchmarkPreview(input: {
  benchmarkDefinitionId: string
  protocolVersionId: string
  protocolVersion: number
  requirements: readonly OutcomeRequirement[]
  pool: EvidencePool
  request: ResultRequest
  context: ResultContextView | null
  existingResultId: string | null
}): BenchmarkPreview {
  const outcomes = input.requirements
    .filter((requirement) => requirement.role === 'primary_outcome' || requirement.role === 'secondary_outcome')
    .map((requirement) => {
      const evaluation = evaluateOutcome(requirement, input.pool, selectionFor(requirement.id, input.request, requirement.requirementKind))
      return toPreviewOutcome(requirement, evaluation)
    })
  const primaries = outcomes.filter((outcome) => outcome.role === 'primary_outcome')
  const confirmation = resolveProtocolConfirmation(input.protocolVersionId, outcomes)
  const dates = new Set(outcomes.flatMap((outcome) => (outcome.resultDate ? [outcome.resultDate] : [])))
  if (input.request.date && dates.size === 1 && !dates.has(input.request.date)) {
    dates.add(input.request.date)
  }
  const resultDate = dates.size === 1 ? [...dates][0] ?? null : null
  let state: PreviewState = 'eligible'
  let message: string | null = null
  if (primaries.length === 0 || primaries.some((outcome) => outcome.status === 'unsupported')) {
    state = 'unsupported'
    message = primaries.find((outcome) => outcome.status === 'unsupported')?.reason ?? 'This protocol has no primary outcome Health can calculate.'
  } else if (outcomes.some((outcome) => outcome.status === 'ambiguous')) {
    state = 'ambiguous'
    message = outcomes.find((outcome) => outcome.status === 'ambiguous')?.reason ?? 'Choose which observation to use.'
  } else if (primaries.some((outcome) => outcome.status === 'missing')) {
    state = 'missing_primary'
    message = 'A primary outcome has no canonical observation.'
  } else if (dates.size !== 1) {
    state = 'conflicting_dates'
    message = 'These outcomes do not share one Health date.'
  }
  const material = state === 'eligible' && resultDate ? fingerprintMaterial(input.benchmarkDefinitionId, input.protocolVersionId, resultDate, outcomes) : null
  if (state === 'eligible' && input.existingResultId) {
    state = 'duplicate'
    message = 'An existing benchmark result already used this evidence.'
  }
  const attestationRequired = state === 'eligible' && confirmation.confirmation === 'owner_attested'
  const canCommit = state === 'eligible' && (!attestationRequired || input.request.ownerAttested)
  if (attestationRequired && !input.request.ownerAttested) {
    message = 'Confirm that this observation followed the protocol.'
  }
  return {
    state,
    canCommit,
    resultDate: state === 'conflicting_dates' ? null : resultDate,
    protocolVersionId: input.protocolVersionId,
    protocolVersion: input.protocolVersion,
    confirmation: confirmation.confirmation,
    attestationRequired,
    protocolMismatch: confirmation.mismatch,
    experimentConflict: confirmation.experimentConflict,
    experimentId: confirmation.experimentId,
    outcomes: outcomes.map((outcome) => withoutTraining(outcome)),
    context: resultDate ? input.context : null,
    existingResultId: state === 'duplicate' ? input.existingResultId : null,
    message,
    fingerprintMaterial: state === 'duplicate' || state === 'eligible' ? material : null,
  }
}

export function resolveProtocolConfirmation(
  protocolVersionId: string,
  outcomes: readonly EvaluatedOutcome[],
): { confirmation: 'linked_protocol' | 'owner_attested'; mismatch: boolean; experimentId: string | null; experimentConflict: boolean } {
  const training = outcomes.flatMap((outcome) => outcome.training ?? [])
  const usesOtherEvidence = outcomes.some(
    (outcome) => outcome.status === 'available' && outcome.evidence.some((item) => item.evidenceKind !== 'training_session'),
  )
  const mismatch = training.some(
    (item) => item.benchmarkProtocolVersionId != null && item.benchmarkProtocolVersionId !== protocolVersionId,
  )
  const experimentIds = [...new Set(training.flatMap((item) => (item.experimentId ? [item.experimentId] : [])))]
  const linked =
    !mismatch &&
    !usesOtherEvidence &&
    training.length > 0 &&
    training.every((item) => item.benchmarkProtocolVersionId === protocolVersionId)
  return {
    confirmation: linked ? 'linked_protocol' : 'owner_attested',
    mismatch,
    experimentId: experimentIds.length === 1 ? experimentIds[0] ?? null : null,
    experimentConflict: experimentIds.length > 1,
  }
}

export function experimentLinkError(resolvedExperimentId: string | null, requestedExperimentId: string | null): string | null {
  if (requestedExperimentId == null) {
    return null
  }
  if (requestedExperimentId !== resolvedExperimentId) {
    return 'This workout is not part of that experiment.'
  }
  return null
}

export function protocolMismatchError(mismatch: boolean): string | null {
  if (!mismatch) {
    return null
  }
  return 'This workout is linked to a different benchmark protocol.'
}

export async function evidenceFingerprint(material: FingerprintMaterial): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalEvidenceJson(material))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function canonicalEvidenceJson(material: FingerprintMaterial): string {
  return JSON.stringify(stableJson(material))
}

export function latestValidBenchmarkResult<T extends { benchmarkDefinitionId: string; protocolVersionId: string; status: string; resultDate: string; createdAt: string }>(
  results: readonly T[],
  benchmarkDefinitionId: string,
  protocolVersionId: string,
): T | null {
  const matches = results.filter(
    (result) =>
      result.status === 'valid' &&
      result.benchmarkDefinitionId === benchmarkDefinitionId &&
      result.protocolVersionId === protocolVersionId,
  )
  matches.sort((left, right) => {
    if (left.resultDate !== right.resultDate) {
      return left.resultDate < right.resultDate ? 1 : -1
    }
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? 1 : -1
    }
    return 0
  })
  return matches[0] ?? null
}

export function sameProtocolValueDelta(previous: number, next: number): { absolute: number; percent: number | null } {
  const absolute = Math.round((next - previous) * 1_000_000) / 1_000_000
  if (previous === 0) {
    return { absolute, percent: null }
  }
  return { absolute, percent: Math.round((absolute / previous) * 100 * 1_000_000) / 1_000_000 }
}

export function compareBenchmarkResults(
  previous: StoredBenchmarkResult,
  next: StoredBenchmarkResult,
): Array<{ requirementId: string; label: string; previousValue: number; nextValue: number; absolute: number; percent: number | null }> | null {
  if (previous.status !== 'valid' || next.status !== 'valid') {
    return null
  }
  if (previous.benchmarkDefinitionId !== next.benchmarkDefinitionId || previous.protocolVersionId !== next.protocolVersionId) {
    return null
  }
  const deltas = []
  for (const value of next.values) {
    const prior = previous.values.find((item) => item.requirementId === value.requirementId)
    if (!prior) {
      continue
    }
    const delta = sameProtocolValueDelta(prior.value, value.value)
    deltas.push({
      requirementId: value.requirementId,
      label: value.label,
      previousValue: prior.value,
      nextValue: value.value,
      absolute: delta.absolute,
      percent: delta.percent,
    })
  }
  return deltas
}

export function protocolChangeNote(versions: ReadonlyArray<{ version: number; validResultCount: number }>): string | null {
  const present = versions.filter((item) => item.validResultCount > 0).sort((left, right) => left.version - right.version)
  if (present.length < 2) {
    return null
  }
  if (present.length === 2) {
    return `Protocol changed from v${present[0]?.version} to v${present[1]?.version}. Results are retained but not directly compared.`
  }
  const labels = present.map((item) => `v${item.version}`)
  const last = labels.pop()
  return `Protocol changed across ${labels.join(', ')}, and ${last}. Results are retained but not directly compared.`
}

export function visibleBenchmarkResults<T extends { status: string }>(results: readonly T[], includeInvalidated: boolean): T[] {
  if (includeInvalidated) {
    return [...results]
  }
  return results.filter((result) => result.status === 'valid')
}

function withoutTraining(outcome: EvaluatedOutcome): PreviewOutcome {
  return {
    requirementId: outcome.requirementId,
    role: outcome.role,
    label: outcome.label,
    status: outcome.status,
    reason: outcome.reason,
    value: outcome.value,
    unit: outcome.unit,
    valueKind: outcome.valueKind,
    resultDate: outcome.resultDate,
    candidates: outcome.candidates,
    evidence: outcome.evidence,
  }
}

function fingerprintMaterial(
  benchmarkDefinitionId: string,
  protocolVersionId: string,
  resultDate: string,
  outcomes: readonly PreviewOutcome[],
): FingerprintMaterial {
  const included = outcomes
    .filter((outcome) => outcome.status === 'available' && outcome.value != null && outcome.unit)
    .sort((left, right) => left.requirementId.localeCompare(right.requirementId))
  return {
    benchmarkDefinitionId,
    protocolVersionId,
    resultDate,
    outcomes: included.map((outcome) => ({
      requirementId: outcome.requirementId,
      value: canonicalNumber(outcome.value ?? 0),
      unit: outcome.unit ?? '',
      evidence: outcome.evidence
        .map((item) => ({
          evidenceKind: item.evidenceKind,
          observationDate: item.observationDate,
          ref: item.evidenceRef,
          values: snapshotValues(item),
        }))
        .sort((left, right) => JSON.stringify(stableJson(left)).localeCompare(JSON.stringify(stableJson(right)))),
    })),
  }
}

function snapshotValues(evidence: EvidencePiece): Record<string, unknown> {
  if (evidence.evidenceKind === 'training_session') {
    const sets = Array.isArray(evidence.evidenceSnapshot.sets) ? evidence.evidenceSnapshot.sets : []
    return { sets }
  }
  if (evidence.evidenceKind === 'body_metric') {
    return { value: evidence.evidenceSnapshot.value, unit: evidence.evidenceSnapshot.unit }
  }
  if (evidence.evidenceKind === 'nutrition_day') {
    return { entries: evidence.evidenceSnapshot.entries }
  }
  if (evidence.evidenceKind === 'activity_day') {
    return { value: evidence.evidenceSnapshot.value, unit: evidence.evidenceSnapshot.unit }
  }
  return { totalSleepMinutes: evidence.evidenceSnapshot.totalSleepMinutes }
}

function toPreviewOutcome(requirement: OutcomeRequirement, evaluation: Evaluation): EvaluatedOutcome {
  if (evaluation.status === 'available') {
    return {
      requirementId: requirement.id,
      role: requirement.role,
      label: requirement.label,
      status: 'available',
      reason: null,
      value: evaluation.value,
      unit: evaluation.unit,
      valueKind: evaluation.valueKind,
      resultDate: evaluation.resultDate,
      candidates: [],
      evidence: evaluation.evidence,
      training: evaluation.training ? [evaluation.training] : [],
    }
  }
  return {
    requirementId: requirement.id,
    role: requirement.role,
    label: requirement.label,
    status: evaluation.status,
    reason: evaluation.reason,
    value: null,
    unit: null,
    valueKind: null,
    resultDate: null,
    candidates: evaluation.status === 'ambiguous' ? evaluation.candidates : [],
    evidence: [],
    training: [],
  }
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableJson(item))
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      sorted[key] = stableJson(record[key])
    }
    return sorted
  }
  return value
}

function optionalUuid(value: unknown, name: string): string | null | { error: string } {
  if (value == null || value === '') {
    return null
  }
  if (typeof value !== 'string' || !UUID.test(value)) {
    return { error: `${name} id is not valid.` }
  }
  return value
}

function parseSelections(value: unknown): { selections: Record<string, string> } | { error: string } {
  if (value == null) {
    return { selections: {} }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Evidence selections must identify a canonical observation.' }
  }
  const selections: Record<string, string> = {}
  for (const [requirementId, sourceId] of Object.entries(value)) {
    if (!UUID.test(requirementId) || typeof sourceId !== 'string' || !UUID.test(sourceId)) {
      return { error: 'Evidence selections must identify a canonical observation.' }
    }
    selections[requirementId] = sourceId
  }
  return { selections }
}
