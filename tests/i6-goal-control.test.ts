import { describe, expect, it } from 'vitest'
import {
  GOAL_CONTROL_VERSION,
  buildGoalControlState,
  dailyTrainingQuestAllowed,
  goalNeedsWeeklyAttention,
} from '../src/domain/goal-control.ts'
import {
  buildHealthIntelligenceSnapshot,
  type IntelligenceObservation,
} from '../src/domain/intelligence/shared.ts'
import { buildWeeklyCoachBrief } from '../src/domain/weekly-coach/build.ts'
import type {
  WeeklyCandidate,
  WeeklyCoachBrief,
  WeeklyCoachInput,
  WeeklyGoalSnapshot,
} from '../src/domain/weekly-coach/types.ts'

const AS_OF = '2026-10-08'

function observation(
  key: IntelligenceObservation['key'],
  date: string,
  value: number,
  options: Partial<IntelligenceObservation> = {},
): IntelligenceObservation {
  const units: Record<IntelligenceObservation['key'], string> = {
    'activity.steps': 'steps',
    'activity.active_energy_kcal': 'kcal',
    'activity.exercise_minutes': 'min',
    'sleep.total_minutes': 'min',
    'nutrition.calories': 'kcal',
    'nutrition.protein_g': 'g',
    'nutrition.fiber_g': 'g',
    'nutrition.sodium_mg': 'mg',
    'training.sessions': 'sessions',
    'training.effort': '1–5',
    'body.weight_kg': 'kg',
    'hydration.ml': 'ml',
    'bowel.count': 'count',
    'wellness.energy': '1–5',
    'wellness.hunger': '1–5',
    'wellness.soreness': '1–5',
    'wellness.stress': '1–5',
  }
  return {
    key,
    date,
    value,
    unit: units[key],
    provenance: 'owner',
    sourceIds: [],
    ...options,
  }
}

function intelligence(observations: IntelligenceObservation[]) {
  return buildHealthIntelligenceSnapshot({
    range: '30d',
    asOf: AS_OF,
    start: '2026-09-09',
    end: AS_OF,
    timezone: 'America/Phoenix',
    today: AS_OF,
    observations,
  })
}

function candidate(overrides: Partial<WeeklyCandidate> = {}): WeeklyCandidate {
  return {
    id: 'focus:goal:test',
    section: 'focus',
    kind: 'goal_review',
    fact: 'Review the active goal.',
    evidenceRefs: ['goal:test'],
    detailPath: '/goals/test',
    actionText: 'Review the active goal before changing course.',
    rank: 1,
    ...overrides,
  }
}

function brief(focus: WeeklyCandidate | null = null, canGenerate = true): WeeklyCoachBrief {
  return {
    packetVersion: 'weekly-coach-evidence-v1',
    asOf: AS_OF,
    period: { start: '2026-10-01', end: '2026-10-07' },
    previousPeriod: { start: '2026-09-24', end: '2026-09-30' },
    state: canGenerate ? 'deterministic' : 'insufficient_evidence',
    canGenerate,
    coverage: {
      activity: true,
      sleep: true,
      nutrition: true,
      training: true,
      supplements: false,
      body: false,
      substantiveDomains: ['activity', 'sleep', 'nutrition', 'training'],
    },
    facts: [],
    wentWell: [],
    worthWatching: [],
    focus,
    candidates: focus ? [focus] : [],
  }
}

function goal(overrides: Partial<WeeklyGoalSnapshot> = {}): WeeklyGoalSnapshot {
  return {
    id: 'goal-1',
    label: 'Daily steps',
    kind: 'activity_steps',
    lifecycle: 'active',
    targetState: 'satisfied',
    deadlineState: 'projected_before_deadline',
    ...overrides,
  }
}

function blankWeeklyInput(): WeeklyCoachInput {
  return {
    asOf: AS_OF,
    timezone: 'America/Phoenix',
    activityDays: [],
    sleepNights: [],
    nutritionEntries: [],
    nutritionTargets: [],
    trainingSessions: [],
    performanceBests: [],
    bodyObservations: [],
    supplements: [],
    goals: [],
    experiments: [],
    retests: [],
    benchmarkResults: [],
    reviewCaptures: [],
    cadenceDue: [],
    insights: [],
    sleepBaseline: null,
    activeBodyGoal: false,
    trainingPlan: null,
  }
}

