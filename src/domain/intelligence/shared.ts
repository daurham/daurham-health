import { addCalendarDays } from '../training-plan.js'
import type { ChangeLedgerEntry } from '../change-ledger.js'
import type { ProgressRange } from '../progress/types.js'
import { associationStrength, spearmanRho } from './spearman.js'

export const HEALTH_INTELLIGENCE_VERSION = 'health-intelligence-v1' as const

export const INTELLIGENCE_SIGNAL_KEYS = [
  'activity.steps',
  'activity.active_energy_kcal',
  'activity.exercise_minutes',
  'sleep.total_minutes',
  'nutrition.calories',
  'nutrition.protein_g',
  'nutrition.carbs_g',
  'nutrition.fiber_g',
  'nutrition.sodium_mg',
  'training.sessions',
  'training.effort',
  'body.weight_kg',
  'hydration.ml',
  'bowel.count',
  'wellness.energy',
  'wellness.hunger',
  'wellness.soreness',
  'wellness.stress',
] as const

export type IntelligenceSignalKey = (typeof INTELLIGENCE_SIGNAL_KEYS)[number]
export type IntelligenceProvenance = 'owner' | 'device' | 'reference' | 'ai' | 'derived' | 'mixed' | 'unknown'
export type IntelligenceConfidence = 'high' | 'moderate' | 'limited' | 'unknown'

export type IntelligenceSignalDefinition = {
  key: IntelligenceSignalKey
  label: string
  domain: string
  unit: string
  requiresCompleteDay: boolean
  absenceMeansZero?: boolean
  detailPath: string
}

export const INTELLIGENCE_SIGNAL_REGISTRY: Record<IntelligenceSignalKey, IntelligenceSignalDefinition> = {
  'activity.steps': { key: 'activity.steps', label: 'Steps', domain: 'activity', unit: 'steps', requiresCompleteDay: true, detailPath: '/progress/activity' },
  'activity.active_energy_kcal': { key: 'activity.active_energy_kcal', label: 'Active energy', domain: 'activity', unit: 'kcal', requiresCompleteDay: true, detailPath: '/progress/activity' },
  'activity.exercise_minutes': { key: 'activity.exercise_minutes', label: 'Exercise minutes', domain: 'activity', unit: 'min', requiresCompleteDay: true, detailPath: '/progress/activity' },
  'sleep.total_minutes': { key: 'sleep.total_minutes', label: 'Sleep duration', domain: 'sleep', unit: 'min', requiresCompleteDay: false, detailPath: '/progress/sleep' },
  'nutrition.calories': { key: 'nutrition.calories', label: 'Calories', domain: 'nutrition', unit: 'kcal', requiresCompleteDay: true, detailPath: '/nutrition' },
  'nutrition.protein_g': { key: 'nutrition.protein_g', label: 'Protein', domain: 'nutrition', unit: 'g', requiresCompleteDay: true, detailPath: '/nutrition' },
  'nutrition.carbs_g': { key: 'nutrition.carbs_g', label: 'Carbohydrate', domain: 'nutrition', unit: 'g', requiresCompleteDay: true, detailPath: '/nutrition' },
  'nutrition.fiber_g': { key: 'nutrition.fiber_g', label: 'Fiber', domain: 'nutrition', unit: 'g', requiresCompleteDay: true, detailPath: '/nutrition' },
  'nutrition.sodium_mg': { key: 'nutrition.sodium_mg', label: 'Sodium', domain: 'nutrition', unit: 'mg', requiresCompleteDay: true, detailPath: '/nutrition' },
  'training.sessions': { key: 'training.sessions', label: 'Training sessions', domain: 'training', unit: 'sessions', requiresCompleteDay: true, absenceMeansZero: true, detailPath: '/training' },
  'training.effort': { key: 'training.effort', label: 'Training effort', domain: 'training', unit: '1–5', requiresCompleteDay: false, detailPath: '/training' },
  'body.weight_kg': { key: 'body.weight_kg', label: 'Body weight', domain: 'body', unit: 'kg', requiresCompleteDay: false, detailPath: '/progress/body' },
  'hydration.ml': { key: 'hydration.ml', label: 'Logged water', domain: 'hydration', unit: 'ml', requiresCompleteDay: true, detailPath: '/check-in' },
  'bowel.count': { key: 'bowel.count', label: 'Bowel movements', domain: 'bowel', unit: 'count', requiresCompleteDay: true, detailPath: '/check-in' },
  'wellness.energy': { key: 'wellness.energy', label: 'Energy', domain: 'wellness', unit: '1–5', requiresCompleteDay: false, detailPath: '/check-in' },
  'wellness.hunger': { key: 'wellness.hunger', label: 'Hunger', domain: 'wellness', unit: '1–5', requiresCompleteDay: false, detailPath: '/check-in' },
  'wellness.soreness': { key: 'wellness.soreness', label: 'Soreness', domain: 'wellness', unit: '1–5', requiresCompleteDay: false, detailPath: '/check-in' },
  'wellness.stress': { key: 'wellness.stress', label: 'Stress', domain: 'wellness', unit: '1–5', requiresCompleteDay: false, detailPath: '/check-in' },
}

