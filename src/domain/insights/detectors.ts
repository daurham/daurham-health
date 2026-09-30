import { activityRangeSummary } from '../activity/analytics.js'
import type { AskLens } from '../ask-health/index.js'
import { ACTIVITY_TIMEZONE } from '../activity/config.js'
import { findingCopy } from '../intelligence/copy.js'
import type { AssociationStrength, CrossDomainFinding } from '../intelligence/types.js'
import { addCalendarDays } from '../progress/dates.js'
import { bodyWeightTrend } from '../progress/body-trend.js'
import { percentChange } from '../progress/statistics.js'
import { kilogramsToPounds } from '../units.js'
import {
  ACTIVITY_COMPARISON_DAYS,
  ACTIVITY_MIN_OBSERVED_DAYS,
  ACTIVITY_MIN_RELATIVE_CHANGE_PCT,
  BODY_WEIGHT_MIN_SLOPE_LB_PER_WEEK,
  CANONICAL_TRAINING_SESSION_TYPES,
  INSIGHT_TIERS,
  NUTRITION_CALORIE_MIN_DELTA,
  NUTRITION_COMPARISON_DAYS,
  NUTRITION_MIN_COVERAGE_PCT,
  NUTRITION_MIN_LOGGED_DAYS,
  NUTRITION_MIN_RELATIVE_CHANGE_PCT,
  NUTRITION_PROTEIN_MIN_DELTA,
  PROACTIVE_INSIGHTS_VERSION,
  SLEEP_COMPARISON_NIGHTS,
  SLEEP_MIN_DURATION_DELTA_MINUTES,
  SLEEP_MIN_ELIGIBLE_NIGHTS,
  TRAINING_COMPARISON_DAYS,
  TRAINING_MIN_SESSIONS_PER_WEEK,
} from './config.js'
import type {
  InsightDetectorInput,
  InsightDetectorResult,
  InsightEvidence,
  InsightNutritionDay,
  InsightSleepNight,
  ProactiveInsight,
  RankedInsight,
} from './types.js'

type Window = { start: string; end: string }

const ACTIVITY_METRICS = [
  { key: 'steps', label: 'step', unit: '/day', digits: 0, summary: (row: ReturnType<typeof activityRangeSummary>) => row.steps },
  {
    key: 'active_energy',
    label: 'active energy',
    unit: ' kcal/day',
    digits: 0,
    summary: (row: ReturnType<typeof activityRangeSummary>) => row.activeEnergy,
  },
  {
    key: 'exercise_minutes',
    label: 'exercise-minute',
    unit: ' min/day',
    digits: 0,
    summary: (row: ReturnType<typeof activityRangeSummary>) => row.exercise,
  },
] as const

const ASSOCIATION_RANK: Record<AssociationStrength, number> = { strong: 3, moderate: 2, weak: 1 }

export function activityComparisonWindows(asOf: string, today: string | null): { current: Window; previous: Window } {
  const currentEnd = today && asOf === today ? addCalendarDays(asOf, -1) : asOf
  return pairedWindows(currentEnd, ACTIVITY_COMPARISON_DAYS)
}

export function sleepComparisonWindows(asOf: string): { current: Window; previous: Window } {
  return pairedWindows(asOf, SLEEP_COMPARISON_NIGHTS)
}

export function nutritionComparisonWindows(asOf: string): { current: Window; previous: Window } {
  return pairedWindows(asOf, NUTRITION_COMPARISON_DAYS)
}

export function trainingComparisonWindows(asOf: string): { current: Window; previous: Window } {
  return pairedWindows(asOf, TRAINING_COMPARISON_DAYS)
}

function pairedWindows(currentEnd: string, length: number): { current: Window; previous: Window } {
  const currentStart = addCalendarDays(currentEnd, -(length - 1))
  const previousEnd = addCalendarDays(currentStart, -1)
  const previousStart = addCalendarDays(previousEnd, -(length - 1))
  return {
    current: { start: currentStart, end: currentEnd },
    previous: { start: previousStart, end: previousEnd },
  }
}

function inWindow(date: string, window: Window): boolean {
  return date >= window.start && date <= window.end
}

function comparisonLabel(length: number): string {
  return `Last ${length} days vs prior ${length} days`
}

