import { describe, expect, it } from 'vitest'
import {
  rankCoachRecommendationDrafts,
  selectCoachRecommendationSlots,
  recommendationIsSuppressed,
  keepVisibleCoachDependencies,
  keepCurrentCalorieDecisionDrafts,
  keepNonCompetingCalorieDrafts,
  type CoachRecommendationDraft,
  type CoachRecommendationMemory,
} from '../src/domain/coach-intelligence.js'

function draft(
  kind: string,
  id: string,
  options: Partial<CoachRecommendationDraft> = {},
): CoachRecommendationDraft {
  return {
    fingerprint: 'coach:i9:' + id, sourceId: id, kind, domain: 'training',
    title: kind, detail: 'Synthetic decision evidence', detailPath: '/training',
    actionText: 'Review', confidence: 'moderate', evidenceRefs: ['example:' + id],
    experimentEligible: false, priority: 100,
    ...options,
  }
}
const observedTraining = {
  exerciseName: 'Bench Press', state: 'plateau' as const,
  metric: 'e1rm_kg' as const, exposureCount: 6,
  latestDate: '2026-10-15', changePct: 0,
  limitationKinds: [], explanation: 'Six verified exposures.',
  window: { start: '2026-09-15', end: '2026-10-16' },
}
const started = (item: CoachRecommendationDraft): CoachRecommendationMemory => ({
  id: '11111111-1111-4111-8111-111111111111',
  fingerprint: item.fingerprint,
  recommendationKind: item.kind,
  responseState: 'do_this', ownerStarted: true,
  suppressUntil: null, followUpOn: '2026-10-24',
  outcomeState: null, lastSurfacedOn: '2026-10-17',
})

describe('PIQ-5.2 useful recommendations rank after hard eligibility checks', () => {
  it('a supported exercise trend outranks a generic experiment review despite primary=100', () => {
    const review = draft('experiment_review', 'lab', { priority: 100 })
    const training = draft('training_progression', 'bench', {
      priority: 80, confidence: 'high', trainingEvidence: observedTraining,
    })
    const ranked = rankCoachRecommendationDrafts([review, training])
    expect(ranked.map(item => item.sourceId)).toEqual(['bench', 'lab'])
    expect(review.priority).toBe(100)
    expect(training.priority).toBe(80)
  })

  it('a time-sensitive goal review wins over a training trend, without pretending a review is treatment', () => {
    const goal = draft('goal_review', 'deadline', { domain: 'goals' })
    const training = draft('training_progression', 'bench', {
      confidence: 'moderate', trainingEvidence: observedTraining,
    })
    expect(rankCoachRecommendationDrafts([training, goal])[0]?.kind).toBe('goal_review')
  })

  it('unverified or sparse exercise signals cannot jump ahead of a valid experiment review', () => {
    const review = draft('experiment_review', 'lab')
    const sparse = draft('training_progression', 'bench', {
      confidence: 'high',
      trainingEvidence: { ...observedTraining, exposureCount: 2 },
    })
    const missing = draft('training_progression', 'unknown')
    expect(rankCoachRecommendationDrafts([sparse, review])[0]?.kind).toBe('experiment_review')
    expect(rankCoachRecommendationDrafts([missing, review])[0]?.kind).toBe('experiment_review')
  })

  it('filters dismissed and explicitly started advice before taking the visible three slots', () => {
    const list = rankCoachRecommendationDrafts([
      draft('goal_review', 'goal'),
      draft('review_intake_adjustment', 'intake'),
      draft('experiment_review', 'experiment'),
      draft('training_progression', 'training'),
      draft('improve_evidence', 'context'),
    ])
    const dismissed = list[0]!
    const alreadyStarted = list[1]!
    const memories = new Map<string, CoachRecommendationMemory>([
      [dismissed.fingerprint, { ...started(dismissed), responseState: 'not_relevant', ownerStarted: false }],
      [alreadyStarted.fingerprint, started(alreadyStarted)],
    ])
    const afterSuppression = list.filter(item =>
      !recommendationIsSuppressed(memories.get(item.fingerprint), '2026-10-17'))
    const visible = selectCoachRecommendationSlots(afterSuppression)
    expect(visible).toHaveLength(3)
    expect(visible.map(item => item.sourceId)).toEqual(['experiment', 'training', 'context'])
    expect(selectCoachRecommendationSlots(list).map(item => item.sourceId))
      .not.toContain('context')
  })

  it('does not surface an activity alternative whose calorie parent was dismissed', () => {
    const parent = draft('review_intake_adjustment', 'calorie')
    const dependent = draft('review_activity_adjustment', 'activity')
    const genuine = draft('training_progression', 'bench')
    const sorted = rankCoachRecommendationDrafts([parent, dependent, genuine])
    const suppressed = sorted.filter(item => item.kind !== 'review_intake_adjustment')
    const eligible = keepVisibleCoachDependencies(suppressed)
    expect(eligible.map(item => item.sourceId)).toEqual(['bench'])
    expect(selectCoachRecommendationSlots(eligible)).toHaveLength(1)
  })

  it('rejects stale calorie revisions and active competing interventions before slot selection', () => {
    const calorie = draft('review_intake_adjustment', 'calorie')
    const training = draft('training_progression', 'bench')
    const next = draft('improve_evidence', 'context')
    const current = keepCurrentCalorieDecisionDrafts([calorie, training, next], false)
    const afterActive = keepNonCompetingCalorieDrafts(current, true)
    expect(selectCoachRecommendationSlots(afterActive).map(item => item.sourceId))
      .toEqual(['bench', 'context'])
  })

  it('does not mutate input order, and uses deterministic confidence/fingerprint tie breakers', () => {
    const z = draft('experiment_review', 'z', { confidence: 'limited' })
    const a = draft('experiment_review', 'a', { confidence: 'high' })
    const b = draft('experiment_review', 'b', { confidence: 'high' })
    const input = [z, b, a]
    expect(rankCoachRecommendationDrafts(input).map(x => x.sourceId)).toEqual(['a', 'b', 'z'])
    expect(input.map(x => x.sourceId)).toEqual(['z', 'b', 'a'])
  })
})
