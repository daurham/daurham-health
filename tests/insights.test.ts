import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityDailyRow } from '../src/domain/activity/analytics.ts'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import progressInsightsRoute, { handleProgressInsights } from '../server/handlers/progress-insights.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'
import { demoInsightEmpty, demoInsightExamples } from '../src/demo/insights.ts'
import {
  BODY_WEIGHT_MIN_SLOPE_LB_PER_WEEK,
  INSIGHTS_EMPTY_COPY,
  PROACTIVE_INSIGHTS_VERSION,
  detectActivityChange,
  detectNutritionChange,
  detectSleepDurationChange,
  detectStrengthTrend,
  deriveProactiveInsights,
  type InsightDetectorInput,
  type InsightNutritionDay,
  type InsightSleepNight,
} from '../src/domain/insights/index.ts'
import { GROUP_MIN_DAYS, RHO_STRONG, SPEARMAN_MIN_PAIRS } from '../src/domain/intelligence/config.ts'
import { analyzeCrossDomain, type CrossDomainFinding } from '../src/domain/intelligence/index.ts'
import { addCalendarDays } from '../src/domain/progress/dates.ts'
import { estimatedStrengthTrend } from '../src/domain/progress/exercise-trend.ts'
import { PROGRESS_ANALYTICS_CONFIG } from '../src/domain/progress/config.ts'
import { poundsToKilograms } from '../src/domain/units.ts'
import type { BodyObservation, SessionStrengthPoint } from '../src/domain/progress/types.ts'

const AS_OF = '2026-09-27'

const service = vi.hoisted(() => ({ getProactiveInsights: vi.fn() }))
vi.mock('../server/insights/service.ts', () => service)

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

function input(partial: Partial<InsightDetectorInput> = {}): InsightDetectorInput {
  return {
    range: '30d',
    asOf: AS_OF,
    today: null,
    activityDays: [],
    sleepNights: [],
    nutritionDays: [],
    trainingSessions: [],
    bodyWeights: [],
    strengthExercises: [],
    findings: [],
    weightGoalId: null,
    ...partial,
  }
}

function activity(date: string, steps: number | null, energy: number | null = null, exercise: number | null = null): ActivityDailyRow {
  return {
    date,
    timezone: 'America/Phoenix',
    stepsCount: steps,
    activeEnergyKcal: energy,
    exerciseMinutes: exercise,
    walkingRunningDistanceM: 12000,
    restingHeartRateBpm: 50,
  }
}

function daysEnding(end: string, count: number, steps: number, energy: number | null = null): ActivityDailyRow[] {
  return Array.from({ length: count }, (_, index) => activity(addCalendarDays(end, -index), steps, energy))
}

function night(date: string, minutes: number, source = 'apple_watch', name = 'Apple Watch'): InsightSleepNight {
  return {
    sleepDate: date,
    analysisEligible: true,
    totalSleepMinutes: minutes,
    logicalSourceKey: source,
    sourceName: name,
  }
}

function nightsEnding(end: string, count: number, minutes: number, source = 'apple_watch', name = 'Apple Watch'): InsightSleepNight[] {
  return Array.from({ length: count }, (_, index) => night(addCalendarDays(end, -index), minutes, source, name))
}

function logged(date: string, calories: number | null, protein: number | null = null): InsightNutritionDay {
  return { date, calories, protein }
}

function loggedEnding(end: string, count: number, calories: number, protein: number | null = null): InsightNutritionDay[] {
  return Array.from({ length: count }, (_, index) => logged(addCalendarDays(end, -index), calories, protein))
}

function weight(date: string, value: number, unit = 'lb'): BodyObservation {
  return {
    measurementId: `${date}-${unit}`,
    measurementSessionId: date,
    key: 'weight',
    value,
    unit,
    valueKind: 'scalar',
    measuredAt: `${date}T15:00:00.000Z`,
    timezone: 'America/Phoenix',
    calendarDate: date,
  }
}

function weeklyWeights(slopePerWeek: number, unit = 'lb'): BodyObservation[] {
  return Array.from({ length: 5 }, (_, index) => weight(addCalendarDays('2026-08-01', index * 7), 180 + slopePerWeek * index, unit))
}

