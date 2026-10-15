import { describe, expect, it } from 'vitest'
import {
  isCalorieDecisionKind,
  keepCurrentCoachFollowUps,
  storedCoachRecommendationIsCurrent,
  recommendationIsSuppressed,
} from '../src/domain/coach-intelligence.js'

const REV_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const REV_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const intake = 'coach:i9:maintenance:intake'
const activity = 'coach:i9:maintenance:activity'
const available = new Set([intake, activity])
type Row = {
  id: string
  fingerprint: string
  recommendation_kind: string
  metadata: Record<string, unknown> | null
  response_state: string
  follow_up_on: string
}
function row(kind: string, revision: unknown = REV_A, id = 'saved'): Row {
  return {
    id,
    fingerprint: kind === 'review_intake_adjustment' ? intake
      : kind === 'review_activity_adjustment' ? activity : 'coach:i9:training:bench',
    recommendation_kind: kind,
    metadata: revision === undefined ? null : { decisionRevision: revision },
    response_state: 'do_this',
    follow_up_on: '2026-10-15',
  }
}
describe('PIQ-1.2 stale Coach recommendation lifecycle, synthetic saved rows', () => {
  it('accepts stored calorie follow-ups only when the stored revision and live evidence both match', () => {
    expect(storedCoachRecommendationIsCurrent(row('review_intake_adjustment'), available, REV_A)).toBe(true)
    expect(storedCoachRecommendationIsCurrent(row('review_activity_adjustment'), available, REV_A)).toBe(true)
  })

  it('retires a calorie follow-up after the target is edited, even if its old response is do_this', () => {
    expect(storedCoachRecommendationIsCurrent(row('review_intake_adjustment'), available, REV_B)).toBe(false)
  })

  it('retires a calorie follow-up after the weight goal changes or recovery makes the old recommendation ineligible', () => {
    expect(storedCoachRecommendationIsCurrent(row('review_intake_adjustment'), new Set(), REV_A)).toBe(false)
  })

  it('does not silently approve legacy calorie rows that predate revision metadata', () => {
    for (const metadata of [null, {}, { decisionRevision: null }, { decisionRevision: 'legacy' }]) {
      const oldRow = { ...row('review_intake_adjustment'), metadata }
      expect(storedCoachRecommendationIsCurrent(oldRow, available, REV_A)).toBe(false)
    }
  })

  it('missing current revision and failed recheck both suppress accepted numerical advice', () => {
    expect(storedCoachRecommendationIsCurrent(row('review_intake_adjustment'), available, null)).toBe(false)
    expect(keepCurrentCoachFollowUps([row('review_intake_adjustment')], available, REV_A, false)).toEqual([])
  })

  it('does not keep a dangling activity alternative when its accepted calorie parent no longer qualifies', () => {
    expect(keepCurrentCoachFollowUps(
      [row('review_activity_adjustment')], new Set(), REV_A, true,
    )).toEqual([])
    expect(keepCurrentCoachFollowUps(
      [row('review_activity_adjustment')], available, REV_B, true,
    )).toEqual([])
  })

  it('unrelated strength follow-up remains visible even if all calorie revision checks are unavailable', () => {
    const bench = row('training_progression', undefined, 'bench')
    const rows = [row('review_intake_adjustment'), bench]
    expect(keepCurrentCoachFollowUps(rows, new Set(), null, false)).toEqual([bench])
    expect(storedCoachRecommendationIsCurrent(bench, new Set(), null)).toBe(true)
  })

  it('filters before the three-visible-follow-ups cap, so old advice cannot hide current training tasks', () => {
    const stale = Array.from({ length: 6 }, (_, i) => row(
      'review_intake_adjustment', REV_B, 'stale-' + i,
    ))
    const active = Array.from({ length: 4 }, (_, i) => row(
      'training_progression', undefined, 'training-' + i,
    ))
    expect(keepCurrentCoachFollowUps([...stale, ...active], available, REV_A, true)
      .map((item) => item.id)).toEqual(['training-0', 'training-1', 'training-2'])
  })

  it('a changed revision retires the historical card rather than deleting owner response memory', () => {
    const old = row('review_intake_adjustment', REV_B)
    const visible = keepCurrentCoachFollowUps([old], available, REV_A, true)
    expect(visible).toHaveLength(0)
    expect(old.response_state).toBe('do_this')
    expect(old.follow_up_on).toBe('2026-10-15')
    expect(old.metadata?.decisionRevision).toBe(REV_B)
  })

  it('categorizes exactly the calorie lever and dependent activity alternative as sensitive', () => {
    expect(isCalorieDecisionKind('review_intake_adjustment')).toBe(true)
    expect(isCalorieDecisionKind('review_activity_adjustment')).toBe(true)
    for (const other of ['training_progression', 'review_goal_plan', 'improve_evidence', 'follow_up_question']) {
      expect(isCalorieDecisionKind(other)).toBe(false)
    }
  })

  it('owner acknowledgement suppression stays independent from live safety qualification', () => {
    const memory = {
      id: 'saved', fingerprint: intake, recommendationKind: 'review_intake_adjustment',
      responseState: 'do_this' as const, suppressUntil: null,
      followUpOn: '2026-10-15', outcomeState: null, lastSurfacedOn: '2026-10-06',
    }
    expect(recommendationIsSuppressed(memory, '2026-10-15')).toBe(true)
    expect(keepCurrentCoachFollowUps([row('review_intake_adjustment', REV_B)], available, REV_A, true)).toEqual([])
  })
})
