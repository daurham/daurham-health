import {
  experimentNeedsReview, experimentStatusForClassification,
  EXPERIMENT_RESULT_CLASSIFICATIONS, PROTOCOL_ATTESTATIONS,
  type ExperimentResultClassification, type ProtocolAttestation,
} from './experiment-results.js'
import { EXPERIMENT_STATUSES, type ExperimentStatus } from './lab.js'
import { isCalendarDate } from './training.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Canonical Lab status is not evidence of adherence, effectiveness or causation. */
export type CoachLinkedExperiment = {
  id: string
  status: ExperimentStatus
  windowStart: string | null
  windowEnd: string | null
  reviewReady: boolean
  resultId: string | null
  classification: ExperimentResultClassification | null
  /** Owner's finalized protocol attestation, NOT independent proof of execution. */
  protocolAttestation: ProtocolAttestation | null
  stoppedForSafety: boolean | null
  /** Separate voluntary owner report; not inferred from Lab start or date window. */
  implementation: { effectiveDate: string; behaviorChange: string } | null
  implementationRetracted: boolean
}

export type CoachLinkedLabRow = {
  id: unknown
  origin: unknown
  status: unknown
  window_start: unknown
  window_end: unknown
  result_id: unknown
  classification: unknown
  protocol_attestation?: unknown
  stopped_for_safety?: unknown
  implementation_date?: unknown
  implementation_change?: unknown
  implementation_retracted?: unknown
}

function dateOrNull(value: unknown): string | null {
  return typeof value === 'string' && isCalendarDate(value) ? value : null
}

/** Unknown or untrusted Lab values cannot produce a verified Coach status. */
export function projectCoachLinkedExperiment(row: CoachLinkedLabRow, today: string): CoachLinkedExperiment | null {
  if (typeof row.id !== 'string' || !UUID.test(row.id) || row.origin !== 'owner_created' ||
      typeof row.status !== 'string' || !(EXPERIMENT_STATUSES as readonly string[]).includes(row.status)) return null
  const status = row.status as ExperimentStatus
  const windowStart = dateOrNull(row.window_start)
  const windowEnd = dateOrNull(row.window_end)
  const classificationAllowed = typeof row.classification === 'string' &&
    (EXPERIMENT_RESULT_CLASSIFICATIONS as readonly string[]).includes(row.classification)
  const classification = classificationAllowed
    ? row.classification as ExperimentResultClassification : null
  // A valid result must agree with the canonical result->experiment status
  // mapping. Mismatched/malformed rows cannot impersonate an evaluation.
  const recorded = (status === 'completed' || status === 'inconclusive') &&
    typeof row.result_id === 'string' && UUID.test(row.result_id) &&
    classification != null && experimentStatusForClassification(classification) === status
  const resultId = recorded ? row.result_id as string : null
  const protocolAttestation = recorded &&
    typeof row.protocol_attestation === 'string' &&
    (PROTOCOL_ATTESTATIONS as readonly string[]).includes(row.protocol_attestation)
    ? row.protocol_attestation as ProtocolAttestation : null
  const stoppedForSafety = recorded
    ? (row.stopped_for_safety === true || classification === 'stopped_safety'
      ? true : row.stopped_for_safety === false ? false : null)
    : null
  const implementationDate = dateOrNull(row.implementation_date)
  const implementationText = typeof row.implementation_change === 'string' ? row.implementation_change.trim() : ''
  const implementedInWindow = windowStart != null && windowEnd != null &&
    implementationDate != null && implementationDate >= windowStart &&
    implementationDate <= windowEnd && implementationDate <= today &&
    ['active', 'completed', 'inconclusive', 'abandoned', 'superseded'].includes(status)
  const implementationRetracted = row.implementation_retracted === true
  const implementation = !implementationRetracted && implementedInWindow &&
    implementationText.length > 0 && implementationText.length <= 500
    ? { effectiveDate: implementationDate, behaviorChange: implementationText } : null
  return {
    id: row.id, status, windowStart, windowEnd,
    reviewReady: experimentNeedsReview({ status, windowEnd, today, hasValidResult: resultId != null }),
    resultId, classification: recorded ? classification : null,
    protocolAttestation, stoppedForSafety, implementation, implementationRetracted,
  }
}

/** Describe state only; never turn Lab workflow into a medical or causal conclusion. */
export function coachLinkedExperimentCopy(link: CoachLinkedExperiment): string {
  switch (link.status) {
    case 'proposed':
      return 'Proposed in Lab; not accepted or started.'
    case 'accepted':
      return 'Accepted in Lab; not scheduled or started.'
    case 'scheduled':
      return 'Scheduled in Lab; not started.'
    case 'active':
      return link.reviewReady
        ? 'Marked active in Lab; observation window ended. Review the evidence before drawing conclusions.'
        : 'Marked active in Lab; adherence and outcomes are not verified.'
    case 'completed':
      return link.resultId == null
        ? 'Lab marked complete; a valid result was not found.'
        : link.classification === 'completed_low_adherence'
          ? 'Lab result recorded with low adherence; no proven benefit.'
          : 'Lab result recorded; this alone does not establish causation or benefit.'
    case 'inconclusive':
      return link.resultId == null
        ? 'Lab marked inconclusive; a valid result was not found.'
        : 'Lab result recorded as inconclusive; no proven benefit.'
    case 'abandoned':
      return 'Abandoned in Lab; historical association only.'
    case 'superseded':
      return 'Superseded in Lab; historical association only.'
  }
}


/** PIQ-6.1: This is voluntary owner testimony about protocol follow-through,
 * not a measured behavior delta or an independent clinical conclusion.
 * A completed/valid result can still be weak or inconclusive evidence.
 */
export function coachLinkedImplementationEvidenceCopy(link: CoachLinkedExperiment): string | null {
  if (!link.resultId) return null
  if (link.stoppedForSafety === true || link.classification === 'stopped_safety') {
    return 'The Lab result records a safety stop; do not infer completed implementation or benefit.'
  }
  switch (link.protocolAttestation) {
    case 'followed':
      return 'Owner reported following the protocol; actual adherence and benefit are not independently verified.'
    case 'not_followed':
      return 'Owner reported not following the protocol; implementation is not established.'
    case 'uncertain':
      return 'Owner is uncertain whether the protocol was followed; implementation is not established.'
    default:
      return 'No valid protocol-following attestation was available; implementation cannot be confirmed.'
  }
}