function strengthExercise(id: string, name: string, latestDate: string, values: number[]) {
  const points = values.map((estimated1RmKg, index) => ({
    sessionId: `${id}-${index}`,
    sessionExerciseId: `${id}-appearance-${index}`,
    exerciseId: id,
    date: addCalendarDays('2026-08-01', index),
    estimated1RmKg,
    sourceSet: { weightKg: 100, reps: 5 },
  })) as SessionStrengthPoint[]
  return { exerciseId: id, name, latestDate, trend: estimatedStrengthTrend(points) }
}

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

describe('activity insights', () => {
  it('keeps a 13-day window ineligible and a 14-day window comparable', () => {
    const currentEnd = AS_OF
    const previousEnd = addCalendarDays(currentEnd, -21)
    const thin = detectActivityChange(
      input({
        activityDays: [...daysEnding(currentEnd, 13, 1100), ...daysEnding(previousEnd, 14, 1000)],
      }),
    )
    expect(thin[0]?.status).toBe('insufficient_evidence')
    expect(thin[0]?.insight).toBeUndefined()
    const comparable = detectActivityChange(
      input({
        activityDays: [...daysEnding(currentEnd, 14, 1050), ...daysEnding(previousEnd, 14, 1000)],
      }),
    )
    expect(comparable[0]?.status).toBe('below_surfacing_threshold')
  })

  it('surfaces a 10% completed-day change and withholds 9%', () => {
    const currentEnd = AS_OF
    const previousEnd = addCalendarDays(currentEnd, -21)
    const below = deriveProactiveInsights(
      input({ activityDays: [...daysEnding(currentEnd, 14, 1090), ...daysEnding(previousEnd, 14, 1000)] }),
    )
    expect(below.insights).toEqual([])
    const surfaced = deriveProactiveInsights(
      input({ activityDays: [...daysEnding(currentEnd, 14, 1100), ...daysEnding(previousEnd, 14, 1000)] }),
    )
    expect(surfaced.insights).toHaveLength(1)
    expect(surfaced.insights[0]?.summary).toContain('increased 10%')
    expect(surfaced.insights[0]?.summary).not.toMatch(/improved|worsened/)
    expect(surfaced.calculationVersion).toBe(PROACTIVE_INSIGHTS_VERSION)
  })

  it('excludes the provisional current day', () => {
    const currentEnd = addCalendarDays(AS_OF, -1)
    const previousEnd = addCalendarDays(currentEnd, -21)
    const result = deriveProactiveInsights(
      input({
        today: AS_OF,
        activityDays: [
          ...daysEnding(currentEnd, 14, 1100),
          ...daysEnding(previousEnd, 14, 1000),
          activity(AS_OF, 50000),
        ],
      }),
    )
    expect(result.insights[0]?.summary).toContain('increased 10%')
    expect(JSON.stringify(result.insights)).not.toContain('50,000')
  })

  it('keeps one activity card when steps and energy both qualify', () => {
    const currentEnd = AS_OF
    const previousEnd = addCalendarDays(currentEnd, -21)
    const result = deriveProactiveInsights(
      input({
        activityDays: [
          ...daysEnding(currentEnd, 14, 1200, 1150),
          ...daysEnding(previousEnd, 14, 1000, 1000),
        ],
      }),
    )
    expect(result.insights.filter((item) => item.domain === 'activity')).toHaveLength(1)
    expect(result.insights[0]?.id).toContain('steps')
  })
})

