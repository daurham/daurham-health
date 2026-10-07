import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityDailyRow } from '../src/domain/activity/analytics.ts'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import progressWeeklyRoute, { readWeeklyCoachRequest } from '../server/handlers/progress-weekly.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'
import { demoWeeklyCoach } from '../src/demo/weekly-coach.ts'
import { addCalendarDays } from '../src/domain/progress/dates.ts'
import type { BodyObservation } from '../src/domain/progress/types.ts'
import type { NutritionEntry } from '../src/domain/nutrition/types.ts'
import type { ProactiveInsight } from '../src/domain/insights/types.ts'
import {
  WEEKLY_COACH_FALLBACK_COPY,
  WEEKLY_COACH_PACKET_VERSION,
  WEEKLY_COACH_PROMPT_VERSION,
  buildWeeklyCoachBrief,
  validateWeeklyCoachModel,
  weeklyCoachPeriods,
  type WeeklyCoachInput,
} from '../src/domain/weekly-coach/index.ts'
import { generateWeeklyCoach, readWeeklyCoach } from '../server/weekly-coach/service.ts'
import type { WeeklyCoachGate } from '../server/weekly-coach/gate.ts'
import { NutritionInterpretError } from '../src/domain/nutrition/interpret.ts'

const AS_OF = '2026-09-27'

const harness = vi.hoisted(() => ({
  input: null as WeeklyCoachInput | null,
}))

vi.mock('../server/weekly-coach/load.ts', () => ({
  loadWeeklyCoachInput: vi.fn(async () => {
    if (!harness.input) {
      throw new Error('missing weekly input')
    }
    return harness.input
  }),
}))

vi.mock('../server/intelligence/goal-control.ts', () => ({
  loadGoalControlState: vi.fn(async (asOf: string) => ({
    version: 'goal-control-v1',
    asOf,
    period: { start: asOf, end: asOf },
    state: 'maintain',
    headline: 'Stay the course',
    summary: 'No change recommended this week.',
    noChangeRecommended: true,
    confidence: 'moderate',
    primaryOpportunity: null,
    goals: [],
    nutritionQuality: {
      state: 'unknown',
      period: { start: asOf, end: asOf },
      loggedDays: 0,
      reliableDays: 0,
      estimateHeavyDays: 0,
      unknownQualityDays: 0,
      requiredLoggedDays: 4,
      requiredReliableDays: 4,
      detail: 'No completed Nutrition days are available for intake-based decisions this week.',
    },
    trainingAdherence: {
      configured: false,
      completedProgrammedSessions: 0,
      weeklyFrequencyTarget: null,
      remainingSessions: null,
      todayIntent: null,
      futureTrainingDates: [],
      state: 'unconfigured',
      detail: 'No flexible Training Plan is configured.',
    },
    relationships: [],
    limitations: [],
    maintenance: null,
  })),
}))

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

function blank(asOf = AS_OF): WeeklyCoachInput {
  return {
    asOf,
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
  }
}

function activity(date: string, steps: number): ActivityDailyRow {
  return {
    date,
    timezone: 'America/Phoenix',
    stepsCount: steps,
    activeEnergyKcal: null,
    exerciseMinutes: null,
    walkingRunningDistanceM: null,
    restingHeartRateBpm: null,
  }
}

function nights(start: string, count: number, minutes: number, source = 'wrist', name = 'Wrist tracker', eligible = true) {
  return Array.from({ length: count }, (_, index) => ({
    sleepDate: addCalendarDays(start, index),
    analysisEligible: eligible,
    totalSleepMinutes: minutes,
    timeInBedMinutes: minutes + 30,
    stageAnalysisEligible: false,
    coreMinutes: null,
    deepMinutes: null,
    remMinutes: null,
    unspecifiedSleepMinutes: null,
    logicalSourceKey: source,
    observationStatus: (eligible ? 'analysis_eligible' : 'partial_observation') as 'analysis_eligible' | 'partial_observation',
    sourceName: name,
  }))
}