function baseInsight(
  fields: Omit<ProactiveInsight, 'calculationVersion' | 'ranking'> & { tier: number; magnitude: number; associationRank: number },
): RankedInsight {
  const insight: ProactiveInsight = {
    id: fields.id,
    calculationVersion: PROACTIVE_INSIGHTS_VERSION,
    kind: fields.kind,
    domain: fields.domain,
    title: fields.title,
    summary: fields.summary,
    period: fields.period,
    periodLabel: fields.periodLabel,
    evidence: fields.evidence,
    detailPath: fields.detailPath,
    goalPath: fields.goalPath,
    askHealth: fields.askHealth,
    signal: fields.signal,
    ranking: { tier: fields.tier, stableKey: fields.id },
  }
  return {
    insight,
    magnitude: fields.magnitude,
    associationRank: fields.associationRank,
    recency: fields.period.end,
  }
}

function skip(status: InsightDetectorResult['status'], reason: string): InsightDetectorResult {
  return { status, reason }
}

function eligible(ranked: RankedInsight): InsightDetectorResult {
  return {
    status: 'eligible',
    insight: ranked.insight,
    reason: 'eligible',
    magnitude: ranked.magnitude,
    associationRank: ranked.associationRank,
    recency: ranked.recency,
  }
}

export function detectActivityChange(input: InsightDetectorInput): InsightDetectorResult[] {
  const windows = activityComparisonWindows(input.asOf, input.today)
  const rows = input.activityDays.filter((row) => row.date <= windows.current.end)
  const today = input.today ?? undefined
  const current = activityRangeSummary(rows, windows.current.start, windows.current.end, ACTIVITY_TIMEZONE, today)
  const previous = activityRangeSummary(rows, windows.previous.start, windows.previous.end, ACTIVITY_TIMEZONE, today)
  const candidates: Array<{
    key: string
    label: string
    unit: string
    digits: number
    change: number
    currentValue: number
    previousValue: number
    currentDays: number
    previousDays: number
  }> = []
  let sawCoverage = false
  for (const metric of ACTIVITY_METRICS) {
    const currentMetric = metric.summary(current)
    const previousMetric = metric.summary(previous)
    if (currentMetric.observedDays < ACTIVITY_MIN_OBSERVED_DAYS || previousMetric.observedDays < ACTIVITY_MIN_OBSERVED_DAYS) {
      continue
    }
    sawCoverage = true
    if (currentMetric.status !== 'available' || previousMetric.status !== 'available') {
      continue
    }
    const currentValue = currentMetric.value
    const previousValue = previousMetric.value
    if (currentValue <= 0 || previousValue <= 0) {
      continue
    }
    const change = percentChange(currentValue, previousValue)
    if (change == null || Math.abs(change) < ACTIVITY_MIN_RELATIVE_CHANGE_PCT) {
      continue
    }
    candidates.push({
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      digits: metric.digits,
      change,
      currentValue,
      previousValue,
      currentDays: currentMetric.observedDays,
      previousDays: previousMetric.observedDays,
    })
  }
  if (candidates.length === 0) {
    return [skip(sawCoverage ? 'below_surfacing_threshold' : 'insufficient_evidence', sawCoverage ? 'activity change below 10%' : 'activity coverage below 14 observed days')]
  }
  candidates.sort((left, right) => Math.abs(right.change) - Math.abs(left.change) || left.key.localeCompare(right.key))
  const chosen = candidates[0]!
  const direction = chosen.change > 0 ? 'increased' : 'decreased'
  const ranked = baseInsight({
    id: `change:activity:${chosen.key}:${input.asOf}`,
    kind: 'domain_change',
    domain: 'activity',
    title: 'Activity',
    summary: `Completed-day ${chosen.label} average ${direction} ${Math.round(Math.abs(chosen.change))}%`,
    period: windows.current,
    periodLabel: comparisonLabel(ACTIVITY_COMPARISON_DAYS),
    evidence: [
      {
        label: 'Completed-day average',
        value: `${formatQuantity(chosen.currentValue, chosen.digits)}${chosen.unit} vs ${formatQuantity(chosen.previousValue, chosen.digits)}${chosen.unit}`,
      },
      {
        label: 'Observed days',
        value: `${chosen.currentDays} vs ${chosen.previousDays}`,
      },
      periodEvidence(windows),
    ],
    detailPath: '/progress/activity',
    signal:
      chosen.key === 'steps' || chosen.key === 'exercise_minutes'
        ? chosen.change > 0 ? 'positive' : 'negative'
        : 'neutral',
    tier: INSIGHT_TIERS.activity_change,
    magnitude: Math.abs(chosen.change),
    associationRank: 0,
    askHealth: {
      lens: 'general',
      range: '90d',
      suggestedQuestion: `What else changed during the period when my ${chosen.label} average ${direction}?`,
    },
  })
  return [eligible(ranked)]
}

