import { experimentNeedsReview, EXPERIMENT_RESULT_CLASSIFICATIONS, type ExperimentResultClassification } from './experiment-results.js'
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
}

export type CoachLinkedLabRow = {
  id: unknown
  origin: unknown
  status: unknown
  window_start: unknown
  window_end: unknown
  result_id: unknown
  classification: unknown
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
  const recorded = (status === 'completed' || status === 'inconclusive') &&
    typeof row.result_id === 'string' && UUID.test(row.result_id) &&
    typeof row.classification === 'string' &&
    (EXPERIMENT_RESULT_CLASSIFICATIONS as readonly string[]).includes(row.classification)
  const resultId = recorded ? row.result_id as string : null
  const classification = recorded ? row.classification as ExperimentResultClassification : null
  return {
    id: row.id, status, windowStart, windowEnd,
    reviewReady: experimentNeedsReview({ status, windowEnd, today, hasValidResult: resultId != null }),
    resultId, classification,
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
