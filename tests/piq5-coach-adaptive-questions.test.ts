import { describe, expect, it } from 'vitest'
import {
  buildCoachFollowUpQuestion,
  coachQuestionPresentation,
} from '../src/domain/coach-intelligence.js'
import type { GoalControlState, GoalControlLimitation } from '../src/domain/goal-control.js'

function context(overrides: Partial<GoalControlState> = {}): GoalControlState {
  return {
    version: 'goal-control-v1', asOf: '2026-10-17',
    period: { start: '2026-10-10', end: '2026-10-16' },
    state: 'insufficient_evidence',
    headline: 'Need better evidence', summary: 'Review',
    noChangeRecommended: false, confidence: 'limited', primaryOpportunity: null,
    goals: [], nutritionQuality: {
      state: 'limited', period: { start: '2026-10-10', end: '2026-10-16' },
      loggedDays: 3, reliableDays: 1, estimateHeavyDays: 1,
      unknownQualityDays: 1, requiredLoggedDays: 4, requiredReliableDays: 4,
      detail: 'Coverage is incomplete.',
    },
    trainingAdherence: {
      configured: false, completedProgrammedSessions: 0,
      qualifiedTrainingDays: null, weeklyFrequencyTarget: null,
      remainingQualifiedDays: null, remainingSessions: null, todayIntent: null,
      futureTrainingDates: [], state: 'unconfigured', detail: 'No plan',
    },
    relationships: [], limitations: [], maintenance: null,
    trainingProgression: null, ...overrides,
  }
}
const missingWellness: GoalControlLimitation = {
  code: 'missing:wellness.energy', text: 'No recent reliable energy check-in.',
  detailPath: '/check-in',
}
const nutrition: GoalControlLimitation = {
  code: 'nutrition_quality_floor', text: 'Food entries may be incomplete.',
  detailPath: '/nutrition',
}
const sleep: GoalControlLimitation = {
  code: 'missing:sleep.total_minutes', text: 'Insufficient imported nights.',
  detailPath: '/progress/sleep',
}
describe('PIQ-5.4 high-value question policy', () => {
  it('hides already-completed daily wellness prompts without changing underlying missing-data history', () => {
    const c = context({ limitations: [missingWellness] })
    expect(buildCoachFollowUpQuestion(c, { todayWellnessCompleted: true })).toBeNull()
    expect(buildCoachFollowUpQuestion(c, { todayWellnessCompleted: false })?.detailPath).toBe('/check-in')
    expect(c.limitations).toHaveLength(1)
  })
  it('fails quietly when daily check-in state is unavailable; unknown is never assumed not done', () => {
    const c = context({ limitations: [missingWellness] })
    expect(buildCoachFollowUpQuestion(c)).toBeNull()
    expect(buildCoachFollowUpQuestion(c, { todayWellnessCompleted: null })).toBeNull()
  })
  it('skips already-resolved check-in or generic limitations and selects the next useful question', () => {
    const limitations: GoalControlLimitation[] = [
      { code: 'limited_cross_domain_evidence', text: 'Not enough matched signals.', detailPath: '/progress' },
      missingWellness, nutrition,
    ]
    const answer = buildCoachFollowUpQuestion(context({ limitations }), { todayWellnessCompleted: true })
    expect(answer?.domain).toBe('nutrition')
    expect(answer?.title).toContain('food logging')
    expect(answer?.fingerprint).toBe('coach:i9:question:nutrition_quality_floor')
  })
  it('does not invent a food-completeness question when nothing was logged or intake quality is already verified', () => {
    const c = context({ limitations: [nutrition] })
    expect(buildCoachFollowUpQuestion({
      ...c, nutritionQuality: { ...c.nutritionQuality, loggedDays: 0 },
    })).toBeNull()
    expect(buildCoachFollowUpQuestion({
      ...c, nutritionQuality: { ...c.nutritionQuality, state: 'met', reliableDays: 4 },
    })).toBeNull()
  })
  it('routes sleep source-coverage questions to sleep records, not another daily wellness check-in', () => {
    const q = buildCoachFollowUpQuestion(context({ limitations: [sleep] }), { todayWellnessCompleted: true })
    expect(q?.detailPath).toBe('/progress/sleep')
    expect(q?.title).toContain('sleep records')
    expect(q?.actionText).toBe('Review sleep records')
  })
  it('does not ask about a changed, paused, satisfied or nonexistent goal', () => {
    const gap: GoalControlLimitation = {
      code: 'goal_unknown:goal-a', text: 'Insufficient supporting steps.',
      detailPath: '/goals/goal-a',
    }
    const c = context({ limitations: [gap] })
    expect(buildCoachFollowUpQuestion(c)).toBeNull()
    const live = {
      id: 'goal-a', label: 'Walking', kind: 'activity_steps', lifecycle: 'active',
      state: 'unknown' as const, targetState: 'unknown', deadlineState: 'future_no_projection',
      detailPath: '/goals/goal-a',
    }
    expect(buildCoachFollowUpQuestion({ ...c, goals: [live] })?.domain).toBe('goals')
    expect(buildCoachFollowUpQuestion({ ...c, goals: [{ ...live, state: 'meeting' }] })).toBeNull()
    expect(buildCoachFollowUpQuestion({ ...c, goals: [{ ...live, lifecycle: 'paused' }] })).toBeNull()
  })
  it('is quiet when evidence becomes sufficient even if old limitations remain cached', () => {
    const c = context({ limitations: [nutrition] })
    expect(buildCoachFollowUpQuestion({ ...c, state: 'maintain' })).toBeNull()
    expect(buildCoachFollowUpQuestion({ ...c, state: 'act' })).toBeNull()
  })
  it('reuses a still-relevant question but never repeats a stale resolved one or replaces it during cooldown', () => {
    const current = buildCoachFollowUpQuestion(context({ limitations: [nutrition] }))!
    const recent = { fingerprint: current.fingerprint }
    expect(coachQuestionPresentation(current, null)).toBe('create')
    expect(coachQuestionPresentation(current, recent)).toBe('reuse')
    expect(coachQuestionPresentation(null, recent)).toBeNull()
    expect(coachQuestionPresentation(current, { fingerprint: 'coach:i9:question:missing:wellness.energy' })).toBeNull()
  })
  it('sends no generic filler question on weak overall cross-domain evidence alone', () => {
    const c = context({
      limitations: [{ code: 'limited_cross_domain_evidence', text: 'Not enough evidence',
        detailPath: '/progress' }],
    })
    expect(buildCoachFollowUpQuestion(c)).toBeNull()
  })
})
