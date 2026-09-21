import { z } from 'zod'
import { isCalendarDate } from '../training.js'
import { calendarDateFromInstant } from '../progress/dates.js'
import { assertIanaTimeZone } from '../time.js'
import {
  NUTRITION_CATALOG_KINDS,
  NUTRITION_CONFIG,
  NUTRITION_MEALS,
  NUTRITION_SOURCE_KINDS,
  type NutritionCatalogKind,
  type NutritionMeal,
  type NutritionSourceKind,
} from './config.js'

export type NutritionFood = {
  id: string
  name: string
  brand: string | null
  barcode: string | null
  catalogKind: NutritionCatalogKind
  servingQuantity: number
  servingUnit: string
  servingGrams: number | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
  sourceKind: NutritionSourceKind
  isStaple: boolean
  archived: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type NutritionEntry = {
  id: string
  logDate: string
  consumedAt: string | null
  timezone: string
  meal: NutritionMeal | null
  foodId: string | null
  foodName: string
  brand: string | null
  servingQuantity: number
  servingUnit: string
  grams: number | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
  sourceKind: NutritionSourceKind
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type NutritionTarget = {
  id: string
  effectiveFrom: string
  caloriesTarget: number
  proteinTarget: number
  carbsTarget: number | null
  fatTarget: number | null
  fiberTarget: number | null
  createdAt: string
  updatedAt: string
}

function trimmed(max: number, emptyMessage: string) {
  return z.string().transform((value, ctx) => {
    const next = value.trim()
    if (next.length === 0) {
      ctx.addIssue({ code: 'custom', message: emptyMessage })
      return z.NEVER
    }
    if (next.length > max) {
      ctx.addIssue({ code: 'custom', message: `Must be ${max} characters or fewer` })
      return z.NEVER
    }
    return next
  })
}

function optionalTrimmed(max: number) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value, ctx) => {
      if (value == null) {
        return null
      }
      const next = value.trim()
      if (next.length === 0) {
        return null
      }
      if (next.length > max) {
        ctx.addIssue({ code: 'custom', message: `Must be ${max} characters or fewer` })
        return z.NEVER
      }
      return next
    })
}

function finiteNumber(options: { min?: number; allowZero?: boolean; label: string }) {
  const min = options.min ?? 0
  return z.any().transform((value, ctx) => {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: 'custom', message: `${options.label} must be a number` })
      return z.NEVER
    }
    if (parsed < min) {
      ctx.addIssue({ code: 'custom', message: `${options.label} must be >= ${min}` })
      return z.NEVER
    }
    if (options.allowZero === false && parsed === 0) {
      ctx.addIssue({ code: 'custom', message: `${options.label} must be > 0` })
      return z.NEVER
    }
    return parsed
  })
}

function optionalFinite(label: string) {
  return z.any().transform((value, ctx) => {
    if (value == null || value === '') {
      return null
    }
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) {
      ctx.addIssue({ code: 'custom', message: `${label} must be a number >= 0` })
      return z.NEVER
    }
    return parsed
  })
}

const sourceKindSchema = z.enum(NUTRITION_SOURCE_KINDS)
const catalogKindSchema = z.enum(NUTRITION_CATALOG_KINDS)
const mealSchema = z.enum(NUTRITION_MEALS)
const calendarDateSchema = z.string().refine(isCalendarDate, 'Date must be YYYY-MM-DD')

export const nutritionFoodCreateSchema = z.object({
  name: trimmed(NUTRITION_CONFIG.foodNameMax, 'Name is required'),
  brand: optionalTrimmed(NUTRITION_CONFIG.brandMax).optional(),
  barcode: optionalTrimmed(NUTRITION_CONFIG.barcodeMax).optional(),
  catalogKind: catalogKindSchema.optional().default('custom'),
  servingQuantity: finiteNumber({ min: 0, allowZero: false, label: 'servingQuantity' }).optional().default(1),
  servingUnit: trimmed(NUTRITION_CONFIG.servingUnitMax, 'Serving unit is required'),
  servingGrams: optionalFinite('servingGrams').optional(),
  calories: finiteNumber({ min: 0, label: 'calories' }),
  protein: optionalFinite('protein').optional(),
  carbs: optionalFinite('carbs').optional(),
  fat: optionalFinite('fat').optional(),
  fiber: optionalFinite('fiber').optional(),
  sourceKind: sourceKindSchema.optional().default('manual'),
  isStaple: z.boolean().optional().default(false),
  notes: optionalTrimmed(NUTRITION_CONFIG.notesMax).optional(),
})

export const nutritionFoodPatchSchema = z
  .object({
    name: trimmed(NUTRITION_CONFIG.foodNameMax, 'Name is required').optional(),
    brand: optionalTrimmed(NUTRITION_CONFIG.brandMax).optional(),
    barcode: optionalTrimmed(NUTRITION_CONFIG.barcodeMax).optional(),
    servingQuantity: finiteNumber({ min: 0, allowZero: false, label: 'servingQuantity' }).optional(),
    servingUnit: trimmed(NUTRITION_CONFIG.servingUnitMax, 'Serving unit is required').optional(),
    servingGrams: optionalFinite('servingGrams').optional(),
    calories: finiteNumber({ min: 0, label: 'calories' }).optional(),
    protein: optionalFinite('protein').optional(),
    carbs: optionalFinite('carbs').optional(),
    fat: optionalFinite('fat').optional(),
    fiber: optionalFinite('fiber').optional(),
    isStaple: z.boolean().optional(),
    archived: z.boolean().optional(),
    notes: optionalTrimmed(NUTRITION_CONFIG.notesMax).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'No food fields to update',
  })

