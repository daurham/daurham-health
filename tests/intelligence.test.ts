import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ActivityDailyRow } from '../src/domain/activity/analytics.ts'
import {
  RELATIONSHIP_IDS,
  analyzeCrossDomain,
  associationStrength,
  averageRanks,
  compareCrossDomainFindings,
  containsCausalLanguage,
  findingCopy,
  provisionalActivityDate,
  spearmanRho,
  type CrossDomainFinding,
  type CrossDomainInput,
  type IntelligenceTrainingSession,
} from '../src/domain/intelligence/index.ts'
import { addCalendarDays } from '../src/domain/progress/dates.ts'
import type { NutritionDailyObservation } from '../src/domain/progress/nutrition.ts'
import { bodyWeightTrend } from '../src/domain/progress/body-trend.ts'
import type { BodyObservation } from '../src/domain/progress/types.ts'
import type { SleepSummaryNight } from '../src/domain/sleep/analytics.ts'
import { healthCalendarDateFromInstant } from '../src/domain/time.ts'

function activity(date: string, values: Partial<ActivityDailyRow> = {}): ActivityDailyRow {
  return {
    date,
    timezone: 'America/Phoenix',
    stepsCount: null,
    activeEnergyKcal: null,
    exerciseMinutes: null,
    walkingRunningDistanceM: null,
    restingHeartRateBpm: null,
    ...values,
  }
}

function night(
  date: string,
  minutes: number | null,
  status: 'analysis_eligible' | 'partial_observation' | 'in_bed_only' = 'analysis_eligible',
): SleepSummaryNight {
  return {
    sleepDate: date,
    analysisEligible: status === 'analysis_eligible',
    totalSleepMinutes: minutes,
    timeInBedMinutes: minutes,
    stageAnalysisEligible: true,
    coreMinutes: 100,
    deepMinutes: 80,
    remMinutes: 90,
    unspecifiedSleepMinutes: null,
    observationStatus: status,
  }
}

function logged(
  date: string,
  values: { calories?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null } = {},
): NutritionDailyObservation {
  const nutrient = (value: number | null | undefined, fallback: number | null) => {
    const resolved = value === undefined ? fallback : value
    return resolved == null ? { status: 'unavailable' as const } : { status: 'available' as const, value: resolved }
  }
  return {
    date,
    entryCount: 1,
    calories: nutrient(values.calories, 2000),
    protein: nutrient(values.protein, null),
    carbs: nutrient(values.carbs, null),
    fat: nutrient(values.fat, null),
    fiber: { status: 'unavailable' },
    target: null,
    evidence: { entryIds: [date], mealGroupIds: [] },
  }
}

function session(date: string, values: Partial<IntelligenceTrainingSession> = {}): IntelligenceTrainingSession {
  return {
    sessionId: date,
    sessionDate: date,
    effort: null,
    painLevel: null,
    ...values,
  }
}