export type IntelligenceObservation = {
  key: IntelligenceSignalKey
  date: string
  value: number
  unit: string
  provenance: IntelligenceProvenance
  sourceIds: string[]
  quality?: string | null
}

export type IntelligenceFrameDay = {
  date: string
  signals: Partial<Record<IntelligenceSignalKey, IntelligenceObservation>>
}

export type IntelligenceCoverage = {
  key: IntelligenceSignalKey
  label: string
  observedDays: number
  eligibleDays: number
  coveragePct: number
  excludedObservations: number
  provenance: Partial<Record<IntelligenceProvenance, number>>
  confidence: IntelligenceConfidence
  detailPath: string
}

export type IntelligenceBaseline = {
  key: IntelligenceSignalKey
  label: string
  state: 'available' | 'insufficient_data'
  unit: string
  observations: number
  start: string | null
  end: string | null
  mean: number | null
  median: number | null
  latest: number | null
  deltaFromMean: number | null
  confidence: IntelligenceConfidence
}

export type IntelligenceRelationship = {
  id: string
  xKey: IntelligenceSignalKey
  yKey: IntelligenceSignalKey
  lagDays: number
  sampleSize: number
  requiredSampleSize: number
  rho: number | null
  direction: 'positive' | 'negative' | 'neutral' | null
  strength: 'weak' | 'moderate' | 'strong' | null
  state: 'available' | 'insufficient_data' | 'below_threshold'
  confidence: IntelligenceConfidence
  evidenceDates: Array<{ xDate: string; yDate: string }>
  summary: string
  detailPaths: string[]
}

export type IntelligenceInterventionComparison = {
  id: string
  changeId: string
  changeDate: string
  changeTitle: string
  signalKey: IntelligenceSignalKey
  signalLabel: string
  beforeMean: number
  afterMean: number
  delta: number
  relativePct: number | null
  beforeN: number
  afterN: number
  unit: string
  confidence: IntelligenceConfidence
  evidenceDates: { before: string[]; after: string[] }
  summary: string
}

export type IntelligenceContextItem = {
  key: string
  label: string
  detail: string
  confidence: IntelligenceConfidence
  detailPath: string | null
}

export type HealthIntelligenceSnapshot = {
  version: typeof HEALTH_INTELLIGENCE_VERSION
  range: ProgressRange
  asOf: string
  period: { start: string; end: string; dayCount: number }
  timezone: string
  frame: IntelligenceFrameDay[]
  coverage: IntelligenceCoverage[]
  baselines: IntelligenceBaseline[]
  relationships: IntelligenceRelationship[]
  interventions: IntelligenceInterventionComparison[]
  context: {
    knows: IntelligenceContextItem[]
    missing: IntelligenceContextItem[]
  }
}

export type BuildHealthIntelligenceInput = {
  range: ProgressRange
  asOf: string
  start: string
  end: string
  timezone: string
  today: string | null
  observations: readonly IntelligenceObservation[]
  excludedObservationCountByKey?: Partial<Record<IntelligenceSignalKey, number>>
  changes?: readonly ChangeLedgerEntry[]
}

