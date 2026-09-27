import type { BenchmarkRetestView } from '@/domain/lab-retests'
import { healthFetch, readApiError } from '@/lib'

export type { BenchmarkRetestView }

export type LabRequirementPayload = {
  role: string
  domain: string
  requirementKind: string
  selector: Record<string, string>
  label: string
  required: boolean
  criteria?: Record<string, number>
}

export type LabRequirementView = LabRequirementPayload & {
  id: string
  position: number
}

export type LabVersionView = {
  id: string
  version: number
  instructions: string
  minimumRetestDays: number | null
  suggestedRetestDays: number | null
  isCurrent: boolean
  createdAt: string
  requirements: LabRequirementView[]
  contextControls: Array<{ tagKey: string; controlMode: 'observe' }>
}

export type ExperimentSummary = {
  id: string
  title: string
  question: string
  status: string
  origin: string
  windowStart: string | null
  windowEnd: string | null
}

export type ExperimentDetail = {
  id: string
  title: string
  question: string
  hypothesis: string | null
  rationale: string | null
  origin: string
  status: string
  windowStart: string | null
  windowEnd: string | null
  protocolVersionId: string
  createdAt: string
  updatedAt: string
  versions: LabVersionView[]
  currentVersion: LabVersionView | null
  supplements: Array<{ supplementId: string; name: string; role: string }>
  benchmarks: Array<{ benchmarkDefinitionId: string; title: string; role: string; protocolId: string }>
  sessions: Array<{ id: string; workoutDate: string; sessionName: string | null; benchmarkProtocolVersionId: string | null }>
  currentResultId?: string | null
  reviewReady?: boolean
}

export type BenchmarkSummary = {
  id: string
  title: string
  domain: string
  isActive: boolean
  currentVersion: number
  currentVersionId?: string
}

export type BenchmarkDetail = {
  id: string
  title: string
  domain: string
  description: string | null
  isActive: boolean
  protocolId: string
  createdAt: string
  updatedAt: string
  versions: LabVersionView[]
  currentVersion: LabVersionView | null
  sessions: Array<{ id: string; workoutDate: string; sessionName: string | null; benchmarkProtocolVersionId: string }>
}

export type ProtocolWrite = {
  instructions: string
  requirements: LabRequirementPayload[]
  contextTags: string[]
  minimumRetestDays?: number | null
  suggestedRetestDays?: number | null
}

async function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await healthFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as T
}

export function fetchExperiments(): Promise<{ experiments: ExperimentSummary[] }> {
  return sendJson('/api/lab/experiments', 'GET')
}

export function fetchExperiment(id: string): Promise<ExperimentDetail> {
  return sendJson(`/api/lab/experiments/${id}`, 'GET')
}

export function createExperiment(body: unknown): Promise<ExperimentDetail> {
  return sendJson('/api/lab/experiments', 'POST', body)
}

export function updateExperiment(id: string, body: unknown): Promise<ExperimentDetail> {
  return sendJson(`/api/lab/experiments/${id}`, 'PATCH', body)
}

export function deleteExperiment(id: string): Promise<{ deleted: true }> {
  return sendJson(`/api/lab/experiments/${id}`, 'DELETE')
}

export function scheduleExperiment(id: string, windowStart: string, windowEnd: string): Promise<ExperimentDetail> {
  return sendJson(`/api/lab/experiments/${id}/schedule`, 'POST', { windowStart, windowEnd })
}

export function startExperiment(id: string): Promise<ExperimentDetail> {
  return sendJson(`/api/lab/experiments/${id}/start`, 'POST', {})
}

export function acceptExperiment(id: string): Promise<ExperimentDetail> {
  return sendJson(`/api/lab/experiments/${id}/accept`, 'POST', {})
}

export function abandonExperiment(id: string): Promise<ExperimentDetail> {
  return sendJson(`/api/lab/experiments/${id}/abandon`, 'POST', {})
}

export function supersedeExperiment(id: string): Promise<ExperimentDetail> {
  return sendJson(`/api/lab/experiments/${id}/supersede`, 'POST', {})
}

export function addExperimentProtocolVersion(id: string, body: ProtocolWrite): Promise<ExperimentDetail> {
  return sendJson(`/api/lab/experiments/${id}/protocol-version`, 'POST', body)
}

export function fetchBenchmarks(): Promise<{ benchmarks: BenchmarkSummary[] }> {
  return sendJson('/api/lab/benchmarks', 'GET')
}

export function fetchBenchmark(id: string): Promise<BenchmarkDetail> {
  return sendJson(`/api/lab/benchmarks/${id}`, 'GET')
}

export function createBenchmark(body: unknown): Promise<BenchmarkDetail> {
  return sendJson('/api/lab/benchmarks', 'POST', body)
}

export function updateBenchmark(id: string, body: unknown): Promise<BenchmarkDetail> {
  return sendJson(`/api/lab/benchmarks/${id}`, 'PATCH', body)
}

export function addBenchmarkProtocolVersion(id: string, body: ProtocolWrite): Promise<BenchmarkDetail> {
  return sendJson(`/api/lab/benchmarks/${id}/protocol-version`, 'POST', body)
}

export function archiveBenchmark(id: string): Promise<BenchmarkDetail> {
  return sendJson(`/api/lab/benchmarks/${id}/archive`, 'POST', {})
}

export type ResultPreviewOutcome = {
  requirementId: string
  role: string
  label: string
  status: string
  reason: string | null
  value: number | null
  unit: string | null
  valueKind: string | null
  candidates: Array<{ id: string; label: string; resultDate: string }>
}