export function detectSleepDurationChange(input: InsightDetectorInput): InsightDetectorResult[] {
  const windows = sleepComparisonWindows(input.asOf)
  const nights = input.sleepNights.filter((night) => night.sleepDate <= input.asOf)
  const current = eligibleNights(nights, windows.current)
  const previous = eligibleNights(nights, windows.previous)
  if (current.length < SLEEP_MIN_ELIGIBLE_NIGHTS || previous.length < SLEEP_MIN_ELIGIBLE_NIGHTS) {
    return [skip('insufficient_evidence', 'fewer than 7 analysis-eligible nights in a comparison window')]
  }
  const source = sharedSource([...current, ...previous])
  if (!source) {
    return [skip('source_not_comparable', 'sleep duration windows do not share one known source')]
  }
  const currentAverage = average(finiteNumbers(current.map((night) => night.totalSleepMinutes)))
  const previousAverage = average(finiteNumbers(previous.map((night) => night.totalSleepMinutes)))
  const delta = currentAverage - previousAverage
  if (Math.abs(delta) < SLEEP_MIN_DURATION_DELTA_MINUTES) {
    return [skip('below_surfacing_threshold', 'sleep duration change below 30 minutes')]
  }
  const direction = delta > 0 ? 'higher' : 'lower'
  const minutes = Math.round(Math.abs(delta))
  const ranked = baseInsight({
    id: `change:sleep:duration:${input.asOf}`,
    kind: 'domain_change',
    domain: 'sleep',
    title: 'Sleep',
    summary: `Average sleep duration was ${minutes}m ${direction} than the previous two weeks`,
    period: windows.current,
    periodLabel: comparisonLabel(SLEEP_COMPARISON_NIGHTS),
    evidence: [
      { label: 'Average duration', value: `${formatDuration(currentAverage)} vs ${formatDuration(previousAverage)}` },
      { label: 'Complete nights', value: `${current.length} vs ${previous.length}` },
      { label: 'Source', value: source.name },
      periodEvidence(windows),
    ],
    detailPath: '/progress/sleep',
    tier: INSIGHT_TIERS.sleep_duration,
    magnitude: Math.abs(delta),
    associationRank: 0,
    askHealth: {
      lens: 'recovery',
      range: '30d',
      suggestedQuestion: 'What does my recent sleep data show around this change?',
    },
  })
  return [eligible(ranked)]
}

export function detectNutritionChange(input: InsightDetectorInput): InsightDetectorResult[] {
  const windows = nutritionComparisonWindows(input.asOf)
  const days = input.nutritionDays.filter((day) => day.date <= input.asOf)
  const current = days.filter((day) => inWindow(day.date, windows.current))
  const previous = days.filter((day) => inWindow(day.date, windows.previous))
  const currentCoverage = (current.length / NUTRITION_COMPARISON_DAYS) * 100
  const previousCoverage = (previous.length / NUTRITION_COMPARISON_DAYS) * 100
  if (
    current.length < NUTRITION_MIN_LOGGED_DAYS ||
    previous.length < NUTRITION_MIN_LOGGED_DAYS ||
    currentCoverage < NUTRITION_MIN_COVERAGE_PCT ||
    previousCoverage < NUTRITION_MIN_COVERAGE_PCT
  ) {
    return [skip('insufficient_evidence', 'nutrition logged-day coverage is below 7 days or 50%')]
  }
  const candidates = [
    nutritionCandidate('calories', 'Calorie intake', 'kcal/day', current, previous, NUTRITION_CALORIE_MIN_DELTA, (day) => day.calories),
    nutritionCandidate('protein', 'Protein intake', 'g/day', current, previous, NUTRITION_PROTEIN_MIN_DELTA, (day) => day.protein),
  ].filter((item): item is NutritionCandidate => item != null)
  if (candidates.length === 0) {
    return [skip('below_surfacing_threshold', 'nutrition change is below the calorie or protein heuristic')]
  }
  candidates.sort((left, right) => Math.abs(right.change) - Math.abs(left.change) || left.key.localeCompare(right.key))
  const chosen = candidates[0]!
  const direction = chosen.change > 0 ? 'increased' : 'decreased'
  const ranked = baseInsight({
    id: `change:nutrition:${chosen.key}:${input.asOf}`,
    kind: 'domain_change',
    domain: 'nutrition',
    title: 'Nutrition',
    summary: `${chosen.title} on logged days ${direction} ${Math.round(Math.abs(chosen.change))}%`,
    period: windows.current,
    periodLabel: comparisonLabel(NUTRITION_COMPARISON_DAYS),
    evidence: [
      {
        label: 'Logged-day average',
        value: `${formatQuantity(chosen.current, 0)} ${chosen.unit} vs ${formatQuantity(chosen.previous, 0)} ${chosen.unit}`,
      },
      { label: 'Logged days', value: `${current.length} vs ${previous.length}` },
      { label: 'Coverage', value: `${Math.round(currentCoverage)}% vs ${Math.round(previousCoverage)}% of each 14-day window` },
      periodEvidence(windows),
    ],
    detailPath: '/nutrition',
    signal: chosen.key === 'protein' ? (chosen.change > 0 ? 'positive' : 'negative') : 'neutral',
    tier: INSIGHT_TIERS.nutrition_change,
    magnitude: Math.abs(chosen.change),
    associationRank: 0,
    askHealth: {
      lens: 'nutrition',
      range: '30d',
      suggestedQuestion: `What does the logged-day ${chosen.key === 'protein' ? 'protein' : 'calorie'} change show in this period?`,
    },
  })
  return [eligible(ranked)]
}