function meal(date: string, protein: number | null, calories = 1800): NutritionEntry {
  return {
    id: date + String(protein),
    logDate: date,
    consumedAt: null,
    timezone: 'America/Phoenix',
    meal: null,
    foodId: null,
    foodName: 'Meal',
    brand: null,
    servingQuantity: 1,
    servingUnit: 'serving',
    grams: null,
    calories,
    protein,
    carbs: 100,
    fat: 40,
    fiber: null,
    sourceKind: 'manual',
    notes: null,
    mealGroupId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function weight(date: string, pounds: number): BodyObservation {
  return {
    measurementId: date,
    measurementSessionId: date,
    key: 'weight',
    value: pounds,
    unit: 'lb',
    valueKind: 'canonical',
    measuredAt: `${date}T15:00:00.000Z`,
    timezone: 'America/Phoenix',
    calendarDate: date,
  }
}

function insight(summary: string): ProactiveInsight {
  return {
    id: 'activity-steps',
    calculationVersion: 'proactive-insights-v1',
    kind: 'domain_change',
    domain: 'activity',
    title: 'Steps',
    summary,
    period: { start: '2026-09-13', end: '2026-09-26' },
    periodLabel: 'Completed week',
    evidence: [{ label: 'Steps', value: 'Higher' }],
    detailPath: '/progress/activity',
    ranking: { tier: 2, stableKey: 'activity-steps' },
  }
}

function model(text: string) {
  return async () => ({ text, model: 'gemini-3.5-flash', inputTokens: 10, outputTokens: 10 })
}

function gate(decision: Awaited<ReturnType<WeeklyCoachGate['take']>>): WeeklyCoachGate {
  return {
    take: vi.fn(async () => decision),
    store: vi.fn(),
    complete: vi.fn(async () => undefined),
    uncertain: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
  }
}

describe('weekly coach periods and evidence', () => {
  it('uses the seven completed dates before asOf and the seven before that', () => {
    expect(weeklyCoachPeriods('2026-09-27')).toEqual({
      period: { start: '2026-09-20', end: '2026-09-26' },
      previousPeriod: { start: '2026-09-13', end: '2026-09-19' },
    })
    const brief = buildWeeklyCoachBrief({
      ...blank(),
      activityDays: [
        ...['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'].map((date) => activity(date, 1000)),
        activity('2026-09-27', 99999),
      ],
    })
    expect(brief.period).toEqual({ start: '2026-09-20', end: '2026-09-26' })
    expect(brief.facts.some((fact) => fact.text.includes('99,999'))).toBe(false)
    expect(brief.facts.some((fact) => fact.text.includes('1,000'))).toBe(true)
  })

  it('keeps evidence after a historical asOf out of the week and the candidates', () => {
    const brief = buildWeeklyCoachBrief({
      ...blank('2026-09-20'),
      activityDays: [
        ...['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'].map((date) => activity(date, 8000)),
        activity('2026-09-21', 99999),
      ],
      performanceBests: [{ exerciseId: 'squat', name: 'Squat', date: '2026-09-21', summary: 'heavier load' }],
      trainingSessions: [{ performedOn: '2026-09-21', sessionType: 'programmed' }],
    })
    expect(brief.period).toEqual({ start: '2026-09-13', end: '2026-09-19' })
    expect(brief.facts.some((fact) => fact.text.includes('99,999'))).toBe(false)
    expect(brief.candidates.some((item) => item.id.includes('2026-09-21'))).toBe(false)
    expect(brief.facts.find((fact) => fact.domain === 'training')?.text.startsWith('0 canonical')).toBe(true)
  })

  it('requires two substantive domains before generation is eligible', () => {
    const one = buildWeeklyCoachBrief({
      ...blank(),
      trainingSessions: [{ performedOn: '2026-09-22', sessionType: 'programmed' }],
    })
    expect(one.state).toBe('insufficient_evidence')
    expect(one.canGenerate).toBe(false)
    const two = buildWeeklyCoachBrief({
      ...blank(),
      trainingSessions: [{ performedOn: '2026-09-22', sessionType: 'programmed' }],
      sleepNights: nights('2026-09-20', 4, 420),
    })
    expect(two.canGenerate).toBe(true)
    expect(two.coverage.substantiveDomains).toEqual(['sleep', 'training'])
  })

  it('keeps nutrition missing days missing and protein unknowns out of the target ratio', () => {
    const target = {
      id: 'target',
      effectiveFrom: '2026-01-01',
      caloriesTarget: 2000,
      proteinTarget: 100,
      carbsTarget: null,
      fatTarget: null,
      fiberTarget: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const sparse = buildWeeklyCoachBrief({
      ...blank(),
      nutritionEntries: ['2026-09-20', '2026-09-21', '2026-09-22'].map((date) => meal(date, 140, 2100)),
      nutritionTargets: [target],
    })
    expect(sparse.facts.find((fact) => fact.id === 'fact:nutrition:coverage')?.text).toContain('3 of 7')
    expect(sparse.facts.find((fact) => fact.id === 'fact:nutrition:calories')?.text).toContain('2,100')
    expect(sparse.candidates.find((item) => item.id === 'watch:coverage:nutrition')?.fact).toContain('3 of 7')
    expect(sparse.candidates.some((item) => /diet|fewer calories|more calories/i.test(item.fact + (item.actionText ?? '')))).toBe(false)

    const dates = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
    const qualifying = buildWeeklyCoachBrief({
      ...blank(),
      nutritionEntries: dates.map((date, index) => meal(date, index === 5 ? 40 : 120)),
      nutritionTargets: [target],
      trainingSessions: [{ performedOn: '2026-09-22', sessionType: 'ad_hoc' }],
    })
    expect(qualifying.candidates.some((item) => item.id === 'win:nutrition-protein')).toBe(true)
    expect(qualifying.candidates.find((item) => item.id === 'win:nutrition-protein')?.fact).toContain('5 of 6')
    const short = buildWeeklyCoachBrief({
      ...blank(),
      nutritionEntries: dates.map((date, index) => meal(date, index < 4 ? 120 : 40)),
      nutritionTargets: [target],
    })
    expect(short.candidates.some((item) => item.id === 'win:nutrition-protein')).toBe(false)
  })

  it('excludes partial sleep from the weekly average and withholds a cross-source comparison', () => {
    const partial = buildWeeklyCoachBrief({
      ...blank(),
      sleepNights: [...nights('2026-09-20', 2, 400), ...nights('2026-09-22', 4, 100, 'wrist', 'Wrist tracker', false)],
    })
    const sleep = partial.facts.find((fact) => fact.id === 'fact:sleep:duration')?.text ?? ''
    expect(sleep.startsWith('2 analysis-eligible')).toBe(true)
    expect(sleep).toContain('6h 40m')
    expect(sleep).not.toContain('1h 40m')

    const switched = buildWeeklyCoachBrief({
      ...blank(),
      sleepNights: [
        ...nights('2026-09-13', 4, 400, 'wrist', 'Wrist tracker'),
        ...nights('2026-09-20', 4, 430, 'bedside', 'Bedside sensor'),
      ],
    })
    const compared = switched.facts.find((fact) => fact.id === 'fact:sleep:duration')?.text ?? ''
    expect(compared).not.toContain('Compared with')
    expect(switched.candidates.find((item) => item.id === 'watch:sleep-source')?.fact).toContain('Wrist tracker')
    expect(switched.candidates.find((item) => item.id === 'watch:sleep-source')?.fact).toContain('Bedside sensor')
  })

  it('counts canonical training only and keeps a genuine weekly performance best', () => {
    const brief = buildWeeklyCoachBrief({
      ...blank(),
      trainingSessions: [
        { performedOn: '2026-09-22', sessionType: 'programmed' },
        { performedOn: '2026-09-23', sessionType: 'apple_workout' },
      ],
      performanceBests: [
        { exerciseId: 'squat', name: 'Squat', date: '2026-09-22', summary: 'heavier load' },
        { exerciseId: 'row', name: 'Row', date: '2026-09-10', summary: 'older best' },
      ],
    })
    expect(brief.facts.find((fact) => fact.domain === 'training')?.text).toContain('1 canonical Training session')
    expect(brief.wentWell.map((item) => item.id)).toEqual(['win:training-pr:squat:2026-09-22'])
    expect(brief.candidates.some((item) => item.fact.includes('older best'))).toBe(false)
  })

  it('does not treat a step increase or a weight decrease as something that went well', () => {
    const brief = buildWeeklyCoachBrief({
      ...blank(),
      activityDays: [
        ...['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16'].map((date) => activity(date, 4000)),
        ...['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'].map((date) => activity(date, 8000)),
      ],
      bodyObservations: ['2026-08-01', '2026-08-10', '2026-08-20', '2026-09-01', '2026-09-22'].map((date, index) =>
        weight(date, 200 - index),
      ),
      insights: [insight('Completed-day step average changed compared with the prior period.')],
    })
    expect(brief.wentWell).toEqual([])
    expect(brief.facts.some((fact) => fact.text.includes('higher'))).toBe(true)
    expect(brief.facts.some((fact) => /\bbetter\b/i.test(fact.text))).toBe(false)
    const watch = brief.candidates.find((item) => item.id === 'watch:insight:activity-steps')
    expect(watch?.fact).toBe('Completed-day step average changed compared with the prior period.')
    expect(watch?.evidenceRefs).toEqual(['activity-steps:Steps'])
  })

  it('reuses goal states without completing the goal or relabeling a missing projection', () => {
    const goals = [
      { id: 'met', label: 'Protein', kind: 'nutrition', lifecycle: 'active', targetState: 'satisfied', deadlineState: 'projected_before_deadline' },
      { id: 'track', label: 'Squat', kind: 'strength', lifecycle: 'active', targetState: 'below_target', deadlineState: 'projected_before_deadline' },
      { id: 'late', label: 'Bodyweight', kind: 'body_metric', lifecycle: 'active', targetState: 'above_target', deadlineState: 'projected_after_deadline' },
      { id: 'open', label: 'Sleep', kind: 'sleep', lifecycle: 'active', targetState: 'below_target', deadlineState: 'future_no_projection' },
      { id: 'past', label: 'Waist', kind: 'body_metric', lifecycle: 'active', targetState: 'above_target', deadlineState: 'passed_unmet' },
    ]
    const brief = buildWeeklyCoachBrief({ ...blank(), goals, sleepNights: nights('2026-09-20', 4, 420) })
    expect(goals.every((goal) => goal.lifecycle === 'active')).toBe(true)
    expect(brief.wentWell.map((item) => item.id)).toEqual(['win:goal:met', 'win:goal:track'])
    expect(brief.candidates.find((item) => item.id === 'watch:goal:late')?.fact).toBe('Bodyweight is off track.')
    expect(brief.candidates.find((item) => item.id === 'watch:goal:open')?.fact).toContain('no projection')
    expect(brief.candidates.find((item) => item.id === 'watch:goal:open')?.fact).not.toContain('off track')
    expect(brief.focus?.actionText).toBe('Review your Waist goal because its target date has passed.')
  })

  it('limits focus to an existing due cadence, due retest, or ready experiment', () => {
    const due = buildWeeklyCoachBrief({
      ...blank(),
      cadenceDue: [{ key: 'waist', label: 'Waist', status: 'due' }],
      retests: [{ id: 'bench', title: 'Bench protocol', status: 'available' }],
      experiments: [{ id: 'exp', title: 'Creatine check', reviewReady: false, completedInWeek: false }],
      sleepNights: nights('2026-09-20', 4, 420),
      trainingSessions: [{ performedOn: '2026-09-22', sessionType: 'experiment' }],
    })
    expect(due.focus?.id).toBe('focus:body-cadence:waist')
    expect(due.focus?.actionText).toBe('Record your scheduled Waist measurement.')
    expect(due.candidates.some((item) => item.id === 'focus:benchmark:bench')).toBe(false)
    expect(due.candidates.some((item) => item.id === 'focus:experiment:exp')).toBe(false)

    const ready = buildWeeklyCoachBrief({
      ...blank(),
      retests: [{ id: 'bench', title: 'Bench protocol', status: 'due' }],
      experiments: [{ id: 'exp', title: 'Creatine check', reviewReady: true, completedInWeek: false }],
    })
    expect(ready.candidates.some((item) => item.id === 'focus:benchmark:bench')).toBe(true)
    expect(ready.candidates.some((item) => item.id === 'focus:experiment:exp')).toBe(true)
    expect(ready.focus?.id).toBe('focus:benchmark:bench')

    const none = buildWeeklyCoachBrief({
      ...blank(),
      cadenceDue: [{ key: 'waist', label: 'Waist', status: 'current' }],
    })
    expect(none.candidates.some((item) => item.kind === 'body_cadence')).toBe(false)
  })

  it('keeps unknown supplement occurrences unknown', () => {
    const brief = buildWeeklyCoachBrief({
      ...blank(),
      supplements: [
        {
          id: 'creatine',
          name: 'Creatine',
          sortOrder: 1,
          schedules: [
            {
              id: 'daily',
              supplementId: 'creatine',
              slotLabel: null,
              doseAmount: 5,
              doseUnit: 'g',
              weekdayMask: 127,
              effectiveFrom: '2026-01-01',
              effectiveThrough: null,
              sortOrder: 1,
            },
          ],
          events: [{ effectiveDate: '2026-01-01', status: 'active' }],
          adherence: ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'].map((date) => ({
            scheduleId: 'daily',
            scheduledDate: date,
            status: 'taken' as const,
            actualDoseAmount: 5,
            actualDoseUnit: 'g',
          })),
        },
      ],
    })
    expect(brief.facts.find((fact) => fact.domain === 'supplements')?.text).toBe('Creatine: 6 taken, 1 unknown, 0 skipped.')
    expect(brief.coverage.supplements).toBe(true)
  })
})

