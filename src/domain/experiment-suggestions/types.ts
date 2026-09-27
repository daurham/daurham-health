import type { BenchmarkRetestState } from '../lab-retests.js'
import type { LabRequirement } from '../lab.js'
import type { GoalKind, GoalSelector, GoalTarget } from '../goals.js'

/** `goal_observation` is reserved vocabulary. The registry does not emit it until Lab can evaluate a Goal target exactly. */
export const SUGGESTION_KINDS = ['benchmark_missing_baseline', 'benchmark_retest_due', 'goal_observation'] as const
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number]

export const OPEN_EXPERIMENT_STATUSES = ['proposed', 'accepted', 'scheduled', 'active'] as const

export const ORIGIN_KINDS = ['owner_created', 'deterministic_candidate', 'ai_assisted', 'external_research'] as const
export type OriginKind = (typeof ORIGIN_KINDS)[number]

export type SuggestionProtocolFact = {
  benchmarkDefinitionId: string
  title: string
  active: boolean
  protocolVersionId: string
  protocolVersion: number
  isCurrent: boolean
  instructions: string
  minimumRetestDays: number | null
  suggestedRetestDays: number | null
  retestStatus: BenchmarkRetestState
  anchorResultId: string | null
  anchorResultDate: string | null
  anchorValueLabel: string | null
}

export type SuggestionCover = {
  status: string
  benchmarkDefinitionId: string | null
  goalId: string | null
}

export type SuggestionGoalFact = {
  goalId: string
  goalVersionId: string
  version: number
  status: 'active' | 'paused' | 'completed'
  goalKind: GoalKind
  displayName: string
  selector: GoalSelector
  target: GoalTarget
  targetState: 'satisfied' | 'unmet' | 'unknown'
}

export type SuggestionInput = {
  protocols: readonly SuggestionProtocolFact[]
  covers: readonly SuggestionCover[]
  goals: readonly SuggestionGoalFact[]
}

export type SuggestionEvidence = {
  ref: string
  label: string
}

export type CompiledRequirement = LabRequirement

export type SuggestionProtocolSpec = {
  instructions: string
  durationLabel: string
  requirements: CompiledRequirement[]
  contextControls: Array<{ tagKey: string; controlMode: 'observe' }>
  benchmarkDefinitionId: string | null
  benchmarkProtocolVersionId: string | null
  protocolVersionNumber: number | null
  goalId: string | null
  goalVersionId: string | null
}

export type ExperimentCandidate = {
  candidateId: string
  candidateFingerprint: string
  calculationVersion: 'experiment-suggestions-v1'
  kind: SuggestionKind
  presentation: 'challenge' | 'observation'
  title: string
  question: string
  hypothesis: string
  rationale: string
  limitations: string
  why: string
  protocol: SuggestionProtocolSpec
  evidence: SuggestionEvidence[]
  linkedGoalLabel: string | null
  linkedBenchmarkLabel: string | null
}

export type GoalCompileResult =
  | { supported: true; candidate: ExperimentCandidate }
  | { supported: false; reason: string }

export type SuggestionDraft = {
  candidateRef: string
  title: string
  rationale: string
  evidenceRefs: string[]
}

export type CompiledExperiment = {
  title: string
  question: string
  hypothesis: string
  rationale: string
  instructions: string
  requirements: CompiledRequirement[]
  contextControls: Array<{ tagKey: string; controlMode: 'observe' }>
  benchmarkDefinitionId: string | null
  goalId: string | null
  goalVersionId: string | null
  legacyOrigin: 'evidence_gap' | 'stale_benchmark' | 'goal_plateau' | 'ai_assisted'
  originKind: 'deterministic_candidate' | 'ai_assisted'
  originTrigger: SuggestionKind
  originFingerprint: string
  originEvidence: Record<string, unknown>
}
