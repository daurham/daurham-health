import type { GoalControlLimitation, GoalControlState } from './goal-control.js'
import type { MaintenanceEvidenceExplanation } from './maintenance.js'
import type { IntelligenceConfidence } from './intelligence/shared.js'

export const COACH_INTELLIGENCE_VERSION = 'coach-intelligence-v1' as const
export const COACH_QUESTION_BUDGET_DAYS = 3 as const

export const COACH_RECOMMENDATION_RESPONSES = [
  'do_this',
  'not_now',
  'not_relevant',
  'turn_into_experiment',
] as const
export type CoachRecommendationResponse = (typeof COACH_RECOMMENDATION_RESPONSES)[number]

export const COACH_RECOMMENDATION_OUTCOMES = [
  'helped',
  'no_change',
  'made_worse',
  'unclear',
] as const
export type CoachRecommendationOutcome = (typeof COACH_RECOMMENDATION_OUTCOMES)[number]

export type CoachRecommendationDraft = {
  fingerprint: string
  sourceId: string
  kind: string
  domain: string
  title: string
  detail: string
  actionText: string
  detailPath: string
  confidence: IntelligenceConfidence
  evidenceExplanation?: MaintenanceEvidenceExplanation
  evidenceRefs: string[]
  priority: number
  experimentEligible: boolean
}

export type CoachRecommendationMemory = {
  id: string
  fingerprint: string
  recommendationKind: string
  responseState: CoachRecommendationResponse | null
  /** True only for a newly acknowledged owner start, never inferred from legacy Review. */
  ownerStarted?: boolean
  suppressUntil: string | null
  followUpOn: string | null
  outcomeState: CoachRecommendationOutcome | null
  lastSurfacedOn: string
}

export type CoachRecommendationView = {
  id: string
  fingerprint: string
  kind: string
  domain: string
  title: string
  detail: string
  actionText: string
  detailPath: string
  confidence: IntelligenceConfidence
  evidenceExplanation?: MaintenanceEvidenceExplanation
  evidenceRefs: string[]
  responseState: CoachRecommendationResponse | null
  /** Opaque exact DB response timestamp; null means never responded. */
  responseAt: string | null
  /** Opaque version of the non-calorie advice and relevant evidence. */
  contextRevision?: string
  experimentEligible: boolean
}

export type CoachRecommendationFollowUp = {
  id: string
  /** Opaque saved owner-start revision, unlike human-readable acceptedOn. */
  responseAt: string
  title: string
  detail: string
  detailPath: string
  acceptedOn: string | null
  followUpOn: string
  /** A genuine past start whose original recommendation is not advised now. */
  historical?: boolean
}

export type CoachFollowUpQuestionDraft = {
  fingerprint: string
  kind: 'follow_up_question'
  domain: string
  title: string
  detail: string
  actionText: string
  detailPath: string
  confidence: 'limited'
  evidenceRefs: string[]
}

export type CoachFollowUpQuestion = CoachFollowUpQuestionDraft & {
  id: string
}

export type CoachIntelligenceState = {
  version: typeof COACH_INTELLIGENCE_VERSION
  asOf: string
  state: 'act' | 'maintain' | 'insufficient_evidence'
  headline: string
  summary: string
  noChangeRecommended: boolean
  nextBestActions: CoachRecommendationView[]
  followUps: CoachRecommendationFollowUp[]
  question: CoachFollowUpQuestion | null
  questionBudgetDays: typeof COACH_QUESTION_BUDGET_DAYS
}

function fingerprint(sourceId: string): string {
  return `coach:i9:${sourceId}`
}

function restAware(
  draft: CoachRecommendationDraft,
  control: GoalControlState,
): CoachRecommendationDraft {
  if (draft.domain !== 'training') return draft
  const adherence = control.trainingAdherence
  // A preferred day already qualified is not a request to train again.
  if (adherence.state === 'rest_day_on_track' &&
      (adherence.todayIntent === 'training_preferred' || adherence.todayIntent === 'training_moved_here')) {
    return {
      ...draft,
      detail: `Today's qualified training already counts toward your target; there is no need to add another session to satisfy Coach. ${draft.detail}`,
      actionText: 'Review next session',
    }
  }
  if (adherence.state !== 'rest_day_on_track' && adherence.state !== 'flexible_week') return draft
  return {
    ...draft,
    detail: `Today is an optional Training day; resting or moving a workout is not a missed-session penalty. ${draft.detail}`,
    actionText: 'Review next session',
  }
}