describe('weekly coach model contract', () => {
  it('rejects an invented focus, a section move, a number, and a new experiment', () => {
    const brief = buildWeeklyCoachBrief({
      ...blank(),
      goals: [{ id: 'past', label: 'Waist', kind: 'body_metric', lifecycle: 'active', targetState: 'above_target', deadlineState: 'passed_unmet' }],
      insights: [insight('Completed-day step average changed compared with the prior period.')],
      sleepNights: nights('2026-09-20', 4, 420),
    })
    expect(validateWeeklyCoachModel('{"focus":{"candidate_ref":"invented.action","comment":"Do this."}}', brief)).toBeNull()
    expect(
      validateWeeklyCoachModel(
        JSON.stringify({
          went_well: [],
          worth_watching: [],
          focus: { candidate_ref: 'watch:insight:activity-steps', comment: 'Keep this in view.' },
        }),
        brief,
      ),
    ).toBeNull()
    expect(
      validateWeeklyCoachModel(
        JSON.stringify({
          went_well: [],
          worth_watching: [{ candidate_ref: 'watch:insight:activity-steps', comment: 'The average moved by 8 percent.' }],
          focus: null,
        }),
        brief,
      ),
    ).toBeNull()
    expect(
      validateWeeklyCoachModel(
        JSON.stringify({
          intro: { text: 'Try a new experiment this week.' },
          went_well: [],
          worth_watching: [],
          focus: null,
        }),
        brief,
      ),
    ).toBeNull()
    const accepted = validateWeeklyCoachModel(
      JSON.stringify({
        intro: { text: 'One goal needs a look, and one change is worth keeping in view.' },
        went_well: [],
        worth_watching: [{ candidate_ref: 'watch:insight:activity-steps', comment: 'The change is context, not a verdict.' }],
        focus: { candidate_ref: 'focus:goal:past', comment: 'Review the goal whose date has passed.' },
      }),
      brief,
    )
    expect(accepted?.focusId).toBe('focus:goal:past')
    expect(accepted?.worthWatchingIds).toEqual(['watch:insight:activity-steps'])
    expect(brief.focus?.actionText).toContain('Review your Waist goal')
  })
})