describe('sleep insights', () => {
  const currentEnd = AS_OF
  const previousEnd = addCalendarDays(currentEnd, -14)

  it('requires 7 complete nights and a 30 minute difference', () => {
    const six = detectSleepDurationChange(
      input({
        sleepNights: [...nightsEnding(currentEnd, 6, 400), ...nightsEnding(previousEnd, 7, 430)],
      }),
    )
    expect(six[0]?.status).toBe('insufficient_evidence')
    const comparable = detectSleepDurationChange(
      input({
        sleepNights: [...nightsEnding(currentEnd, 7, 401), ...nightsEnding(previousEnd, 7, 430)],
      }),
    )
    expect(comparable[0]?.status).toBe('below_surfacing_threshold')
    const surfaced = deriveProactiveInsights(
      input({
        sleepNights: [...nightsEnding(currentEnd, 7, 400), ...nightsEnding(previousEnd, 7, 430)],
      }),
    )
    expect(surfaced.insights).toHaveLength(1)
    expect(surfaced.insights[0]?.summary).toContain('30m lower')
    expect(surfaced.insights[0]?.summary).not.toMatch(/worse|bad/)
    expect(surfaced.insights[0]?.evidence.some((item) => item.value === 'Apple Watch')).toBe(true)
  })

  it('withholds a duration card when the source is mixed, switched, or unknown', () => {
    const mixed = [...nightsEnding(currentEnd, 7, 400), ...nightsEnding(previousEnd, 7, 450)]
    mixed[0] = night(mixed[0]!.sleepDate, 400, 'bedside', 'Bedside sensor')
    expect(detectSleepDurationChange(input({ sleepNights: mixed }))[0]?.status).toBe('source_not_comparable')
    const switched = [
      ...nightsEnding(currentEnd, 7, 400, 'apple_watch', 'Apple Watch'),
      ...nightsEnding(previousEnd, 7, 450, 'bedside', 'Bedside sensor'),
    ]
    expect(detectSleepDurationChange(input({ sleepNights: switched }))[0]?.status).toBe('source_not_comparable')
    const unknown = [
      ...nightsEnding(currentEnd, 7, 400, 'unknown', 'Unknown'),
      ...nightsEnding(previousEnd, 7, 450, 'unknown', 'Unknown'),
    ]
    expect(detectSleepDurationChange(input({ sleepNights: unknown }))[0]?.status).toBe('source_not_comparable')
    expect(deriveProactiveInsights(input({ sleepNights: switched })).insights).toEqual([])
  })
})

describe('nutrition insights', () => {
  const currentEnd = AS_OF
  const previousEnd = addCalendarDays(currentEnd, -14)

  it('requires 7 logged days and at least 50% coverage of each 14-day window', () => {
    const six = detectNutritionChange(
      input({
        nutritionDays: [...loggedEnding(currentEnd, 6, 2200), ...loggedEnding(previousEnd, 7, 1500)],
      }),
    )
    expect(six[0]?.status).toBe('insufficient_evidence')
    const covered = deriveProactiveInsights(
      input({
        nutritionDays: [...loggedEnding(currentEnd, 7, 1650), ...loggedEnding(previousEnd, 7, 1500)],
      }),
    )
    expect(covered.insights).toHaveLength(1)
    expect(covered.insights[0]?.summary).toContain('on logged days')
  })

  it('requires both the absolute and relative calorie and protein heuristics', () => {
    const smallCalories = deriveProactiveInsights(
      input({
        nutritionDays: [...loggedEnding(currentEnd, 7, 1149), ...loggedEnding(previousEnd, 7, 1000)],
      }),
    )
    expect(smallCalories.insights).toEqual([])
    const calories = deriveProactiveInsights(
      input({
        nutritionDays: [...loggedEnding(currentEnd, 7, 1650), ...loggedEnding(previousEnd, 7, 1500)],
      }),
    )
    expect(calories.insights[0]?.id).toContain('calories')
    const smallProtein = deriveProactiveInsights(
      input({
        nutritionDays: [
          ...loggedEnding(currentEnd, 7, 2000, 114),
          ...loggedEnding(previousEnd, 7, 2000, 100),
        ],
      }),
    )
    expect(smallProtein.insights).toEqual([])
    const proteinOnly = deriveProactiveInsights(
      input({
        nutritionDays: [
          ...loggedEnding(currentEnd, 7, 2000, 115),
          ...loggedEnding(previousEnd, 7, 2000, 100),
        ],
      }),
    )
    expect(proteinOnly.insights[0]?.summary).toContain('Protein intake on logged days')
    const relativeMiss = deriveProactiveInsights(
      input({
        nutritionDays: [
          ...loggedEnding(currentEnd, 7, 2000, 219),
          ...loggedEnding(previousEnd, 7, 2000, 200),
        ],
      }),
    )
    expect(relativeMiss.insights).toEqual([])
    const both = deriveProactiveInsights(
      input({
        nutritionDays: [
          ...loggedEnding(currentEnd, 7, 1800, 150),
          ...loggedEnding(previousEnd, 7, 1500, 100),
        ],
      }),
    )
    expect(both.insights.filter((item) => item.domain === 'nutrition')).toHaveLength(1)
    expect(both.insights[0]?.id).toContain('protein')
  })
})

