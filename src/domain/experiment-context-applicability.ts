import type { ExperimentComparisonSnapshot } from './experiment-comparison-snapshot.js'

/** Metadata-only, on-demand applicability SIGNAL. No original goal/profile
 * baselines were frozen in v1 coverage snapshots, so absence of a later
 * revision is NEVER proof that old advice remains applicable.
 */
export type ExperimentContextApplicability = {
  state: 'needs_recheck' | 'not_established' | 'unavailable'
  asOf: string
  snapshotCapturedAt: string | null
  profileChangedAfterCapture: boolean | null
  linkedGoalChangedAfterCapture: boolean | null
  linkedGoalCount: number | null
  canRankRecommendations: false
}

type Metadata = {
  profile_changed: unknown
  linked_goal_changed: unknown
  linked_goal_count: unknown
}

export function assessExperimentContextApplicability(input: {
  snapshot: ExperimentComparisonSnapshot | null
  snapshotCapturedAt: string | null
  metadata: unknown
  asOf: string
}): ExperimentContextApplicability {
  const base: ExperimentContextApplicability = {
    state: 'unavailable', asOf: input.asOf,
    snapshotCapturedAt: input.snapshotCapturedAt,
    profileChangedAfterCapture: null,
    linkedGoalChangedAfterCapture: null,
    linkedGoalCount: null,
    canRankRecommendations: false,
  }
  if (!input.snapshot || !input.snapshotCapturedAt ||
      !Number.isFinite(Date.parse(input.snapshotCapturedAt))) return base
  // A captured-at timestamp is merely a threshold for detected revisions.
  // The historical snapshot lacks an initial profile/goal version binding.
  const raw = input.metadata
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const m = raw as Metadata
  if (m.profile_changed !== null && typeof m.profile_changed !== 'boolean') return base
  if (typeof m.linked_goal_changed !== 'boolean' ||
      !Number.isSafeInteger(m.linked_goal_count) ||
      typeof m.linked_goal_count !== 'number' ||
      m.linked_goal_count < 0 || m.linked_goal_count > 10000) return base
  const changed = m.profile_changed === true || m.linked_goal_changed
  return {
    ...base,
    state: changed ? 'needs_recheck' : 'not_established',
    profileChangedAfterCapture: m.profile_changed as boolean | null,
    linkedGoalChangedAfterCapture: m.linked_goal_changed,
    linkedGoalCount: m.linked_goal_count,
  }
}

export function experimentContextApplicabilityCopy(result: ExperimentContextApplicability): string {
  switch (result.state) {
    case 'unavailable':
      return 'Current goal and health-profile revision metadata could not be verified. The historical result is preserved, but present-day applicability is unknown.'
    case 'needs_recheck': {
      const changed = [
        result.profileChangedAfterCapture ? 'health profile' : null,
        result.linkedGoalChangedAfterCapture ? 'experiment-linked goals' : null,
      ].filter(Boolean).join(' and ')
      return `Recheck present-day relevance: the ${changed} were updated after this result was saved. The historical observation has not been changed.`
    }
    case 'not_established':
      return result.linkedGoalCount === 0
        ? 'No revision was detected in the available health profile, but this experiment has no linked goals to compare. Current relevance is not established.'
        : result.profileChangedAfterCapture === null
          ? 'Linked goals have no detected newer revision, but health-profile revision history is unavailable. Current relevance is not established.'
          : 'No newer revisions were detected in the available health profile or linked goals. The original goal/profile versions and changes in circumstances were not frozen, so current relevance is still not established.'
  }
}
