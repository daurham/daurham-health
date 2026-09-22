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
export { resolveNutritionTarget } from './targets.js'
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
export {
  NUTRITION_LABEL_SCHEMA_VERSION,
  NUTRITION_LABEL_PIPELINE,
  NUTRITION_LABEL_SOURCE_KEY,
  NUTRITION_LABEL_CAPTURE_KIND,
  sanitizeLabelCandidate,
  validateAndFlagCandidate,
  validateLabelReview,
  planLabelCommitFood,
  draftFromCandidate,
  emptyLabelCandidate,
  macroEnergyWarning,
  labelFailureMessage,
  isLabelRetryCode,
  nutritionLabelJobFingerprint,
  missingField,
  okField,
  uncertainField,
  isHomeAiJobId,
  HOME_AI_JOB_ID_RE,
} from './label.js'
export type {
  NutritionLabelCandidate,
  NutritionLabelFields,
  LabelReviewDraft,
  LabelBasis,
  ExtractedField,
  PendingNutritionCapture,
  NutritionLabelJobResponse,
  NutritionLabelComparison,
  CommitNutritionLabelRequest,
} from './label.js'
export {
  nutritionLabelCandidateSchema,
  nutritionLabelJobResponseSchema,
  nutritionLabelJobListResponseSchema,
  commitNutritionLabelRequestSchema,
  pendingNutritionCaptureSchema,
} from './label.js'
export {
  NUTRITION_MEAL_SCHEMA_VERSION,
  NUTRITION_MEAL_PIPELINE,
  NUTRITION_MEAL_SOURCE_KEY,
  NUTRITION_MEAL_CAPTURE_KIND,
  NUTRITION_MEAL_GROUP_ENTITY,
  sanitizeMealCandidate,
  emptyMealCandidate,
  matchMealComponent,
  recipeCandidatesForComponents,
  draftFromMealCandidate,
  applyRecipeSelection,
  mealReviewTotals,
  mealComponentSnapshot,
  validateMealReview,
  mealFailureMessage,
  classifyMealTransportFailure,
  isMealConnectivityCode,
  isMealRetryCode,
  MEAL_CONNECTIVITY_CODES,
  nutritionMealJobFingerprint,
  roundVisualGrams,
  looksLikeHiddenFat,
} from './meal.js'
export {
  foodDescriptionOffer,
  hasStrongCatalogMatch,
  shouldOfferFoodDescription,
  parseFoodDescription,
  localFoodDescriptionInterpreter,
  dropInterpreterNutrients,
  massGrams,
  descriptionPortion,
  descriptionComponentTotals,
} from './describe.js'
export type { FoodDescriptionComponent, FoodDescriptionCandidate, FoodDescriptionInterpreter } from './describe.js'
export {
  NUTRITION_USER_CONTEXT_MAX,
  GEMINI_NUTRITION_MODEL_DEFAULT,
  GEMINI_DESCRIPTION_MODEL_DEFAULT,
  GEMINI_MEAL_MODEL_DEFAULT,
  GEMINI_LABEL_MODEL_DEFAULT,
  GEMINI_DESCRIPTION_TIMEOUT_MS,
  GEMINI_MEAL_TIMEOUT_MS,
  GEMINI_LABEL_TIMEOUT_MS,
  normalizeUserContext,
  parseNutritionProvider,
  mealPhotoPrompt,
  foodDescriptionPrompt,
  nutritionLabelPrompt,
  applyMealUserContext,
  applyLabelUserContext,
  interpretMealPhotoResponse,
  interpretNutritionLabelResponse,
  interpretFoodDescriptionResponse,
  parseGeminiJson,
  normalizeGeminiDescriptionRaw,
  summarizeInterpretationUsage,
  schemaMentionsNutrientTotals,
  GEMINI_MEAL_RESPONSE_SCHEMA,
  GEMINI_DESCRIPTION_RESPONSE_SCHEMA,
  GEMINI_LABEL_RESPONSE_SCHEMA,
  descriptionFailureMessage,
  isGeminiFailureCode,
  isGeminiTransientCode,
  isGeminiAutoRetryCode,
  NutritionInterpretError,
} from './interpret.js'
export type { NutritionInterpreter, NutritionProvider, InterpretationMetadata } from './interpret.js'
export type {
  MealPhotoCandidate,
  MealComponent,
  MealReviewDraft,
  MealReviewComponent,
  MealFoodMatch,
  CommitNutritionMealRequest,
  NutritionMealJobResponse,
} from './meal.js'
export {
  mealPhotoCandidateSchema,
  commitNutritionMealRequestSchema,
  homeAiMealJobSchema,
  homeAiMealCreatedJobSchema,
  homeAiMealJobStatusSchema,
} from './meal.js'
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