type NutritionCandidate = {
  key: 'calories' | 'protein'
  title: string
  unit: string
  change: number
  current: number
  previous: number
}

function nutritionCandidate(
  key: 'calories' | 'protein',
  title: string,
  unit: string,
  currentDays: readonly InsightNutritionDay[],
  previousDays: readonly InsightNutritionDay[],
  minimumDelta: number,
  read: (day: InsightNutritionDay) => number | null,
): NutritionCandidate | null {
  const currentValues = currentDays.flatMap((day) => {
    const value = read(day)
    return value == null || !Number.isFinite(value) ? [] : [value]
  })
  const previousValues = previousDays.flatMap((day) => {
    const value = read(day)
    return value == null || !Number.isFinite(value) ? [] : [value]
  })
  if (currentValues.length < NUTRITION_MIN_LOGGED_DAYS || previousValues.length < NUTRITION_MIN_LOGGED_DAYS) {
    return null
  }
  const current = average(currentValues)
  const previous = average(previousValues)
  if (current <= 0 || previous <= 0) {
    return null
  }
  const change = percentChange(current, previous)
  if (change == null || Math.abs(current - previous) < minimumDelta || Math.abs(change) < NUTRITION_MIN_RELATIVE_CHANGE_PCT) {
    return null
  }
  return { key, title, unit, change, current, previous }
}

export function detectTrainingFrequencyChange(input: InsightDetectorInput): InsightDetectorResult[] {
  const windows = trainingComparisonWindows(input.asOf)
  const sessions = input.trainingSessions.filter(
    (session) =>
      session.performedOn <= input.asOf &&
      CANONICAL_TRAINING_SESSION_TYPES.includes(session.sessionType as (typeof CANONICAL_TRAINING_SESSION_TYPES)[number]),
  )
  const currentCount = sessions.filter((session) => inWindow(session.performedOn, windows.current)).length
  const previousCount = sessions.filter((session) => inWindow(session.performedOn, windows.previous)).length
  const currentRate = (currentCount * 7) / TRAINING_COMPARISON_DAYS
  const previousRate = (previousCount * 7) / TRAINING_COMPARISON_DAYS
  const delta = currentRate - previousRate
  if (Math.abs(delta) < TRAINING_MIN_SESSIONS_PER_WEEK) {
    return [skip('below_surfacing_threshold', 'logged training frequency change is below 1 session/week')]
  }
  const direction = delta > 0 ? 'increased' : 'decreased'
  const ranked = baseInsight({
    id: `change:training:frequency:${input.asOf}`,
    kind: 'domain_change',
    domain: 'training',
    title: 'Training',
    summary: `Logged Training frequency ${direction}`,
    period: windows.current,
    periodLabel: comparisonLabel(TRAINING_COMPARISON_DAYS),
    evidence: [
      { label: 'Logged sessions/week', value: `${formatRate(currentRate)} vs ${formatRate(previousRate)}` },
      { label: 'Canonical sessions', value: `${currentCount} vs ${previousCount} in each 21-day window` },
      periodEvidence(windows),
    ],
    detailPath: '/training',
    signal: delta > 0 ? 'positive' : 'negative',
    tier: INSIGHT_TIERS.training_frequency,
    magnitude: Math.abs(delta),
    associationRank: 0,
    askHealth: {
      lens: 'training',
      range: '90d',
      suggestedQuestion: 'What does the change in logged Training frequency show?',
    },
  })
  return [eligible(ranked)]
}