describe('training frequency insights', () => {
  it('ignores Apple Activity workouts and changes below one session per week', () => {
    const quiet = deriveProactiveInsights(
      input({
        trainingSessions: [
          { performedOn: '2026-09-20', sessionType: 'programmed' },
          { performedOn: '2026-09-21', sessionType: 'ad_hoc' },
          { performedOn: '2026-09-22', sessionType: 'apple_workout' },
          { performedOn: '2026-09-23', sessionType: 'apple_workout' },
        ],
      }),
    )
    expect(quiet.insights).toEqual([])
    const surfaced = deriveProactiveInsights(
      input({
        trainingSessions: [
          { performedOn: '2026-09-20', sessionType: 'programmed' },
          { performedOn: '2026-09-21', sessionType: 'ad_hoc' },
          { performedOn: '2026-09-22', sessionType: 'experiment' },
          { performedOn: '2026-09-23', sessionType: 'apple_workout' },
          { performedOn: '2026-09-24', sessionType: 'apple_workout' },
        ],
      }),
    )
    expect(surfaced.insights).toHaveLength(1)
    expect(surfaced.insights[0]?.summary).toBe('Logged Training frequency increased')
    expect(surfaced.insights[0]?.summary).not.toMatch(/You trained/)
  })
})

describe('body and strength insights', () => {
  it('reuses the body trend gate and surfaces 0.25 lb/week', () => {
    expect(PROGRESS_ANALYTICS_CONFIG.bodyWeightTrend.minimumMeasurements).toBe(5)
    expect(PROGRESS_ANALYTICS_CONFIG.bodyWeightTrend.minimumSpanDays).toBe(14)
    expect(BODY_WEIGHT_MIN_SLOPE_LB_PER_WEEK).toBe(0.25)
    expect(deriveProactiveInsights(input({ bodyWeights: weeklyWeights(0.24) })).insights).toEqual([])
    const surfaced = deriveProactiveInsights(
      input({ bodyWeights: weeklyWeights(0.25), weightGoalId: 'goal-weight' }),
    )
    expect(surfaced.insights).toHaveLength(1)
    expect(surfaced.insights[0]?.summary).toContain('0.25 lb/week')
    expect(surfaced.insights[0]?.summary).not.toMatch(/good progress|bad progress/)
    expect(surfaced.insights[0]?.goalPath).toBe('/goals/goal-weight')
    const kilograms = deriveProactiveInsights(
      input({ bodyWeights: weeklyWeights(poundsToKilograms(0.25), 'kg') }),
    )
    expect(kilograms.insights[0]?.summary).toContain('lb/week')
  })

  it('surfaces an accepted higher or lower strength trend and skips stable or short history', () => {
    const stable = detectStrengthTrend(
      input({ strengthExercises: [strengthExercise('bench', 'Bench Press', '2026-09-20', [100, 100, 100, 100, 100, 100])] }),
    )
    expect(stable[0]?.insight).toBeUndefined()
    const shortHistory = detectStrengthTrend(
      input({ strengthExercises: [strengthExercise('bench', 'Bench Press', '2026-09-20', [100, 100, 110, 120, 130])] }),
    )
    expect(shortHistory[0]?.insight).toBeUndefined()
    const higher = deriveProactiveInsights(
      input({
        strengthExercises: [
          strengthExercise('older', 'Squat', '2026-09-10', [100, 100, 100, 120, 120, 120]),
          strengthExercise('bench', 'Bench Press', '2026-09-20', [100, 100, 100, 120, 120, 120]),
        ],
      }),
    )
    expect(higher.insights).toHaveLength(1)
    expect(higher.insights[0]?.title).toBe('Bench Press')
    expect(higher.insights[0]?.summary).toContain('higher')
    expect(higher.insights[0]?.summary).not.toMatch(/improving|good/)
    expect(higher.insights[0]?.evidence.some((item) => item.value.includes('120.0 kg'))).toBe(true)
    const tie = deriveProactiveInsights(
      input({
        strengthExercises: [
          strengthExercise('squat', 'Squat', '2026-09-20', [100, 100, 100, 120, 120, 120]),
          strengthExercise('bench', 'Bench Press', '2026-09-20', [100, 100, 100, 80, 80, 80]),
        ],
      }),
    )
    expect(tie.insights[0]?.title).toBe('Bench Press')
  })
})