const RELATIONSHIPS: Array<{
  id: string
  xKey: IntelligenceSignalKey
  yKey: IntelligenceSignalKey
  lagDays: number
  minPairs: number
}> = [
  { id: 'shared:sleep:energy', xKey: 'sleep.total_minutes', yKey: 'wellness.energy', lagDays: 0, minPairs: 10 },
  { id: 'shared:sleep:hunger', xKey: 'sleep.total_minutes', yKey: 'wellness.hunger', lagDays: 0, minPairs: 10 },
  { id: 'shared:sleep:soreness', xKey: 'sleep.total_minutes', yKey: 'wellness.soreness', lagDays: 0, minPairs: 10 },
  { id: 'shared:sleep:steps', xKey: 'sleep.total_minutes', yKey: 'activity.steps', lagDays: 0, minPairs: 14 },
  { id: 'shared:hydration:bowel:same_day', xKey: 'hydration.ml', yKey: 'bowel.count', lagDays: 0, minPairs: 10 },
  { id: 'shared:hydration:bowel:next_day', xKey: 'hydration.ml', yKey: 'bowel.count', lagDays: 1, minPairs: 10 },
  { id: 'shared:fiber:bowel:same_day', xKey: 'nutrition.fiber_g', yKey: 'bowel.count', lagDays: 0, minPairs: 10 },
  { id: 'shared:fiber:bowel:next_day', xKey: 'nutrition.fiber_g', yKey: 'bowel.count', lagDays: 1, minPairs: 10 },
  { id: 'shared:protein:soreness:next_day', xKey: 'nutrition.protein_g', yKey: 'wellness.soreness', lagDays: 1, minPairs: 10 },
  { id: 'shared:steps:sleep:next_night', xKey: 'activity.steps', yKey: 'sleep.total_minutes', lagDays: 1, minPairs: 14 },
]

const INTERVENTION_KEYS: IntelligenceSignalKey[] = [
  'nutrition.calories',
  'nutrition.protein_g',
  'activity.steps',
  'training.sessions',
  'body.weight_kg',
  'hydration.ml',
  'sleep.total_minutes',
  'wellness.energy',
  'wellness.hunger',
]

function finite(value: number): boolean {
  return Number.isFinite(value)
}

function calendarDates(start: string, end: string): string[] {
  const dates: string[] = []
  for (let date = start; date <= end; date = addCalendarDays(date, 1)) dates.push(date)
  return dates
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}

function confidenceFromSample(observations: number, coveragePct?: number): IntelligenceConfidence {
  if (observations <= 0) return 'unknown'
  if (observations >= 14 && (coveragePct == null || coveragePct >= 60)) return 'high'
  if (observations >= 7) return 'moderate'
  return 'limited'
}

function frameFor(input: BuildHealthIntelligenceInput): IntelligenceFrameDay[] {
  const map = new Map(calendarDates(input.start, input.end).map((date) => [date, { date, signals: {} } as IntelligenceFrameDay]))
  for (const observation of input.observations) {
    if (!finite(observation.value) || observation.date < input.start || observation.date > input.end) continue
    const day = map.get(observation.date)
    if (!day) continue
    day.signals[observation.key] = observation
  }
  for (const day of map.values()) {
    for (const key of INTELLIGENCE_SIGNAL_KEYS) {
      const definition = INTELLIGENCE_SIGNAL_REGISTRY[key]
      if (!definition.absenceMeansZero || day.signals[key]) continue
      if (definition.requiresCompleteDay && input.today != null && day.date === input.today) continue
      day.signals[key] = {
        key,
        date: day.date,
        value: 0,
        unit: definition.unit,
        provenance: 'derived',
        sourceIds: [],
      }
    }
  }
  return [...map.values()]
}