describe('I6 Goal Control authority', () => {
  it('makes no-change a successful first-class weekly decision', () => {
    const observations = Array.from({ length: 10 }, (_, index) =>
      observation('activity.steps', `2026-09-${String(20 + index).padStart(2, '0')}`, 8000 + index * 50, { provenance: 'device' }),
    )
    const state = buildGoalControlState({
      asOf: AS_OF,
      brief: brief(),
      intelligence: intelligence(observations),
      goals: [goal()],
      trainingPlan: null,
    })
    expect(state.version).toBe(GOAL_CONTROL_VERSION)
    expect(state.state).toBe('maintain')
    expect(state.noChangeRecommended).toBe(true)
    expect(state.primaryOpportunity).toBeNull()
    expect(state.headline).toBe('Stay the course')
    expect(state.summary).toContain('No change recommended')
  })

  it('promotes the deterministic Weekly Coach focus instead of inventing another opportunity', () => {
    const focus = candidate({
      id: 'focus:body-cadence:waist',
      kind: 'body_cadence',
      fact: 'Waist measurement is due.',
      detailPath: '/body',
      actionText: 'Record your scheduled Waist measurement.',
      evidenceRefs: ['cadence:waist'],
    })
    const state = buildGoalControlState({
      asOf: AS_OF,
      brief: brief(focus),
      intelligence: intelligence([]),
      goals: [],
      trainingPlan: null,
    })
    expect(state.state).toBe('act')
    expect(state.primaryOpportunity).toMatchObject({
      id: focus.id,
      sourceCandidateId: focus.id,
      detailPath: '/body',
    })
    expect(state.summary).toBe(focus.actionText)
  })

  it('uses a Nutrition evidence floor before intake evidence is considered reliable', () => {
    const observations: IntelligenceObservation[] = [
      observation('nutrition.calories', '2026-10-01', 1900, { quality: 'high_confidence' }),
      observation('nutrition.calories', '2026-10-02', 1950, { quality: 'high_confidence' }),
      observation('nutrition.calories', '2026-10-03', 2000, { quality: 'estimate_heavy', provenance: 'ai' }),
      observation('nutrition.calories', '2026-10-04', 2050, { quality: 'high_confidence' }),
    ]
    const state = buildGoalControlState({
      asOf: AS_OF,
      brief: brief(),
      intelligence: intelligence(observations),
      goals: [],
      trainingPlan: null,
    })
    expect(state.nutritionQuality).toMatchObject({
      state: 'limited',
      loggedDays: 4,
      reliableDays: 3,
      estimateHeavyDays: 1,
      requiredReliableDays: 4,
    })
    expect(state.limitations.some((item) => item.code === 'nutrition_quality_floor')).toBe(true)

    observations.push(observation('nutrition.calories', '2026-10-05', 1980, { quality: 'high_confidence' }))
    const enough = buildGoalControlState({
      asOf: AS_OF,
      brief: brief(),
      intelligence: intelligence(observations),
      goals: [],
      trainingPlan: null,
    })
    expect(enough.nutritionQuality.state).toBe('met')
    expect(enough.nutritionQuality.reliableDays).toBe(4)
  })

  it('treats a planned rest day as adherence-compatible when enough Training days remain', () => {
    const state = buildGoalControlState({
      asOf: AS_OF,
      brief: brief(),
      intelligence: intelligence([]),
      goals: [],
      trainingPlan: {
        configured: true,
        completedProgrammedSessions: 1,
        weeklyFrequencyTarget: 3,
        todayIntent: 'rest',
        todayRoutineName: 'Routine B',
        futureTrainingDates: ['2026-10-09', '2026-10-11'],
      },
    })
    expect(state.trainingAdherence).toMatchObject({
      state: 'rest_day_on_track',
      remainingSessions: 2,
    })
    expect(state.trainingAdherence.detail).toContain('not a planned Training day')
    expect(dailyTrainingQuestAllowed({ configured: true, todayIntent: 'rest' })).toBe(false)
    expect(dailyTrainingQuestAllowed({ configured: true, todayIntent: 'active_recovery' })).toBe(false)
    expect(dailyTrainingQuestAllowed({ configured: true, todayIntent: 'training_moved_here' })).toBe(true)
  })

  it('asks for a plan review when remaining programmed sessions no longer fit the planned week', () => {
    const state = buildGoalControlState({
      asOf: AS_OF,
      brief: brief(),
      intelligence: intelligence([]),
      goals: [],
      trainingPlan: {
        configured: true,
        completedProgrammedSessions: 0,
        weeklyFrequencyTarget: 3,
        todayIntent: 'rest',
        todayRoutineName: 'Routine A',
        futureTrainingDates: ['2026-10-10'],
      },
    })
    expect(state.trainingAdherence.state).toBe('schedule_review')
    expect(state.trainingAdherence.detail).toContain('Review the plan')
  })

  it('only surfaces sufficiently mature personal relationships relevant to active goals', () => {
    const observations: IntelligenceObservation[] = []
    for (let day = 1; day <= 12; day += 1) {
      const date = `2026-09-${String(day + 10).padStart(2, '0')}`
      observations.push(observation('sleep.total_minutes', date, 360 + day * 5, { provenance: 'device' }))
      observations.push(observation('wellness.energy', date, 1 + Math.floor((day - 1) / 3)))
    }
    const state = buildGoalControlState({
      asOf: AS_OF,
      brief: brief(),
      intelligence: intelligence(observations),
      goals: [goal({
        id: 'sleep-goal',
        label: 'Sleep duration',
        kind: 'sleep_duration',
        targetState: 'below_target',
        deadlineState: 'projected_before_deadline',
      })],
      trainingPlan: null,
    })
    expect(state.relationships.some((item) => item.id === 'shared:sleep:energy')).toBe(true)
    expect(state.relationships.every((item) => item.confidence === 'high' || item.confidence === 'moderate')).toBe(true)
  })

  it('uses insufficient-evidence rather than pretending silence means stay-the-course', () => {
    const state = buildGoalControlState({
      asOf: AS_OF,
      brief: brief(null, false),
      intelligence: intelligence([]),
      goals: [goal({ targetState: 'below_target', deadlineState: 'future_no_projection' })],
      trainingPlan: null,
    })
    expect(state.state).toBe('insufficient_evidence')
    expect(state.noChangeRecommended).toBe(false)
    expect(state.summary).toContain('not yet have enough completed evidence')
    expect(state.limitations.some((item) => item.code === 'goal_unknown:goal-1')).toBe(true)
  })
})