describe('cross-domain insights', () => {
  it('keeps an existing finding, including n, rho, strength, and coverage', () => {
    expect(SPEARMAN_MIN_PAIRS).toBe(20)
    expect(RHO_STRONG).toBe(0.6)
    expect(GROUP_MIN_DAYS).toBe(5)
    const days = Array.from({ length: 20 }, (_, index) => addCalendarDays('2026-08-24', index))
    const state = analyzeCrossDomain({
      range: '30d',
      asOf: '2026-09-22',
      today: '2026-09-22',
      activityDays: days.map((date, index) => activity(date, 1000 + index)),
      sleepNights: days.map((date, index) => ({
        sleepDate: date,
        analysisEligible: true,
        totalSleepMinutes: 400 + index,
        timeInBedMinutes: 420 + index,
        stageAnalysisEligible: true,
        coreMinutes: 100,
        deepMinutes: 80,
        remMinutes: 90,
        unspecifiedSleepMinutes: null,
        observationStatus: 'analysis_eligible' as const,
      })),
      nutritionDays: [],
      trainingSessions: [],
      bodyWeights: [],
    })
    const finding = state.findings.find((item) => item.id === 'sleep_activity:sleep_minutes:steps')
    expect(finding?.surfaced).toBe(true)
    expect(finding?.kind).toBe('spearman_association')
    if (!finding || finding.kind !== 'spearman_association') {
      throw new Error('missing sleep activity finding')
    }
    const result = deriveProactiveInsights(input({ asOf: '2026-09-22', findings: [finding] }))
    const card = result.insights[0]
    expect(card?.kind).toBe('cross_domain_pattern')
    expect(card?.evidence.some((item) => item.value === `n ${finding.metrics.n}`)).toBe(true)
    expect(card?.evidence.some((item) => item.value === finding.metrics.rho?.toFixed(2))).toBe(true)
    expect(card?.evidence.some((item) => item.value === finding.strength)).toBe(true)
    expect(card?.evidence.some((item) => item.value === `${finding.coverage.paired} of ${finding.coverage.denominator}`)).toBe(true)
    expect(card?.summary).not.toMatch(/\bcaused\b/i)
  })

  it('uses the training-day protein question for that logged-day pattern', () => {
    const training = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
    const other = ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10']
    const state = analyzeCrossDomain({
      range: '30d',
      asOf: '2026-09-22',
      today: null,
      activityDays: [],
      sleepNights: [],
      nutritionDays: [
        ...training.map((date) => nutritionObservation(date, 2200, 153)),
        ...other.map((date) => nutritionObservation(date, 1800, 118)),
      ],
      trainingSessions: training.map((date) => ({ sessionId: date, sessionDate: date, effort: null, painLevel: null })),
      bodyWeights: [],
    })
    const finding = state.relationships.find((item) => item.id === 'nutrition_training:logged_day_groups')
    expect(finding?.surfaced).toBe(true)
    const result = deriveProactiveInsights(input({ asOf: '2026-09-22', findings: finding ? [finding] : [] }))
    expect(result.insights[0]?.askHealth?.suggestedQuestion).toBe('Explain the evidence behind this Training-day protein pattern.')
    expect(result.insights[0]?.askHealth?.lens).toBe('nutrition')
  })
})