function coverageFor(input: BuildHealthIntelligenceInput, frame: readonly IntelligenceFrameDay[]): IntelligenceCoverage[] {
  return INTELLIGENCE_SIGNAL_KEYS.map((key) => {
    const definition = INTELLIGENCE_SIGNAL_REGISTRY[key]
    const eligible = frame.filter((day) => !(definition.requiresCompleteDay && input.today != null && day.date === input.today))
    const observed = eligible.flatMap((day) => day.signals[key] ? [day.signals[key]!] : [])
    const provenance: Partial<Record<IntelligenceProvenance, number>> = {}
    for (const item of observed) provenance[item.provenance] = (provenance[item.provenance] ?? 0) + 1
    const coveragePct = eligible.length === 0 ? 0 : (observed.length / eligible.length) * 100
    return {
      key,
      label: definition.label,
      observedDays: observed.length,
      eligibleDays: eligible.length,
      coveragePct,
      excludedObservations: input.excludedObservationCountByKey?.[key] ?? 0,
      provenance,
      confidence: confidenceFromSample(observed.length, coveragePct),
      detailPath: definition.detailPath,
    }
  })
}

function baselinesFor(
  input: BuildHealthIntelligenceInput,
  frame: readonly IntelligenceFrameDay[],
  coverage: readonly IntelligenceCoverage[],
): IntelligenceBaseline[] {
  return INTELLIGENCE_SIGNAL_KEYS.map((key) => {
    const definition = INTELLIGENCE_SIGNAL_REGISTRY[key]
    const observations = frame
      .filter((day) => !(definition.requiresCompleteDay && input.today != null && day.date === input.today))
      .flatMap((day) => day.signals[key] ? [{ date: day.date, value: day.signals[key]!.value }] : [])
      .slice(-28)
    const values = observations.map((item) => item.value)
    const average = mean(values)
    const middle = median(values)
    const latest = observations.at(-1)?.value ?? null
    const coverageState = coverage.find((item) => item.key === key)
    const state = observations.length >= 5 ? 'available' : 'insufficient_data'
    return {
      key,
      label: definition.label,
      state,
      unit: definition.unit,
      observations: observations.length,
      start: observations[0]?.date ?? null,
      end: observations.at(-1)?.date ?? null,
      mean: state === 'available' ? average : null,
      median: state === 'available' ? middle : null,
      latest,
      deltaFromMean: state === 'available' && latest != null && average != null ? latest - average : null,
      confidence: coverageState?.confidence ?? confidenceFromSample(observations.length),
    }
  })
}

function relationshipDirection(rho: number | null): IntelligenceRelationship['direction'] {
  if (rho == null || Math.abs(rho) < 0.05) return rho == null ? null : 'neutral'
  return rho > 0 ? 'positive' : 'negative'
}

function relationshipSummary(
  x: IntelligenceSignalDefinition,
  y: IntelligenceSignalDefinition,
  lagDays: number,
  rho: number | null,
  n: number,
): string {
  const timing = lagDays === 0 ? 'on the same tracked day' : lagDays === 1 ? 'with the following day' : `with a ${lagDays}-day lag`
  if (rho == null) return `${x.label} and ${y.label} do not yet have enough paired evidence ${timing}.`
  const strength = associationStrength(rho)
  const direction = rho >= 0 ? 'move together' : 'move in opposite directions'
  return `${x.label} and ${y.label} ${direction} ${timing} in ${n} paired observations (${strength} rank association). This is observational, not causal.`
}

