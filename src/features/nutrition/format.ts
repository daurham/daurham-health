import type { NutritionCatalogKind, NutritionEntry, NutritionMeal, NutritionSourceKind } from '@/domain/nutrition'
import type { NutrientTotal } from '@/domain/nutrition'

const MEAL_LABELS: Record<NutritionMeal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  other: 'Other',
}

const KIND_LABELS: Record<NutritionCatalogKind, string> = {
  ingredient: 'Ingredient',
  recipe: 'Recipe',
  packaged: 'Packaged',
  custom: 'Custom',
}

const SOURCE_LABELS: Record<NutritionSourceKind, string> = {
  manual: 'Manual',
  migrated: 'Migrated from calorie tracker',
  barcode: 'Barcode',
  ocr: 'OCR',
  photo_ai: 'Photo',
  shortcut: 'Shortcut',
  import: 'Imported',
}

export function formatNumber(value: number, maxFractionDigits = 1): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: 0,
  })
}

export function formatKcal(value: number): string {
  return `${formatNumber(value, 0)} kcal`
}

export function formatGrams(value: number | null | undefined): string | null {
  if (value == null) {
    return null
  }
  return `${formatNumber(value)} g`
}

export function formatQuantity(quantity: number, unit: string): string {
  return `${formatNumber(quantity)} ${unit}`
}

export function nutrientText(total: NutrientTotal, unit: string): string {
  if (total.status !== 'available' || total.value == null) {
    return '—'
  }
  return unit === 'kcal' ? formatKcal(total.value) : `${formatNumber(total.value)} ${unit}`
}

export function caloriesHeadline(consumed: NutrientTotal, target: number | null): string {
  const amount = consumed.status === 'available' && consumed.value != null ? formatNumber(consumed.value, 0) : '—'
  if (target == null) {
    return consumed.status === 'available' ? `${amount} kcal consumed` : 'Calories unavailable'
  }
  if (consumed.status !== 'available' || consumed.value == null) {
    return `— / ${formatNumber(target, 0)} kcal`
  }
  return `${amount} / ${formatNumber(target, 0)} kcal`
}

export function proteinHeadline(consumed: NutrientTotal, target: number | null): string {
  if (consumed.status !== 'available' || consumed.value == null) {
    return target == null ? 'Protein unavailable' : `— / ${formatNumber(target)} g`
  }
  if (target == null) {
    return `${formatNumber(consumed.value)} g recorded`
  }
  return `${formatNumber(consumed.value)} / ${formatNumber(target)} g`
}

export function overTargetDelta(consumed: number | null, target: number | null): number | null {
  if (consumed == null || target == null || consumed <= target) {
    return null
  }
  return consumed - target
}

export function progressRatio(consumed: number | null, target: number | null): number | null {
  if (consumed == null || target == null || target <= 0) {
    return null
  }
  return Math.min(consumed / target, 1)
}

export function catalogKindLabel(kind: NutritionCatalogKind): string {
  return KIND_LABELS[kind]
}

export function mealLabel(meal: NutritionMeal): string {
  return MEAL_LABELS[meal]
}

export function provenanceLabel(kind: NutritionSourceKind): string {
  return SOURCE_LABELS[kind]
}

export function groupedEntries(entries: readonly NutritionEntry[]): Array<{
  key: NutritionMeal | 'today'
  label: string
  entries: NutritionEntry[]
}> {
  if (entries.every((entry) => entry.meal == null)) {
    return [{ key: 'today', label: 'Today', entries: [...entries] }]
  }
  const buckets = new Map<NutritionMeal | 'other', NutritionEntry[]>()
  for (const meal of Object.keys(MEAL_LABELS) as NutritionMeal[]) {
    buckets.set(meal, [])
  }
  for (const entry of entries) {
    const key = entry.meal ?? 'other'
    buckets.get(key)?.push(entry)
  }
  return [...buckets.entries()]
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) => ({ key, label: MEAL_LABELS[key], entries: list }))
}
