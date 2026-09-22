import { inclusiveDayCount } from './dates.js'
import { PROGRESS_ANALYTICS_CONFIG } from './config.js'
import type { CanonicalEvidence, ProgressFinding } from './types.js'
import { nutritionDayTotals } from '../nutrition/totals.js'
import { resolveNutritionTarget } from '../nutrition/targets.js'
import type { NutritionMeal } from '../nutrition/config.js'
import type { NutritionEntry, NutritionTarget } from '../nutrition/types.js'

export const NUTRITION_PROGRESS_NUTRIENTS = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const
export type NutritionProgressNutrient = (typeof NUTRITION_PROGRESS_NUTRIENTS)[number]

export type NutritionNutrientObservation = {
  status: 'available' | 'unavailable'
  value?: number
}

export type NutritionDayTarget = {
  calories: number
  protein: number
  carbs: number | null
  fat: number | null
  fiber: number | null
}

export type NutritionDailyObservation = {
  date: string
  entryCount: number
  calories: NutritionNutrientObservation
  protein: NutritionNutrientObservation
  carbs: NutritionNutrientObservation
  fat: NutritionNutrientObservation
  fiber: NutritionNutrientObservation
  target: NutritionDayTarget | null
  evidence: {
    entryIds: string[]
    mealGroupIds: string[]
  }
}

export type NutritionTargetContext = {
  daysWithTarget: number
  averageDifference: number
}

export type NutritionCaloriesPeriodStat = {
  averageOnLoggedDays: number | null
  observedDays: number
  targetContext: NutritionTargetContext | null
}

export type NutritionMacroPeriodStat = {
  averageOnObservedDays: number | null
  observedDays: number
  targetContext: NutritionTargetContext | null
}

export type NutritionPeriodEvidence = {
  dates: string[]
  entryIds: string[]
  mealGroupIds: string[]
}

export type NutritionPeriodSummary = {
  status: 'available' | 'insufficient_data'
  calendarDays: number
  loggedDays: number
  coveragePct: number
  calories: NutritionCaloriesPeriodStat
  protein: NutritionMacroPeriodStat
  carbs: NutritionMacroPeriodStat
  fat: NutritionMacroPeriodStat
  fiber: NutritionMacroPeriodStat
  observations: NutritionDailyObservation[]
  evidence: NutritionPeriodEvidence
}

export type NutritionDayEntrySnapshot = {
  id: string
  foodName: string
  meal: NutritionMeal | null
  calories: number
  protein: number | null
  mealGroupId: string | null
  servingQuantity: number
  servingUnit: string
}

export type NutritionDayEventData = {
  entryCount: number
  mealGroupCount: number
  calories: NutritionNutrientObservation
  protein: NutritionNutrientObservation
  carbs: NutritionNutrientObservation
  fat: NutritionNutrientObservation
  fiber: NutritionNutrientObservation
  targetContext: NutritionDayTarget | null
  entries: NutritionDayEntrySnapshot[]
}

export type NutritionCalorieSeriesPoint = {
  date: string
  calories: number
  targetCalories: number | null
}

function mealGroupIdsFor(entries: readonly NutritionEntry[]): string[] {
  return [...new Set(entries.flatMap((entry) => (entry.mealGroupId ? [entry.mealGroupId] : [])))]
}

function asProgressNutrient(
  status: 'available' | 'insufficient_data',
  value: number | null,
): NutritionNutrientObservation {
  if (status === 'available' && value != null) {
    return { status: 'available', value }
  }
  return { status: 'unavailable' }
}