describe('weekly coach generation', () => {
  beforeEach(() => {
    harness.input = {
      ...blank(),
      sleepNights: nights('2026-09-20', 4, 420),
      trainingSessions: [{ performedOn: '2026-09-22', sessionType: 'programmed' }],
    }
  })

  it('does not call the provider while reading the week', async () => {
    const provider = vi.fn(model('{}'))
    const used = gate({ ok: true, cached: null, usageId: 'should-not-reserve' })
    const read = await readWeeklyCoach(AS_OF)
    expect(read.brief.packetVersion).toBe(WEEKLY_COACH_PACKET_VERSION)
    expect(read.commentary).toBeNull()
    expect(provider).not.toHaveBeenCalled()
    expect(used.take).not.toHaveBeenCalled()
  })

  it('skips the provider when the week is not substantive or the budget or rate gate refuses', async () => {
    harness.input = { ...blank(), trainingSessions: [{ performedOn: '2026-09-22', sessionType: 'programmed' }] }
    const provider = vi.fn(model('{}'))
    const sparse = await generateWeeklyCoach({ asOf: AS_OF, provider, gate: gate({ ok: false, reason: 'budget' }) })
    expect(sparse.brief.state).toBe('insufficient_evidence')
    expect(sparse.notice).toBeNull()
    expect(provider).not.toHaveBeenCalled()

    harness.input = {
      ...blank(),
      sleepNights: nights('2026-09-20', 4, 420),
      trainingSessions: [{ performedOn: '2026-09-22', sessionType: 'programmed' }],
    }
    const blocked = gate({ ok: false, reason: 'budget' })
    const budget = await generateWeeklyCoach({ asOf: AS_OF, provider, gate: blocked })
    expect(budget.notice).toContain('monthly budget')
    expect(budget.brief.facts.length).toBeGreaterThan(0)
    expect(provider).not.toHaveBeenCalled()

    const limited = await generateWeeklyCoach({
      asOf: AS_OF,
      provider,
      gate: gate({ ok: false, reason: 'rate' }),
    })
    expect(limited.notice).toContain('too quickly')
    expect(provider).not.toHaveBeenCalled()
  })

  it('keeps the deterministic brief when the provider fails or returns an invalid selection', async () => {
    const invalid = gate({ ok: true, cached: null, usageId: 'usage-1' })
    const rejected = await generateWeeklyCoach({
      asOf: AS_OF,
      provider: model('{"focus":{"candidate_ref":"invented.action","comment":"Cut calories."}}'),
      gate: invalid,
    })
    expect(rejected.notice).toBe(WEEKLY_COACH_FALLBACK_COPY)
    expect(rejected.brief.packetVersion).toBe(WEEKLY_COACH_PACKET_VERSION)
    expect(invalid.complete).toHaveBeenCalled()
    expect(rejected.commentary).toBeNull()

    const failed = gate({ ok: true, cached: null, usageId: 'usage-2' })
    const timeout = await generateWeeklyCoach({
      asOf: AS_OF,
      provider: async () => {
        throw new Error('timeout')
      },
      gate: failed,
    })
    expect(failed.uncertain).toHaveBeenCalledWith('usage-2', expect.any(Number))
    expect(timeout.brief.facts.length).toBeGreaterThan(0)

    const missing = gate({ ok: true, cached: null, usageId: 'usage-3' })
    const unconfigured = await generateWeeklyCoach({
      asOf: AS_OF,
      provider: async () => {
        throw new NutritionInterpretError('GEMINI_NOT_CONFIGURED', 'unavailable')
      },
      gate: missing,
    })
    expect(missing.release).toHaveBeenCalledWith('usage-3', expect.any(Number))
    expect(unconfigured.notice).toBe(WEEKLY_COACH_FALLBACK_COPY)
  })

  it('shares the monthly budget and does not filter the rate gate by request type', () => {
    const ledger = readFileSync('server/ai-usage/ledger.ts', 'utf8')
    const attempts = ledger.slice(ledger.indexOf('WITH attempts'), ledger.indexOf('charged AS'))
    expect(attempts).not.toContain('request_type')
    const gateSource = readFileSync('server/weekly-coach/gate.ts', 'utf8')
    expect(gateSource).toContain("requestType: WEEKLY_COACH_REQUEST_TYPE")
    expect(gateSource).toContain('monthlyBudgetUsd')
    expect(readFileSync('server/ai-usage/config.ts', 'utf8')).not.toContain('WEEKLY_COACH_MONTHLY')
    expect(WEEKLY_COACH_PROMPT_VERSION).toBe('weekly-coach-v3')
  })
})

