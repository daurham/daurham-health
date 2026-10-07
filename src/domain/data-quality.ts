export const DATA_QUALITY_CLASSIFICATIONS = [
  'needs_confirmation',
  'plausible_but_unusual',
  'possible_duplicate',
  'source_discontinuity',
] as const
export type DataQualityClassification = (typeof DATA_QUALITY_CLASSIFICATIONS)[number]

export const DATA_QUALITY_REVIEW_STATUSES = ['confirmed_valid', 'excluded_from_analysis'] as const
export type DataQualityReviewStatus = (typeof DATA_QUALITY_REVIEW_STATUSES)[number]

export type DataQualityIssue = {
  fingerprint: string
  issueKind: string
  classification: DataQualityClassification
  entityKind: string
  entityId: string
  date: string
  title: string
  detail: string
  href: string | null
  reviewStatus: DataQualityReviewStatus | null
  metadata: Record<string, unknown>
}

export type DataQualityResponse = {
  asOf: string
  issues: DataQualityIssue[]
  reviewed: DataQualityIssue[]
}

export function bodyValueClassification(input: {
  metricKey: string
  value: number
  unit: string
}): DataQualityClassification | null {
  if (!Number.isFinite(input.value)) return 'needs_confirmation'
  if (input.metricKey === 'weight' && input.unit === 'kg') {
    if (input.value < 30 || input.value > 350) return 'needs_confirmation'
    if (input.value < 40 || input.value > 250) return 'plausible_but_unusual'
  }
  if (input.metricKey === 'body_fat_percentage' && (input.unit === 'percent' || input.unit === '%')) {
    if (input.value < 2 || input.value > 70) return 'needs_confirmation'
    if (input.value < 5 || input.value > 55) return 'plausible_but_unusual'
  }
  if (input.metricKey.endsWith('_circumference') && input.unit === 'cm') {
    if (input.value < 20 || input.value > 250) return 'needs_confirmation'
    if (input.value < 30 || input.value > 200) return 'plausible_but_unusual'
  }
  return null
}

export function nutritionEntryClassification(input: {
  calories: number
  servingQuantity: number
}): DataQualityClassification | null {
  if (!Number.isFinite(input.calories) || !Number.isFinite(input.servingQuantity)) return 'needs_confirmation'
  if (input.calories > 5000 || input.servingQuantity > 30) return 'needs_confirmation'
  if (input.calories > 3000 || input.servingQuantity > 10) return 'plausible_but_unusual'
  return null
}

export function incompleteNutritionDay(input: {
  calories: number
  targetCalories: number
  entryCount: number
}): boolean {
  return input.entryCount > 0 &&
    input.targetCalories > 0 &&
    input.calories >= 0 &&
    input.calories < input.targetCalories * 0.5
}

export function independentSideMissing(input: {
  left: number | null
  right: number | null
}): boolean {
  return (input.left != null || input.right != null) && (input.left == null || input.right == null)
}
