import { describe, expect, it } from 'vitest'
import { buildCoachRecommendationDrafts } from '../src/domain/coach-intelligence.js'
import { buildGoalControlState } from '../src/domain/goal-control.js'
import {
  buildHealthIntelligenceSnapshot,
  type IntelligenceObservation,
} from '../src/domain/intelligence/shared.js'
import { buildMaintenanceState } from '../src/domain/maintenance.js'
import { addCalendarDays } from '../src/domain/progress/dates.js'
import type { WeeklyCoachBrief } from '../src/domain/weekly-coach/types.js'

const AS_OF = '2026-10-15'
const START = '2026-09-16'
const dates = Array.from({ length: 28 }, (_, i) => addCalendarDays('2026-09-17', i))
const prior21 = dates.slice(0, 21)
const latest7 = dates.slice(21)
const baseObservations: IntelligenceObservation[] = dates.flatMap((date) => ([
  {
    key: 'nutrition.calories' as const, date, value: 2200, unit: 'kcal',
    quality: 'high_confidence', provenance: 'owner' as const, sourceIds: [date + '-meal'],
  },
  {
    key: 'body.weight_kg' as const, date, value: 85, unit: 'kg',
    quality: 'usual', provenance: 'owner' as const, sourceIds: [date + '-scale'],
  },
]))

function snapshot(verified: ReadonlySet<string>, unavailable = false) {
  return buildHealthIntelligenceSnapshot({
    range: '30d', asOf: AS_OF, start: START, end: AS_OF,
    today: AS_OF, timezone: 'America/Phoenix', observations: baseObservations,
    nutritionVerifiedCompleteDates: verified,
    nutritionVerificationStatus: unavailable ? 'unavailable' : 'available',
  })
}

function weeklyBrief(): WeeklyCoachBrief {
  return {
    packetVersion: 'weekly-coach-evidence-v1', asOf: AS_OF,
    period: { start: '2026-10-08', end: '2026-10-14' },
    previousPeriod: { start: '2026-10-01', end: '2026-10-07' },
    state: 'deterministic', canGenerate: true,
    coverage: {
      activity: true, sleep: true, nutrition: true, training: false,
      supplements: false, body: true,
      substantiveDomains: ['activity', 'sleep', 'nutrition', 'body'],
    },
    facts: [], wentWell: [], worthWatching: [], focus: null, candidates: [],
  }
}

function control(verified: ReadonlySet<string>, unavailable = false) {
  const intelligence = snapshot(verified, unavailable)
  const maintenance = buildMaintenanceState({
    asOf: AS_OF, today: AS_OF, intelligence, contexts: [],
    eligibleNutritionDates: verified,
    weightGoal: {
      goalId: 'weight-goal', goalVersionId: 'weight-goal-v1',
      label: 'Weight', targetState: 'unmet', direction: 'lose',
    },
  })
  const goalControl = buildGoalControlState({
    asOf: AS_OF, brief: weeklyBrief(), intelligence,
    goals: [], trainingPlan: null, maintenance,
  })
  return { intelligence, maintenance, goalControl }
}

