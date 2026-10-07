import type { ActivityProgressView } from '../activity/progress-view.js'
import type { GoalKind, GoalStatus } from '../goals.js'
import type { GoalDeadlineState, GoalTargetState } from '../goal-status.js'
import type { GoalProjectionState } from '../goal-projection.js'
import type { ProgressOverview } from '../progress/overview.js'
import type { ProgressRange } from '../progress/types.js'
import type { SleepProgressView } from '../sleep/progress-view.js'
import type { TodaySupplementInput } from '../supplements/types.js'
import type { IntelligenceContextItem, RoutedHealthIntelligence } from '../intelligence/shared.js'
import type { AskLens } from './config.js'

export type AskEvidenceCoverage = Record<string, number | string | null>

export type AskEvidence = {
  id: string
  domain: string
  label: string
  value: number | string | null
  unit: string | null
  text: string | null
  period: { start: string; end: string } | null
  coverage: AskEvidenceCoverage | null
  detailPath: string | null
  userEntered: boolean
  substantive: boolean
  confidence?: string
  provenance?: string
  evidenceDates?: string[]
}

export type AskLimitation = {
  code: string
  text: string
  evidenceId: string
}

export type AskGoalInput = {
  id: string
  kind: GoalKind
  lifecycle: GoalStatus
  label: string
  targetText: string
  targetState: GoalTargetState
  deadlineState: GoalDeadlineState
  projectionState: GoalProjectionState | null
  projectionReason: string | null
}

export type AskExperimentInput = {
  id: string
  title: string
  question: string
  hypothesis: string | null
  status: string
  classification: string | null
  protocolVersion: number | null
  requirementPass: number | null
  requirementFail: number | null
  requirementMissing: number | null
}

export type AskBenchmarkInput = {
  id: string
  title: string
  protocolVersion: number
  resultDate: string
  label: string
  value: number
  unit: string
}

export type AskContextInput = {
  tagCounts: Record<string, number>
  notedDays: number
  notes: Array<{ date: string; text: string }>
}

export type AskPatternInput = {
  id: string
  text: string
}

export type AskClinicalProfileInput = {
  persistentHealthContext: string | null
  trainingLimitations: string | null
  dietaryContext: string | null
  conditions: Array<{ name: string; status: 'active' | 'resolved' | 'unknown' }>
  allergies: Array<{ substance: string; reaction: string | null; severity: 'unknown' | 'mild' | 'moderate' | 'severe' }>
  medications: Array<{ name: string; dose: string | null; frequency: string | null; status: 'active' | 'paused' | 'discontinued' }>
}

export type AskHealthPacketInput = {
  lens: AskLens
  range: ProgressRange
  asOf: string
  period: { start: string; end: string }
  generatedAt: string
  question: string
  overview: ProgressOverview | null
  activity: ActivityProgressView | null
  sleep: SleepProgressView | null
  goals: readonly AskGoalInput[]
  experiments: readonly AskExperimentInput[]
  benchmarks: readonly AskBenchmarkInput[]
  supplements: readonly TodaySupplementInput[]
  context: AskContextInput | null
  patterns: readonly AskPatternInput[]
  profile?: AskClinicalProfileInput | null
  intelligence?: RoutedHealthIntelligence | null
  maxChars?: number
}

export type AskHealthPacket = {
  packetVersion: 'ask-health-evidence-v2'
  lens: AskLens
  range: ProgressRange
  rangeStart: string
  rangeEnd: string
  asOf: string
  generatedAt: string
  evidence: AskEvidence[]
  limitations: AskLimitation[]
  contextSummary: {
    knows: IntelligenceContextItem[]
    missing: IntelligenceContextItem[]
  }
  clarification: string | null
}

export type AskTurn = {
  role: 'user' | 'assistant'
  text: string
}

export type AskHealthAnswerBlock = {
  text: string
  evidenceRefs: string[]
}

export type AskHealthAnswer = {
  blocks: AskHealthAnswerBlock[]
  limitations: AskHealthAnswerBlock[]
  followUps: string[]
}
