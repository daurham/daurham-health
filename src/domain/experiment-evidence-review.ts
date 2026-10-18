import type { ExperimentComparisonSnapshot } from './experiment-comparison-snapshot.js'
import type { FeedbackHistory } from './experiment-evidence-memory.js'
import type { CurrentOutcomeComparison } from './experiment-current-outcomes.js'
import type { OutcomeFeedbackReadiness } from './experiment-outcome-feedback.js'

/** A bounded evidence REVIEW, not a learned treatment response.
 * This never ranks advice, changes targets, or asserts efficacy. Underlying
 * snapshot and feedback must have been verified by the canonical server.
 */
export type ExperimentEvidenceReview = {
  state: 'unavailable' | 'withdrawn' | 'needs_recheck' | 'not_assessable' |
    'source_changed' | 'coverage_changed' | 'source_unverified' |
    'partial_audit' | 'observation_only' | 'context_reported' |
    'context_unsure' | 'none_recalled'
  snapshotRecordedDate: string | null
  observationsAsOf: string | null
  feedbackVersion: number | null
  primaryMetricCount: number
  canRankRecommendations: false
}

export function reviewExperimentEvidence(input: {
  snapshot: ExperimentComparisonSnapshot | null
  snapshotStatus: 'verified' | 'not_recorded' | 'unavailable_integrity_check'
  current: CurrentOutcomeComparison | null
  history: FeedbackHistory
  readiness: OutcomeFeedbackReadiness
}): ExperimentEvidenceReview {
  const empty = (state: ExperimentEvidenceReview['state']): ExperimentEvidenceReview => ({
    state,
    snapshotRecordedDate: input.snapshotStatus === 'verified' ? input.snapshot?.recordedHealthDate ?? null : null,
    observationsAsOf: null, feedbackVersion: null,
    primaryMetricCount: 0, canRankRecommendations: false,
  })
  // Do not project corrupted/non-verified evidence as an owner finding.
  if (input.snapshotStatus !== 'verified' || !input.snapshot ||
      input.history.status === 'unavailable' || input.history.review === 'unavailable') {
    return empty('unavailable')
  }
  const latest = input.history.events[0]
  // The audit parser checked the fingerprint and continuity before exposing
  // these entries. Withdrawn feedback defeats all earlier owner responses.
  if (input.history.review === 'withdrawn' || latest?.action === 'withdrawn') {
    return { ...empty('withdrawn'),feedbackVersion: latest?.version ?? null }
  }
  if (input.readiness.state !== 'ready' || input.history.review === 'needs_recheck') {
    return { ...empty('needs_recheck'),feedbackVersion: latest?.version ?? null }
  }
  // The historical coverage snapshot stays immutable. If current verified
  // prespecified values, recording coverage, or the stored value seal have
  // changed, surface that reason in the *primary* evidence review status,
  // rather than hiding it behind the collapsed current-comparison details.
  // This does not imply a physiological effect or rewrite owner feedback.
  if (input.current?.state === 'unavailable') {
    const status = input.current.reason === 'source_values_changed'
      ? 'source_changed' : input.current.reason === 'changed_coverage'
        ? 'coverage_changed' : input.current.reason === 'source_values_unverified'
          ? 'source_unverified' : 'not_assessable'
    return { ...empty(status),feedbackVersion: latest?.version ?? null }
  }
  if (!input.current || input.current.metrics.length < 1 ||
      input.current.metrics.length > 8 ||
      input.current.asOf <= input.snapshot.recordedHealthDate) {
    return { ...empty('not_assessable'),feedbackVersion: latest?.version ?? null }
  }
  const common = {
    snapshotRecordedDate: input.snapshot.recordedHealthDate,
    observationsAsOf: input.current.asOf,
    feedbackVersion: latest?.version ?? null,
    primaryMetricCount: input.current.metrics.length,
    canRankRecommendations: false as const,
  }
  // More than 25 versions means the history is explicitly partial. The
  // most recent answer may be known, but the complete audit is not shown.
  if (input.history.status === 'partial') return { ...common, state: 'partial_audit' }
  if (input.history.status === 'empty' && input.history.review === 'not_recorded') {
    return { ...common,state: 'observation_only' }
  }
  if (input.history.status !== 'complete' || input.history.review !== 'owner_context_recorded' ||
      !latest || (latest.action !== 'recorded' && latest.action !== 'revised')) {
    return empty('unavailable')
  }
  switch (latest.unloggedFactors) {
    case 'other_changes':
      return { ...common,state:'context_reported' }
    case 'unsure':
      return { ...common,state:'context_unsure' }
    case 'none_reported':
      return { ...common,state:'none_recalled' }
    default:
      return empty('unavailable')
  }
}

export function experimentEvidenceReviewCopy(review: ExperimentEvidenceReview): string {
  switch (review.state) {
    case 'unavailable':
      return 'The stored evidence or owner-feedback audit could not be verified. No finding is available.'
    case 'withdrawn':
      return 'The owner withdrew the latest context report. Earlier answers remain in the private audit, not as current evidence.'
    case 'needs_recheck':
      return 'The result or implementation changed. This observation needs review before it can be considered current.'
    case 'not_assessable':
      return 'A comparable current-record observation is not available. The historical result is unchanged.'
    case 'source_changed':
      return 'Recorded nutrition or sleep outcome values have changed since this result was saved. Current before/after figures are withheld; review the corrected records. The historical result and owner feedback have not been rewritten.'
    case 'coverage_changed':
      return 'Current verified outcome recording coverage no longer matches the saved experiment screen. Before/after figures are withheld; check added, removed, or unverified days. The historical result is preserved.'
    case 'source_unverified':
      return 'The saved outcome has no verifiable original source-value seal, or current records could not be sealed. Historical before/after values cannot be confirmed and are withheld.'
    case 'partial_audit':
      return 'The latest feedback exists, but the full version history is not displayed. Do not treat this as a calibrated finding.'
    case 'observation_only':
      return 'A descriptive before/after difference is available, but no owner follow-up about other factors is recorded.'
    case 'context_reported':
      return 'A descriptive difference is recorded, and the owner reported other circumstances. Those may explain some or all of the difference.'
    case 'context_unsure':
      return 'A descriptive difference is recorded, but the owner was unsure whether other important factors changed.'
    case 'none_recalled':
      return 'A descriptive difference is recorded, and the owner did not recall other changes. This does not establish that no confounders existed.'
  }
}