describe('I6 Weekly Coach / Coach alignment rules', () => {
  it('uses the same weekly-attention definition for due, passed, and off-track goals', () => {
    expect(goalNeedsWeeklyAttention('due_today')).toBe(true)
    expect(goalNeedsWeeklyAttention('passed_unmet')).toBe(true)
    expect(goalNeedsWeeklyAttention('projected_after_deadline')).toBe(true)
    expect(goalNeedsWeeklyAttention('projected_before_deadline')).toBe(false)
    expect(goalNeedsWeeklyAttention('future_no_projection')).toBe(false)
  })

  it('does not turn an intentional rest day into a Weekly Coach Training focus', () => {
    const restful = buildWeeklyCoachBrief({
      ...blankWeeklyInput(),
      trainingPlan: {
        configured: true,
        completedProgrammedSessions: 1,
        weeklyFrequencyTarget: 3,
        todayIntent: 'rest',
        todayRoutineName: 'Routine B',
        futureTrainingDates: ['2026-10-09', '2026-10-11'],
      },
    })
    expect(restful.candidates.some((item) => item.id.startsWith('focus:training-plan:'))).toBe(false)

    const trainingDay = buildWeeklyCoachBrief({
      ...blankWeeklyInput(),
      trainingPlan: {
        configured: true,
        completedProgrammedSessions: 1,
        weeklyFrequencyTarget: 3,
        todayIntent: 'training_preferred',
        todayRoutineName: 'Routine B',
        futureTrainingDates: ['2026-10-08', '2026-10-11'],
      },
    })
    expect(trainingDay.candidates.find((item) => item.id === 'focus:training-plan:today')?.actionText).toContain('Routine B')
  })
})