describe('weekly coach route', () => {
  beforeEach(() => {
    harness.input = blank()
  })

  it('rejects anonymous callers, non-owners, ingest tokens, and the wrong method', async () => {
    const anonymous = await call('GET', null)
    expect(anonymous.status()).toBe(401)
    const other = await call('GET', { id: 'someone', email: 'other@example.com' })
    expect(other.status()).toBe(403)
    const token = await call('GET', null, { authorization: 'Bearer ingest-token' })
    expect(token.status()).toBe(401)
    const wrong = captureResponse()
    await progressWeeklyRoute(request('PUT', '/api/progress/weekly'), wrong.res)
    expect(wrong.status()).toBe(405)
    expect(wrong.allow()).toBe('GET, POST')
    const owner = await call('GET', { id: 'owner-1', email: 'owner@example.com' })
    expect(owner.status()).toBe(200)
    expect(owner.body()).toMatchObject({ brief: { state: 'insufficient_evidence' }, commentary: null })
    expect(matchHealthApiRoute('/api/progress/weekly')).toBe('progress-weekly')
  })

  it('does not write canonical health rows or persist coach prose', () => {
    const load = readFileSync('server/weekly-coach/load.ts', 'utf8')
    const domain = readFileSync('src/domain/weekly-coach/build.ts', 'utf8')
    const handler = readFileSync('server/handlers/progress-weekly.ts', 'utf8')
    const page = readFileSync('src/features/weekly-coach/WeeklyCoachPage.tsx', 'utf8')
    expect(load).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/)
    expect(domain).not.toMatch(/deriveProactiveInsights|detectActivityChange/)
    expect(handler).toContain('withOwnerAuth')
    expect(handler).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(page).not.toContain('localStorage')
    expect(readFileSync('server/handlers/today.ts', 'utf8')).not.toContain('weekly')
    const read = readFileSync('server/weekly-coach/service.ts', 'utf8')
    const reader = read.slice(read.indexOf('export async function readWeeklyCoach'), read.indexOf('export async function generateWeeklyCoach'))
    expect(reader).not.toContain('gate')
    expect(reader).not.toContain('Gemini')
  })

  it('builds the demo brief from fixtures without a provider', () => {
    const example = demoWeeklyCoach()
    expect(example.label).toContain('not generated live')
    expect(example.brief.period).toEqual({ start: '2026-09-08', end: '2026-09-14' })
    expect(example.brief.facts.some((fact) => fact.text.includes('20,000'))).toBe(false)
    expect(example.brief.facts.some((fact) => fact.text.includes('1 canonical'))).toBe(true)
    expect(example.brief.focus?.actionText).toContain('Log Nutrition more consistently')
    expect(example.commentary?.focusId).toBe(example.brief.focus?.id)
    const source = readFileSync('src/demo/weekly-coach.ts', 'utf8')
    expect(source).not.toMatch(/gemini|healthFetch|\/api\/|ai_usage/i)
  })
})

function request(method: string, url: string, headers: Record<string, string> = {}): ApiRequest {
  return { method, url, headers, async *[Symbol.asyncIterator]() {} } as ApiRequest
}

function captureResponse(): { res: ApiResponse; status: () => number; allow: () => string | undefined; body: () => unknown } {
  const nodeRes = new ServerResponse(new IncomingMessage(new Socket()))
  const res = wrapNodeResponse(nodeRes)
  let statusCode = 200
  let payload: unknown
  const headers = new Map<string, string>()
  res.setHeader = ((name: string, value: string) => {
    headers.set(name.toLowerCase(), value)
    return res
  }) as ApiResponse['setHeader']
  res.status = (code: number) => {
    statusCode = code
    return res
  }
  res.json = ((value: unknown) => {
    payload = value
    return res
  }) as ApiResponse['json']
  return { res, status: () => statusCode, allow: () => headers.get('allow'), body: () => payload }
}

function call(method: string, identity: { id: string; email: string } | null, headers: Record<string, string> = {}) {
  const captured = captureResponse()
  return withOwnerAuth(readWeeklyCoachRequest, {
    config: ownerConfig,
    readSession: async () => identity,
  })(request(method, '/api/progress/weekly', headers), captured.res).then(() => captured)
}
