import type { ActivityDailyRow } from '../activity/analytics.js'
import { bodyWeightTrend } from '../progress/body-trend.js'
import { addCalendarDays } from '../progress/dates.js'
import type { NutritionDailyObservation } from '../progress/nutrition.js'
import { trailingPeriod } from '../progress/periods.js'
import type { BodyObservation, HealthDomain, ProgressRange } from '../progress/types.js'
import type { SleepSummaryNight } from '../sleep/analytics.js'
import { isCalendarDate } from '../training.js'
import {
  BODY_NUTRITION_MIN_LOGGED_DAYS,
  BODY_NUTRITION_MIN_MEASUREMENTS,
  BODY_NUTRITION_WINDOW_DAYS,
  GROUP_MIN_DAYS,
  INTELLIGENCE_TIMEZONE,
  RELATIONSHIP_IDS,
  SPEARMAN_MIN_PAIRS,
  type RelationshipId,
} from './config.js'
import { associationDirection, associationStrength, sampleTierFor, spearmanRho } from './spearman.js'
import type {
  AssociationDirection,
  AssociationStrength,
  BodyNutritionWindow,
  CrossDomainCoverage,
  CrossDomainEvidence,
  CrossDomainFinding,
  CrossDomainState,
  GroupComparisonMetrics,
  GroupMetric,
  IntelligencePeriod,
  IntelligenceState,
  PeriodContextMetrics,
  SampleTier,
  SpearmanMetrics,
  SurfacingResult,
  WindowedMetrics,
} from './types.js'

export type IntelligenceTrainingSession = {
  sessionId: string
  sessionDate: string
  effort: number | null
  painLevel: number | null
}

export type CrossDomainInput = {
  range: ProgressRange
  asOf: string
  today?: string | null
  activityDays: readonly ActivityDailyRow[]
  sleepNights: readonly SleepSummaryNight[]
  nutritionDays: readonly NutritionDailyObservation[]
  trainingSessions: readonly IntelligenceTrainingSession[]
  bodyWeights: readonly BodyObservation[]
}

type Pair = { date: string; x: number; y: number }