function targetSnapshot(target: NutritionTarget | null): NutritionDayTarget | null {
  if (!target) {
    return null
  }
  return {
    calories: target.caloriesTarget,
    protein: target.proteinTarget,
    carbs: target.carbsTarget,
    fat: target.fatTarget,
    fiber: target.fiberTarget,
  }
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function targetContextFor(
  observations: readonly NutritionDailyObservation[],
  nutrient: NutritionProgressNutrient,
): NutritionTargetContext | null {
  const pairs: number[] = []
  for (const observation of observations) {
    const consumed = observation[nutrient]
    const targetValue = observation.target?.[nutrient]
    if (consumed.status !== 'available' || consumed.value == null || targetValue == null) {
      continue
    }
    pairs.push(consumed.value - targetValue)
  }
  if (pairs.length === 0) {
    return null
  }
  return {
    daysWithTarget: pairs.length,
    averageDifference: mean(pairs)!,
  }
}

function caloriesStat(observations: readonly NutritionDailyObservation[]): NutritionCaloriesPeriodStat {
  const values = observations.flatMap((item) =>
    item.calories.status === 'available' && item.calories.value != null ? [item.calories.value] : [],
  )
  return {
    averageOnLoggedDays: mean(values),
    observedDays: values.length,
    targetContext: targetContextFor(observations, 'calories'),
  }
}

function macroStat(
  observations: readonly NutritionDailyObservation[],
  nutrient: Exclude<NutritionProgressNutrient, 'calories'>,
): NutritionMacroPeriodStat {
  const values = observations.flatMap((item) =>
    item[nutrient].status === 'available' && item[nutrient].value != null ? [item[nutrient].value] : [],
  )
  return {
    averageOnObservedDays: mean(values),
    observedDays: values.length,
    targetContext: targetContextFor(observations, nutrient),
  }
}

function periodEvidence(observations: readonly NutritionDailyObservation[]): NutritionPeriodEvidence {
  return {
    dates: observations.map((item) => item.date),
    entryIds: observations.flatMap((item) => item.evidence.entryIds),
    mealGroupIds: [...new Set(observations.flatMap((item) => item.evidence.mealGroupIds))],
  }
}

export function emptyNutritionPeriodSummary(calendarDays: number): NutritionPeriodSummary {
  return {
    status: 'insufficient_data',
    calendarDays,
    loggedDays: 0,
    coveragePct: 0,
    calories: { averageOnLoggedDays: null, observedDays: 0, targetContext: null },
    protein: { averageOnObservedDays: null, observedDays: 0, targetContext: null },
    carbs: { averageOnObservedDays: null, observedDays: 0, targetContext: null },
    fat: { averageOnObservedDays: null, observedDays: 0, targetContext: null },
    fiber: { averageOnObservedDays: null, observedDays: 0, targetContext: null },
    observations: [],
    evidence: { dates: [], entryIds: [], mealGroupIds: [] },
  }
}

/**
 * One observation per calendar day that has at least one canonical nutrition_entry.
 * Unlogged days are omitted — they are not zero consumption.
 */
export function nutritionDailyObservations(input: {
  entries: readonly NutritionEntry[]
  targets: readonly NutritionTarget[]
  start: string
  end: string
}): NutritionDailyObservation[] {
  const byDate = new Map<string, NutritionEntry[]>()
  for (const entry of input.entries) {
    if (entry.logDate < input.start || entry.logDate > input.end) {
      continue
    }
    const list = byDate.get(entry.logDate) ?? []
    list.push(entry)
    byDate.set(entry.logDate, list)
  }
  return [...byDate.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([date, dayEntries]) => {
      const totals = nutritionDayTotals(dayEntries)
      return {
        date,
        entryCount: dayEntries.length,
        calories: asProgressNutrient(totals.calories.status, totals.calories.value),
        protein: asProgressNutrient(totals.protein.status, totals.protein.value),
        carbs: asProgressNutrient(totals.carbs.status, totals.carbs.value),
        fat: asProgressNutrient(totals.fat.status, totals.fat.value),
        fiber: asProgressNutrient(totals.fiber.status, totals.fiber.value),
        target: targetSnapshot(resolveNutritionTarget(input.targets, date)),
        evidence: {
          entryIds: dayEntries.map((entry) => entry.id),
          mealGroupIds: mealGroupIdsFor(dayEntries),
        },
      }
    })
}

export function nutritionPeriodSummary(input: {
  entries: readonly NutritionEntry[]
  targets: readonly NutritionTarget[]
  start: string
  end: string
}): NutritionPeriodSummary {
  const calendarDays = inclusiveDayCount(input.start, input.end)
  const observations = nutritionDailyObservations(input)
  if (observations.length === 0) {
    return emptyNutritionPeriodSummary(calendarDays)
  }
  const loggedDays = observations.length
  return {
    status: 'available',
    calendarDays,
    loggedDays,
    coveragePct: calendarDays === 0 ? 0 : (loggedDays / calendarDays) * 100,
    calories: caloriesStat(observations),
    protein: macroStat(observations, 'protein'),
    carbs: macroStat(observations, 'carbs'),
    fat: macroStat(observations, 'fat'),
    fiber: macroStat(observations, 'fiber'),
    observations,
    evidence: periodEvidence(observations),
  }
}

export function nutritionCoverageDiffers(
  left: Pick<NutritionPeriodSummary, 'coveragePct'>,
  right: Pick<NutritionPeriodSummary, 'coveragePct'>,
): boolean {
  return Math.abs(left.coveragePct - right.coveragePct) >= PROGRESS_ANALYTICS_CONFIG.nutrition.coverageDiffersPct
}

export function nutritionCalorieSeries(
  observations: readonly NutritionDailyObservation[],
): NutritionCalorieSeriesPoint[] {
  return observations.flatMap((item) =>
    item.calories.status === 'available' && item.calories.value != null
      ? [
          {
            date: item.date,
            calories: item.calories.value,
            targetCalories: item.target?.calories ?? null,
          },
        ]
      : [],
  )
}

export function nutritionDayEntrySnapshots(entries: readonly NutritionEntry[]): NutritionDayEntrySnapshot[] {
  return [...entries]
    .sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return left.createdAt < right.createdAt ? -1 : 1
      }
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    })
    .map((entry) => ({
      id: entry.id,
      foodName: entry.foodName,
      meal: entry.meal,
      calories: entry.calories,
      protein: entry.protein,
      mealGroupId: entry.mealGroupId,
      servingQuantity: entry.servingQuantity,
      servingUnit: entry.servingUnit,
    }))
}

