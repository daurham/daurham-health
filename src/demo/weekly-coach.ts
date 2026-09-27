import type { ActivityDailyRow } from '@/domain/activity/analytics'
import type { NutritionEntry, NutritionTarget } from '@/domain/nutrition/types'
import type { ProactiveInsight } from '@/domain/insights/types'
import { buildWeeklyCoachBrief, type WeeklyCoachBrief, type WeeklyCoachCommentary, type WeeklyCoachInput } from '@/domain/weekly-coach'
import { DEMO_AS_OF } from './constants'
import { EVERY_DAY_MASK } from '@/domain/supplements/weekday'

const WEEK_START = '2026-09-08'
const PREVIOUS_START = '2026-09-01'

export function demoWeeklyCoach(): { brief: WeeklyCoachBrief; commentary: WeeklyCoachCommentary; label: string } {
  const brief = buildWeeklyCoachBrief(demoWeeklyInput())
  const comments: Record<string, string> = {}
  const pr = brief.wentWell.find((item) => item.kind === 'training_pr')
  if (pr) {
    comments[pr.id] = 'The performance best is the completed result in this example week.'
  }
  if (brief.focus?.id === 'focus:nutrition-coverage') {
    comments[brief.focus.id] = 'This reminder only asks for more logged days in the example.'
  }
  return {
    brief,
    commentary: {
      intro: pr ? 'This example keeps the completed training result and the coverage notes already in the packet.' : null,
      comments,
      wentWellIds: brief.wentWell.map((item) => item.id),
      worthWatchingIds: brief.worthWatching.map((item) => item.id),
      focusId: brief.focus?.id ?? null,
    },
    label: 'Example coach brief — not generated live',
  }
}

function demoWeeklyInput(): WeeklyCoachInput {
  return {
    asOf: DEMO_AS_OF,
    activityDays: [
      ...steps(PREVIOUS_START, 5, 5400),
      ...steps(WEEK_START, 5, 6200),
      activityRow(DEMO_AS_OF, 20000),
    ],
    sleepNights: nights(WEEK_START, 5, 'wrist', 'Wrist tracker', 430),
    nutritionEntries: [entry('2026-09-08'), entry('2026-09-09'), entry('2026-09-10')],
    nutritionTargets: [target()],
    trainingSessions: [
      { performedOn: '2026-09-11', sessionType: 'ad_hoc' },
      { performedOn: '2026-09-12', sessionType: 'apple_workout' },
    ],
    performanceBests: [{ exerciseId: 'squat', name: 'Back squat', date: '2026-09-11', summary: 'heavier load' }],
    bodyObservations: [],
    supplements: [
      {
        id: 'creatine',
        name: 'Creatine',
        sortOrder: 1,
        schedules: [
          {
            id: 'creatine-daily',
            supplementId: 'creatine',
            slotLabel: null,
            doseAmount: 5,
            doseUnit: 'g',
            weekdayMask: EVERY_DAY_MASK,
            effectiveFrom: '2026-01-01',
            effectiveThrough: null,
            sortOrder: 1,
          },
        ],
        events: [{ effectiveDate: '2026-01-01', status: 'active' }],
        adherence: ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'].map((date) => ({
          scheduleId: 'creatine-daily',
          scheduledDate: date,
          status: 'taken' as const,
          actualDoseAmount: 5,
          actualDoseUnit: 'g',
        })),
      },
    ],
    goals: [],
    experiments: [],
    retests: [],
    benchmarkResults: [],
    reviewCaptures: [],
    cadenceDue: [],
    insights: [stepInsight()],
    sleepBaseline: null,
    activeBodyGoal: false,
  }
}

function steps(start: string, count: number, value: number): ActivityDailyRow[] {
  return Array.from({ length: count }, (_, index) => activityRow(shift(start, index), value))
}

function activityRow(date: string, stepsCount: number): ActivityDailyRow {
  return {
    date,
    timezone: 'America/Phoenix',
    stepsCount,
    activeEnergyKcal: null,
    exerciseMinutes: null,
    walkingRunningDistanceM: null,
    restingHeartRateBpm: null,
  }
}

function nights(start: string, count: number, key: string, name: string, minutes: number): WeeklyCoachInput['sleepNights'] {
  return Array.from({ length: count }, (_, index) => ({
    sleepDate: shift(start, index),
    analysisEligible: true,
    totalSleepMinutes: minutes,
    timeInBedMinutes: minutes + 20,
    stageAnalysisEligible: false,
    coreMinutes: null,
    deepMinutes: null,
    remMinutes: null,
    unspecifiedSleepMinutes: null,
    logicalSourceKey: key,
    observationStatus: 'analysis_eligible' as const,
    sourceName: name,
  }))
}

function entry(logDate: string): NutritionEntry {
  return {
    id: `entry-${logDate}`,
    logDate,
    consumedAt: null,
    timezone: 'America/Phoenix',
    meal: null,
    foodId: null,
    foodName: 'Example meal',
    brand: null,
    servingQuantity: 1,
    servingUnit: 'serving',
    grams: null,
    calories: 1800,
    protein: 140,
    carbs: 160,
    fat: 60,
    fiber: null,
    mealGroupId: null,
    sourceKind: 'manual',
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function target(): NutritionTarget {
  return {
    id: 'target',
    effectiveFrom: '2026-01-01',
    caloriesTarget: 2000,
    proteinTarget: 150,
    carbsTarget: null,
    fatTarget: null,
    fiberTarget: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function stepInsight(): ProactiveInsight {
  return {
    id: 'activity-steps-change',
    calculationVersion: 'proactive-insights-v1',
    kind: 'domain_change',
    domain: 'activity',
    title: 'Steps changed',
    summary: 'Completed-day step average changed compared with the prior period.',
    period: { start: PREVIOUS_START, end: '2026-09-14' },
    periodLabel: 'Prior period compared with the completed week',
    evidence: [{ label: 'Steps', value: 'Higher on completed days' }],
    detailPath: '/progress/activity',
    ranking: { tier: 2, stableKey: 'activity-steps-change' },
  }
}

function shift(start: string, days: number): string {
  const [year, month, day] = start.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