export function detectBodyWeightTrend(input: InsightDetectorInput): InsightDetectorResult[] {
  const observations = input.bodyWeights.filter((item) => item.key === 'weight' && item.calendarDate <= input.asOf)
  const units = new Set(observations.map((item) => item.unit))
  if (units.size > 1) {
    return [skip('unsupported', 'mixed body-weight units')]
  }
  const trend = bodyWeightTrend(observations)
  if (trend.status !== 'available') {
    return [skip('insufficient_evidence', 'body weight trend does not meet the existing observation gate')]
  }
  const unit = observations[0]?.unit
  const lbPerWeek = unit === 'kg' ? kilogramsToPounds(trend.value.slopePerWeek) : unit === 'lb' ? trend.value.slopePerWeek : null
  if (lbPerWeek == null) {
    return [skip('unsupported', 'body weight unit is not kg or lb')]
  }
  if (Math.abs(lbPerWeek) + 1e-9 < BODY_WEIGHT_MIN_SLOPE_LB_PER_WEEK) {
    return [skip('below_surfacing_threshold', 'body weight slope is below 0.25 lb/week')]
  }
  const direction = lbPerWeek < 0 ? 'lower' : 'higher'
  const first = [...observations].sort((left, right) => (left.calendarDate < right.calendarDate ? -1 : 1))[0]
  const ranked = baseInsight({
    id: `trend:body:weight:${input.asOf}`,
    kind: 'domain_trend',
    domain: 'body',
    title: 'Bodyweight',
    summary: `Recent weight trend is trending ${direction} at ${formatSlope(lbPerWeek)} lb/week`,
    period: { start: first?.calendarDate ?? trend.value.latest.calendarDate, end: trend.value.latest.calendarDate },
    periodLabel: `${trend.value.measurementCount} observations over ${formatSpan(trend.value.spanDays)}`,
    evidence: [
      { label: 'Slope', value: `${formatSlope(lbPerWeek)} lb/week` },
      { label: 'Observations', value: `${trend.value.measurementCount} over ${formatSpan(trend.value.spanDays)}` },
    ],
    detailPath: '/progress/body',
    goalPath: input.weightGoalId ? `/goals/${input.weightGoalId}` : undefined,
    tier: INSIGHT_TIERS.domain_trend,
    magnitude: Math.abs(lbPerWeek),
    associationRank: 0,
    askHealth: {
      lens: 'general',
      range: input.range,
      suggestedQuestion: 'What does my recent weight trend show?',
    },
  })
  return [eligible(ranked)]
}

