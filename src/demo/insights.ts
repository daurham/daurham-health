import { deriveProactiveInsights, type ProactiveInsights } from '../domain/insights/index.js'
import { addCalendarDays } from '../domain/progress/dates.js'
import type { ActivityDailyRow } from '../domain/activity/analytics.js'
import { DEMO_AS_OF } from './constants.js'
import { demoPatterns } from './repository.js'

function activityDay(date: string, steps: number): ActivityDailyRow {
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

function emptyInput(asOf: string) {
  return {
    range: '90d' as const,
    asOf,
    today: asOf,
    activityDays: [] as ActivityDailyRow[],
    sleepNights: [],
    nutritionDays: [],
    trainingSessions: [],
    bodyWeights: [],
    strengthExercises: [],
    findings: [],
    weightGoalId: null,
  }
}

/** Calculated from a fixed step series plus the demo cross-domain engine. */
export function demoInsightExamples(): ProactiveInsights {
  const currentEnd = addCalendarDays(DEMO_AS_OF, -1)
  const currentStart = addCalendarDays(currentEnd, -20)
  const previousEnd = addCalendarDays(currentStart, -1)
  const activityDays: ActivityDailyRow[] = []
  for (let offset = 0; offset < 14; offset += 1) {
    activityDays.push(activityDay(addCalendarDays(currentEnd, -offset), 6410))
    activityDays.push(activityDay(addCalendarDays(previousEnd, -offset), 5431))
  }
  return deriveProactiveInsights({
    ...emptyInput(DEMO_AS_OF),
    activityDays,
    findings: demoPatterns().findings.filter((finding) => finding.surfaced).slice(0, 1),
  })
}

export function demoInsightEmpty(): ProactiveInsights {
  return deriveProactiveInsights(emptyInput(DEMO_AS_OF))
}
