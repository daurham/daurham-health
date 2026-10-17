/**
 * PIQ-6.3: contextual *timing* overlaps from canonical Change Ledger sources.
 * An overlap does NOT establish that a factor affected any measurement.
 * Absence of a recorded overlap does NOT establish control of confounders.
 */
export const COACH_LAB_OVERLAP_KINDS = [
  'nutrition_target', 'training_plan', 'supplement_status', 'daily_context',
  'goal_started', 'confirmed_behavior_shift', 'other_experiment',
] as const
export type CoachLabOverlapKind = typeof COACH_LAB_OVERLAP_KINDS[number]
export type CoachLabOverlapReview = {
  state: 'not_checked' | 'unavailable' | 'none_recorded' | 'recorded'
  observations: Array<{ kind: CoachLabOverlapKind; count: number }>
}
const labels: Record<CoachLabOverlapKind, string> = {
  nutrition_target: 'nutrition target changes',
  training_plan: 'training plan revisions',
  supplement_status: 'supplement status changes',
  daily_context: 'relevant daily context tags',
  goal_started: 'newly started goals',
  confirmed_behavior_shift: 'owner-confirmed activity or hydration shifts',
  other_experiment: 'another owner-reported experiment change',
}

export type CoachLabOverlapRow = {
  experiment_id: unknown
  kind: unknown
  event_count: unknown
}

/** A defensive projection for a bounded SQL count-by-kind query; never
 * interpret malformed or missing values as evidence of no overlapping change.
 */
export function projectCoachLabOverlapReview(
  rows: readonly CoachLabOverlapRow[], experimentId: string,
): CoachLabOverlapReview {
  const observations: CoachLabOverlapReview['observations'] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.experiment_id !== experimentId ||
      typeof row.kind !== 'string' ||
      !(COACH_LAB_OVERLAP_KINDS as readonly string[]).includes(row.kind) ||
      seen.has(row.kind)) return { state: 'unavailable', observations: [] }
    const count = typeof row.event_count === 'number' ? row.event_count
      : typeof row.event_count === 'string' && /^\d+$/.test(row.event_count) ? Number(row.event_count) : NaN
    if (!Number.isSafeInteger(count) || count < 1) {
      return { state: 'unavailable', observations: [] }
    }
    seen.add(row.kind)
    observations.push({ kind: row.kind as CoachLabOverlapKind, count })
  }
  return {
    state: observations.length > 0 ? 'recorded' : 'none_recorded',
    observations: observations.sort((a, b) => COACH_LAB_OVERLAP_KINDS.indexOf(a.kind) - COACH_LAB_OVERLAP_KINDS.indexOf(b.kind)),
  }
}

export function coachLabOverlapCopy(review: CoachLabOverlapReview): string | null {
  switch (review.state) {
    case 'not_checked':
      return null
    case 'unavailable':
      return 'Overlapping-change review unavailable. Do not assume conditions were stable.'
    case 'none_recorded':
      return 'No changes found in the checked records during this observation window. Missing logs, unrecorded changes and baseline quality remain unknown; this does not prove an effect.'
    case 'recorded':
      return 'Other recorded changes overlap this observation window: ' +
        review.observations.map(({ kind, count }) => `${labels[kind]} (${count})`).join('; ') +
        '. These are timing overlaps, not proven confounders or evidence of causation. Review them before interpreting outcomes.'
  }
}