describe('PIQ-1.2 Goal Control and Coach day-completeness gate', () => {
  it('T03: 28 precisely logged one-meal days are not enough to pass Goal Control nutrition floor', () => {
    const { intelligence, maintenance, goalControl } = control(new Set())
    expect(intelligence.coverage.find((item) => item.key === 'nutrition.calories'))
      .toMatchObject({ loggedDays: 28, observedDays: 0 })
    expect(maintenance.estimate.state).toBe('insufficient_evidence')
    expect(goalControl.nutritionQuality).toMatchObject({
      loggedDays: 7, reliableDays: 0, state: 'limited',
      estimateHeavyDays: 0, unknownQualityDays: 0,
    })
    expect(goalControl.nutritionQuality.detail).toContain('owner-confirmed complete')
    expect(goalControl.limitations.some((item) => item.code === 'nutrition_quality_floor')).toBe(true)
    expect(buildCoachRecommendationDrafts(goalControl).some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
  })

  it('T03: verified older history cannot justify an intake cut after an unverified recent week', () => {
    const { maintenance, goalControl } = control(new Set(prior21))
    // Enough verified older intake and comparable weight to produce a
    // plausible empirical estimate and a plateau, despite a missing recent week.
    expect(maintenance.estimate.state).toBe('available')
    expect(maintenance.plateau.state).toBe('plateau_likely')
    expect(maintenance.interventions.some((item) => item.kind === 'review_intake_adjustment')).toBe(true)
    expect(goalControl.nutritionQuality).toMatchObject({ loggedDays: 7, reliableDays: 0, state: 'limited' })
    expect(goalControl.primaryOpportunity?.kind).not.toBe('review_intake_adjustment')
    const drafts = buildCoachRecommendationDrafts(goalControl)
    expect(drafts.some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
    expect(drafts.some((item) => item.kind === 'review_activity_adjustment')).toBe(false)
    expect(drafts.some((item) => item.title.startsWith('Or change activity'))).toBe(false)
  })

  it('does not needlessly block a qualified intake-review candidate with verified recent evidence', () => {
    const { maintenance, goalControl } = control(new Set(dates))
    expect(maintenance.plateau.state).toBe('plateau_likely')
    expect(goalControl.nutritionQuality).toMatchObject({ loggedDays: 7, reliableDays: 7, state: 'met' })
    expect(goalControl.primaryOpportunity?.kind).toBe('review_intake_adjustment')
    const drafts = buildCoachRecommendationDrafts(goalControl)
    expect(drafts.map((item) => item.kind)).toContain('review_intake_adjustment')
    expect(drafts.map((item) => item.kind)).toContain('review_activity_adjustment')
  })

  it('partly confirmed days and current provisional day never pass the floor', () => {
    const { goalControl } = control(new Set(latest7.slice(0, 3)))
    expect(goalControl.nutritionQuality).toMatchObject({ loggedDays: 7, reliableDays: 3, state: 'limited' })
    const withToday = control(new Set([...latest7.slice(0, 3), AS_OF]))
    expect(withToday.goalControl.nutritionQuality.reliableDays).toBe(3)
  })

  it('source reliability alone cannot promote estimate-heavy entries to complete-day evidence', () => {
    const partial = snapshot(new Set(latest7))
    const fakeSource = { ...partial.frame.find((x) => x.date === latest7[0])!.signals['nutrition.calories']!, quality: 'estimate_heavy' }
    const tampered = {
      ...partial,
      frame: partial.frame.map((day) => day.date === latest7[0]
        ? { ...day, signals: { ...day.signals, 'nutrition.calories': fakeSource } } : day),
    }
    const state = buildGoalControlState({
      asOf: AS_OF, brief: weeklyBrief(), intelligence: tampered,
      goals: [], trainingPlan: null,
    })
    expect(state.nutritionQuality).toMatchObject({ loggedDays: 7, reliableDays: 6, state: 'met' })
    expect(state.nutritionQuality.estimateHeavyDays).toBe(1)
  })

  it('does not misreport an unavailable read as an owner refusal to confirm', () => {
    const { goalControl } = control(new Set(), true)
    expect(goalControl.nutritionQuality).toMatchObject({ state: 'limited', reliableDays: 0, loggedDays: 7 })
    expect(goalControl.nutritionQuality.detail).toContain('verification is unavailable')
    expect(goalControl.nutritionQuality.detail).toContain('does not mean the owner confirmed zero')
  })

  it('Coach still gates a stale direct calorie-action card even if Goal Control was bypassed', () => {
    const { goalControl, maintenance } = control(new Set(prior21))
    const stale = {
      ...goalControl, state: 'act' as const,
      primaryOpportunity: {
        id: 'maintenance:review-intake', kind: 'review_intake_adjustment',
        domain: 'nutrition', title: 'Cut calories by 150', detail: 'Stale proposal',
        actionText: 'Review', detailPath: '/nutrition',
        sourceCandidateId: null, evidenceRefs: ['maintenance:estimate'],
      },
      maintenance,
    }
    const drafts = buildCoachRecommendationDrafts(stale)
    expect(drafts.some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
    expect(drafts.some((item) => item.kind === 'review_activity_adjustment')).toBe(false)
  })
})