function weight(date: string, value: number, unit = 'lb'): BodyObservation {
  return {
    measurementId: date,
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

function analyze(partial: Partial<CrossDomainInput> = {}) {
  return analyzeCrossDomain({
    range: '30d',
    asOf: '2026-09-22',
    today: '2026-09-22',
    activityDays: [],
    sleepNights: [],
    nutritionDays: [],
    trainingSessions: [],
    bodyWeights: [],
    ...partial,
  })
}

function relationship(state: ReturnType<typeof analyze>, id: string): CrossDomainFinding {
  const found = state.relationships.find((item) => item.id === id)
  if (!found) {
    throw new Error(`missing ${id}`)
  }
  return found
}

describe('spearman rank correlation', () => {
  it('returns perfect positive and negative associations and averages tie ranks', () => {
    expect(spearmanRho([1, 2, 3, 4], [10, 20, 30, 40])).toBe(1)
    expect(spearmanRho([1, 2, 3, 4], [40, 30, 20, 10])).toBe(-1)
    expect(averageRanks([1, 2, 2, 4])).toEqual([1, 2.5, 2.5, 4])
    const rho = spearmanRho([1, 2, 2, 4], [1, 2, 3, 4])
    expect(rho).toBeCloseTo(4.5 / Math.sqrt(22.5), 10)
    expect(spearmanRho([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull()
    expect(associationStrength(0.19)).toBeNull()
    expect(associationStrength(0.2)).toBe('weak')
    expect(associationStrength(0.4)).toBe('moderate')
    expect(associationStrength(-0.6)).toBe('strong')
  })
})

describe('cross-domain range, identity, and ordering', () => {
  it('scopes findings to the selected range and asOf without widening', () => {
    const state = analyze({
      range: '30d',
      asOf: '2026-09-22',
      today: '2026-09-23',
      activityDays: [activity('2026-08-23', { stepsCount: 100 }), activity('2026-09-23', { stepsCount: 9000 })],
      sleepNights: [night('2026-08-23', 400), night('2026-09-23', 400)],
    })
    expect(state.period).toMatchObject({ start: '2026-08-24', end: '2026-09-22', dayCount: 30 })
    expect(state.timezone).toBe('America/Phoenix')
    expect(relationship(state, 'sleep_activity:sleep_minutes:steps').metrics).toMatchObject({ n: 0 })
    expect(state.relationships.map((item) => item.id)).toEqual([...RELATIONSHIP_IDS])
    expect(new Set(state.relationships.map((item) => item.id)).size).toBe(RELATIONSHIP_IDS.length)
    expect(state.relationships.some((item) => /rem|deep|core/i.test(item.id))).toBe(false)
    expect(state).not.toHaveProperty('score')
    expect(JSON.stringify(state)).not.toMatch(/readiness|recovery|"score"/)
  })

  it('uses America/Phoenix for the provisional boundary and keeps historical asOf complete', () => {
    expect(healthCalendarDateFromInstant(new Date('2026-09-22T06:30:00.000Z'))).toBe('2026-09-21')
    expect(provisionalActivityDate('2026-09-21', '2026-09-21')).toBe('2026-09-21')
    expect(provisionalActivityDate('2026-09-20', '2026-09-21')).toBeNull()
    const excluded = analyze({
      range: '30d',
      asOf: '2026-09-21',
      today: '2026-09-21',
      activityDays: [activity('2026-09-21', { stepsCount: 129 }), activity('2026-09-20', { stepsCount: 8000 })],
      sleepNights: [night('2026-09-21', 400), night('2026-09-20', 480)],
    })
    expect(relationship(excluded, 'sleep_activity:sleep_minutes:steps').evidence.dates).toEqual(['2026-09-20'])
    const historical = analyze({
      range: '30d',
      asOf: '2026-09-21',
      today: '2026-09-22',
      activityDays: [activity('2026-09-21', { stepsCount: 8000 })],
      sleepNights: [night('2026-09-21', 480)],
    })
    expect(relationship(historical, 'sleep_activity:sleep_minutes:steps').evidence.dates).toEqual(['2026-09-21'])
  })

  it('keeps stable ids and sorts surfaced findings by sample tier, magnitude, coverage, then id', () => {
    const first = analyze()
    const second = analyze()
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    const larger = relationship(first, 'sleep_activity:sleep_minutes:steps')
    const smaller = relationship(first, 'nutrition_activity:protein:steps')
    const high: CrossDomainFinding = {
      ...larger,
      id: 'sleep_activity:sleep_minutes:steps',
      sampleTier: 'limited_evidence',
      gateSampleSize: 20,
      coverage: { ...larger.coverage, pct: 10 },
      metrics: { xMetric: 'sleep_minutes', yMetric: 'steps', rho: 0.9, n: 20 },
    }
    const low: CrossDomainFinding = {
      ...smaller,
      sampleTier: 'moderate_sample',
      gateSampleSize: 30,
      coverage: { ...smaller.coverage, pct: 1 },
      metrics: { xMetric: 'protein', yMetric: 'steps', rho: 0.25, n: 30 },
    }
    expect(compareCrossDomainFindings(high, low)).toBeGreaterThan(0)
    expect([high, low].sort(compareCrossDomainFindings).map((item) => item.id)).toEqual([
      'nutrition_activity:protein:steps',
      'sleep_activity:sleep_minutes:steps',
    ])
  })
})

describe('sleep and activity pairing', () => {
  it('uses eligible sleep only, drops partials, the provisional day, and missing activity metrics', () => {
    const days = Array.from({ length: 20 }, (_, index) => addCalendarDays('2026-08-24', index))
    const state = analyze({
      sleepNights: [
        ...days.map((date, index) => night(date, 400 + index)),
        night('2026-09-13', 500, 'partial_observation'),
        night('2026-09-14', null, 'in_bed_only'),
        night('2026-09-22', 600),
      ],
      activityDays: [
        ...days.map((date, index) =>
          activity(date, {
            stepsCount: 1000 + index,
            activeEnergyKcal: index === 0 ? null : 200 + index,
            exerciseMinutes: index === 1 ? null : 10 + index,
            restingHeartRateBpm: index === 2 ? null : 55,
          }),
        ),
        activity('2026-09-22', { stepsCount: 129, activeEnergyKcal: 12, exerciseMinutes: 1, restingHeartRateBpm: 70 }),
      ],
    })
    const steps = relationship(state, 'sleep_activity:sleep_minutes:steps')
    const energy = relationship(state, 'sleep_activity:sleep_minutes:active_energy_kcal')
    const exercise = relationship(state, 'sleep_activity:sleep_minutes:exercise_minutes')
    const heart = relationship(state, 'sleep_activity:sleep_minutes:resting_heart_rate_bpm')
    expect(steps.metrics).toMatchObject({ n: 20, xMetric: 'sleep_minutes', yMetric: 'steps' })
    expect(steps.evidence.dates).not.toContain('2026-09-22')
    expect(steps.evidence.dates).not.toContain('2026-09-13')
    expect(steps.evidence.dates).not.toContain('2026-09-14')
    expect(energy.metrics.n).toBe(19)
    expect(exercise.metrics.n).toBe(19)
    expect(heart.metrics.n).toBe(19)
    expect(steps.coverage).toMatchObject({ paired: 20, denominator: 30, label: 'paired days out of selected days' })
    expect(steps.surfaced).toBe(true)
    expect(steps.strength).toBe('strong')
    expect(steps.direction).toBe('positive')
    expect(steps.state).toBe('available')
  })

  it('does not surface a perfect association below the sample gate or a weak rho', () => {
    const short = Array.from({ length: 19 }, (_, index) => addCalendarDays('2026-08-24', index))
    const belowGate = analyze({
      sleepNights: short.map((date) => night(date, 400)),
      activityDays: short.map((date, index) => activity(date, { stepsCount: 1000 + index })),
    })
    const gated = relationship(belowGate, 'sleep_activity:sleep_minutes:steps')
    expect(gated.metrics.n).toBe(19)
    expect(gated.surfaced).toBe(false)
    expect(gated.surfacing).toBe('insufficient_sample')
    expect(belowGate.findings.some((item) => item.id === gated.id)).toBe(false)

    const weakDays = Array.from({ length: 20 }, (_, index) => addCalendarDays('2026-08-24', index))
    const weak = analyze({
      sleepNights: weakDays.map((date, index) => night(date, 400 + index)),
      activityDays: weakDays.map((date, index) => activity(date, { stepsCount: index % 2 === 0 ? 1000 : 5000 })),
    })
    const quiet = relationship(weak, 'sleep_activity:sleep_minutes:steps')
    expect(quiet.metrics.n).toBe(20)
    expect(quiet.metrics.rho).not.toBeNull()
    expect(Math.abs(quiet.metrics.rho ?? 0)).toBeLessThan(0.2)
    expect(quiet.state).toBe('available')
    expect(quiet.surfaced).toBe(false)
    expect(quiet.surfacing).toBe('below_association_threshold')
    expect(quiet.direction).toBe('neutral')
    expect(quiet.strength).toBeNull()
  })
})

describe('sleep and training', () => {
  it('pairs the wake date, skips missing effort or pain, and compares training nights descriptively', () => {
    const training = ['2026-09-01', '2026-09-03', '2026-09-05', '2026-09-07', '2026-09-09']
    const other = ['2026-09-02', '2026-09-04', '2026-09-06', '2026-09-08', '2026-09-10']
    const state = analyze({
      today: '2026-09-23',
      sleepNights: [
        ...training.map((date) => night(date, 480)),
        ...other.map((date) => night(date, 420)),
        night('2026-09-11', 300, 'partial_observation'),
      ],
      trainingSessions: [
        ...training.filter((date) => date !== '2026-09-09').map((date) => session(date, { effort: 4, painLevel: 1 })),
        session('2026-09-09', { effort: 4, painLevel: 0 }),
        session('2026-09-12', { effort: null, painLevel: null }),
        session('2026-09-01', { sessionId: 'second', effort: 2, painLevel: 0 }),
        session('2026-09-03', { sessionId: 'pain-zero', effort: null, painLevel: 0 }),
      ],
    })
    const effort = relationship(state, 'sleep_training:sleep_minutes:effort')
    const pain = relationship(state, 'sleep_training:sleep_minutes:pain_level')
    expect(effort.evidence.dates).not.toContain('2026-09-01')
    expect(effort.evidence.dates).toContain('2026-09-05')
    expect(effort.evidence.dates).not.toContain('2026-09-12')
    expect(pain.evidence.dates).not.toContain('2026-09-01')
    expect(pain.evidence.dates).not.toContain('2026-09-03')
    expect(pain.evidence.dates).toContain('2026-09-09')
    const groups = relationship(state, 'sleep_training:sleep_minutes')
    expect(groups.kind).toBe('group_comparison')
    if (groups.kind === 'group_comparison') {
      expect(groups.metrics.leftDays).toBe(5)
      expect(groups.metrics.rightDays).toBe(5)
      expect(groups.metrics.metrics[0]).toMatchObject({ leftAverage: 480, rightAverage: 420, delta: 60 })
    }
    expect(groups.surfaced).toBe(true)
    expect(groups.statisticalMethod).toBe('group_mean_difference')
    expect(groups.evidence.leftDates).toEqual(training)
    expect(groups.evidence.rightDates).toEqual(other)
  })
})

describe('nutrition pairings', () => {
  it('ignores unlogged days and compares logged training days with other logged days', () => {
    const training = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
    const other = ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10']
    const state = analyze({
      today: '2026-09-23',
      nutritionDays: [
        ...training.map((date) => logged(date, { calories: 2200, protein: 140, carbs: 200, fat: 70 })),
        ...other.map((date) => logged(date, { calories: 1800, protein: 110, carbs: 180, fat: 60 })),
        logged('2026-09-11', { calories: 0, protein: 0, carbs: 0, fat: 0 }),
      ],
      trainingSessions: [...training.map((date) => session(date)), session('2026-09-12')],
    })
    const groups = relationship(state, 'nutrition_training:logged_day_groups')
    expect(groups.surfaced).toBe(true)
    expect(groups.evidence.dates).not.toContain('2026-09-12')
    expect(groups.evidence.dates).toContain('2026-09-11')
    if (groups.kind === 'group_comparison') {
      expect(groups.metrics.leftDays).toBe(5)
      expect(groups.metrics.rightDays).toBe(6)
      expect(groups.metrics.metrics.find((metric) => metric.metric === 'calories')).toMatchObject({
        leftAverage: 2200,
        rightAverage: 1500,
        delta: 700,
      })
      expect(groups.metrics.metrics.find((metric) => metric.metric === 'protein')).toMatchObject({
        leftAverage: 140,
        rightAverage: 550 / 6,
      })
    }
    const tooSmall = analyze({
      today: '2026-09-23',
      nutritionDays: [logged('2026-09-01', { calories: 2000, protein: 100 }), logged('2026-09-02', { calories: 1800, protein: 80 })],
      trainingSessions: [session('2026-09-01')],
    })
    expect(relationship(tooSmall, 'nutrition_training:logged_day_groups').surfacing).toBe('insufficient_sample')
  })

  it('pairs only overlapping logged nutrition days with completed activity', () => {
    const days = Array.from({ length: 20 }, (_, index) => addCalendarDays('2026-08-24', index))
    const state = analyze({
      nutritionDays: [
        ...days.map((date, index) => logged(date, { calories: 1800 + index * 10, protein: 100 + index })),
        logged('2026-09-22', { calories: 9000, protein: 300 }),
      ],
      activityDays: [
        ...days.map((date, index) => activity(date, { stepsCount: 4000 + index * 50, activeEnergyKcal: 300 + index })),
        activity('2026-09-21', { stepsCount: 100 }),
        activity('2026-09-22', { stepsCount: 129, activeEnergyKcal: 12 }),
      ],
    })
    const calories = relationship(state, 'nutrition_activity:calories:steps')
    expect(calories.metrics.n).toBe(20)
    expect(calories.evidence.dates).not.toContain('2026-09-22')
    expect(calories.evidence.dates).not.toContain('2026-09-21')
    expect(relationship(state, 'nutrition_activity:protein:active_energy_kcal').metrics.n).toBe(20)
    expect(state.relationships.some((item) => item.id.includes('exercise_minutes') && item.domainA === 'nutrition')).toBe(false)
  })
})

describe('body, nutrition, and training context', () => {
  it('uses the preceding 14 days, requires seven logged days, and does not forward-fill weight', () => {
    const measurement = '2026-09-15'
    const windowDays = Array.from({ length: 14 }, (_, index) => addCalendarDays('2026-09-01', index))
    const loggedDays = windowDays.slice(0, 7)
    const state = analyze({
      range: '90d',
      today: '2026-09-23',
      nutritionDays: [
        ...loggedDays.map((date) => logged(date, { calories: 2100, protein: 130 })),
        logged('2026-08-31', { calories: 9000, protein: 400 }),
        logged(measurement, { calories: 100, protein: 1 }),
        logged('2026-09-16', { calories: 50, protein: 1 }),
      ],
      bodyWeights: [weight(measurement, 180), weight('2026-09-20', 190)],
    })
    const calories = relationship(state, 'body_nutrition:preceding_calories')
    expect(calories.kind).toBe('windowed_association')
    expect(calories.metrics.n).toBe(1)
    expect(calories.surfacing).toBe('insufficient_sample')
    expect(calories.requiredSampleSize).toBe(10)
    expect(calories.evidence.windows).toEqual([
      {
        date: measurement,
        weight: 180,
        unit: 'lb',
        loggedDays: 7,
        coveragePct: 50,
        averageCalories: 2100,
        averageProtein: 130,
      },
    ])
    expect(calories.evidence.dates).toEqual([measurement])
    const sparse = Array.from({ length: 9 }, (_, index) => addCalendarDays('2026-01-20', index * 20))
    const sparseState = analyze({
      range: 'all',
      asOf: '2026-09-22',
      today: '2026-09-22',
      nutritionDays: sparseStateDays(sparse),
      bodyWeights: sparse.map((date, index) => weight(date, 200 - index)),
    })
    const sparseFinding = relationship(sparseState, 'body_nutrition:preceding_calories')
    expect(sparseFinding.metrics.n).toBe(9)
    expect(sparseFinding.metrics.rho).toBe(1)
    expect(sparseFinding.surfaced).toBe(false)
  })

  it('reports body trend context from the body domain and nutrition coverage', () => {
    const dates = ['2026-08-01', '2026-08-10', '2026-08-20', '2026-08-30', '2026-09-10']
    const weights = dates.map((date, index) => weight(date, 200 - index))
    const nutritionDays = dates.map((date) => logged(date, { calories: 2100, protein: 120 }))
    const state = analyze({
      range: '90d',
      today: '2026-09-23',
      nutritionDays,
      bodyWeights: weights,
    })
    const trend = bodyWeightTrend(weights)
    const context = relationship(state, 'body_nutrition:period_context')
    expect(trend.status).toBe('available')
    expect(context.surfaced).toBe(true)
    if (context.kind === 'period_context' && trend.status === 'available') {
      expect(context.metrics.slopePerDay).toBe(trend.value.slopePerDay)
      expect(context.metrics.slopePer30Days).toBe(trend.value.slopePerDay * 30)
      expect(context.metrics.averageCalories).toBe(2100)
      expect(context.metrics.loggedDays).toBe(5)
    }
    const mixed = analyze({
      range: 'all',
      asOf: '2026-09-22',
      bodyWeights: [weight('2026-09-01', 180, 'lb'), weight('2026-09-15', 80, 'kg')],
      nutritionDays: Array.from({ length: 7 }, (_, index) => logged(addCalendarDays('2026-08-18', index), { calories: 2000 })),
    })
    expect(relationship(mixed, 'body_nutrition:preceding_calories').state).toBe('unsupported')
    expect(relationship(mixed, 'body_nutrition:period_context').state).toBe('unsupported')
  })

  it('compares steps on canonical training days and leaves Apple workouts out of training', () => {
    const training = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
    const other = ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10']
    const state = analyze({
      today: '2026-09-23',
      activityDays: [
        ...training.map((date) => activity(date, { stepsCount: 8000, exerciseMinutes: 40 })),
        ...other.map((date) => activity(date, { stepsCount: 4000, exerciseMinutes: 10 })),
        activity('2026-09-11', { stepsCount: null, exerciseMinutes: 30 }),
      ],
      trainingSessions: training.map((date) => session(date)),
    })
    const steps = relationship(state, 'activity_training:steps')
    expect(steps.surfaced).toBe(true)
    if (steps.kind === 'group_comparison') {
      expect(steps.metrics.leftDays).toBe(5)
      expect(steps.metrics.rightDays).toBe(5)
      expect(steps.metrics.metrics[0]).toMatchObject({ leftAverage: 8000, rightAverage: 4000, delta: 4000 })
    }
    expect(steps.evidence.dates).not.toContain('2026-09-11')
    expect(steps.evidence.dates).not.toContain('2026-09-22')
    expect(steps.evidence.rightDates).toEqual(other)
  })
})

describe('deterministic copy', () => {
  it('describes associations without causal language or a score', () => {
    const source = readdirSync('src/domain/intelligence')
      .map((file) => {
        const text = readFileSync(`src/domain/intelligence/${file}`, 'utf8')
        return file === 'copy.ts' ? text.replace(/const CAUSAL_LANGUAGE = .+\n/, '') : text
      })
      .join('\n')
    expect(source).not.toMatch(/gemini|home-ai|readiness/i)
    expect(containsCausalLanguage(source)).toBe(false)
    const days = Array.from({ length: 20 }, (_, index) => addCalendarDays('2026-08-24', index))
    const state = analyze({
      sleepNights: days.map((date, index) => night(date, 400 + index)),
      activityDays: days.map((date, index) => activity(date, { stepsCount: 1000 + index * 100 })),
      nutritionDays: [
        ...['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'].map((date) =>
          logged(date, { calories: 2200, protein: 150, carbs: 200, fat: 70 }),
        ),
        ...['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'].map((date) =>
          logged(date, { calories: 1800, protein: 120, carbs: 160, fat: 50 }),
        ),
      ],
      trainingSessions: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'].map((date) => session(date)),
    })
    const copies = state.findings.map((finding) => findingCopy(finding)).filter((text): text is string => text != null)
    expect(copies.length).toBeGreaterThan(0)
    for (const text of copies) {
      expect(containsCausalLanguage(text)).toBe(false)
      expect(text).not.toMatch(/correlat/i)
    }
    expect(copies.some((text) => text.includes('tended to occur with'))).toBe(true)
    expect(copies.some((text) => text.includes('averaged') && text.includes('higher'))).toBe(true)
    expect(findingCopy(relationship(state, 'sleep_activity:sleep_minutes:exercise_minutes'))).toBeNull()
  })
})

function sparseStateDays(measurements: readonly string[]): NutritionDailyObservation[] {
  return measurements.flatMap((date) =>
    Array.from({ length: 7 }, (_, index) => logged(addCalendarDays(date, index - 7), { calories: 2000 - measurements.indexOf(date) * 10, protein: 100 })),
  )
}