export type ResultPreview = {
  state: string
  canCommit: boolean
  resultDate: string | null
  protocolVersionId: string
  protocolVersion: number
  confirmation: 'linked_protocol' | 'owner_attested' | null
  attestationRequired: boolean
  experimentId: string | null
  outcomes: ResultPreviewOutcome[]
  context: { recorded: boolean; tags: string[]; note: string | null; controls: Array<{ tagKey: string; recorded: boolean }> } | null
  existingResultId: string | null
  message: string | null
}

export type ResultHistory = {
  protocolChangeNote: string | null
  versions: Array<{
    protocolVersionId: string
    version: number
    isCurrent: boolean
    validResultCount: number
    results: Array<{
      id: string
      resultDate: string
      status: 'valid' | 'invalidated'
      protocolConfirmationKind: string
      invalidationReason: string | null
      values: Array<{ requirementId: string; role: string; label: string; value: number; unit: string; valueKind: string }>
      deltas: Array<{ requirementId: string; label: string; absolute: number; percent: number | null }> | null
    }>
  }>
}

export type ResultEvidence = {
  evidenceKind: string
  observationDate: string
  evidenceRef: Record<string, unknown>
  evidenceSnapshot: Record<string, unknown>
}

export type ResultDetail = {
  id: string
  benchmarkDefinitionId: string
  benchmarkTitle: string
  protocolVersion: number
  resultDate: string
  status: 'valid' | 'invalidated'
  protocolConfirmationKind: 'linked_protocol' | 'owner_attested'
  experiment: { id: string; title: string; status: string } | null
  invalidationReason: string | null
  supersedesResultId: string | null
  supersededBy: string[]
  values: Array<{
    requirementId: string
    role: string
    label: string
    value: number
    unit: string
    valueKind: string
    evidence: ResultEvidence[]
  }>
  context: { recorded: boolean; tags: string[]; note: string | null; controls: Array<{ tagKey: string; recorded: boolean }> }
  deltas: Array<{ requirementId: string; label: string; absolute: number; percent: number | null }> | null
}

export type BenchmarkRetestDetail = {
  isActive: boolean
  asOf: string
  current: BenchmarkRetestView
  history: BenchmarkRetestView[]
}

export function fetchRetests(): Promise<{ asOf: string; retests: BenchmarkRetestView[] }> {
  return sendJson('/api/lab/retests', 'GET')
}

export function fetchBenchmarkRetest(id: string): Promise<BenchmarkRetestDetail> {
  return sendJson(`/api/lab/benchmarks/${id}/retest`, 'GET')
}

export function fetchBenchmarkResults(id: string): Promise<ResultHistory> {
  return sendJson(`/api/lab/benchmarks/${id}/results`, 'GET')
}

export function previewBenchmarkResult(id: string, body: unknown): Promise<ResultPreview> {
  return sendJson(`/api/lab/benchmarks/${id}/results/preview`, 'POST', body)
}

export function commitBenchmarkResult(id: string, body: unknown): Promise<ResultDetail> {
  return sendJson(`/api/lab/benchmarks/${id}/results`, 'POST', body)
}

export function fetchBenchmarkResult(id: string): Promise<ResultDetail> {
  return sendJson(`/api/lab/benchmark-results/${id}`, 'GET')
}

export function invalidateBenchmarkResult(id: string, reason: string): Promise<ResultDetail> {
  return sendJson(`/api/lab/benchmark-results/${id}/invalidate`, 'POST', { reason })
}

export type ExperimentResultView = {
  id?: string
  state?: 'window_in_progress' | 'ready'
  classification: string | null
  classificationCopy: { title: string; detail: string } | null
  canCommit?: boolean
  message?: string | null
  title: string
  question: string
  hypothesis: string | null
  protocolVersion: number
  windowStart: string
  plannedWindowEnd: string
  effectiveEndDate: string | null
  protocolAttestation: string
  stoppedForSafety: boolean
  safetyReason?: string | null
  ownerNote?: string | null
  requirements: Array<{
    requirementId: string
    label: string
    evaluationStatus: string
    criterionStatus: string
    summary: Record<string, unknown>
    evidence?: unknown[]
  }>
  descriptiveAdherence?: Array<{ label: string; summary: Record<string, unknown> }>
  contextControls?: Array<{ tagKey: string; recordedDates: string[]; recordedDayCount: number }>
  limitations: string[]
  footer: string
  status?: string
  invalidationReason?: string | null
}

export function previewExperimentResult(id: string, body: unknown): Promise<ExperimentResultView> {
  return sendJson(`/api/lab/experiments/${id}/result/preview`, 'POST', body)
}

export function commitExperimentResult(id: string, body: unknown): Promise<ExperimentResultView> {
  return sendJson(`/api/lab/experiments/${id}/result`, 'POST', body)
}

export function fetchExperimentResult(id: string): Promise<ExperimentResultView> {
  return sendJson(`/api/lab/experiment-results/${id}`, 'GET')
}

export function invalidateExperimentResult(id: string, reason: string): Promise<ExperimentResultView> {
  return sendJson(`/api/lab/experiment-results/${id}/invalidate`, 'POST', { reason })
}

export function fetchLabProtocolVersion(id: string): Promise<{ id: string; version: number; title: string; benchmarkDefinitionId: string }> {
  return sendJson(`/api/lab/protocol-versions/${id}`, 'GET')
}