export function detectStrengthTrend(input: InsightDetectorInput): InsightDetectorResult[] {
  const qualifying = input.strengthExercises.flatMap((exercise) => {
    if (!exercise.latestDate || exercise.latestDate > input.asOf || exercise.trend.status !== 'available') {
      return []
    }
    const direction = exercise.trend.value.direction
    if (direction !== 'improving' && direction !== 'decreasing') {
      return []
    }
    return [{ exercise, direction }]
  })
  if (qualifying.length === 0) {
    return [skip('insufficient_evidence', 'no accepted higher or lower strength trend')]
  }
  qualifying.sort((left, right) => {
    if (left.exercise.latestDate !== right.exercise.latestDate) {
      return left.exercise.latestDate! < right.exercise.latestDate! ? 1 : -1
    }
    return left.exercise.exerciseId.localeCompare(right.exercise.exerciseId)
  })
  const chosen = qualifying[0]!
  const trend = chosen.exercise.trend.status === 'available' ? chosen.exercise.trend.value : null
  if (!trend) {
    return [skip('insufficient_evidence', 'strength trend became unavailable')]
  }
  const word = chosen.direction === 'improving' ? 'higher' : 'lower'
  const ranked = baseInsight({
    id: `trend:strength:${chosen.exercise.exerciseId}:${input.asOf}`,
    kind: 'domain_trend',
    domain: 'strength',
    title: chosen.exercise.name,
    summary: `Recent estimated strength is ${word} than the prior three appearances`,
    period: { start: chosen.exercise.latestDate!, end: chosen.exercise.latestDate! },
    periodLabel: 'Recent three appearances vs the prior three',
    evidence: [
      {
        label: 'Estimated strength',
        value: `${formatQuantity(trend.recentMedian, 1)} kg vs ${formatQuantity(trend.previousMedian, 1)} kg`,
      },
      { label: 'Appearances', value: `${trend.observationCount} in the accepted comparison` },
      { label: 'Latest appearance', value: chosen.exercise.latestDate! },
    ],
    detailPath: `/progress/strength/${chosen.exercise.exerciseId}`,
    signal: chosen.direction === 'improving' ? 'positive' : 'negative',
    tier: INSIGHT_TIERS.domain_trend,
    magnitude: Math.abs(trend.changePercent),
    associationRank: 0,
    askHealth: {
      lens: 'training',
      range: input.range,
      suggestedQuestion: `What does the recent ${chosen.exercise.name} strength trend show?`,
    },
  })
  return [eligible(ranked)]
}

export function detectCrossDomainInsights(input: InsightDetectorInput): InsightDetectorResult[] {
  const insights = input.findings.flatMap((finding) => {
    if (!finding.surfaced || finding.period.end > input.asOf) {
      return []
    }
    const text = findingCopy(finding)
    if (!text) {
      return []
    }
    return [patternInsight(input, finding, text)]
  })
  if (insights.length === 0) {
    return [skip('insufficient_evidence', 'no surfaced cross-domain finding')]
  }
  return insights
}

function patternInsight(input: InsightDetectorInput, finding: CrossDomainFinding, text: string): InsightDetectorResult {
  const evidence = patternEvidence(finding)
  const ranked = baseInsight({
    id: `pattern:${finding.id}:${input.asOf}`,
    kind: 'cross_domain_pattern',
    domain: finding.domainA,
    title: 'Pattern',
    summary: text,
    period: { start: finding.period.start, end: finding.period.end },
    periodLabel: `${finding.period.start} to ${finding.period.end}`,
    evidence,
    detailPath: '/progress/compare',
    signal: patternSignal(finding),
    tier: INSIGHT_TIERS.cross_domain_pattern,
    magnitude: patternMagnitude(finding),
    associationRank: finding.strength ? ASSOCIATION_RANK[finding.strength] : 0,
    askHealth: {
      lens: patternLens(finding),
      range: input.range,
      suggestedQuestion: patternQuestion(finding),
    },
  })
  return eligible(ranked)
}

function patternEvidence(finding: CrossDomainFinding): InsightEvidence[] {
  const items: InsightEvidence[] = []
  if (finding.kind === 'spearman_association' || finding.kind === 'windowed_association') {
    items.push({ label: 'Sample', value: `n ${finding.metrics.n}` })
    items.push({ label: 'rho', value: finding.metrics.rho == null ? 'unavailable' : finding.metrics.rho.toFixed(2) })
    if (finding.strength) {
      items.push({ label: 'Association', value: finding.strength })
    }
  }
  if (finding.kind === 'group_comparison') {
    items.push({
      label: 'Observed days',
      value: `${finding.metrics.leftDays} vs ${finding.metrics.rightDays}`,
      detail: `${finding.metrics.leftLabel} vs ${finding.metrics.rightLabel}`,
    })
    for (const metric of finding.metrics.metrics) {
      if (metric.leftAverage == null || metric.rightAverage == null) {
        continue
      }
      items.push({
        label: metric.metric,
        value: `${formatQuantity(metric.leftAverage, 0)} vs ${formatQuantity(metric.rightAverage, 0)} ${metric.unit}`,
      })
    }
  }
  if (finding.kind === 'period_context') {
    items.push({
      label: 'Observations',
      value: `${finding.metrics.measurementCount} over ${finding.metrics.spanDays ?? 0} days`,
    })
    items.push({ label: 'Logged days', value: `${finding.metrics.loggedDays} of ${finding.metrics.calendarDays}` })
  }
  items.push({
    label: 'Coverage',
    value: `${finding.coverage.paired} of ${finding.coverage.denominator}`,
    detail: finding.coverage.label,
  })
  if (finding.strength && finding.kind !== 'spearman_association' && finding.kind !== 'windowed_association') {
    items.push({ label: 'Association', value: finding.strength })
  }
  items.push({ label: 'Sample size', value: String(finding.sampleSize) })
  return items
}