function relationshipsFor(frame: readonly IntelligenceFrameDay[], today: string | null): IntelligenceRelationship[] {
  const byDate = new Map(frame.map((day) => [day.date, day]))
  return RELATIONSHIPS.map((spec) => {
    const pairs: Array<{ xDate: string; yDate: string; x: number; y: number }> = []
    for (const day of frame) {
      const xDefinition = INTELLIGENCE_SIGNAL_REGISTRY[spec.xKey]
      const yDefinition = INTELLIGENCE_SIGNAL_REGISTRY[spec.yKey]
      if (today != null && ((xDefinition.requiresCompleteDay && day.date === today) || (yDefinition.requiresCompleteDay && addCalendarDays(day.date, spec.lagDays) === today))) continue
      const x = day.signals[spec.xKey]
      if (!x) continue
      const yDate = addCalendarDays(day.date, spec.lagDays)
      const y = byDate.get(yDate)?.signals[spec.yKey]
      if (!y) continue
      pairs.push({ xDate: day.date, yDate, x: x.value, y: y.value })
    }
    const rho = pairs.length >= spec.minPairs ? spearmanRho(pairs.map((pair) => pair.x), pairs.map((pair) => pair.y)) : null
    const strength = rho == null ? null : associationStrength(rho)
    const available = pairs.length >= spec.minPairs && rho != null
    const surfaced = available && Math.abs(rho) >= 0.2
    const xDefinition = INTELLIGENCE_SIGNAL_REGISTRY[spec.xKey]
    const yDefinition = INTELLIGENCE_SIGNAL_REGISTRY[spec.yKey]
    return {
      id: spec.id,
      xKey: spec.xKey,
      yKey: spec.yKey,
      lagDays: spec.lagDays,
      sampleSize: pairs.length,
      requiredSampleSize: spec.minPairs,
      rho,
      direction: relationshipDirection(rho),
      strength: surfaced ? strength : null,
      state: !available ? 'insufficient_data' : surfaced ? 'available' : 'below_threshold',
      confidence: confidenceFromSample(pairs.length),
      evidenceDates: pairs.map(({ xDate, yDate }) => ({ xDate, yDate })),
      summary: relationshipSummary(xDefinition, yDefinition, spec.lagDays, rho, pairs.length),
      detailPaths: [...new Set([xDefinition.detailPath, yDefinition.detailPath])],
    } satisfies IntelligenceRelationship
  })
}

function valuesBetween(
  frame: readonly IntelligenceFrameDay[],
  key: IntelligenceSignalKey,
  start: string,
  end: string,
  today: string | null,
): Array<{ date: string; value: number }> {
  const definition = INTELLIGENCE_SIGNAL_REGISTRY[key]
  return frame
    .filter((day) =>
      day.date >= start &&
      day.date <= end &&
      day.signals[key] != null &&
      !(definition.requiresCompleteDay && today != null && day.date === today)
    )
    .map((day) => ({ date: day.date, value: day.signals[key]!.value }))
}

function interventionComparisons(
  frame: readonly IntelligenceFrameDay[],
  changes: readonly ChangeLedgerEntry[],
  asOf: string,
  today: string | null,
): IntelligenceInterventionComparison[] {
  const output: IntelligenceInterventionComparison[] = []
  for (const change of changes) {
    if (change.date > asOf) continue
    const beforeStart = addCalendarDays(change.date, -7)
    const beforeEnd = addCalendarDays(change.date, -1)
    const afterStart = change.date
    const afterEnd = addCalendarDays(change.date, 6) > asOf ? asOf : addCalendarDays(change.date, 6)
    for (const key of INTERVENTION_KEYS) {
      const before = valuesBetween(frame, key, beforeStart, beforeEnd, today)
      const after = valuesBetween(frame, key, afterStart, afterEnd, today)
      if (before.length < 3 || after.length < 3) continue
      const beforeMean = mean(before.map((item) => item.value))!
      const afterMean = mean(after.map((item) => item.value))!
      const delta = afterMean - beforeMean
      const relativePct = beforeMean === 0 ? null : (delta / Math.abs(beforeMean)) * 100
      const definition = INTELLIGENCE_SIGNAL_REGISTRY[key]
      output.push({
        id: `intervention:${change.id}:${key}`,
        changeId: change.id,
        changeDate: change.date,
        changeTitle: change.title,
        signalKey: key,
        signalLabel: definition.label,
        beforeMean,
        afterMean,
        delta,
        relativePct,
        beforeN: before.length,
        afterN: after.length,
        unit: definition.unit,
        confidence: confidenceFromSample(Math.min(before.length, after.length)),
        evidenceDates: { before: before.map((item) => item.date), after: after.map((item) => item.date) },
        summary: `${definition.label} averaged ${round(beforeMean)} ${definition.unit} before “${change.title}” and ${round(afterMean)} ${definition.unit} afterward. This before/after comparison is descriptive only; causality is not established.`,
      })
    }
  }
  return output
    .sort((a, b) => Math.abs(b.relativePct ?? 0) - Math.abs(a.relativePct ?? 0) || b.changeDate.localeCompare(a.changeDate))
    .slice(0, 24)
}

