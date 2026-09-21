export const NUTRITION_CONFIG = {
  calendarTimeZone: 'America/Los_Angeles',
  foodNameMax: 200,
  brandMax: 120,
  barcodeMax: 64,
  servingUnitMax: 80,
  notesMax: 2000,
  foodQueryLimit: 50,
} as const

export type NutritionConfig = typeof NUTRITION_CONFIG

export const NUTRITION_SOURCE_KINDS = [
  'manual',
  'migrated',
  'barcode',
  'ocr',
  'photo_ai',
  'shortcut',
  'import',
] as const

export type NutritionSourceKind = (typeof NUTRITION_SOURCE_KINDS)[number]

export const NUTRITION_CATALOG_KINDS = ['ingredient', 'recipe', 'packaged', 'custom'] as const
export type NutritionCatalogKind = (typeof NUTRITION_CATALOG_KINDS)[number]

export const NUTRITION_MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'other'] as const
export type NutritionMeal = (typeof NUTRITION_MEALS)[number]

export const NUTRITION_FOOD_ENTITY = 'nutrition_food'
export const NUTRITION_ENTRY_ENTITY = 'nutrition_entry'
