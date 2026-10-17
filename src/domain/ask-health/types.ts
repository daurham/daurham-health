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
import type { AskNutritionIntegrity } from './nutrition-integrity.js'
import type { FocusedTrainingEvidence } from './focused-training.js'
import type { FocusedDigestiveEvidence } from './focused-digestive.js'
import type { FocusedWeightEnergyEvidence } from './focused-weight-energy.js'
import type { HistoricalWeightEnergyDay } from './focused-weight-energy-history.js'
import type { HistoricalWeightEnergyWindow } from './focused-weight-energy-window.js'
import type { AskContextMode } from './config.js'

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
  /** Private current Goal Control version for cross-source identity checking. */
  versionId?: string
  /** Private fingerprint of the exact weight point read by Goal Control. */
  bodyWeightSourceRevision?: string | null
  /** Private revision of the exact canonical weight series used for projection. */
  bodyWeightProjectionRevision?: string | null
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

/** Current owner-entered DOB may be backcast to calculate age, never height. */
export type AskStableProfileInput = {
  dateOfBirth: string | null
  ageYears: number | null
  heightCm: number | null
  historical: boolean
}

export type AskClinicalProfileInput = {
  /** Explicit owner-entered sex applicable to reference ranges; not gender identity. */
  sexForPhysiology?: 'male' | 'female' | 'other' | null
  persistentHealthContext: string | null
  trainingLimitations: string | null
  dietaryContext: string | null
  conditions: Array<{ name: string; status: 'active' | 'resolved' | 'unknown' }>
  allergies: Array<{ substance: string; reaction: string | null; severity: 'unknown' | 'mild' | 'moderate' | 'severe' }>
  medications: Array<{ name: string; dose: string | null; frequency: string | null; status: 'active' | 'paused' | 'discontinued' }>
}

/** Diagnostics only: never store observation values, question text or evidence IDs here. */
export type AskHealthSourceCoverageAudit = {
  observedSignalCount: number
  selectedObservedSignalCount: number
  unselectedObservedSignalCount: number
}

/** Packet-builder facts only; source loading may still be incomplete. */
export type AskHealthEvidenceSelectionAudit = {
  candidateCount: number
  selectedCount: number
  removedCount: number
  removedSubstantiveCount: number
  maxChars: number
  selectedSerializedChars: number
  exceedsMaxChars: boolean
}

export type AskHealthPacketInput = {
  lens: AskLens
  range: ProgressRange
  asOf: string
  /** Actual Health-local current date, not the historical asOf selection. */
  healthToday?: string
  period: { start: string; end: string }
  generatedAt: string
  question: string
  contextMode?: AskContextMode
  overview: ProgressOverview | null
  activity: ActivityProgressView | null
  /** Cross-read agreement of canonical Activity and shared intelligence values.
   * No extra database read; optional for synthetic/historical inputs.
   */
  activitySnapshotConsistency?: 'not_checked' | 'verified' | 'changed_or_unavailable'
  sleep: SleepProgressView | null
  /** Agreement of two already-loaded current Sleep views, not a late revision attestation. */
  sleepSnapshotConsistency?: 'not_checked' | 'verified' | 'changed_or_unavailable'
  goals: readonly AskGoalInput[]
  experiments: readonly AskExperimentInput[]
  benchmarks: readonly AskBenchmarkInput[]
  supplements: readonly TodaySupplementInput[]
  context: AskContextInput | null
  /** Current context source consistency; optional for historical/test callers. */
  currentContextSourceRecheck?: 'not_checked' | 'verified' | 'changed_or_unavailable'
  patterns: readonly AskPatternInput[]
  focusedTraining?: FocusedTrainingEvidence | null
  focusedDigestive?: FocusedDigestiveEvidence | null
  focusedWeightEnergy?: FocusedWeightEnergyEvidence | null
  focusedWeightEnergyDay?: HistoricalWeightEnergyDay | null
  /** Late source agreement for an explicitly requested historical date/window.
   * Optional only for isolated deterministic fixtures.
   */
  historicalWeightEnergySourceRecheck?: 'not_checked' | 'verified' | 'changed_or_unavailable'
  focusedWeightEnergyWindow?: HistoricalWeightEnergyWindow | null
  stableProfile?: AskStableProfileInput | null
  profile?: AskClinicalProfileInput | null
  intelligence?: RoutedHealthIntelligence | null
  nutritionIntegrity?: AskNutritionIntegrity | null
  maxChars?: number
  sourceCoverageAudit?: AskHealthSourceCoverageAudit | null
}

export type AskHealthPacket = {
  packetVersion: 'ask-health-evidence-v2'
  lens: AskLens
  range: ProgressRange
  rangeStart: string
  rangeEnd: string
  asOf: string
  /** Health-local current date when known; never substitute selected asOf. */
  healthToday?: string
  generatedAt: string
  evidence: AskEvidence[]
  limitations: AskLimitation[]
  contextSummary: {
    knows: IntelligenceContextItem[]
    missing: IntelligenceContextItem[]
  }
  clarification: string | null
  evidenceSelectionAudit?: AskHealthEvidenceSelectionAudit | null
  sourceCoverageAudit?: AskHealthSourceCoverageAudit | null
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
