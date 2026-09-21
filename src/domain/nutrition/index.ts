export { NUTRITION_CONFIG, NUTRITION_SOURCE_KINDS, NUTRITION_CATALOG_KINDS, NUTRITION_MEALS, NUTRITION_FOOD_ENTITY, NUTRITION_ENTRY_ENTITY } from './config.js'
export type { NutritionSourceKind, NutritionCatalogKind, NutritionMeal } from './config.js'
export {
  parseOptionalGramsFromServingText,
  scaleNutrients,
  servingMultiplier,
  scaledGrams,
  snapshotFromDefinition,
  rescaleLoggedSnapshot,
} from './servings.js'
export type { NutrientAmount } from './servings.js'
export { recentsFromEntries, rankFoodsForQuery } from './catalog.js'
export { nutritionDayTotals } from './totals.js'
export type { NutritionDayTotals, NutrientTotal, NutritionTotable } from './totals.js'
export {
  normalizeBarcode,
  barcodeDigits,
  barcodesEquivalent,
  canonicalRetailBarcode,
  expandUpcEToUpcA,
  shouldIgnoreDuplicateScan,
} from './barcode.js'
export type { NormalizedBarcode } from './barcode.js'
export {
  candidateFromProviderSnapshot,
  validatePackagedReview,
  applyHundredGramServing,
  applyGramServing,
  deriveServingFromPer100g,
} from './packaged.js'
export type {
  PackagedFoodCandidate,
  PackagedProviderSnapshot,
  PackagedFoodProviderId,
  NutrientBasis,
} from './packaged.js'
export {
  nutritionFoodCreateSchema,
  nutritionFoodPatchSchema,
  nutritionEntryCreateSchema,
  nutritionEntryPatchSchema,
  nutritionTargetCreateSchema,
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
  NutritionTargetCreate,
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
