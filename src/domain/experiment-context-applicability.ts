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
  contextBaselineComparison?: 'matched' | 'changed' | 'legacy' | 'unavailable'
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
  currentContextSeal?: string | null
  currentLinkedGoalCount?: number | null
}): ExperimentContextApplicability {
  const base: ExperimentContextApplicability = {
    state: 'unavailable', asOf: input.asOf,
    snapshotCapturedAt: input.snapshotCapturedAt,
    profileChangedAfterCapture: null,
    linkedGoalChangedAfterCapture: null,
    linkedGoalCount: null,
    canRankRecommendations: false,
    contextBaselineComparison: 'unavailable',
  }
  if (!input.snapshot || !input.snapshotCapturedAt ||
      !Number.isFinite(Date.parse(input.snapshotCapturedAt))) return base
  // New snapshots carry a hashed original goal/profile revision baseline.
  // No-mismatch remains NOT ESTABLISHED: physiology and circumstances may differ.
  if(Object.prototype.hasOwnProperty.call(input.snapshot,'contextRevisionSeal')){
    const original=input.snapshot.contextRevisionSeal
    const current=input.currentContextSeal
    const count=input.currentLinkedGoalCount
    if(!original||!current||!Number.isSafeInteger(count)||
       count==null||count<0||count>1)return base
    const same=original===current
    return {...base,state:same?'not_established':'needs_recheck',
      linkedGoalCount:count,
      contextBaselineComparison:same?'matched':'changed'}
  }
  // Legacy-only updated-at screening cannot catch link replacement.
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
    contextBaselineComparison: 'legacy',
  }
}

export function experimentContextApplicabilityCopy(result: ExperimentContextApplicability): string {
  switch (result.state) {
    case 'unavailable':
      return 'Current goal and health-profile revision metadata could not be verified. The historical result is preserved, but present-day applicability is unknown.'
    case 'needs_recheck': {
      if(result.contextBaselineComparison==='changed')
        return 'Recheck present-day relevance: the saved profile or linked-goal revision baseline no longer matches current records. The historical observation remains unchanged.'
      const changed = [
        result.profileChangedAfterCapture ? 'health profile' : null,
        result.linkedGoalChangedAfterCapture ? 'experiment-linked goals' : null,
      ].filter(Boolean).join(' and ')
      return `Recheck present-day relevance: the ${changed} were updated after this result was saved. The historical observation has not been changed.`
    }
    case 'not_established':
      if(result.contextBaselineComparison==='matched')
        return 'The saved profile and linked-goal revision metadata still match today. This does not prove that health circumstances, goals, or treatment relevance are unchanged.'
      return result.linkedGoalCount === 0
        ? 'No revision was detected in the available health profile, but this experiment has no linked goals to compare. Current relevance is not established.'
        : result.profileChangedAfterCapture === null
          ? 'Linked goals have no detected newer revision, but health-profile revision history is unavailable. Current relevance is not established.'
          : 'No newer revisions were detected in the available health profile or linked goals. The original goal/profile versions and changes in circumstances were not frozen, so current relevance is still not established.'
  }
}
