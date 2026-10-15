import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { GoalControlState } from '../src/domain/goal-control.js'
import type { CoachRecommendationDraft } from '../src/domain/coach-intelligence.js'
import {
  coachRecommendationContextRevision,
  requireCurrentNonCalorieRecommendation,
} from '../server/intelligence/coach-intelligence.js'

const asOf = '2026-10-15'
const draft: CoachRecommendationDraft = {
  fingerprint: 'coach:i9:training:bench',
  sourceId: 'training:bench', kind: 'training_progression',
  domain: 'training', title: 'Review bench progression',
  detail: 'Progress could be slowing.', actionText: 'Review training',
  detailPath: '/training', confidence: 'moderate',
  evidenceRefs: ['training:bench'], priority: 80, experimentEligible: true,
}
const row = { recommendation_kind: draft.kind, fingerprint: draft.fingerprint }
const context = {
  asOf,
  period: { start: '2026-10-12', end: asOf },
  trainingProgression: { series: [{ exerciseId: 'bench', improvementPct: 4.5 }] },
  trainingAdherence: { qualifiedTrainingDays: 2, weeklyFrequencyTarget: 3 },
  nutritionQuality: { state: 'met', loggedDays: 6 },
} as unknown as GoalControlState

describe('PIQ-1.5 Coach advice context revision', () => {
  it('has a deterministic opaque token that changes with relevant underlying training evidence', () => {
    const token = coachRecommendationContextRevision(draft, context)
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect(coachRecommendationContextRevision(draft, context)).toBe(token)
    const changed = {
      ...context,
      trainingProgression: { series: [{ exerciseId: 'bench', improvementPct: -1.2 }] },
    } as unknown as GoalControlState
    expect(coachRecommendationContextRevision(draft, changed)).not.toBe(token)
    expect(coachRecommendationContextRevision({ ...draft, detail: 'New explanation' }, context)).not.toBe(token)
  })

  it('does not invalidate training for unrelated nutrition bookkeeping, but expires a prior-day context', () => {
    const token = coachRecommendationContextRevision(draft, context)
    expect(coachRecommendationContextRevision(draft, {
      ...context,
      nutritionQuality: { state: 'limited', loggedDays: 1 },
    } as unknown as GoalControlState)).toBe(token)
    expect(coachRecommendationContextRevision(draft, { ...context, asOf: '2026-10-16' })).not.toBe(token)
  })

  it('accepts matching evidence but refuses an old tab after the same-ID evidence changes', async () => {
    const token = coachRecommendationContextRevision(draft, context)
    await expect(requireCurrentNonCalorieRecommendation(
      row, asOf, [draft], token, context,
    )).resolves.toBeUndefined()
    const changed = {
      ...context,
      trainingProgression: { series: [{ exerciseId: 'bench', improvementPct: -1.2 }] },
    } as unknown as GoalControlState
    await expect(requireCurrentNonCalorieRecommendation(
      row, asOf, [draft], token, changed,
    )).rejects.toMatchObject({ statusCode: 409 })
    await expect(requireCurrentNonCalorieRecommendation(
      row, asOf, [draft], 'not-a-revision', context,
    )).rejects.toMatchObject({ statusCode: 428 })
  })

  it('keeps original kind/fingerprint eligibility and calorie-specific revision guards independent', async () => {
    const token = coachRecommendationContextRevision(draft, context)
    await expect(requireCurrentNonCalorieRecommendation(
      row, asOf, [], token, context,
    )).rejects.toMatchObject({ statusCode: 409 })
    await expect(requireCurrentNonCalorieRecommendation(
      { recommendation_kind: 'review_intake_adjustment', fingerprint: 'calorie' },
      asOf, [], token, context,
    )).resolves.toBeUndefined()
  })

  it('propagates context through Coach GET, owner response, and current-evidence server check', () => {
    const server = readFileSync('server/intelligence/coach-intelligence.ts', 'utf8')
    const card = readFileSync('src/features/coach/CoachCard.tsx', 'utf8')
    const api = readFileSync('src/features/coach/api.ts', 'utf8')
    const handler = readFileSync('server/handlers/coach-intelligence.ts', 'utf8')
    expect(server).toContain('contextRevision: coachRecommendationContextRevision(draft, control)')
    expect(server).toContain("!isCalorieDecisionKind(row.recommendation_kind)")
    expect(server).toContain('expectedContextRevision')
    expect(card).toContain('item.responseAt, item.contextRevision')
    expect(api).toContain('{ response, ownerStarted: true, expectedResponseAt, expectedContextRevision }')
    expect(handler).toContain("typeof body.expectedContextRevision === 'string'")
  })
})