function opportunityDraft(
  control: GoalControlState,
): CoachRecommendationDraft | null {
  const opportunity = control.primaryOpportunity
  if (!opportunity) return null
  // Both a stale weekly focus and a manually reconstructed Goal Control
  // object must fail closed: only the matching current Maintenance decision
  // may create a numerical calorie review. Never promote its alternative
  // to a standalone primary card.
  if (isCalorieDecisionKind(opportunity.kind)) {
    if (opportunity.kind !== 'review_intake_adjustment' ||
        control.nutritionQuality.state !== 'met' ||
        control.maintenance?.calorieAdjustmentSafety?.status !== 'review_possible' ||
        !control.maintenance.interventions.some((item) =>
          item.id === opportunity.id && item.kind === opportunity.kind)) return null
  }
  const maintenanceExplanation = control.maintenance?.interventions.some((item) => item.id === opportunity.id)
    ? control.maintenance.evidenceExplanation : null
  return restAware({
    fingerprint: fingerprint(opportunity.id),
    sourceId: opportunity.id,
    kind: opportunity.kind,
    domain: opportunity.domain,
    title: opportunity.title,
    detail: opportunity.detail,
    actionText: opportunity.actionText,
    detailPath: opportunity.detailPath,
    // A Maintenance-specific action must use the estimate's own confidence,
    // not the cross-domain Goal Control summary confidence.
    confidence: maintenanceExplanation ? control.maintenance!.estimate.confidence : control.confidence,
    ...(maintenanceExplanation ? { evidenceExplanation: maintenanceExplanation } : {}),
    evidenceRefs: [...opportunity.evidenceRefs],
    priority: 100,
    experimentEligible: opportunity.domain !== 'review',
  }, control)
}

function trainingDrafts(control: GoalControlState): CoachRecommendationDraft[] {
  const progression = control.trainingProgression
  if (!progression?.primaryOpportunity) return []
  const item = progression.primaryOpportunity
  if (control.primaryOpportunity?.id === item.id) return []
  return [restAware({
    fingerprint: fingerprint(item.id),
    sourceId: item.id,
    kind: 'training_progression',
    domain: 'training',
    title: item.title,
    detail: item.detail,
    actionText: item.actionText,
    detailPath: item.detailPath,
    confidence:
      progression.series.find((series) => item.id.endsWith(series.exerciseId))?.confidence ?? control.confidence,
    evidenceRefs: [...item.evidenceRefs],
    priority: 80,
    experimentEligible: true,
  }, control)]
}

function maintenanceDrafts(control: GoalControlState): CoachRecommendationDraft[] {
  if (!control.maintenance) return []
  return control.maintenance.interventions.flatMap((item) => {
    if (item.priority !== 'secondary' || item.kind === 'hold_course') return []
    if (item.kind === 'review_intake_adjustment' && control.nutritionQuality.state !== 'met') return []
    // The activity option is explicitly an alternative to the primary
    // calorie lever; never surface a standalone dangling alternative card.
    if (item.kind === 'review_activity_adjustment' &&
        (control.primaryOpportunity?.kind !== 'review_intake_adjustment' ||
         control.maintenance?.calorieAdjustmentSafety?.status !== 'review_possible' ||
         control.nutritionQuality.state !== 'met')) return []
    const id = `maintenance:${item.id}`
    if (control.primaryOpportunity?.id === item.id) return []
    return [{
      fingerprint: fingerprint(id),
      sourceId: id,
      kind: item.kind,
      domain: item.kind.includes('intake') || item.kind.includes('nutrition') ? 'nutrition' : 'goals',
      title: item.title,
      detail: item.detail,
      actionText: 'Review',
      detailPath: item.detailPath,
      confidence: control.maintenance!.estimate.confidence,
      evidenceExplanation: control.maintenance!.evidenceExplanation,
      evidenceRefs: ['maintenance:estimate', 'maintenance:plateau-state'],
      priority: 70,
      experimentEligible: true,
    }]
  })
}

