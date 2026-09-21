export { NUTRITION_CONFIG, NUTRITION_SOURCE_KINDS, NUTRITION_CATALOG_KINDS, NUTRITION_MEALS, NUTRITION_FOOD_ENTITY, NUTRITION_ENTRY_ENTITY } from './config.js'
export type { NutritionSourceKind, NutritionCatalogKind, NutritionMeal } from './config.js'
export {
  parseOptionalGramsFromServingText,
  scaleNutrients,
  servingMultiplier,
  scaledGrams,
  snapshotFromDefinition,
} from './servings.js'
export type { NutrientAmount } from './servings.js'
export { nutritionDayTotals } from './totals.js'
export type { NutritionDayTotals, NutrientTotal, NutritionTotable } from './totals.js'
export {
  nutritionFoodCreateSchema,
  nutritionFoodPatchSchema,
  nutritionEntryCreateSchema,
  nutritionEntryPatchSchema,
  resolveEntryLogDate,
} from './types.js'
export type {
  NutritionFood,
  NutritionEntry,
  NutritionTarget,
  NutritionFoodCreate,
  NutritionFoodPatch,
  NutritionEntryCreate,
  NutritionEntryPatch,
} from './types.js'
export {
  planLegacyImport,
  mapLegacyFoods,
  mapLegacyEntries,
  mapLegacySourceKind,
  ingredientFingerprint,
  mealComboFingerprint,
  packagedFoodFingerprint,
  foodLogFingerprint,
  catalogFingerprintForLog,
} from './legacy.js'
export type {
  LegacyNutritionDump,
  LegacyIngredient,
  LegacyMealCombo,
  LegacyPackagedFood,
  LegacyFoodLog,
  LegacyImportPlan,
  PlannedFood,
  PlannedEntry,
} from './legacy.js'
