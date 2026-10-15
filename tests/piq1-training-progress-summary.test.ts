import { describe, expect, it } from 'vitest'
import { buildTrainingWeekQualification, type PerformedExerciseEvidence } from '../src/domain/training-qualification.js'
import { buildTrainingProgressSummary } from '../src/domain/training-progress-summary.js'
import { buildGoalControlState } from '../src/domain/goal-control.js'
import { buildHealthIntelligenceSnapshot } from '../src/domain/intelligence/shared.js'
import { buildWeeklyCoachBrief } from '../src/domain/weekly-coach/build.js'
import type { WeeklyCoachBrief, WeeklyCoachInput, WeeklyTrainingPlanSnapshot } from '../src/domain/weekly-coach/types.js'

const TODAY = '2026-10-08' // Thursday; Monday starts 2026-10-05
const entry = (date: string, exerciseId: string): PerformedExerciseEvidence => ({ date, exerciseId, routineCode: null })
const performed = (...dates: string[]): PerformedExerciseEvidence[] =>
  dates.flatMap((date) => [entry(date, date + ':squat'), entry(date, date + ':bench'), entry(date, date + ':row')])
function plan(input: {
  evidence?: PerformedExerciseEvidence[]
  programmed?: number
  todayIntent?: WeeklyTrainingPlanSnapshot['todayIntent']
  future?: string[]
  omitQualification?: boolean
} = {}): WeeklyTrainingPlanSnapshot {
  const week = buildTrainingWeekQualification(input.evidence ?? [], TODAY)
  return {
    configured: true,
    completedProgrammedSessions: input.programmed ?? 0,
    ...(input.omitQualification ? {} : {
      qualifiedTrainingDays: week.completedDays,
      todayQualified: week.days.find((day) => day.date === TODAY)?.qualifies ?? false,
    }),
    weeklyFrequencyTarget: 3,
    todayIntent: input.todayIntent ?? 'rest',
    todayRoutineName: 'Routine B',
    futureTrainingDates: input.future ?? ['2026-10-09', '2026-10-11'],
  }
}
function brief(): WeeklyCoachBrief {
  return {
    packetVersion: 'weekly-coach-evidence-v1', asOf: TODAY,
    period: { start: '2026-10-01', end: '2026-10-07' },
    previousPeriod: { start: '2026-09-24', end: '2026-09-30' },
    state: 'deterministic', canGenerate: true,
    coverage: {
      activity: true, sleep: true, nutrition: false, training: true,
      supplements: false, body: false,
      substantiveDomains: ['activity', 'sleep', 'training'],
    },
    facts: [], wentWell: [], worthWatching: [], focus: null, candidates: [],
  }
}
function goalControl(trainingPlan: WeeklyTrainingPlanSnapshot) {
  const intelligence = buildHealthIntelligenceSnapshot({
    range: '30d', asOf: TODAY, today: TODAY,
    start: '2026-09-09', end: TODAY, timezone: 'America/Phoenix', observations: [],
  })
  return buildGoalControlState({
    asOf: TODAY, brief: brief(), intelligence, goals: [], trainingPlan,
  }).trainingAdherence
}
function weekly(trainingPlan: WeeklyTrainingPlanSnapshot): WeeklyCoachBrief {
  const input: WeeklyCoachInput = {
    asOf: TODAY, timezone: 'America/Phoenix',
    activityDays: [], sleepNights: [], nutritionEntries: [], nutritionTargets: [],
    trainingSessions: [], performanceBests: [], bodyObservations: [],
    supplements: [], goals: [], experiments: [], retests: [], benchmarkResults: [],
    reviewCaptures: [], cadenceDue: [], insights: [], sleepBaseline: null,
    activeBodyGoal: false, trainingPlan,
  }
  return buildWeeklyCoachBrief(input)
}
describe('PIQ-1.3 training semantics: qualified strength days are authoritative', () => {
  it('2/3 qualified days vs one programmed session leaves ONE target day, not two sessions', () => {
    const p = plan({ evidence: performed('2026-10-05', '2026-10-07'), programmed: 1 })
    const summary = buildTrainingProgressSummary(p)
    expect(summary.qualifiedTrainingDays).toBe(2)
    expect(summary.completedProgrammedSessions).toBe(1)
    expect(summary.remainingQualifiedDays).toBe(1)
    expect(summary.detail).toContain('2/3 qualified strength days')
    expect(summary.detail).toContain('1 day remaining')
    const decision = goalControl(p)
    expect(decision.remainingQualifiedDays).toBe(1)
    expect(decision.remainingSessions).toBe(2) // legacy diagnostic, NOT target credit
    expect(decision.detail).toContain('1 day remaining')
    expect(decision.detail).not.toContain('2 programmed sessions remain')
  })

  it('two separate ad-hoc logs on one date can together qualify ONE strength day', () => {
    const evidence = [entry('2026-10-06', 'pushup'), entry('2026-10-06', 'row'), entry('2026-10-06', 'squat')]
    const p = plan({ evidence, programmed: 0 })
    expect(buildTrainingProgressSummary(p)).toMatchObject({
      qualifiedTrainingDays: 1, completedProgrammedSessions: 0,
      remainingQualifiedDays: 2,
    })
    expect(goalControl(p).detail).toContain('0 programmed session rows recorded separately')
  })

  it('two or more workout logs on one date never credit multiple target days', () => {
    const evidence = [
      ...performed('2026-10-05'), entry('2026-10-05', 'press'),
      entry('2026-10-05', 'press'),
    ]
    expect(buildTrainingWeekQualification(evidence, TODAY).completedDays).toBe(1)
    expect(buildTrainingProgressSummary(plan({ evidence, programmed: 3 })).remainingQualifiedDays).toBe(2)
  })

  it('retroactively saved or edited performed evidence recalculates the qualified day without changing session counter', () => {
    const evidence = performed('2026-10-05')
    const before = plan({ evidence: evidence.slice(0, 2), programmed: 1 })
    const after = plan({ evidence, programmed: 1 })
    const deleted = plan({ evidence: evidence.slice(0, 2), programmed: 1 })
    expect(buildTrainingProgressSummary(before).qualifiedTrainingDays).toBe(0)
    expect(buildTrainingProgressSummary(after).qualifiedTrainingDays).toBe(1)
    expect(buildTrainingProgressSummary(deleted).qualifiedTrainingDays).toBe(0)
  })

  it('one programmed workout with no performed exercise evidence is not a qualifying day', () => {
    const p = plan({ evidence: [], programmed: 1 })
    expect(buildTrainingProgressSummary(p).remainingQualifiedDays).toBe(3)
    expect(goalControl(p).state).toBe('flexible_week')
  })

  it('unknown qualification evidence never silently becomes zero or inherits programmed counts', () => {
    const p = plan({ evidence: performed('2026-10-05'), programmed: 3, omitQualification: true })
    expect(buildTrainingProgressSummary(p).status).toBe('unavailable')
    expect(buildTrainingProgressSummary(p).qualifiedTrainingDays).toBeNull()
    expect(goalControl(p).state).toBe('unavailable')
    expect(goalControl(p).detail).toContain('unavailable')
    expect(weekly(p).candidates.some((item) => item.id === 'focus:training-plan:today')).toBe(false)
  })

  it('3/3 qualified days meet target even with only one programmed session row', () => {
    const p = plan({ evidence: performed('2026-10-05', '2026-10-06', '2026-10-07'), programmed: 1 })
    const summary = buildTrainingProgressSummary(p)
    expect(summary.status).toBe('met')
    expect(summary.remainingQualifiedDays).toBe(0)
    expect(goalControl(p).state).toBe('met')
    expect(weekly({ ...p, todayIntent: 'training_preferred' })
      .candidates.some((item) => item.id === 'focus:training-plan:today')).toBe(false)
  })

  it('qualified workouts on the current preferred day do not trigger a second training session', () => {
    const p = plan({
      evidence: performed('2026-10-05', TODAY), programmed: 0,
      todayIntent: 'training_preferred',
    })
    expect(buildTrainingProgressSummary(p).status).toBe('open_day')
    expect(buildTrainingProgressSummary(p).detail).toContain('already qualified')
    expect(weekly(p).candidates.some((item) => item.id === 'focus:training-plan:today')).toBe(false)
  })

  it('a planned rest day remains optional even when not enough preferred weekdays are left', () => {
    const p = plan({ evidence: [], programmed: 0, todayIntent: 'rest', future: ['2026-10-09'] })
    expect(goalControl(p).state).toBe('flexible_week')
    expect(goalControl(p).detail).toContain('no workout is marked missed')
    expect(weekly(p).candidates.some((item) => item.id.startsWith('focus:training-plan:'))).toBe(false)
  })

  it('a rescheduled preferred day suggests a routine without calling it an obligation', () => {
    const p = plan({ todayIntent: 'training_moved_here', future: ['2026-10-11'] })
    expect(goalControl(p).state).toBe('training_day')
    const focus = weekly(p).candidates.find((item) => item.id === 'focus:training-plan:today')
    expect(focus?.fact).toContain('3 qualified strength days')
    expect(focus?.fact).toContain('not a requirement')
    expect(focus?.actionText).toContain('Routine B')
  })

  it('a moved-away training day never becomes a missed or required session', () => {
    const p = plan({ todayIntent: 'training_moved_away', future: [] })
    expect(goalControl(p).state).toBe('flexible_week')
    expect(weekly(p).candidates.some((item) => item.id.startsWith('focus:training-plan:'))).toBe(false)
  })

  it('future exercise rows cannot grant current as-of training day credit', () => {
    const evidence = performed('2026-10-05', '2026-10-09')
    expect(buildTrainingWeekQualification(evidence, TODAY).completedDays).toBe(1)
    expect(buildTrainingProgressSummary(plan({ evidence })).remainingQualifiedDays).toBe(2)
  })
})
