import type { OutcomeFeedbackEvent, OutcomeFeedbackReadiness } from './experiment-outcome-feedback.js'

/** PIQ-6.5: bounded owner-only AUDIT of reports, never a medical result or
 * machine-learned clinical fact. A snapshot hash links versions to a recorded
 * coverage screen; it does not prove benefit, effectiveness or causality.
 */
export type FeedbackHistoryEntry = OutcomeFeedbackEvent & { comparisonFingerprint: string }
export type FeedbackHistory = {
  status: 'empty' | 'complete' | 'partial' | 'unavailable'
  events: FeedbackHistoryEntry[]
  review: 'not_recorded' | 'owner_context_recorded' | 'needs_recheck' | 'withdrawn' | 'unavailable'
}
export const MAX_FEEDBACK_HISTORY = 25

/**
 * PIQ-6.5 integrity boundary: the separately queried current feedback must
 * agree exactly with the newest verified append-only audit event. A missing,
 * corrupt, or cross-query inconsistent record is not safe to revise or present
 * as current owner evidence. Even a partial (bounded) audit must have a
 * checked latest entry.
 */
export function reconcileLatestFeedback(history: FeedbackHistory, latest: unknown): {
  verified: boolean
  latest: OutcomeFeedbackEvent | null
} {
  const rejected = { verified: false, latest: null }
  if (history.status === 'unavailable') return rejected
  if (history.status === 'empty') return latest == null ? { verified: true, latest: null } : rejected
  const head = history.events[0]
  if (!head || !latest || typeof latest !== 'object' || Array.isArray(latest)) return rejected
  const row = latest as Record<string, unknown>
  if (row.version !== head.version || row.action !== head.action ||
      row.unloggedFactors !== head.unloggedFactors || row.ownerNote !== head.ownerNote ||
      row.recordedAt !== head.recordedAt) return rejected
  return {
    verified: true,
    latest: {
      version: head.version, action: head.action, unloggedFactors: head.unloggedFactors,
      ownerNote: head.ownerNote, recordedAt: head.recordedAt,
    },
  }
}

function parseRow(value: unknown): FeedbackHistoryEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.version !== 'number' || !Number.isSafeInteger(row.version) || row.version < 1 ||
      (row.action !== 'recorded' && row.action !== 'revised' && row.action !== 'withdrawn') ||
      typeof row.comparisonFingerprint !== 'string' ||
      !/^[0-9a-f]{64}$/.test(row.comparisonFingerprint) ||
      typeof row.recordedAt !== 'string' || !Number.isFinite(Date.parse(row.recordedAt))) return null
  const answer = row.unloggedFactors
  const note = row.ownerNote
  if (row.action === 'withdrawn') {
    if (answer !== null || note !== null || row.version === 1) return null
  } else if (
    (answer !== 'none_reported' && answer !== 'other_changes' && answer !== 'unsure') ||
    (note !== null && (typeof note !== 'string' || note.trim().length < 1 || note.length > 500)) ||
    (answer !== 'other_changes' && note !== null)
  ) return null
  if ((row.version === 1) !== (row.action === 'recorded')) return null
  return {
    version: row.version as number,
    action: row.action as FeedbackHistoryEntry['action'],
    unloggedFactors: answer as FeedbackHistoryEntry['unloggedFactors'],
    ownerNote: note as string | null,
    recordedAt: row.recordedAt,
    comparisonFingerprint: row.comparisonFingerprint,
  }
}

/** A missing record is not a negative finding. Revisions/withdrawals remain
 * visible, but changed implementation/status/coverage suspends interpretation.
 * Even 'owner_context_recorded' is NOT a valid outcome effect estimate.
 */
export function reviewFeedbackHistory(input: {
  rows: unknown
  expectedFingerprint: string | null
  snapshotVerified: boolean
  readiness: OutcomeFeedbackReadiness
}): FeedbackHistory {
  const unavailable: FeedbackHistory = { status: 'unavailable', events: [], review: 'unavailable' }
  if (!Array.isArray(input.rows) || input.rows.length > MAX_FEEDBACK_HISTORY + 1) return unavailable
  if (input.rows.length === 0) return { status: 'empty', events: [], review: 'not_recorded' }
  if (!input.snapshotVerified || !input.expectedFingerprint) return unavailable

  const records: FeedbackHistoryEntry[] = []
  const recent = input.rows.slice(0, MAX_FEEDBACK_HISTORY)
  for (const raw of recent) {
    const event = parseRow(raw)
    if (!event || event.comparisonFingerprint !== input.expectedFingerprint ||
        (records.length > 0 && records[records.length - 1]!.version !== event.version + 1)) return unavailable
    records.push(event)
  }
  if (input.rows.length === MAX_FEEDBACK_HISTORY + 1) {
    const last = parseRow(input.rows[MAX_FEEDBACK_HISTORY])
    if (!last || last.comparisonFingerprint !== input.expectedFingerprint ||
        records[MAX_FEEDBACK_HISTORY - 1]!.version !== last.version + 1) return unavailable
  } else if (records[records.length - 1]?.version !== 1) {
    // Do not pretend missing historical versions have been audited.
    return unavailable
  }
  const latest = records[0]!
  return {
    status: input.rows.length > MAX_FEEDBACK_HISTORY ? 'partial' : 'complete',
    events: records,
    review: latest.action === 'withdrawn' ? 'withdrawn' :
      input.readiness.state !== 'ready' ? 'needs_recheck' : 'owner_context_recorded',
  }
}

export function feedbackHistoryCopy(history: FeedbackHistory): string {
  switch (history.review) {
    case 'not_recorded':
      return 'No owner follow-up has been recorded for this result.'
    case 'withdrawn':
      return 'The latest owner feedback was withdrawn. Earlier versions remain in the private audit history, not as current evidence.'
    case 'needs_recheck':
      return 'Previously reported context needs review because the result, intervention or supporting evidence is no longer eligible. Do not reuse it to rank recommendations.'
    case 'unavailable':
      return 'The feedback audit could not be verified. It is unavailable for learning or recommendation ranking.'
    case 'owner_context_recorded':
      return 'Owner context is recorded and linked to a saved evidence snapshot. This does not establish whether the intervention worked.'
  }
}