describe('insight ranking and history', () => {
  it('returns a deterministic top five', () => {
    const packed = packedInsights()
    const first = deriveProactiveInsights(packed)
    const second = deriveProactiveInsights(packed)
    expect(first.insights).toHaveLength(5)
    expect(second.insights.map((item) => item.id)).toEqual(first.insights.map((item) => item.id))
    const tiers = first.insights.map((item) => item.ranking.tier)
    expect([...tiers].sort((left, right) => left - right)).toEqual(tiers)
    expect(first.insights.some((item) => item.domain === 'activity')).toBe(false)
  })

  it('returns no cards when nothing qualifies', () => {
    const result = deriveProactiveInsights(input())
    expect(result.insights).toEqual([])
    expect(INSIGHTS_EMPTY_COPY).toContain('Not enough comparable recent evidence')
  })

  it('ignores observations after asOf and recomputes after a correction', () => {
    const currentEnd = '2026-09-10'
    const previousEnd = addCalendarDays(currentEnd, -21)
    const historical = deriveProactiveInsights(
      input({
        asOf: currentEnd,
        activityDays: [
          ...daysEnding(currentEnd, 14, 1100),
          ...daysEnding(previousEnd, 14, 1000),
          activity('2026-09-20', 9000),
        ],
        bodyWeights: [...weeklyWeights(0.25), weight('2026-09-20', 140)],
      }),
    )
    expect(historical.insights.some((item) => item.domain === 'activity' && item.summary.includes('10%'))).toBe(true)
    expect(historical.insights.some((item) => item.domain === 'body')).toBe(true)
    const corrected = deriveProactiveInsights(
      input({
        asOf: currentEnd,
        activityDays: [...daysEnding(currentEnd, 14, 1000), ...daysEnding(previousEnd, 14, 1000)],
      }),
    )
    expect(corrected.insights).toEqual([])
    const futureStrength = deriveProactiveInsights(
      input({
        strengthExercises: [
          strengthExercise('future', 'Deadlift', '2026-10-01', [100, 100, 100, 140, 140, 140]),
          strengthExercise('bench', 'Bench Press', '2026-09-20', [100, 100, 100, 120, 120, 120]),
        ],
      }),
    )
    expect(futureStrength.insights[0]?.title).toBe('Bench Press')
  })
})

describe('ask health handoff and boundaries', () => {
  it('prefills a lens, range, and question without posting', () => {
    const result = deriveProactiveInsights(
      input({
        activityDays: [
          ...daysEnding(AS_OF, 14, 1100),
          ...daysEnding(addCalendarDays(AS_OF, -21), 14, 1000),
        ],
      }),
    )
    const ask = result.insights[0]?.askHealth
    expect(ask?.lens).toBe('general')
    expect(ask?.range).toBe('90d')
    expect(ask?.suggestedQuestion).toContain('step average increased')
    const page = readFileSync('src/features/ask-health/AskHealthPage.tsx', 'utf8')
    const section = readFileSync('src/features/progress/InsightsSection.tsx', 'utf8')
    expect(page).not.toContain('useEffect')
    expect(page).toContain("params.get('question')")
    expect(section).toContain('Ask Health about this')
    expect(section).not.toContain('healthFetch')
    expect(section).not.toContain('askHealth(')
  })

  it('does not call Gemini, reserve ai usage, or write canonical rows', () => {
    const serviceSource = readFileSync('server/insights/service.ts', 'utf8')
    const handlerSource = readFileSync('server/handlers/progress-insights.ts', 'utf8')
    const domainSource = readFileSync('src/domain/insights/derive.ts', 'utf8') + readFileSync('src/domain/insights/detectors.ts', 'utf8')
    for (const source of [serviceSource, handlerSource, domainSource]) {
      expect(source).not.toMatch(/gemini|ai_usage|getAskHealthGate/i)
    }
    expect(serviceSource).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/)
    expect(handlerSource).toContain('withOwnerAuth')
    expect(handlerSource).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(readFileSync('server/handlers/today.ts', 'utf8')).not.toContain('insights')
    expect(readFileSync('server/handlers/progress-timeline.ts', 'utf8')).not.toContain('insights')
  })

  it('calculates demo cards without a provider or owner API', () => {
    const examples = demoInsightExamples()
    const sparse = demoInsightEmpty()
    expect(examples.calculationVersion).toBe(PROACTIVE_INSIGHTS_VERSION)
    expect(examples.insights.some((item) => item.kind === 'domain_change')).toBe(true)
    expect(examples.insights.some((item) => item.kind === 'cross_domain_pattern')).toBe(true)
    expect(sparse.insights).toEqual([])
    const source = readFileSync('src/demo/insights.ts', 'utf8')
    expect(source).not.toMatch(/gemini|healthFetch|\/api\//i)
  })
})

