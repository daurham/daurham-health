import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  draftFromCandidate,
  emptyLabelCandidate,
  macroEnergyWarning,
  nutritionLabelJobFingerprint,
  okField,
  planLabelCommitFood,
  sanitizeLabelCandidate,
  snapshotFromDefinition,
  uncertainField,
  validateLabelReview,
  missingField,
  labelFailureMessage,
} from '../src/domain/nutrition/index.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { INSERT_ENTRY_WITH_ID_SQL, UPDATE_FOOD_SQL } from '../server/nutrition/queries.ts'

const JOB_ID = '11111111-1111-4111-8111-111111111111'

function fullLabel(overrides?: { fields?: Record<string, unknown> } & Record<string, unknown>) {
  const { fields: fieldOverrides, ...rest } = overrides ?? {}
  return {
    schemaVersion: '1.0' as const,
    status: 'candidate' as const,
    fields: {
      productName: okField('Chocolate Cookies'),
      brand: okField('Example'),
      servingQuantity: okField(2),
      servingUnit: okField('cookies'),
      servingGrams: okField(30),
      servingsPerContainer: okField(4),
      calories: okField(160),
      proteinGrams: okField(2),
      carbsGrams: okField(22),
      fatGrams: okField(7),
      fiberGrams: okField(1),
      basis: okField('per_serving' as const),
      barcode: okField('034000470693'),
      ...fieldOverrides,
    },
    ambiguities: [],
    warnings: [],
    ...rest,
  }
}

describe('nutrition label candidate', () => {
  it('keeps 2 cookies (30g) as the labeled serving and pads barcode as a string', () => {
    const candidate = sanitizeLabelCandidate(fullLabel())
    expect(candidate.status).toBe('review_required')
    expect(candidate.fields.servingQuantity.value).toBe(2)
    expect(candidate.fields.servingUnit.value).toBe('cookies')
    expect(candidate.fields.servingGrams.value).toBe(30)
    expect(candidate.fields.calories.value).toBe(160)
    expect(candidate.fields.basis.value).toBe('per_serving')
    expect(candidate.fields.barcode.value).toBe('0034000470693')
    expect(typeof candidate.fields.barcode.value).toBe('string')
  })

  it('leaves missing optional nutrients as null, not zero', () => {
    const candidate = sanitizeLabelCandidate(
      fullLabel({
        fields: {
          fiberGrams: missingField(),
          proteinGrams: uncertainField(null),
        },
      }),
    )
    expect(candidate.fields.fiberGrams.value).toBeNull()
    expect(candidate.fields.proteinGrams.value).toBeNull()
    expect(candidate.fields.calories.value).toBe(160)
  })

  it('preserves per-100g basis without inventing a serving', () => {
    const candidate = sanitizeLabelCandidate(
      fullLabel({
        fields: {
          servingQuantity: missingField(),
          servingUnit: missingField(),
          servingGrams: missingField(),
          calories: okField(250),
          basis: okField('per_100g' as const),
        },
      }),
    )
    expect(candidate.fields.basis.value).toBe('per_100g')
    expect(candidate.fields.servingGrams.value).toBeNull()
    expect(candidate.fields.calories.value).toBe(250)
  })

  it('keeps servings per container as context, not the log quantity', () => {
    const candidate = sanitizeLabelCandidate(fullLabel())
    const draft = draftFromCandidate(candidate)
    expect(draft.servingsPerContainer).toBe(4)
    expect(draft.logQuantity).toBe(1)
  })

  it('flags negative calories as uncertain without rewriting them to zero', () => {
    const candidate = sanitizeLabelCandidate(
      fullLabel({
        fields: { calories: okField(-10) },
      }),
    )
    expect(candidate.fields.calories.value).toBe(-10)
    expect(candidate.fields.calories.status).toBe('uncertain')
  })

  it('warns when macros disagree with calories and does not overwrite calories', () => {
    const candidate = sanitizeLabelCandidate(
      fullLabel({
        fields: {
          calories: okField(80),
          proteinGrams: okField(50),
          carbsGrams: okField(80),
          fatGrams: okField(30),
        },
      }),
    )
    expect(candidate.fields.calories.value).toBe(80)
    expect(macroEnergyWarning(candidate.fields)).toMatch(/match listed macros/i)
    expect(candidate.warnings.join(' ')).toMatch(/match listed macros/i)
  })

  it('requires name, serving, calories, and basis on review, not optional macros', () => {
    expect(
      validateLabelReview({
        productName: '',
        brand: '',
        servingQuantity: 1,
        servingUnit: 'serving',
        servingGrams: null,
        servingsPerContainer: null,
        calories: null,
        proteinGrams: null,
        carbsGrams: null,
        fatGrams: null,
        fiberGrams: null,
        basis: 'unknown',
        barcode: '',
        logQuantity: 1,
      }).map((item) => item.path),
    ).toEqual(['productName', 'calories', 'basis'])
    expect(
      validateLabelReview({
        productName: 'Cookies',
        brand: '',
        servingQuantity: 0,
        servingUnit: '',
        servingGrams: -5,
        servingsPerContainer: 4,
        calories: 160,
        proteinGrams: null,
        carbsGrams: 22,
        fatGrams: 7,
        fiberGrams: null,
        basis: 'per_serving',
        barcode: '',
        logQuantity: 1,
      }).map((item) => item.path),
    ).toEqual(['servingUnit', 'servingQuantity', 'servingGrams'])
    expect(
      validateLabelReview({
        productName: 'Cookies',
        brand: '',
        servingQuantity: 2,
        servingUnit: 'cookies',
        servingGrams: 30,
        servingsPerContainer: 4,
        calories: 160,
        proteinGrams: null,
        carbsGrams: 22,
        fatGrams: 7,
        fiberGrams: null,
        basis: 'per_serving',
        barcode: '',
        logQuantity: 1.5,
      }),
    ).toEqual([])
  })

  it('clears a calories error after correction', () => {
    const first = validateLabelReview({
      ...draftFromCandidate(emptyLabelCandidate()),
      productName: 'Yogurt',
      servingUnit: 'serving',
      servingQuantity: 1,
      calories: null,
      basis: 'per_serving',
    })
    expect(first.some((item) => item.path === 'calories')).toBe(true)
    const second = validateLabelReview({
      ...draftFromCandidate(emptyLabelCandidate()),
      productName: 'Yogurt',
      servingUnit: 'serving',
      servingQuantity: 1,
      calories: 120,
      basis: 'per_serving',
    })
    expect(second).toEqual([])
  })

  it('scales log quantity with the shared Nutrition scaler', () => {
    const scaled = snapshotFromDefinition(
      { calories: 160, protein: 12, carbs: 22, fat: 4, fiber: 2, servingGrams: 30 },
      { quantity: 1.5 },
    )
    expect(scaled.calories).toBe(240)
    expect(scaled.protein).toBe(18)
    expect(scaled.grams).toBe(45)
  })
})