function limitationDraft(limitation: GoalControlLimitation, control: GoalControlState): CoachRecommendationDraft | null {
  if (!limitation.detailPath) return null
  const nutrition = limitation.code === 'nutrition_quality_floor'
  const goal = limitation.code.startsWith('goal_unknown:')
  const title = nutrition
    ? 'Improve nutrition evidence before changing intake'
    : goal
      ? 'Clarify this goal before changing course'
      : 'Fill the evidence gap before changing course'
  return {
    fingerprint: fingerprint(`evidence:${limitation.code}`),
    sourceId: `evidence:${limitation.code}`,
    kind: 'improve_evidence',
    domain: nutrition ? 'nutrition' : goal ? 'goals' : 'health',
    title,
    detail: limitation.text,
    actionText: 'Add context',
    detailPath: limitation.detailPath,
    confidence: control.confidence,
    evidenceRefs: [`limitation:${limitation.code}`],
    priority: 60,
    experimentEligible: false,
  }
}

export function buildCoachRecommendationDrafts(control: GoalControlState): CoachRecommendationDraft[] {
  if (control.state === 'maintain') return []
  const drafts: CoachRecommendationDraft[] = []
  const primary = opportunityDraft(control)
  if (primary) drafts.push(primary)
  drafts.push(...trainingDrafts(control))
  drafts.push(...maintenanceDrafts(control))
  if (control.state === 'insufficient_evidence') {
    const evidence = control.limitations.map((item) => limitationDraft(item, control)).find((item): item is CoachRecommendationDraft => item != null)
    if (evidence) drafts.push(evidence)
  }
  const seen = new Set<string>()
  return drafts
    .filter((item) => {
      if (seen.has(item.fingerprint)) return false
      seen.add(item.fingerprint)
      return true
    })
    .sort((a, b) => b.priority - a.priority || a.fingerprint.localeCompare(b.fingerprint))
    .slice(0, 3)
}

/** Apply after owner suppression, not merely when drafting: the secondary
 * activity alternative must never survive without its visible calorie parent.
 * This is presentation dependency handling, not an automatic plan mutation. */
export function keepVisibleCoachDependencies(
  drafts: readonly CoachRecommendationDraft[],
): CoachRecommendationDraft[] {
  const intakeParentVisible = drafts.some((item) => item.kind === 'review_intake_adjustment')
  return drafts.filter((item) => item.kind !== 'review_activity_adjustment' || intakeParentVisible)
}

/** A stale settings revision never promotes a numerical calorie-change card.
 * Keep unrelated coaching cards intact; strip the dependent activity alternative.
 */
export function keepCurrentCalorieDecisionDrafts<T extends { kind: string }>(
  drafts: readonly T[],
  revisionCurrent: boolean,
): T[] {
  if (revisionCurrent) return [...drafts]
  return drafts.filter((item) =>
    item.kind !== 'review_intake_adjustment' && item.kind !== 'review_activity_adjustment')
}

/** A historical calorie-review row is actionable only while its original
 * settings revision AND its complete contemporary evidence still qualify.
 * Legacy rows lack this metadata and are therefore never silently upgraded.
 */
export const POSSIBLE_PLATEAU_RESPONSE_GROUP = 'possible_plateau_response' as const

export function isCalorieDecisionKind(kind: string): boolean {
  return kind === 'review_intake_adjustment' || kind === 'review_activity_adjustment'
}

/** A started calorie lever and an activity lever belong to one decision,
 * not two simultaneous prescriptions. Historical owner memory is untouched.
 */
export function keepNonCompetingCalorieDrafts<T extends { kind: string }>(
  drafts: readonly T[],
  activeGroup: boolean,
): T[] {
  return activeGroup ? drafts.filter((draft) => !isCalorieDecisionKind(draft.kind)) : [...drafts]
}