export function nutritionDayEventData(
  observation: NutritionDailyObservation,
  entries: readonly NutritionEntry[],
): NutritionDayEventData {
  const dayEntries = entries.filter((entry) => entry.logDate === observation.date)
  return {
    entryCount: observation.entryCount,
    mealGroupCount: observation.evidence.mealGroupIds.length,
    calories: observation.calories,
    protein: observation.protein,
    carbs: observation.carbs,
    fat: observation.fat,
    fiber: observation.fiber,
    targetContext: observation.target,
    entries: nutritionDayEntrySnapshots(dayEntries),
  }
}

function evidenceFromPeriod(summary: NutritionPeriodSummary): CanonicalEvidence[] {
  return summary.evidence.dates.map((date) => ({
    domain: 'nutrition',
    date,
  }))
}

export function nutritionFindings(summary: NutritionPeriodSummary): ProgressFinding[] {
  if (summary.loggedDays === 0) {
    return []
  }
  const evidence = evidenceFromPeriod(summary)
  const findings: ProgressFinding[] = [
    {
      kind: 'nutrition_logging_summary',
      domain: 'nutrition',
      loggedDays: summary.loggedDays,
      calendarDays: summary.calendarDays,
      coveragePct: summary.coveragePct,
      evidence,
    },
  ]
  if (summary.calories.averageOnLoggedDays != null) {
    findings.push({
      kind: 'nutrition_period_average',
      domain: 'nutrition',
      nutrient: 'calories',
      average: summary.calories.averageOnLoggedDays,
      observedDays: summary.calories.observedDays,
      evidence,
    })
  }
  return findings
}