describe('nutrition label existing-food policy', () => {
  it('does not silently overwrite a local barcode match', () => {
    expect(
      planLabelCommitFood({
        existingAction: 'create',
        matchingFoodId: '11111111-1111-4111-8111-111111111111',
      }),
    ).toMatchObject({ type: 'error', status: 409 })
    expect(
      planLabelCommitFood({
        existingAction: 'log_existing',
        existingFoodId: '11111111-1111-4111-8111-111111111111',
        matchingFoodId: '11111111-1111-4111-8111-111111111111',
      }),
    ).toEqual({ type: 'log_existing', foodId: '11111111-1111-4111-8111-111111111111' })
    expect(
      planLabelCommitFood({
        existingAction: 'update_and_log',
        existingFoodId: '11111111-1111-4111-8111-111111111111',
      }),
    ).toEqual({ type: 'update_and_log', foodId: '11111111-1111-4111-8111-111111111111' })
    expect(UPDATE_FOOD_SQL).toMatch(/^UPDATE nutrition_foods/)
    expect(UPDATE_FOOD_SQL).not.toContain('nutrition_entries')
  })
})

describe('nutrition label jobs routing and provenance', () => {
  it('uses the existing dispatcher, claims by job fingerprint, and stays off workout v1.3', () => {
    expect(matchHealthApiRoute('/api/nutrition/label/jobs')).toBe('nutrition-label-jobs')
    expect(matchHealthApiRoute(`/api/nutrition/label/jobs/${JOB_ID}`)).toBe('nutrition-label-job-detail')
    expect(matchHealthApiRoute(`/api/nutrition/label/jobs/${JOB_ID}/image`)).toBe('nutrition-label-job-detail')
    expect(matchHealthApiRoute('/api/nutrition/label/commit')).toBe('nutrition-label-commit')
    expect(nutritionLabelJobFingerprint(JOB_ID)).toBe(`nutrition-label-v1-job:${JOB_ID}`)
    expect(INSERT_ENTRY_WITH_ID_SQL).toContain('INSERT INTO nutrition_entries')
    expect(readFileSync('server/nutrition/label.ts', 'utf8')).not.toContain('/api/workouts/v1.3')
    expect(readFileSync('server/handlers/nutrition-label-jobs.ts', 'utf8')).toContain('withOwnerAuth')
    expect(readFileSync('src/features/nutrition/LabelCapture.tsx', 'utf8')).not.toContain('HOME_AI_API_KEY')
    expect(readFileSync('src/features/nutrition/prepare-label-photo.ts', 'utf8')).not.toContain('HOME_AI_API_KEY')
    expect(readFileSync('src/features/nutrition/prepare-label-photo.ts', 'utf8')).toContain('2800')
    expect(readFileSync('src/features/training/prepare-workout-photo.ts', 'utf8')).toContain('2400')
    expect(readFileSync('src/lib/prepare-image.ts', 'utf8')).toContain("imageOrientation: 'from-image'")
    expect(readFileSync('src/features/nutrition/LabelCapture.tsx', 'utf8')).toContain('Enter label manually')
    expect(readFileSync('src/features/nutrition/LabelCapture.tsx', 'utf8')).toContain('HOME_AI_UNAVAILABLE')
    expect(labelFailureMessage('HOME_AI_UNAVAILABLE')).toMatch(/unavailable/i)
    expect(labelFailureMessage('UNREADABLE_LABEL')).toMatch(/readable Nutrition Facts/i)
    expect(labelFailureMessage('TIMED_OUT')).toMatch(/timed out/i)
    expect(labelFailureMessage('PIPELINE_FAILED')).toMatch(/failed/i)
    expect(readdirSync('api').filter((name) => name.endsWith('.ts'))).toEqual(['index.ts'])
  })
})