export function storedCoachRecommendationIsCurrent(
  row: { recommendation_kind: string; fingerprint: string; metadata: Record<string, unknown> | null },
  currentDraftFingerprints: ReadonlySet<string>,
  currentDecisionRevision: string | null | undefined,
): boolean {
  if (!isCalorieDecisionKind(row.recommendation_kind)) return true
  const originalRevision = row.metadata?.decisionRevision
  return typeof originalRevision === 'string' && /^[a-f0-9]{32}$/.test(originalRevision) &&
    currentDecisionRevision === originalRevision &&
    currentDraftFingerprints.has(row.fingerprint)
}

/** Filter before applying the UI's 3-item limit, so retired historical
 * calorie rows cannot crowd out a still-current, unrelated owner follow-up.
 */
export function keepCurrentCoachFollowUps<
  T extends { recommendation_kind: string; fingerprint: string; metadata: Record<string, unknown> | null }
>(
  rows: readonly T[],
  currentDraftFingerprints: ReadonlySet<string>,
  currentDecisionRevision: string | null | undefined,
  revisionRechecked: boolean,
  limit = 3,
): T[] {
  return rows.filter((row) =>
    !isCalorieDecisionKind(row.recommendation_kind) ||
      (revisionRechecked && storedCoachRecommendationIsCurrent(
        row, currentDraftFingerprints, currentDecisionRevision))
  ).slice(0, limit)
}

function questionForLimitation(limitation: GoalControlLimitation): Omit<CoachFollowUpQuestionDraft, 'fingerprint' | 'kind' | 'confidence' | 'evidenceRefs'> | null {
  if (!limitation.detailPath) return null
  if (limitation.code === 'nutrition_quality_floor') {
    return {
      domain: 'nutrition',
      title: 'Was recent food logging unusually rough or incomplete?',
      detail: 'A short answer or a few corrected entries can be more useful than changing targets from uncertain intake data.',
      actionText: 'Review nutrition',
      detailPath: limitation.detailPath,
    }
  }
  if (limitation.code.startsWith('missing:sleep')) {
    return {
      domain: 'recovery',
      title: 'Was recent sleep disrupted in a way the imported data would miss?',
      detail: 'Context such as an interrupted night can explain why a short window is less comparable.',
      actionText: 'Add context',
      detailPath: '/check-in',
    }
  }
  if (limitation.code.startsWith('missing:wellness')) {
    return {
      domain: 'recovery',
      title: 'How have energy, soreness, and hunger felt recently?',
      detail: 'A brief check-in can help distinguish a real training signal from a recovery-context gap.',
      actionText: 'Add check-in',
      detailPath: '/check-in',
    }
  }
  if (limitation.code.startsWith('goal_unknown:')) {
    return {
      domain: 'goals',
      title: 'Is this still a goal you want Coach to optimize right now?',
      detail: 'Clarifying the goal can be more useful than generating another recommendation from weak evidence.',
      actionText: 'Review goal',
      detailPath: limitation.detailPath,
    }
  }
  return {
    domain: 'health',
    title: 'Is there recent context Health is missing?',
    detail: limitation.text,
    actionText: 'Add context',
    detailPath: limitation.detailPath,
  }
}

export function buildCoachFollowUpQuestion(control: GoalControlState): CoachFollowUpQuestionDraft | null {
  if (control.state !== 'insufficient_evidence') return null
  const limitation = control.limitations[0]
  if (!limitation) return null
  const question = questionForLimitation(limitation)
  if (!question) return null
  return {
    fingerprint: fingerprint(`question:${limitation.code}`),
    kind: 'follow_up_question',
    confidence: 'limited',
    evidenceRefs: [`limitation:${limitation.code}`],
    ...question,
  }
}

export function recommendationIsSuppressed(memory: CoachRecommendationMemory | undefined, asOf: string): boolean {
  if (!memory?.responseState) return false
  if (memory.responseState === 'not_relevant') return true
  // Historical Review and Experiment-preview clicks were incorrectly persisted
  // as decisions. Only an explicitly acknowledged start may suppress on do_this.
  if (memory.responseState === 'do_this') return memory.ownerStarted === true
  if (memory.responseState === 'turn_into_experiment') return false
  return memory.suppressUntil != null && asOf < memory.suppressUntil
}
