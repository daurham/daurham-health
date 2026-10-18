import { addCalendarDays } from './progress/dates.js'
import { isCalendarDate } from './training.js'
import type { ExperimentComparisonSnapshot, ImplementationProvenance } from './experiment-comparison-snapshot.js'
import type { CurrentOutcomeComparison } from './experiment-current-outcomes.js'

export type OutcomeFeedbackAnswer = 'none_reported' | 'other_changes' | 'unsure'
export type OutcomeFeedbackAction = 'recorded' | 'revised' | 'withdrawn'
export type OutcomeFeedbackEvent = {
  version: number
  action: OutcomeFeedbackAction
  unloggedFactors: OutcomeFeedbackAnswer | null
  ownerNote: string | null
  recordedAt: string
}
export type OutcomeFeedbackReadiness = {
  state: 'ready' | 'not_ready'
  reason: 'ready' | 'not_current_result' | 'protocol_not_followed' | 'unsupported_classification' |
    'missing_implementation' | 'implementation_changed' | 'unverified_snapshot' |
    'insufficient_outcome_coverage' | 'follow_up_not_mature' |
    'source_evidence_changed' | 'source_evidence_unverified'
}

export function reviewOutcomeFeedbackReadiness(input: {
  resultStatus: string
  protocolAttestation: string
  classification: string
  stoppedForSafety: boolean
  snapshot: ExperimentComparisonSnapshot | null
  currentImplementation: { provenance: ImplementationProvenance; effectiveDate: string | null; revision: number | null }
  today: string
}): OutcomeFeedbackReadiness {
  const block = (reason: Exclude<OutcomeFeedbackReadiness['reason'], 'ready'>): OutcomeFeedbackReadiness =>
    ({ state: 'not_ready', reason })
  if (input.resultStatus !== 'valid' || input.stoppedForSafety) return block('not_current_result')
  if (input.protocolAttestation !== 'followed') return block('protocol_not_followed')
  // A completed Lab protocol is NOT sufficient by itself to claim an intervention effect.
  if (input.classification !== 'completed_interpretable' && input.classification !== 'inconclusive') {
    return block('unsupported_classification')
  }
  const snap = input.snapshot
  if (!snap) return block('unverified_snapshot')
  if (snap.implementation.provenance !== 'original' && snap.implementation.provenance !== 'corrected') {
    return block('missing_implementation')
  }
  if (!snap.implementation.effectiveDate || input.currentImplementation.provenance === 'retracted' ||
    !input.currentImplementation.effectiveDate) return block('implementation_changed')
  const original = snap.implementation
  const current = input.currentImplementation
  if (original.provenance !== current.provenance ||
      original.effectiveDate !== current.effectiveDate ||
      original.revision !== current.revision) return block('implementation_changed')
  if (snap.review.state !== 'descriptive_coverage' || snap.review.reason !== 'coverage_screen_met' ||
      !snap.review.followUpWindow || !snap.review.baselineWindow || snap.review.metrics.length === 0) {
    return block('insufficient_outcome_coverage')
  }
  // Seven full calendar days after owner-confirmed implementation, irrespective
  // of whether some nonzero minimum number of observations passed early.
  const followUp = snap.review.followUpWindow
  if (!isCalendarDate(input.today) ||
      !isCalendarDate(followUp.end) ||
      !isCalendarDate(followUp.start) ||
      followUp.start !== original.effectiveDate ||
      followUp.end < addCalendarDays(followUp.start, 6) ||
      input.today <= followUp.end ||
      snap.review.metrics.some(m => m.afterExpected < 7 || m.beforeExpected < 7)) {
    return block('follow_up_not_mature')
  }
  return { state: 'ready', reason: 'ready' }
}

/** Page-level availability of a NEW/REVISED feedback report.
 * The result GET already loaded and sealed the prespecified current outcome
 * values; use that verified projection rather than a second costly source
 * read. The POST separately re-verifies source values and its INSERT uses a
 * statement-snapshot CAS because GET is never a write authorization.
 */
export function feedbackReadinessForCurrentOutcomes(
  readiness: OutcomeFeedbackReadiness,
  current: CurrentOutcomeComparison | null,
): OutcomeFeedbackReadiness {
  if (readiness.state !== 'ready') return readiness
  if (current?.state === 'available' && current.reason === 'current_records') {
    return readiness
  }
  return {
    state: 'not_ready',
    reason: current?.reason === 'source_values_changed' ||
      current?.reason === 'changed_coverage'
      ? 'source_evidence_changed' : 'source_evidence_unverified',
  }
}

export function feedbackReadinessCopy(readiness:OutcomeFeedbackReadiness):string {
  switch(readiness.reason) {
    case 'source_evidence_changed':
      return 'New or revised feedback is unavailable because recorded outcome values or verified observation days changed after this result was saved. Review the corrected records. You can still withdraw earlier feedback.'
    case 'source_evidence_unverified':
      return 'New or revised feedback is unavailable because the saved or current outcome values could not be verified against the original source seal. You can still withdraw earlier feedback.'
    default:
      return 'The original record is not currently eligible for a new review. Any previously recorded feedback can still be withdrawn.'
  }
}

export function feedbackPromptCopy(): string {
  return 'These are recording-quality observations, not proof of benefit. Were there other important changes or unlogged factors during the experiment?'
}

export function parseOutcomeFeedbackSubmission(body: unknown):
  | { action: 'record' | 'withdraw'; expectedVersion: number; unloggedFactors: OutcomeFeedbackAnswer | null; ownerNote: string | null }
  | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'A feedback decision is required.' }
  const v = body as Record<string, unknown>
  if (v.confirmFeedback !== true || (v.action !== 'record' && v.action !== 'withdraw')) {
    return { error: 'Explicit owner feedback confirmation is required.' }
  }
  if (typeof v.expectedVersion !== 'number' || !Number.isInteger(v.expectedVersion) ||
      v.expectedVersion < 0 || v.expectedVersion >= 2147483647) {
    return { error: 'The latest feedback version is required. Refresh and try again.' }
  }
  if (v.action === 'withdraw') {
    if (v.unloggedFactors != null || v.ownerNote != null) return { error: 'Withdrawal cannot include a new answer.' }
    return { action: 'withdraw', expectedVersion: v.expectedVersion, unloggedFactors: null, ownerNote: null }
  }
  if (v.unloggedFactors !== 'none_reported' && v.unloggedFactors !== 'other_changes' && v.unloggedFactors !== 'unsure') {
    return { error: 'Choose an answer about other or unlogged factors.' }
  }
  if (v.ownerNote != null && typeof v.ownerNote !== 'string') return { error: 'Feedback notes must be text.' }
  const note = typeof v.ownerNote === 'string' ? v.ownerNote.trim() : ''
  if (note.length > 500) return { error: 'Feedback notes must be 500 characters or fewer.' }
  if (v.unloggedFactors !== 'other_changes' && note.length > 0) {
    return { error: 'Additional details apply only when other changes are reported.' }
  }
  return {
    action: 'record', expectedVersion: v.expectedVersion, unloggedFactors: v.unloggedFactors,
    ownerNote: note || null,
  }
}