function round(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function contextSummary(
  coverage: readonly IntelligenceCoverage[],
  baselines: readonly IntelligenceBaseline[],
  relationships: readonly IntelligenceRelationship[],
  interventions: readonly IntelligenceInterventionComparison[],
): HealthIntelligenceSnapshot['context'] {
  const knows: IntelligenceContextItem[] = []
  const missing: IntelligenceContextItem[] = []
  for (const item of coverage) {
    const baseline = baselines.find((candidate) => candidate.key === item.key)
    if (item.observedDays >= 5) {
      knows.push({
        key: item.key,
        label: item.label,
        detail: `${item.observedDays} observed day${item.observedDays === 1 ? '' : 's'} in this range${baseline?.state === 'available' ? '; a personal baseline is available' : ''}.`,
        confidence: item.confidence,
        detailPath: item.detailPath,
      })
    } else if (item.observedDays === 0 || (item.eligibleDays >= 7 && item.coveragePct < 30)) {
      missing.push({
        key: item.key,
        label: item.label,
        detail: item.observedDays === 0
          ? 'No usable observations are available in this range.'
          : `Only ${item.observedDays} of ${item.eligibleDays} eligible days are observed.`,
        confidence: 'unknown',
        detailPath: item.detailPath,
      })
    }
  }
  for (const relation of relationships.filter((item) => item.state === 'available').slice(0, 4)) {
    knows.push({
      key: relation.id,
      label: 'Personal relationship',
      detail: relation.summary,
      confidence: relation.confidence,
      detailPath: relation.detailPaths[0] ?? null,
    })
  }
  for (const comparison of interventions.slice(0, 3)) {
    knows.push({
      key: comparison.id,
      label: 'Change context',
      detail: comparison.summary,
      confidence: comparison.confidence,
      detailPath: null,
    })
  }
  return { knows: knows.slice(0, 12), missing: missing.slice(0, 10) }
}

export function buildHealthIntelligenceSnapshot(input: BuildHealthIntelligenceInput): HealthIntelligenceSnapshot {
  const frame = frameFor(input)
  const coverage = coverageFor(input, frame)
  const baselines = baselinesFor(input, frame, coverage)
  const relationships = relationshipsFor(frame, input.today)
  const interventions = interventionComparisons(frame, input.changes ?? [], input.asOf, input.today)
  return {
    version: HEALTH_INTELLIGENCE_VERSION,
    range: input.range,
    asOf: input.asOf,
    period: { start: input.start, end: input.end, dayCount: frame.length },
    timezone: input.timezone,
    frame,
    coverage,
    baselines,
    relationships,
    interventions,
    context: contextSummary(coverage, baselines, relationships, interventions),
  }
}

export type RoutedHealthIntelligence = {
  version: typeof HEALTH_INTELLIGENCE_VERSION
  selectedKeys: IntelligenceSignalKey[]
  coverage: IntelligenceCoverage[]
  baselines: IntelligenceBaseline[]
  relationships: IntelligenceRelationship[]
  interventions: IntelligenceInterventionComparison[]
  knows: IntelligenceContextItem[]
  missing: IntelligenceContextItem[]
}

const TERM_GROUPS: Array<{ pattern: RegExp; keys: IntelligenceSignalKey[] }> = [
  { pattern: /water|hydration|drink/i, keys: ['hydration.ml', 'bowel.count', 'wellness.energy'] },
  { pattern: /bowel|stool|constipat|bristol/i, keys: ['bowel.count', 'hydration.ml', 'nutrition.fiber_g'] },
  { pattern: /fiber/i, keys: ['nutrition.fiber_g', 'bowel.count', 'hydration.ml'] },
  { pattern: /sleep|tired|fatigue|recovery/i, keys: ['sleep.total_minutes', 'wellness.energy', 'wellness.soreness', 'wellness.hunger', 'training.effort'] },
  { pattern: /hunger|appetite/i, keys: ['wellness.hunger', 'nutrition.calories', 'sleep.total_minutes'] },
  { pattern: /sore|soreness/i, keys: ['wellness.soreness', 'training.effort', 'nutrition.protein_g', 'sleep.total_minutes'] },
  { pattern: /weight|scale|body fat|waist|plateau/i, keys: ['body.weight_kg', 'nutrition.calories', 'nutrition.carbs_g', 'nutrition.sodium_mg', 'activity.steps', 'hydration.ml', 'bowel.count'] },
  { pattern: /carb|carbohydrate/i, keys: ['nutrition.carbs_g', 'nutrition.calories', 'body.weight_kg'] },
  { pattern: /sodium|salt/i, keys: ['nutrition.sodium_mg', 'body.weight_kg', 'hydration.ml'] },
  { pattern: /calorie|protein|macro|nutrition|diet/i, keys: ['nutrition.calories', 'nutrition.protein_g', 'nutrition.carbs_g', 'nutrition.fiber_g', 'nutrition.sodium_mg', 'body.weight_kg'] },
  { pattern: /train|workout|strength|lift|gym/i, keys: ['training.sessions', 'training.effort', 'sleep.total_minutes', 'nutrition.protein_g', 'wellness.soreness'] },
  { pattern: /step|walk|activity|cardio/i, keys: ['activity.steps', 'activity.exercise_minutes', 'activity.active_energy_kcal', 'sleep.total_minutes'] },
]

function lensDefaults(lens: string): IntelligenceSignalKey[] {
  if (lens === 'training') return ['training.sessions', 'training.effort', 'sleep.total_minutes', 'nutrition.protein_g', 'wellness.soreness']
  if (lens === 'nutrition') return ['nutrition.calories', 'nutrition.protein_g', 'nutrition.carbs_g', 'nutrition.fiber_g', 'nutrition.sodium_mg', 'body.weight_kg', 'wellness.hunger']
  if (lens === 'recovery') return ['sleep.total_minutes', 'wellness.energy', 'wellness.soreness', 'wellness.stress', 'training.effort']
  if (lens === 'experiments') return ['body.weight_kg', 'nutrition.calories', 'activity.steps', 'sleep.total_minutes', 'training.sessions']
  return ['body.weight_kg', 'nutrition.calories', 'activity.steps', 'sleep.total_minutes', 'training.sessions', 'hydration.ml', 'wellness.energy']
}

export function routeHealthIntelligence(
  snapshot: HealthIntelligenceSnapshot,
  input: { question: string; lens: string },
): RoutedHealthIntelligence {
  const keys = new Set<IntelligenceSignalKey>()
  for (const group of TERM_GROUPS) {
    if (group.pattern.test(input.question)) group.keys.forEach((key) => keys.add(key))
  }
  if (keys.size === 0) lensDefaults(input.lens).forEach((key) => keys.add(key))
  const selectedKeys = [...keys]
  const relationships = snapshot.relationships
    .filter((item) => keys.has(item.xKey) || keys.has(item.yKey))
    .sort((a, b) => {
      const stateRank = (value: IntelligenceRelationship['state']) => value === 'available' ? 0 : value === 'below_threshold' ? 1 : 2
      return stateRank(a.state) - stateRank(b.state) || b.sampleSize - a.sampleSize
    })
  const interventions = snapshot.interventions.filter((item) => keys.has(item.signalKey)).slice(0, 8)
  const contextRelevant = (item: IntelligenceContextItem) =>
    selectedKeys.includes(item.key as IntelligenceSignalKey) ||
    relationships.some((relationship) => relationship.id === item.key) ||
    interventions.some((comparison) => comparison.id === item.key)
  return {
    version: snapshot.version,
    selectedKeys,
    coverage: snapshot.coverage.filter((item) => keys.has(item.key)),
    baselines: snapshot.baselines.filter((item) => keys.has(item.key)),
    relationships: relationships.slice(0, 10),
    interventions,
    knows: snapshot.context.knows.filter(contextRelevant).slice(0, 8),
    missing: snapshot.context.missing.filter(contextRelevant).slice(0, 6),
  }
}