export const nutritionEntryCreateSchema = z.object({
  logDate: calendarDateSchema.optional(),
  consumedAt: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null || value.trim() === '') {
        return null
      }
      return value.trim()
    })
    .optional(),
  timezone: z
    .string()
    .optional()
    .transform((value, ctx) => {
      const next = (value ?? NUTRITION_CONFIG.calendarTimeZone).trim()
      try {
        return assertIanaTimeZone(next)
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid timezone' })
        return z.NEVER
      }
    }),
  meal: z.union([mealSchema, z.null()]).optional(),
  foodId: z.union([z.uuid(), z.null()]).optional(),
  foodName: trimmed(NUTRITION_CONFIG.foodNameMax, 'Food name is required').optional(),
  brand: optionalTrimmed(NUTRITION_CONFIG.brandMax).optional(),
  servingQuantity: finiteNumber({ min: 0, allowZero: false, label: 'servingQuantity' }).optional().default(1),
  servingUnit: trimmed(NUTRITION_CONFIG.servingUnitMax, 'Serving unit is required').optional(),
  grams: optionalFinite('grams').optional(),
  calories: finiteNumber({ min: 0, label: 'calories' }).optional(),
  protein: optionalFinite('protein').optional().default(null),
  carbs: optionalFinite('carbs').optional().default(null),
  fat: optionalFinite('fat').optional().default(null),
  fiber: optionalFinite('fiber').optional().default(null),
  sourceKind: sourceKindSchema.optional().default('manual'),
  notes: optionalTrimmed(NUTRITION_CONFIG.notesMax).optional(),
}).refine((value) => value.calories != null || value.foodId != null, {
  message: 'calories is required',
})

export const nutritionEntryPatchSchema = z
  .object({
    logDate: calendarDateSchema.optional(),
    consumedAt: z
      .union([z.string(), z.null()])
      .transform((value) => {
        if (value == null || value.trim() === '') {
          return null
        }
        return value.trim()
      })
      .optional(),
    meal: z.union([mealSchema, z.null()]).optional(),
    foodName: trimmed(NUTRITION_CONFIG.foodNameMax, 'Food name is required').optional(),
    brand: optionalTrimmed(NUTRITION_CONFIG.brandMax).optional(),
    servingQuantity: finiteNumber({ min: 0, allowZero: false, label: 'servingQuantity' }).optional(),
    servingUnit: trimmed(NUTRITION_CONFIG.servingUnitMax, 'Serving unit is required').optional(),
    grams: optionalFinite('grams').optional(),
    calories: finiteNumber({ min: 0, label: 'calories' }).optional(),
    protein: optionalFinite('protein').optional(),
    carbs: optionalFinite('carbs').optional(),
    fat: optionalFinite('fat').optional(),
    fiber: optionalFinite('fiber').optional(),
    notes: optionalTrimmed(NUTRITION_CONFIG.notesMax).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'No entry fields to update',
  })

export function resolveEntryLogDate(input: {
  logDate?: string | null
  consumedAt?: string | null
  timezone: string
}): { logDate: string; consumedAt: string | null } {
  const timezone = assertIanaTimeZone(input.timezone)
  const consumedAt = input.consumedAt ?? null
  if (consumedAt) {
    const instant = new Date(consumedAt)
    if (Number.isNaN(instant.getTime())) {
      throw new Error('consumedAt must be an ISO timestamp')
    }
    const fromInstant = calendarDateFromInstant(instant, timezone)
    if (input.logDate && input.logDate !== fromInstant) {
      throw new Error('logDate must match consumedAt in the entry timezone')
    }
    return { logDate: fromInstant, consumedAt: instant.toISOString() }
  }
  if (!input.logDate || !isCalendarDate(input.logDate)) {
    throw new Error('logDate must be YYYY-MM-DD when consumedAt is omitted')
  }
  return { logDate: input.logDate, consumedAt: null }
}

export type NutritionFoodCreate = z.input<typeof nutritionFoodCreateSchema>
export type NutritionFoodPatch = z.infer<typeof nutritionFoodPatchSchema>
export type NutritionEntryCreate = z.input<typeof nutritionEntryCreateSchema>
export type NutritionEntryPatch = z.infer<typeof nutritionEntryPatchSchema>

export const nutritionTargetCreateSchema = z.object({
  effectiveFrom: calendarDateSchema,
  caloriesTarget: finiteNumber({ min: 0, allowZero: false, label: 'caloriesTarget' }),
  proteinTarget: finiteNumber({ min: 0, label: 'proteinTarget' }),
  carbsTarget: optionalFinite('carbsTarget').optional().default(null),
  fatTarget: optionalFinite('fatTarget').optional().default(null),
  fiberTarget: optionalFinite('fiberTarget').optional().default(null),
})

export type NutritionTargetCreate = z.input<typeof nutritionTargetCreateSchema>