describe('insight API auth', () => {
  beforeEach(() => {
    service.getProactiveInsights.mockReset()
    service.getProactiveInsights.mockResolvedValue({
      calculationVersion: PROACTIVE_INSIGHTS_VERSION,
      range: '30d',
      asOf: AS_OF,
      insights: [],
    })
  })

  it('rejects anonymous callers, non-owners, ingest tokens, and the wrong method', async () => {
    const anonymous = await call('GET', '/api/progress/insights', null)
    expect(anonymous.status()).toBe(401)
    const other = await call('GET', '/api/progress/insights', { id: 'someone', email: 'other@example.com' })
    expect(other.status()).toBe(403)
    const token = await call('GET', '/api/progress/insights', null, { authorization: 'Bearer ingest-token' })
    expect(token.status()).toBe(401)
    expect(service.getProactiveInsights).not.toHaveBeenCalled()
    const wrong = captureResponse()
    await progressInsightsRoute(request('POST', '/api/progress/insights'), wrong.res)
    expect(wrong.status()).toBe(405)
    expect(wrong.allow()).toBe('GET')
    const owner = await call('GET', '/api/progress/insights?range=90d', { id: 'owner-1', email: 'owner@example.com' })
    expect(owner.status()).toBe(200)
    expect(owner.body()).toMatchObject({ calculationVersion: PROACTIVE_INSIGHTS_VERSION })
    expect(matchHealthApiRoute('/api/progress/insights')).toBe('progress-insights')
  })
})

function packedInsights(): InsightDetectorInput {
  const currentEnd = AS_OF
  const previousActivity = addCalendarDays(currentEnd, -21)
  const previousShort = addCalendarDays(currentEnd, -14)
  return input({
    findings: [pattern('strong'), pattern('weak')],
    bodyWeights: weeklyWeights(0.4),
    strengthExercises: [strengthExercise('bench', 'Bench Press', '2026-09-20', [100, 100, 100, 120, 120, 120])],
    sleepNights: [...nightsEnding(currentEnd, 7, 360), ...nightsEnding(previousShort, 7, 430)],
    activityDays: [...daysEnding(currentEnd, 14, 1200), ...daysEnding(previousActivity, 14, 1000)],
    nutritionDays: [...loggedEnding(currentEnd, 7, 1800, 150), ...loggedEnding(previousShort, 7, 1500, 100)],
    trainingSessions: [
      { performedOn: '2026-09-20', sessionType: 'programmed' },
      { performedOn: '2026-09-21', sessionType: 'programmed' },
      { performedOn: '2026-09-22', sessionType: 'programmed' },
    ],
  })
}

function pattern(strength: 'strong' | 'weak'): CrossDomainFinding {
  return {
    id: strength === 'strong' ? 'sleep_activity:sleep_minutes:steps' : 'nutrition_activity:protein:steps',
    kind: 'spearman_association',
    domainA: strength === 'strong' ? 'sleep' : 'nutrition',
    domainB: 'activity',
    period: { range: '30d', asOf: AS_OF, start: '2026-08-29', end: AS_OF, dayCount: 30 },
    sampleSize: strength === 'strong' ? 24 : 20,
    gateSampleSize: 20,
    requiredSampleSize: 20,
    sampleTier: 'moderate_sample',
    coverage: { paired: 20, denominator: 30, label: 'paired days out of selected days', pct: 66.7 },
    direction: 'positive',
    strength,
    statisticalMethod: 'spearman_rank',
    evidence: { dates: [] },
    state: 'available',
    surfaced: true,
    surfacing: 'surfaced',
    metrics: { xMetric: 'x', yMetric: 'y', rho: strength === 'strong' ? 0.8 : 0.25, n: strength === 'strong' ? 24 : 20 },
  }
}

function nutritionObservation(date: string, calories: number, protein: number) {
  const nutrient = (value: number) => ({ status: 'available' as const, value })
  return {
    date,
    entryCount: 1,
    calories: nutrient(calories),
    protein: nutrient(protein),
    carbs: { status: 'unavailable' as const },
    fat: { status: 'unavailable' as const },
    fiber: { status: 'unavailable' as const },
    target: null,
    evidence: { entryIds: [date], mealGroupIds: [] },
  }
}

function call(
  method: string,
  url: string,
  identity: { id: string; email: string } | null,
  headers: Record<string, string> = {},
) {
  const captured = captureResponse()
  return withOwnerAuth(handleProgressInsights, {
    config: ownerConfig,
    readSession: async () => identity,
  })(request(method, url, headers), captured.res).then(() => captured)
}