const SPEARMAN_METHOD = 'spearman_rank'
const GROUP_METHOD = 'group_mean_difference'
const WINDOW_METHOD = 'preceding_window_spearman'
const CONTEXT_METHOD = 'theil_sen_period_context'

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function coverage(paired: number, denominator: number, label: string): CrossDomainCoverage {
  return {
    paired,
    denominator,
    label,
    pct: denominator === 0 ? 0 : (paired / denominator) * 100,
  }
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function provisionalActivityDate(asOf: string, today?: string | null): string | null {
  if (!today || asOf !== today) {
    return null
  }
  return today
}

function inPeriod(date: string, period: IntelligencePeriod): boolean {
  return date >= period.start && date <= period.end
}

function eligibleSleep(night: SleepSummaryNight): boolean {
  if (night.observationStatus === 'partial_observation' || night.observationStatus === 'in_bed_only') {
    return false
  }
  return night.analysisEligible === true && finite(night.totalSleepMinutes)
}

function nutrientValue(observation: { status: string; value?: number }): number | null {
  if (observation.status !== 'available' || !finite(observation.value)) {
    return null
  }
  return observation.value
}

function oneWeightPerDate(observations: readonly BodyObservation[]): BodyObservation[] {
  const ordered = [...observations].sort((left, right) => {
    if (left.calendarDate !== right.calendarDate) {
      return left.calendarDate < right.calendarDate ? -1 : 1
    }
    if (left.measuredAt !== right.measuredAt) {
      return left.measuredAt < right.measuredAt ? -1 : 1
    }
    return left.measurementId < right.measurementId ? -1 : 1
  })
  const byDate = new Map<string, BodyObservation>()
  for (const observation of ordered) {
    byDate.set(observation.calendarDate, observation)
  }
  return [...byDate.values()].sort((left, right) => (left.calendarDate < right.calendarDate ? -1 : 1))
}

function resolvePeriod(input: CrossDomainInput): IntelligencePeriod {
  const dates: string[] = []
  for (const row of input.activityDays) {
    if (row.date <= input.asOf) dates.push(row.date)
  }
  for (const night of input.sleepNights) {
    if (night.sleepDate <= input.asOf) dates.push(night.sleepDate)
  }
  for (const day of input.nutritionDays) {
    if (day.date <= input.asOf) dates.push(day.date)
  }
  for (const session of input.trainingSessions) {
    if (session.sessionDate <= input.asOf) dates.push(session.sessionDate)
  }
  for (const weight of input.bodyWeights) {
    if (weight.key === 'weight' && weight.calendarDate <= input.asOf) dates.push(weight.calendarDate)
  }
  const earliest = dates.length === 0 ? null : dates.reduce((min, date) => (date < min ? date : min))
  const trailing = trailingPeriod(input.range, input.asOf, earliest)
  return {
    range: input.range,
    asOf: input.asOf,
    start: trailing.start,
    end: trailing.end,
    dayCount: trailing.dayCount,
  }
}

function base(input: {
  id: RelationshipId
  kind: CrossDomainFinding['kind']
  domainA: HealthDomain
  domainB: HealthDomain
  period: IntelligencePeriod
  sampleSize: number
  gateSampleSize: number
  requiredSampleSize: number
  coverage: CrossDomainCoverage
  direction: AssociationDirection | null
  strength: AssociationStrength | null
  statisticalMethod: string
  evidence: CrossDomainEvidence
  state: IntelligenceState
  surfaced: boolean
  surfacing: SurfacingResult
  metrics: CrossDomainFinding['metrics']
}): CrossDomainFinding {
  const shared = {
    id: input.id,
    domainA: input.domainA,
    domainB: input.domainB,
    period: input.period,
    sampleSize: input.sampleSize,
    gateSampleSize: input.gateSampleSize,
    requiredSampleSize: input.requiredSampleSize,
    sampleTier: sampleTierFor(input.gateSampleSize),
    coverage: input.coverage,
    direction: input.direction,
    strength: input.strength,
    statisticalMethod: input.statisticalMethod,
    evidence: input.evidence,
    state: input.state,
    surfaced: input.surfaced,
    surfacing: input.surfacing,
  }
  if (input.kind === 'spearman_association') {
    return { ...shared, kind: input.kind, metrics: input.metrics as SpearmanMetrics }
  }
  if (input.kind === 'windowed_association') {
    return { ...shared, kind: input.kind, metrics: input.metrics as WindowedMetrics }
  }
  if (input.kind === 'group_comparison') {
    return { ...shared, kind: input.kind, metrics: input.metrics as GroupComparisonMetrics }
  }
  return { ...shared, kind: 'period_context', metrics: input.metrics as PeriodContextMetrics }
}

function spearmanFinding(input: {
  id: RelationshipId
  domainA: HealthDomain
  domainB: HealthDomain
  period: IntelligencePeriod
  xMetric: string
  yMetric: string
  pairs: readonly Pair[]
  denominator: number
  coverageLabel: string
  minPairs: number
  kind?: 'spearman_association' | 'windowed_association'
  method?: string
  windowDays?: number
  minLoggedDays?: number
  windows?: BodyNutritionWindow[]
}): CrossDomainFinding {
  const xs = input.pairs.map((pair) => pair.x)
  const ys = input.pairs.map((pair) => pair.y)
  const rho = spearmanRho(xs, ys)
  const strength = rho == null ? null : associationStrength(rho)
  const enough = input.pairs.length >= input.minPairs && rho != null
  const surfaced = enough && strength != null
  const state: IntelligenceState = enough ? 'available' : 'insufficient_data'
  const surfacing: SurfacingResult = surfaced
    ? 'surfaced'
    : state === 'available'
      ? 'below_association_threshold'
      : 'insufficient_sample'
  const metrics: WindowedMetrics = {
    xMetric: input.xMetric,
    yMetric: input.yMetric,
    rho,
    n: input.pairs.length,
    windowDays: input.windowDays ?? 0,
    minLoggedDays: input.minLoggedDays ?? 0,
  }
  const kind = input.kind ?? 'spearman_association'
  return base({
    id: input.id,
    kind,
    domainA: input.domainA,
    domainB: input.domainB,
    period: input.period,
    sampleSize: input.pairs.length,
    gateSampleSize: input.pairs.length,
    requiredSampleSize: input.minPairs,
    coverage: coverage(input.pairs.length, input.denominator, input.coverageLabel),
    direction: associationDirection(rho, strength),
    strength: surfaced ? strength : null,
    statisticalMethod: input.method ?? SPEARMAN_METHOD,
    evidence: {
      dates: input.pairs.map((pair) => pair.date),
      windows: input.windows,
    },
    state: surfaced ? 'available' : state,
    surfaced,
    surfacing,
    metrics: kind === 'spearman_association' ? { xMetric: metrics.xMetric, yMetric: metrics.yMetric, rho: metrics.rho, n: metrics.n } : metrics,
  })
}

function groupDirection(metrics: readonly GroupMetric[]): AssociationDirection | null {
  const signs = metrics
    .map((metric) => metric.delta)
    .filter((delta): delta is number => delta != null && delta !== 0)
    .map((delta) => (delta > 0 ? 1 : -1))
  if (signs.length === 0) {
    return metrics.some((metric) => metric.delta === 0) ? 'neutral' : null
  }
  if (signs.every((sign) => sign > 0)) {
    return 'positive'
  }
  if (signs.every((sign) => sign < 0)) {
    return 'negative'
  }
  return 'mixed'
}

function groupMetric(
  metric: string,
  unit: string,
  left: readonly number[],
  right: readonly number[],
): GroupMetric {
  const leftAverage = mean(left)
  const rightAverage = mean(right)
  return {
    metric,
    unit,
    leftAverage,
    rightAverage,
    leftCount: left.length,
    rightCount: right.length,
    delta: leftAverage == null || rightAverage == null ? null : leftAverage - rightAverage,
  }
}

function groupFinding(input: {
  id: RelationshipId
  domainA: HealthDomain
  domainB: HealthDomain
  period: IntelligencePeriod
  leftLabel: string
  rightLabel: string
  leftDates: readonly string[]
  rightDates: readonly string[]
  metrics: GroupMetric[]
  denominator: number
  coverageLabel: string
}): CrossDomainFinding {
  const leftDays = input.leftDates.length
  const rightDays = input.rightDates.length
  const gate = Math.min(leftDays, rightDays)
  const comparable = input.metrics.some((metric) => metric.delta != null)
  const surfaced = gate >= GROUP_MIN_DAYS && comparable
  const metrics: GroupComparisonMetrics = {
    leftLabel: input.leftLabel,
    rightLabel: input.rightLabel,
    leftDays,
    rightDays,
    metrics: input.metrics,
  }
  return base({
    id: input.id,
    kind: 'group_comparison',
    domainA: input.domainA,
    domainB: input.domainB,
    period: input.period,
    sampleSize: leftDays + rightDays,
    gateSampleSize: gate,
    requiredSampleSize: GROUP_MIN_DAYS,
    coverage: coverage(leftDays + rightDays, input.denominator, input.coverageLabel),
    direction: groupDirection(input.metrics),
    strength: null,
    statisticalMethod: GROUP_METHOD,
    evidence: {
      dates: [...input.leftDates, ...input.rightDates].sort(),
      leftDates: [...input.leftDates],
      rightDates: [...input.rightDates],
    },
    state: surfaced ? 'available' : 'insufficient_data',
    surfaced,
    surfacing: surfaced ? 'surfaced' : 'insufficient_sample',
    metrics,
  })
}

function activityValue(row: ActivityDailyRow, field: 'stepsCount' | 'activeEnergyKcal' | 'exerciseMinutes' | 'restingHeartRateBpm'): number | null {
  const value = row[field]
  return finite(value) ? value : null
}

function indexActivity(rows: readonly ActivityDailyRow[], period: IntelligencePeriod, provisionalDate: string | null): Map<string, ActivityDailyRow> {
  const map = new Map<string, ActivityDailyRow>()
  for (const row of rows) {
    if (!inPeriod(row.date, period) || row.date === provisionalDate) {
      continue
    }
    map.set(row.date, row)
  }
  return map
}

function indexSleep(nights: readonly SleepSummaryNight[], period: IntelligencePeriod): Map<string, SleepSummaryNight> {
  const map = new Map<string, SleepSummaryNight>()
  for (const night of nights) {
    if (!inPeriod(night.sleepDate, period) || !eligibleSleep(night)) {
      continue
    }
    map.set(night.sleepDate, night)
  }
  return map
}

function indexNutrition(days: readonly NutritionDailyObservation[], period: IntelligencePeriod): Map<string, NutritionDailyObservation> {
  const map = new Map<string, NutritionDailyObservation>()
  for (const day of days) {
    if (!inPeriod(day.date, period) || day.entryCount < 1) {
      continue
    }
    map.set(day.date, day)
  }
  return map
}

function trainingDates(sessions: readonly IntelligenceTrainingSession[], period: IntelligencePeriod): Set<string> {
  const dates = new Set<string>()
  for (const session of sessions) {
    if (inPeriod(session.sessionDate, period)) {
      dates.add(session.sessionDate)
    }
  }
  return dates
}

function sessionValueOnDate(
  sessions: readonly IntelligenceTrainingSession[],
  date: string,
  field: 'effort' | 'painLevel',
): number | null {
  const values = sessions
    .filter((session) => session.sessionDate === date && finite(session[field]))
    .map((session) => session[field] as number)
  if (values.length !== 1) {
    return null
  }
  return values[0]!
}

function sleepActivityPairs(
  sleep: Map<string, SleepSummaryNight>,
  activity: Map<string, ActivityDailyRow>,
  field: 'stepsCount' | 'activeEnergyKcal' | 'exerciseMinutes' | 'restingHeartRateBpm',
): Pair[] {
  const pairs: Pair[] = []
  for (const [date, night] of sleep) {
    const row = activity.get(date)
    const y = row ? activityValue(row, field) : null
    if (!row || y == null || !finite(night.totalSleepMinutes)) {
      continue
    }
    pairs.push({ date, x: night.totalSleepMinutes, y })
  }
  pairs.sort((left, right) => (left.date < right.date ? -1 : 1))
  return pairs
}

function sleepActivity(input: {
  period: IntelligencePeriod
  sleep: Map<string, SleepSummaryNight>
  activity: Map<string, ActivityDailyRow>
}): CrossDomainFinding[] {
  const specs: Array<{
    id: RelationshipId
    field: 'stepsCount' | 'activeEnergyKcal' | 'exerciseMinutes' | 'restingHeartRateBpm'
    yMetric: string
  }> = [
    { id: 'sleep_activity:sleep_minutes:steps', field: 'stepsCount', yMetric: 'steps' },
    { id: 'sleep_activity:sleep_minutes:active_energy_kcal', field: 'activeEnergyKcal', yMetric: 'active_energy_kcal' },
    { id: 'sleep_activity:sleep_minutes:exercise_minutes', field: 'exerciseMinutes', yMetric: 'exercise_minutes' },
    { id: 'sleep_activity:sleep_minutes:resting_heart_rate_bpm', field: 'restingHeartRateBpm', yMetric: 'resting_heart_rate_bpm' },
  ]
  return specs.map((spec) =>
    spearmanFinding({
      id: spec.id,
      domainA: 'sleep',
      domainB: 'activity',
      period: input.period,
      xMetric: 'sleep_minutes',
      yMetric: spec.yMetric,
      pairs: sleepActivityPairs(input.sleep, input.activity, spec.field),
      denominator: input.period.dayCount,
      coverageLabel: 'paired days out of selected days',
      minPairs: SPEARMAN_MIN_PAIRS,
    }),
  )
}

function sleepTraining(input: {
  period: IntelligencePeriod
  sleep: Map<string, SleepSummaryNight>
  sessions: readonly IntelligenceTrainingSession[]
  trained: Set<string>
}): CrossDomainFinding[] {
  const effortPairs: Pair[] = []
  const painPairs: Pair[] = []
  for (const [date, night] of input.sleep) {
    if (!finite(night.totalSleepMinutes) || !input.trained.has(date)) {
      continue
    }
    const effort = sessionValueOnDate(input.sessions, date, 'effort')
    const pain = sessionValueOnDate(input.sessions, date, 'painLevel')
    if (effort != null) {
      effortPairs.push({ date, x: night.totalSleepMinutes, y: effort })
    }
    if (pain != null) {
      painPairs.push({ date, x: night.totalSleepMinutes, y: pain })
    }
  }
  effortPairs.sort((left, right) => (left.date < right.date ? -1 : 1))
  painPairs.sort((left, right) => (left.date < right.date ? -1 : 1))
  const trainingNights: string[] = []
  const otherNights: string[] = []
  const trainingMinutes: number[] = []
  const otherMinutes: number[] = []
  for (const [date, night] of input.sleep) {
    if (!finite(night.totalSleepMinutes)) {
      continue
    }
    if (input.trained.has(date)) {
      trainingNights.push(date)
      trainingMinutes.push(night.totalSleepMinutes)
    } else {
      otherNights.push(date)
      otherMinutes.push(night.totalSleepMinutes)
    }
  }
  trainingNights.sort()
  otherNights.sort()
  return [
    spearmanFinding({
      id: 'sleep_training:sleep_minutes:effort',
      domainA: 'sleep',
      domainB: 'training',
      period: input.period,
      xMetric: 'sleep_minutes',
      yMetric: 'effort',
      pairs: effortPairs,
      denominator: input.period.dayCount,
      coverageLabel: 'paired training dates out of selected days',
      minPairs: SPEARMAN_MIN_PAIRS,
    }),
    spearmanFinding({
      id: 'sleep_training:sleep_minutes:pain_level',
      domainA: 'sleep',
      domainB: 'training',
      period: input.period,
      xMetric: 'sleep_minutes',
      yMetric: 'pain_level',
      pairs: painPairs,
      denominator: input.period.dayCount,
      coverageLabel: 'paired training dates out of selected days',
      minPairs: SPEARMAN_MIN_PAIRS,
    }),
    groupFinding({
      id: 'sleep_training:sleep_minutes',
      domainA: 'sleep',
      domainB: 'training',
      period: input.period,
      leftLabel: 'training dates',
      rightLabel: 'other complete nights',
      leftDates: trainingNights,
      rightDates: otherNights,
      metrics: [groupMetric('sleep_minutes', 'min', trainingMinutes, otherMinutes)],
      denominator: input.period.dayCount,
      coverageLabel: 'complete nights out of selected days',
    }),
  ]
}

function nutritionTraining(input: {
  period: IntelligencePeriod
  nutrition: Map<string, NutritionDailyObservation>
  trained: Set<string>
}): CrossDomainFinding {
  const leftDates: string[] = []
  const rightDates: string[] = []
  const groups = {
    calories: { left: [] as number[], right: [] as number[] },
    protein: { left: [] as number[], right: [] as number[] },
    carbs: { left: [] as number[], right: [] as number[] },
    fat: { left: [] as number[], right: [] as number[] },
  }
  for (const [date, day] of input.nutrition) {
    const side = input.trained.has(date) ? 'left' : 'right'
    if (side === 'left') {
      leftDates.push(date)
    } else {
      rightDates.push(date)
    }
    const calories = nutrientValue(day.calories)
    const protein = nutrientValue(day.protein)
    const carbs = nutrientValue(day.carbs)
    const fat = nutrientValue(day.fat)
    if (calories != null) groups.calories[side].push(calories)
    if (protein != null) groups.protein[side].push(protein)
    if (carbs != null) groups.carbs[side].push(carbs)
    if (fat != null) groups.fat[side].push(fat)
  }
  leftDates.sort()
  rightDates.sort()
  return groupFinding({
    id: 'nutrition_training:logged_day_groups',
    domainA: 'nutrition',
    domainB: 'training',
    period: input.period,
    leftLabel: 'logged training days',
    rightLabel: 'other logged days',
    leftDates,
    rightDates,
    metrics: [
      groupMetric('calories', 'kcal', groups.calories.left, groups.calories.right),
      groupMetric('protein', 'g', groups.protein.left, groups.protein.right),
      groupMetric('carbs', 'g', groups.carbs.left, groups.carbs.right),
      groupMetric('fat', 'g', groups.fat.left, groups.fat.right),
    ],
    denominator: input.period.dayCount,
    coverageLabel: 'logged nutrition days out of selected days',
  })
}

function nutritionActivity(input: {
  period: IntelligencePeriod
  nutrition: Map<string, NutritionDailyObservation>
  activity: Map<string, ActivityDailyRow>
}): CrossDomainFinding[] {
  const specs: Array<{
    id: RelationshipId
    nutrient: 'calories' | 'protein'
    field: 'stepsCount' | 'activeEnergyKcal'
    yMetric: string
  }> = [
    { id: 'nutrition_activity:calories:steps', nutrient: 'calories', field: 'stepsCount', yMetric: 'steps' },
    { id: 'nutrition_activity:calories:active_energy_kcal', nutrient: 'calories', field: 'activeEnergyKcal', yMetric: 'active_energy_kcal' },
    { id: 'nutrition_activity:protein:steps', nutrient: 'protein', field: 'stepsCount', yMetric: 'steps' },
    { id: 'nutrition_activity:protein:active_energy_kcal', nutrient: 'protein', field: 'activeEnergyKcal', yMetric: 'active_energy_kcal' },
  ]
  return specs.map((spec) => {
    const pairs: Pair[] = []
    for (const [date, day] of input.nutrition) {
      const row = input.activity.get(date)
      const x = nutrientValue(day[spec.nutrient])
      const y = row ? activityValue(row, spec.field) : null
      if (x == null || y == null) {
        continue
      }
      pairs.push({ date, x, y })
    }
    pairs.sort((left, right) => (left.date < right.date ? -1 : 1))
    return spearmanFinding({
      id: spec.id,
      domainA: 'nutrition',
      domainB: 'activity',
      period: input.period,
      xMetric: spec.nutrient,
      yMetric: spec.yMetric,
      pairs,
      denominator: input.period.dayCount,
      coverageLabel: 'paired logged days out of selected days',
      minPairs: SPEARMAN_MIN_PAIRS,
    })
  })
}

function nutritionWindow(
  nutrition: Map<string, NutritionDailyObservation>,
  measurementDate: string,
  period: IntelligencePeriod,
): { logged: NutritionDailyObservation[]; start: string; end: string } | null {
  const precedingStart = addCalendarDays(measurementDate, -BODY_NUTRITION_WINDOW_DAYS)
  const precedingEnd = addCalendarDays(measurementDate, -1)
  const start = precedingStart < period.start ? period.start : precedingStart
  const end = precedingEnd > period.end ? period.end : precedingEnd
  if (end < start) {
    return null
  }
  const logged = [...nutrition.values()].filter((day) => day.date >= start && day.date <= end)
  return { logged, start, end }
}

function bodyNutrition(input: {
  period: IntelligencePeriod
  nutrition: Map<string, NutritionDailyObservation>
  weights: readonly BodyObservation[]
}): CrossDomainFinding[] {
  const measurements = oneWeightPerDate(
    input.weights.filter((item) => item.key === 'weight' && inPeriod(item.calendarDate, input.period) && finite(item.value)),
  )
  const measurementUnits = new Set(measurements.map((measurement) => measurement.unit))
  if (measurementUnits.size > 1) {
    return [
      unsupportedWindow(input.period, 'body_nutrition:preceding_calories', 'preceding_14d_avg_calories', measurements.length, []),
      unsupportedWindow(input.period, 'body_nutrition:preceding_protein', 'preceding_14d_avg_protein', measurements.length, []),
      bodyPeriodContext(input.period, input.nutrition, measurements),
    ]
  }
  const windows: BodyNutritionWindow[] = []
  for (const measurement of measurements) {
    const window = nutritionWindow(input.nutrition, measurement.calendarDate, input.period)
    const logged = window?.logged ?? []
    if (logged.length < BODY_NUTRITION_MIN_LOGGED_DAYS) {
      continue
    }
    const calories = logged.map((day) => nutrientValue(day.calories)).filter((value): value is number => value != null)
    const protein = logged.map((day) => nutrientValue(day.protein)).filter((value): value is number => value != null)
    windows.push({
      date: measurement.calendarDate,
      weight: measurement.value,
      unit: measurement.unit,
      loggedDays: logged.length,
      coveragePct: (logged.length / BODY_NUTRITION_WINDOW_DAYS) * 100,
      averageCalories: mean(calories),
      averageProtein: mean(protein),
    })
  }
  const caloriePairs: Pair[] = []
  const proteinPairs: Pair[] = []
  for (const window of windows) {
    if (window.averageCalories != null) {
      caloriePairs.push({ date: window.date, x: window.averageCalories, y: window.weight })
    }
    if (window.averageProtein != null) {
      proteinPairs.push({ date: window.date, x: window.averageProtein, y: window.weight })
    }
  }
  const calorieFinding = spearmanFinding({
        id: 'body_nutrition:preceding_calories',
        domainA: 'body',
        domainB: 'nutrition',
        period: input.period,
        xMetric: 'preceding_14d_avg_calories',
        yMetric: 'bodyweight',
        pairs: caloriePairs,
        denominator: measurements.length,
        coverageLabel: 'bodyweight measurements with a preceding nutrition window',
        minPairs: BODY_NUTRITION_MIN_MEASUREMENTS,
        kind: 'windowed_association',
        method: WINDOW_METHOD,
        windowDays: BODY_NUTRITION_WINDOW_DAYS,
        minLoggedDays: BODY_NUTRITION_MIN_LOGGED_DAYS,
        windows,
      })
  const proteinFinding = spearmanFinding({
        id: 'body_nutrition:preceding_protein',
        domainA: 'body',
        domainB: 'nutrition',
        period: input.period,
        xMetric: 'preceding_14d_avg_protein',
        yMetric: 'bodyweight',
        pairs: proteinPairs,
        denominator: measurements.length,
        coverageLabel: 'bodyweight measurements with a preceding nutrition window',
        minPairs: BODY_NUTRITION_MIN_MEASUREMENTS,
        kind: 'windowed_association',
        method: WINDOW_METHOD,
        windowDays: BODY_NUTRITION_WINDOW_DAYS,
        minLoggedDays: BODY_NUTRITION_MIN_LOGGED_DAYS,
        windows,
      })
  return [calorieFinding, proteinFinding, bodyPeriodContext(input.period, input.nutrition, measurements)]
}

function unsupportedWindow(
  period: IntelligencePeriod,
  id: RelationshipId,
  xMetric: string,
  measurementCount: number,
  windows: BodyNutritionWindow[],
): CrossDomainFinding {
  return base({
    id,
    kind: 'windowed_association',
    domainA: 'body',
    domainB: 'nutrition',
    period,
    sampleSize: 0,
    gateSampleSize: 0,
    requiredSampleSize: BODY_NUTRITION_MIN_MEASUREMENTS,
    coverage: coverage(0, measurementCount, 'bodyweight measurements with a preceding nutrition window'),
    direction: null,
    strength: null,
    statisticalMethod: WINDOW_METHOD,
    evidence: { dates: [], windows },
    state: 'unsupported',
    surfaced: false,
    surfacing: 'unsupported',
    metrics: {
      xMetric,
      yMetric: 'bodyweight',
      rho: null,
      n: 0,
      windowDays: BODY_NUTRITION_WINDOW_DAYS,
      minLoggedDays: BODY_NUTRITION_MIN_LOGGED_DAYS,
    },
  })
}

function bodyPeriodContext(
  period: IntelligencePeriod,
  nutrition: Map<string, NutritionDailyObservation>,
  measurements: readonly BodyObservation[],
): CrossDomainFinding {
  const units = new Set(measurements.map((item) => item.unit))
  if (units.size > 1) {
    return base({
      id: 'body_nutrition:period_context',
      kind: 'period_context',
      domainA: 'body',
      domainB: 'nutrition',
      period,
      sampleSize: measurements.length,
      gateSampleSize: measurements.length,
      requiredSampleSize: 5,
      coverage: coverage(nutrition.size, period.dayCount, 'logged nutrition days out of selected days'),
      direction: null,
      strength: null,
      statisticalMethod: CONTEXT_METHOD,
      evidence: { dates: [...nutrition.keys()].sort() },
      state: 'unsupported',
      surfaced: false,
      surfacing: 'unsupported',
      metrics: emptyContext(period, nutrition.size),
    })
  }
  const trend = bodyWeightTrend(measurements)
  const calories = [...nutrition.values()].map((day) => nutrientValue(day.calories)).filter((value): value is number => value != null)
  const protein = [...nutrition.values()].map((day) => nutrientValue(day.protein)).filter((value): value is number => value != null)
  const averageCalories = mean(calories)
  const metrics: PeriodContextMetrics = {
    trendStatus: trend.status === 'available' ? 'available' : trend.status === 'unsupported' ? 'unsupported' : 'insufficient_data',
    slopePerDay: trend.status === 'available' ? trend.value.slopePerDay : null,
    slopePer30Days: trend.status === 'available' ? trend.value.slopePerDay * 30 : null,
    unit: measurements[0]?.unit ?? null,
    measurementCount: trend.status === 'available' ? trend.value.measurementCount : measurements.length,
    spanDays: trend.status === 'available' ? trend.value.spanDays : null,
    loggedDays: nutrition.size,
    calendarDays: period.dayCount,
    coveragePct: period.dayCount === 0 ? 0 : (nutrition.size / period.dayCount) * 100,
    averageCalories,
    averageProtein: mean(protein),
  }
  const surfaced = trend.status === 'available' && nutrition.size > 0 && averageCalories != null
  return base({
    id: 'body_nutrition:period_context',
    kind: 'period_context',
    domainA: 'body',
    domainB: 'nutrition',
    period,
    sampleSize: metrics.measurementCount,
    gateSampleSize: metrics.measurementCount,
    requiredSampleSize: 5,
    coverage: coverage(nutrition.size, period.dayCount, 'logged nutrition days out of selected days'),
    direction: null,
    strength: null,
    statisticalMethod: CONTEXT_METHOD,
    evidence: { dates: [...nutrition.keys()].sort() },
    state: surfaced ? 'available' : 'insufficient_data',
    surfaced,
    surfacing: surfaced ? 'surfaced' : 'insufficient_sample',
    metrics,
  })
}

function emptyContext(period: IntelligencePeriod, loggedDays: number): PeriodContextMetrics {
  return {
    trendStatus: 'unsupported',
    slopePerDay: null,
    slopePer30Days: null,
    unit: null,
    measurementCount: 0,
    spanDays: null,
    loggedDays,
    calendarDays: period.dayCount,
    coveragePct: period.dayCount === 0 ? 0 : (loggedDays / period.dayCount) * 100,
    averageCalories: null,
    averageProtein: null,
  }
}

function activityTraining(input: {
  period: IntelligencePeriod
  activity: Map<string, ActivityDailyRow>
  trained: Set<string>
}): CrossDomainFinding {
  const leftDates: string[] = []
  const rightDates: string[] = []
  const leftSteps: number[] = []
  const rightSteps: number[] = []
  for (const [date, row] of input.activity) {
    const steps = activityValue(row, 'stepsCount')
    if (steps == null) {
      continue
    }
    if (input.trained.has(date)) {
      leftDates.push(date)
      leftSteps.push(steps)
    } else {
      rightDates.push(date)
      rightSteps.push(steps)
    }
  }
  leftDates.sort()
  rightDates.sort()
  return groupFinding({
    id: 'activity_training:steps',
    domainA: 'activity',
    domainB: 'training',
    period: input.period,
    leftLabel: 'training days',
    rightLabel: 'other completed activity days',
    leftDates,
    rightDates,
    metrics: [groupMetric('steps', 'steps', leftSteps, rightSteps)],
    denominator: input.period.dayCount,
    coverageLabel: 'completed activity days with steps out of selected days',
  })
}

function tierRank(tier: SampleTier | null): number {
  if (tier === 'larger_sample') return 3
  if (tier === 'moderate_sample') return 2
  if (tier === 'limited_evidence') return 1
  return 0
}

function magnitude(finding: CrossDomainFinding): number {
  if (finding.kind === 'spearman_association' || finding.kind === 'windowed_association') {
    return finding.metrics.rho == null ? 0 : Math.abs(finding.metrics.rho)
  }
  if (finding.kind === 'group_comparison') {
    let best = 0
    for (const metric of finding.metrics.metrics) {
      if (metric.delta == null || metric.leftAverage == null || metric.leftAverage === 0) {
        continue
      }
      const relative = Math.abs(metric.delta / metric.leftAverage)
      if (relative > best) {
        best = relative
      }
    }
    return best
  }
  return 0
}

export function compareCrossDomainFindings(left: CrossDomainFinding, right: CrossDomainFinding): number {
  const tier = tierRank(right.sampleTier) - tierRank(left.sampleTier)
  if (tier !== 0) {
    return tier
  }
  if (left.gateSampleSize !== right.gateSampleSize) {
    return right.gateSampleSize - left.gateSampleSize
  }
  const size = magnitude(right) - magnitude(left)
  if (size !== 0) {
    return size
  }
  if (left.coverage.pct !== right.coverage.pct) {
    return right.coverage.pct - left.coverage.pct
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

export function analyzeCrossDomain(input: CrossDomainInput): CrossDomainState {
  if (!isCalendarDate(input.asOf)) {
    throw new Error('asOf must be YYYY-MM-DD')
  }
  const period = resolvePeriod(input)
  const provisional = provisionalActivityDate(input.asOf, input.today)
  const activity = indexActivity(input.activityDays, period, provisional)
  const sleep = indexSleep(input.sleepNights, period)
  const nutrition = indexNutrition(input.nutritionDays, period)
  const trained = trainingDates(input.trainingSessions, period)
  const relationships = [
    ...sleepActivity({ period, sleep, activity }),
    ...sleepTraining({ period, sleep, sessions: input.trainingSessions, trained }),
    nutritionTraining({ period, nutrition, trained }),
    ...nutritionActivity({ period, nutrition, activity }),
    ...bodyNutrition({ period, nutrition, weights: input.bodyWeights }),
    activityTraining({ period, activity, trained }),
  ]
  if (relationships.map((item) => item.id).join('|') !== RELATIONSHIP_IDS.join('|')) {
    throw new Error('Cross-domain relationship catalog drifted')
  }
  const findings = relationships.filter((item) => item.surfaced).sort(compareCrossDomainFindings)
  return {
    timezone: INTELLIGENCE_TIMEZONE,
    period,
    today: input.today ?? null,
    provisionalActivityDate: provisional,
    relationships,
    findings,
  }
}
