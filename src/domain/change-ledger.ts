export const CHANGE_CANDIDATE_KINDS = ['steps_shift', 'training_frequency_shift', 'hydration_shift'] as const
export type ChangeCandidateKind = (typeof CHANGE_CANDIDATE_KINDS)[number]

export const CHANGE_CANDIDATE_STATUSES = ['open', 'confirmed', 'dismissed'] as const
export type ChangeCandidateStatus = (typeof CHANGE_CANDIDATE_STATUSES)[number]

export type NumericObservation = {
  date: string
  value: number
}

export type ShiftDetection = {
  direction: 'increase' | 'decrease'
  recentMean: number
  baselineMean: number
  delta: number
  deltaPct: number | null
}

export function detectMeanShift(input: {
  recent: readonly NumericObservation[]
  baseline: readonly NumericObservation[]
  minRecent: number
  minBaseline: number
  minRelativePct: number
  minAbsoluteDelta: number
}): ShiftDetection | null {
  const recent = input.recent.filter((item) => Number.isFinite(item.value))
  const baseline = input.baseline.filter((item) => Number.isFinite(item.value))
  if (recent.length < input.minRecent || baseline.length < input.minBaseline) return null
  const recentMean = recent.reduce((sum, item) => sum + item.value, 0) / recent.length
  const baselineMean = baseline.reduce((sum, item) => sum + item.value, 0) / baseline.length
  const delta = recentMean - baselineMean
  const absolute = Math.abs(delta)
  const relativePct = baselineMean === 0 ? null : (absolute / Math.abs(baselineMean)) * 100
  if (absolute < input.minAbsoluteDelta) return null
  if (relativePct != null && relativePct < input.minRelativePct) return null
  return {
    direction: delta >= 0 ? 'increase' : 'decrease',
    recentMean,
    baselineMean,
    delta,
    deltaPct: baselineMean === 0 ? null : (delta / Math.abs(baselineMean)) * 100,
  }
}

export type ChangeLedgerEntry = {
  id: string
  date: string
  kind:
    | 'nutrition_target'
    | 'training_plan'
    | 'goal_started'
    | 'goal_target'
    | 'goal_lifecycle'
    | 'supplement_status'
    | 'experiment_window'
    | 'context_event'
    | 'behavior_change'
  title: string
  detail: string | null
  sourceKind: string
  sourceId: string | null
  status?: ChangeCandidateStatus
  metadata: Record<string, unknown>
}

export type ChangeLedgerResponse = {
  asOf: string
  entries: ChangeLedgerEntry[]
  openCandidates: ChangeLedgerEntry[]
}