function patternSignal(finding: CrossDomainFinding): 'positive' | 'negative' | 'neutral' {
  if (finding.id !== 'activity_training:steps' || finding.kind !== 'group_comparison') {
    return 'neutral'
  }
  const steps = finding.metrics.metrics.find((metric) => metric.metric === 'steps')
  if (steps?.delta == null || steps.delta === 0) return 'neutral'
  return steps.delta > 0 ? 'positive' : 'negative'
}

function patternMagnitude(finding: CrossDomainFinding): number {
  if (finding.kind === 'spearman_association' || finding.kind === 'windowed_association') {
    return finding.metrics.rho == null ? 0 : Math.abs(finding.metrics.rho)
  }
  if (finding.kind === 'group_comparison') {
    const relatives = finding.metrics.metrics.flatMap((metric) => {
      if (metric.leftAverage == null || metric.rightAverage == null || metric.rightAverage === 0) {
        return metric.delta == null ? [] : [Math.abs(metric.delta)]
      }
      return [Math.abs(((metric.leftAverage - metric.rightAverage) / metric.rightAverage) * 100)]
    })
    return relatives.length === 0 ? 0 : Math.max(...relatives)
  }
  return finding.metrics.slopePer30Days == null ? 0 : Math.abs(finding.metrics.slopePer30Days)
}

function patternLens(finding: CrossDomainFinding): AskLens {
  if (finding.id.startsWith('nutrition')) {
    return 'nutrition'
  }
  if (finding.id.startsWith('sleep')) {
    return 'recovery'
  }
  if (finding.domainA === 'training' || finding.domainB === 'training') {
    return 'training'
  }
  return 'general'
}

function patternQuestion(finding: CrossDomainFinding): string {
  const mentionsProtein =
    finding.id.includes('protein') ||
    (finding.kind === 'group_comparison' && finding.metrics.metrics.some((metric) => metric.metric === 'protein'))
  const mentionsTraining = finding.id.includes('training') || finding.domainA === 'training' || finding.domainB === 'training'
  if (mentionsProtein && mentionsTraining) {
    return 'Explain the evidence behind this Training-day protein pattern.'
  }
  return 'Explain the evidence behind this pattern.'
}

function eligibleNights(nights: readonly InsightSleepNight[], window: Window): InsightSleepNight[] {
  return nights.filter(
    (night) =>
      night.analysisEligible &&
      inWindow(night.sleepDate, window) &&
      night.totalSleepMinutes != null &&
      Number.isFinite(night.totalSleepMinutes),
  )
}

function sharedSource(nights: readonly InsightSleepNight[]): { key: string; name: string } | null {
  const keys = new Set(nights.map((night) => night.logicalSourceKey).filter((key): key is string => Boolean(key)))
  if (keys.size !== 1) {
    return null
  }
  const key = [...keys][0]
  if (!key || key === 'unknown') {
    return null
  }
  const named = [...nights].reverse().find((night) => night.logicalSourceKey === key && night.sourceName)
  return { key, name: named?.sourceName || key }
}

function finiteNumbers(values: readonly (number | null)[]): number[] {
  return values.filter((value): value is number => value != null && Number.isFinite(value))
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function periodEvidence(windows: { current: Window; previous: Window }): InsightEvidence {
  return {
    label: 'Period',
    value: `${windows.current.start} to ${windows.current.end} vs ${windows.previous.start} to ${windows.previous.end}`,
  }
}

function formatQuantity(value: number, digits: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes)
  const hours = Math.floor(rounded / 60)
  const remainder = rounded % 60
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`
}

function formatRate(value: number): string {
  return `${value.toFixed(1)} sessions/week`
}

function formatSlope(value: number): string {
  const text = (Math.round(value * 100) / 100).toFixed(2)
  return text.replace(/\.?0+$/, '')
}

function formatSpan(spanDays: number): string {
  if (spanDays > 0 && spanDays % 7 === 0) {
    const weeks = spanDays / 7
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`
  }
  return `${spanDays} days`
}

