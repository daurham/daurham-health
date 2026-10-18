import { isCalendarDate } from './training.js'
import type { ExperimentComparisonReview } from './experiment-comparison.js'

/** Durable versioned observation COVERAGE record, NOT efficacy or causality.
 * Snapshot only bounded counts, dates and provenance metadata. Never copy
 * free-text owner behavior descriptions, private daily-context notes or PHI.
 */
export type ImplementationProvenance = 'unreported' | 'original' | 'corrected' | 'retracted'
export type ExperimentComparisonSnapshot = {
  snapshotVersion: 1
  recordedHealthDate: string
  implementation: {
    provenance: ImplementationProvenance
    effectiveDate: string | null
    revision: number | null
  }
  review: ExperimentComparisonReview
  /** New v1 records can seal exact eligible source values; legacy v1 omits it. */
  sourceValueSeal?: string | null
  contextRevisionSeal?: string | null
}

export function createExperimentComparisonSnapshot(input: {
  recordedHealthDate: string
  implementationProvenance: ImplementationProvenance
  implementationEffectiveDate: string | null
  implementationRevision: number | null
  review: ExperimentComparisonReview
  sourceValueSeal?: string | null
  contextRevisionSeal?: string | null
}): ExperimentComparisonSnapshot {
  return {
    snapshotVersion: 1,
    recordedHealthDate: input.recordedHealthDate,
    implementation: {
      provenance: input.implementationProvenance,
      effectiveDate: input.implementationEffectiveDate,
      revision: input.implementationRevision,
    },
    review: input.review,
    ...(input.sourceValueSeal !== undefined ? {sourceValueSeal:input.sourceValueSeal} : {}),
    ...(input.contextRevisionSeal !== undefined ? {contextRevisionSeal:input.contextRevisionSeal} : {}),
  }
}

const statuses = ['not_assessable', 'insufficient_coverage', 'descriptive_coverage'] as const
const reasons = {
  no_reported_implementation: 'not_assessable',
  invalid_implementation_date: 'not_assessable',
  no_primary_nutrition_outcome: 'not_assessable',
  unsupported_primary_outcome: 'not_assessable',
  follow_up_in_progress: 'not_assessable',
  insufficient_observations: 'insufficient_coverage',
  inconsistent_sleep_sources: 'insufficient_coverage',
  coverage_screen_met: 'descriptive_coverage',
} as const

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function window(value: unknown): { start: string; end: string } | null | undefined {
  if (value === null) return null
  const w = object(value)
  if (!w || typeof w.start !== 'string' || typeof w.end !== 'string' ||
      !isCalendarDate(w.start) || !isCalendarDate(w.end) || w.start > w.end) return undefined
  return { start: w.start, end: w.end }
}

function days(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0
}

/** Do not trust stored JSONB blindly. Corrupted/unknown snapshots fail closed. */
export function parseExperimentComparisonSnapshot(value: unknown): ExperimentComparisonSnapshot | null {
  const root = object(value)
  if (!root || root.snapshotVersion !== 1 ||
      typeof root.recordedHealthDate !== 'string' || !isCalendarDate(root.recordedHealthDate)) return null
  const impl = object(root.implementation)
  const source = impl?.provenance
  if (source !== 'unreported' && source !== 'original' && source !== 'corrected' && source !== 'retracted') return null
  const date = impl?.effectiveDate
  const revision = impl?.revision
  if (date !== null && (typeof date !== 'string' || !isCalendarDate(date))) return null
  if (source === 'original' || source === 'corrected') {
    if (date === null) return null
  } else if (date !== null) return null
  if (source === 'corrected' || source === 'retracted') {
    if (!days(revision) || revision < 1) return null
  } else if (revision !== null) return null

  const sourceSeal = root.sourceValueSeal
  if (sourceSeal !== undefined && sourceSeal !== null &&
      (typeof sourceSeal !== 'string' || !/^[0-9a-f]{64}$/.test(sourceSeal))) return null
  const contextSeal=root.contextRevisionSeal
  if(contextSeal!==undefined&&contextSeal!==null&&
     (typeof contextSeal!=='string'||!/^[0-9a-f]{64}$/.test(contextSeal)))return null
  const review = object(root.review)
  if (!review || !statuses.includes(review.state as typeof statuses[number]) ||
      typeof review.reason !== 'string' || !(review.reason in reasons) ||
      reasons[review.reason as keyof typeof reasons] !== review.state ||
      !Array.isArray(review.metrics)) return null
  const baseline = window(review.baselineWindow)
  const followUp = window(review.followUpWindow)
  if (baseline === undefined || followUp === undefined) return null
  if (followUp !== null && baseline === null) return null
  const metrics: ExperimentComparisonReview['metrics'] = []
  for (const entry of review.metrics) {
    const m = object(entry)
    if (!m || typeof m.requirementId !== 'string' || !m.requirementId ||
        (m.outcomeKind !== 'nutrition_metric' && m.outcomeKind !== 'sleep_metric') ||
        typeof m.metricKey !== 'string' || !m.metricKey ||
        !days(m.beforeDays) || !days(m.afterDays) ||
        !days(m.beforeExpected) || !days(m.afterExpected) ||
        m.beforeDays > m.beforeExpected || m.afterDays > m.afterExpected) return null
    metrics.push({
      requirementId: m.requirementId,
      outcomeKind: m.outcomeKind,
      metricKey: m.metricKey,
      beforeDays: m.beforeDays, afterDays: m.afterDays,
      beforeExpected: m.beforeExpected, afterExpected: m.afterExpected,
    })
  }
  return {
    snapshotVersion: 1, recordedHealthDate: root.recordedHealthDate,
    implementation: { provenance: source, effectiveDate: date, revision },
    ...(sourceSeal !== undefined ? {sourceValueSeal:sourceSeal as string | null} : {}),
    ...(contextSeal !== undefined ? {contextRevisionSeal:contextSeal as string | null} : {}),
    review: {
      state: review.state as ExperimentComparisonReview['state'],
      reason: review.reason as ExperimentComparisonReview['reason'],
      baselineWindow: baseline, followUpWindow: followUp, metrics,
    },
  }
}
