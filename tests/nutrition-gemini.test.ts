import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  GEMINI_DESCRIPTION_RESPONSE_SCHEMA,
  GEMINI_LABEL_RESPONSE_SCHEMA,
  GEMINI_MEAL_RESPONSE_SCHEMA,
  GEMINI_NUTRITION_MODEL_DEFAULT,
  applyLabelUserContext,
  applyMealUserContext,
  foodDescriptionPrompt,
  interpretFoodDescriptionResponse,
  interpretMealPhotoResponse,
  interpretNutritionLabelResponse,
  mealPhotoPrompt,
  nutritionLabelPrompt,
  nutritionMealJobFingerprint,
  okField,
  sanitizeMealCandidate,
  schemaMentionsNutrientTotals,
  summarizeInterpretationUsage,
  emptyLabelCandidate,
} from '../src/domain/nutrition/index.ts'
import { GeminiNutritionInterpreter, classifyGeminiError, withGeminiRetry } from '../server/integrations/gemini/client.ts'
import type { GeminiGenerate } from '../server/integrations/gemini/client.ts'

const mealJson = JSON.stringify({
  components: [
    {
      proposedName: 'broccoli',
      preparation: 'steamed',
      portionEstimate: { description: '1 cup', gramsEstimate: 90, confidence: 'medium' },
      visualConfidence: 'medium',
      ambiguities: [],
      possibleSauceOrOil: false,
    },
  ],
  ambiguities: [],
  possibleUnaccountedItems: [],
})

function fakeGenerate(text: string): GeminiGenerate {
  return async () => ({
    text,
    model: GEMINI_NUTRITION_MODEL_DEFAULT,
    latencyMs: 25,
    inputTokens: 12,
    outputTokens: 8,
    thinkingTokens: 0,
    providerRequestId: 'req-1',
  })
}

describe('Gemini nutrition interpretation', () => {
  it('maps a schema-constrained meal into the shared candidate and drops calorie totals', () => {
    const raw = JSON.parse(mealJson) as Record<string, unknown>
    raw.calories = 500
    raw.protein = 40
    const candidate = interpretMealPhotoResponse(JSON.stringify(raw), null, GEMINI_NUTRITION_MODEL_DEFAULT)
    expect(candidate.components[0]?.proposedName).toBe('broccoli')
    expect(candidate.status).toBe('review_required')
    expect(candidate.notes.join(' ')).toMatch(/ignored model-generated nutrition/i)
    expect(candidate).not.toHaveProperty('calories')
    expect(schemaMentionsNutrientTotals(GEMINI_MEAL_RESPONSE_SCHEMA)).toBe(false)
    expect(schemaMentionsNutrientTotals(GEMINI_DESCRIPTION_RESPONSE_SCHEMA)).toBe(false)
    expect(schemaMentionsNutrientTotals(GEMINI_LABEL_RESPONSE_SCHEMA)).toBe(true)
  })

  it('treats an empty component list as a semantic failure and keeps calorie notes out of canonical fields', () => {
    expect(() => interpretMealPhotoResponse(JSON.stringify({ components: [], ambiguities: [], possibleUnaccountedItems: [] }), null, null)).toThrow(
      /couldn't confidently interpret/i,
    )
    const withNote = applyMealUserContext(sanitizeMealCandidate(JSON.parse(mealJson)), 'This plate is 500 calories.')
    expect(withNote.notes.join(' ')).toMatch(/not used/i)
    expect(withNote).not.toHaveProperty('calories')
  })

  it('turns a cauliflower-rice note into an ambiguity instead of silently choosing', () => {
    const candidate = interpretMealPhotoResponse(
      JSON.stringify({
        components: [
          {
            proposedName: 'white rice',
            preparation: null,
            portionEstimate: { description: null, gramsEstimate: 150, confidence: 'low' },
            visualConfidence: 'low',
            ambiguities: [],
            possibleSauceOrOil: false,
          },
        ],
        ambiguities: [],
        possibleUnaccountedItems: [],
      }),
      'This is cauliflower rice.',
      null,
    )
    expect(candidate.components[0]?.ambiguities.join(' ')).toMatch(/cauliflower rice/i)
  })

  it('flags sauce or oil without accepting a macro total', () => {
    const candidate = interpretMealPhotoResponse(
      JSON.stringify({
        components: [
          {
            proposedName: 'chicken',
            preparation: 'grilled',
            portionEstimate: { description: null, gramsEstimate: 120, confidence: 'medium' },
            visualConfidence: 'medium',
            ambiguities: [],
            possibleSauceOrOil: false,
          },
          {
            proposedName: 'mayo',
            preparation: null,
            portionEstimate: { description: 'about 1 tbsp', gramsEstimate: 15, confidence: 'low' },
            visualConfidence: 'low',
            ambiguities: [],
            possibleSauceOrOil: true,
          },
        ],
        ambiguities: [],
        possibleUnaccountedItems: [],
      }),
      null,
      null,
    )
    expect(candidate.possibleUnaccountedItems).toContain('mayo')
  })

  it('extracts a food description without nutrition and preserves ambiguity', () => {
    const candidate = interpretFoodDescriptionResponse(
      JSON.stringify({
        components: [
          { proposedName: 'wagyu beef', quantity: 0.5, unit: 'lb', preparation: null, ambiguity: null, calories: 900 },
          { proposedName: 'onion', quantity: 0.25, unit: 'whole', preparation: 'diced', ambiguity: 'onion size is unspecified' },
          { proposedName: 'broccoli', quantity: 1, unit: 'cup', preparation: null, ambiguity: null },
        ],
      }),
      'half a lb of wagyu beef, a quarter of diced onion and a cup of broccoli',
    )
    expect(candidate.components.map((item) => [item.proposedName, item.quantity, item.unit])).toEqual([
      ['wagyu beef', 0.5, 'lb'],
      ['onion', 0.25, 'whole'],
      ['broccoli', 1, 'cup'],
    ])
    expect(candidate.components[1]?.ambiguity).toMatch(/onion size/i)
    expect(candidate.components[0]).not.toHaveProperty('calories')
  })

  it('keeps visible label numbers when context disagrees and leaves missing fiber null', () => {
    const candidate = interpretNutritionLabelResponse(
      JSON.stringify({
        fields: {
          productName: { value: 'Yogurt', status: 'ok' },
          brand: { value: null, status: 'missing' },
          servingQuantity: { value: 1, status: 'ok' },
          servingUnit: { value: 'container', status: 'ok' },
          servingGrams: { value: 150, status: 'ok' },
          servingsPerContainer: { value: 1, status: 'ok' },
          calories: { value: 120, status: 'ok' },
          proteinGrams: { value: 12, status: 'ok' },
          carbsGrams: { value: 15, status: 'ok' },
          fatGrams: { value: 2, status: 'ok' },
          fiberGrams: { value: null, status: 'missing' },
          basis: { value: 'per_serving', status: 'ok' },
          barcode: { value: null, status: 'missing' },
        },
        ambiguities: [],
        warnings: [],
      }),
      'This is 80 calories.',
      GEMINI_NUTRITION_MODEL_DEFAULT,
    )
    expect(candidate.fields.calories.value).toBe(120)
    expect(candidate.fields.fiberGrams.value).toBeNull()
    expect(candidate.status).toBe('review_required')
    expect(candidate.ambiguities.join(' ')).toMatch(/label shows 120/)
    const unchanged = applyLabelUserContext(
      emptyLabelCandidate({ fields: { ...emptyLabelCandidate().fields, calories: okField(100), productName: okField('Soup') } }),
      'The front says reduced fat.',
    )
    expect(unchanged.fields.calories.value).toBe(100)
  })

  it('includes user context in the Gemini prompt and does not enable search grounding', () => {
    expect(mealPhotoPrompt('cauliflower rice with eggs')).toContain('cauliflower rice with eggs')
    expect(mealPhotoPrompt(null)).toContain('Do not provide calorie or macro totals.')
    expect(foodDescriptionPrompt('a cup of broccoli')).toContain('Do not calculate nutrition.')
    expect(nutritionLabelPrompt('12 oz package')).toContain('Do not infer missing numeric nutrients.')
    const client = readFileSync('server/integrations/gemini/client.ts', 'utf8')
    expect(client).not.toContain('googleSearch')
    expect(client).not.toContain('google_search')
    expect(client).toContain("responseMimeType: 'application/json'")
    expect(client).not.toContain('responseJsonSchema')
    expect(client).not.toContain('responseSchema')
    expect(client).not.toContain('responseFormat')
  })

  it('asks Gemini in JSON mode and returns token metadata separately from the candidate', async () => {
    let seenPrompt = ''
    const interpreter = new GeminiNutritionInterpreter({
      model: GEMINI_NUTRITION_MODEL_DEFAULT,
      generate: async (request) => {
        seenPrompt = request.prompt
        expect(request).not.toHaveProperty('schema')
        return fakeGenerate(mealJson)(request)
      },
    })
    const interpreted = await interpreter.interpretMealPhoto({
      image: Uint8Array.from([1, 2, 3]),
      mimeType: 'image/jpeg',
      userContext: 'about one cup',
    })
    expect(seenPrompt).toContain('about one cup')
    expect(seenPrompt).toContain('USER-PROVIDED CONTEXT')
    expect(interpreted.candidate.components).toHaveLength(1)
    expect(interpreted.metadata).toMatchObject({ provider: 'gemini', inputTokens: 12, outputTokens: 8, model: GEMINI_NUTRITION_MODEL_DEFAULT })
    expect(interpreted.candidate).not.toHaveProperty('inputTokens')
  })

  it('retries one unavailable Gemini error and does not retry timeout, auth, or schema failures', async () => {
    let unavailable = 0
    const value = await withGeminiRetry(async () => {
      unavailable += 1
      if (unavailable === 1) {
        throw new Error('503 unavailable')
      }
      return 'ok'
    })
    expect(value).toBe('ok')
    expect(unavailable).toBe(2)
    let timeouts = 0
    await expect(
      withGeminiRetry(async () => {
        timeouts += 1
        throw new Error('timeout')
      }),
    ).rejects.toMatchObject({ code: 'GEMINI_TIMEOUT' })
    expect(timeouts).toBe(1)
    let schemaFailures = 0
    await expect(
      withGeminiRetry(async () => {
        schemaFailures += 1
        throw Object.assign(new Error('bad schema'), { status: 400 })
      }),
    ).rejects.toMatchObject({ code: 'GEMINI_SCHEMA' })
    expect(schemaFailures).toBe(1)
    expect(classifyGeminiError(Object.assign(new Error('API key'), { status: 401 }))).toBe('GEMINI_AUTH')
    await expect(withGeminiRetry(async () => Promise.reject(Object.assign(new Error('bad key'), { status: 401 })))).rejects.toMatchObject({
      code: 'GEMINI_AUTH',
    })
  })

  it('maps the smaller provider schema into the same candidate and keeps an invalid meal out of a commit', () => {
    const meal = interpretMealPhotoResponse(
      JSON.stringify({
        components: [{ proposedName: 'broccoli', portionDescription: '1 cup', gramsEstimate: 90, possibleSauceOrOil: false }],
      }),
      null,
      null,
    )
    expect(meal.components[0]?.portionEstimate.gramsEstimate).toBe(90)
    expect(() => interpretMealPhotoResponse('not-json', null, null)).toThrow(/couldn't confidently interpret/i)
    const label = interpretNutritionLabelResponse(
      JSON.stringify({ productName: 'Yogurt', calories: 120, proteinGrams: 12, carbsGrams: 15, fatGrams: 2, basis: 'per_serving' }),
      null,
      null,
    )
    expect(label.fields.calories.value).toBe(120)
    expect(label.fields.fiberGrams.value).toBeNull()
    const encoded = JSON.stringify(GEMINI_DESCRIPTION_RESPONSE_SCHEMA)
    expect(encoded).not.toContain('null')
    expect(JSON.stringify(GEMINI_MEAL_RESPONSE_SCHEMA)).not.toContain('portionEstimate')
    expect(JSON.stringify(GEMINI_MEAL_RESPONSE_SCHEMA)).toContain('items')
    const jobs = readFileSync('server/nutrition/gemini-jobs.ts', 'utf8')
    expect(jobs).toContain("status: 'failed'")
    expect(jobs).not.toContain('commitNutrition')
  })

  it('normalizes JSON-mode aliases, numeric strings, and fenced JSON without a second formatter', () => {
    const described = interpretFoodDescriptionResponse(
      '```json\n{"items":[{"food":"wagyu beef","amount":"0.5","unit":"lb","note":""},{"name":"onion","quantity":"quarter onion","unit":"whole","note":"size unspecified"}]}\n```',
      'half a lb of wagyu beef and a quarter onion',
    )
    expect(described.components[0]).toMatchObject({ proposedName: 'wagyu beef', quantity: 0.5, unit: 'lb' })
    expect(described.components[1]?.proposedName).toBe('onion')
    expect(described.components[1]?.quantity).toBeNull()
    expect(described.components[1]?.ambiguity).toMatch(/quarter onion|size unspecified/)
    const meal = interpretMealPhotoResponse(
      JSON.stringify({
        items: [
          { name: 'scrambled eggs', portion: 'roughly 2 eggs', amount: 2, unit: 'egg', note: null, calories: 180 },
          { foodName: 'white rice', amount: '1', unit: 'cup' },
        ],
        possibleExtras: ['cooking oil'],
        ambiguities: [],
      }),
      null,
      null,
    )
    expect(meal.components.map((item) => item.proposedName)).toEqual(['scrambled eggs', 'white rice'])
    expect(meal.components[0]?.portionEstimate.description).toBe('roughly 2 eggs')
    expect(meal.components[0]?.portionEstimate.gramsEstimate).toBeNull()
    expect(meal.possibleUnaccountedItems).toContain('cooking oil')
    expect(meal.notes.join(' ')).toMatch(/ignored model-generated nutrition/i)
    expect(() => interpretFoodDescriptionResponse('{items:[}', 'broccoli')).toThrow(/couldn't confidently interpret/i)
    const client = readFileSync('server/integrations/gemini/client.ts', 'utf8')
    expect(client).not.toMatch(/fix this JSON|second.*generateContent|reformat/i)
    expect(client.split('generateContent').length - 1).toBe(1)
  })

  it('routes description, meal, and label to their own models', async () => {
    const seen: string[] = []
    const interpreter = new GeminiNutritionInterpreter({
      model: 'gemini-3.5-flash',
      descriptionModel: 'gemini-3.5-flash-lite',
      labelModel: 'gemini-3.5-flash',
      generate: async (request) => {
        seen.push(`${request.model}:${request.timeoutMs}`)
        if (request.prompt.startsWith('Extract food components')) {
          return fakeGenerate(
            JSON.stringify({ components: [{ proposedName: 'broccoli', quantity: 1, unit: 'cup' }] }),
          )(request)
        }
        if (request.prompt.startsWith('Extract the visible label')) {
          return fakeGenerate(JSON.stringify({ calories: 120, proteinGrams: 10, carbsGrams: 8, fatGrams: 3 }))(request)
        }
        return fakeGenerate(mealJson)(request)
      },
    })
    await interpreter.interpretFoodDescription({ text: 'a cup of broccoli' })
    await interpreter.interpretMealPhoto({ image: Uint8Array.from([1]), mimeType: 'image/jpeg', userContext: null })
    await interpreter.interpretNutritionLabel({ image: Uint8Array.from([1]), mimeType: 'image/jpeg', userContext: null })
    expect(seen).toEqual(['gemini-3.5-flash-lite:10000', 'gemini-3.5-flash:20000', 'gemini-3.5-flash:20000'])
  })

  it('summarizes token usage from capture metadata without model prices', () => {
    const summary = summarizeInterpretationUsage([
      { status: 'completed', interpretation: { latencyMs: 100, inputTokens: 10, outputTokens: 4 } },
      { status: 'failed', interpretation: { latencyMs: 300, inputTokens: 8, outputTokens: 0 } },
    ])
    expect(summary).toMatchObject({ calls: 2, failures: 1, failureRate: 0.5, inputTokens: 18, outputTokens: 4, averageLatencyMs: 200 })
  })
})

describe('Gemini routing, context, and boundaries', () => {
  it('keeps Gemini server-side, defaults the model, and leaves workout transcription on Home-AI', () => {
    const example = readFileSync('.env.example', 'utf8')
    const config = readFileSync('server/integrations/gemini/config.ts', 'utf8')
    const clientApi = readFileSync('src/features/nutrition/api.ts', 'utf8')
    const meal = readFileSync('server/nutrition/meal.ts', 'utf8')
    const describeHandler = readFileSync('server/handlers/nutrition-describe.ts', 'utf8')
    const workout = readFileSync('server/training/transcription.ts', 'utf8')
    const mealUi = readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')
    const labelUi = readFileSync('src/features/nutrition/LabelCapture.tsx', 'utf8')
    expect(example).toContain('GEMINI_API_KEY=')
    expect(example).toContain('GEMINI_NUTRITION_MODEL=gemini-3.5-flash')
    expect(example).toContain('GEMINI_NUTRITION_DESCRIPTION_MODEL=gemini-3.5-flash-lite')
    expect(example).toContain('GEMINI_NUTRITION_MEAL_MODEL=gemini-3.5-flash')
    expect(example).toContain('GEMINI_NUTRITION_LABEL_MODEL=gemini-3.5-flash')
    const geminiClient = readFileSync('server/integrations/gemini/client.ts', 'utf8')
    expect(geminiClient).toContain('thinkingLevel: ThinkingLevel.MINIMAL')
    expect(geminiClient).not.toContain('thinkingBudget')
    expect(geminiClient).not.toContain('temperature')
    expect(geminiClient).not.toContain('responseJsonSchema')
    expect(geminiClient).not.toContain('responseSchema')
    expect(geminiClient).toContain("responseMimeType: 'application/json'")
    expect(geminiClient).toContain('attempts: 1')
    expect(geminiClient).toContain('GEMINI_DESCRIPTION_TIMEOUT_MS')
    expect(geminiClient).toContain('GEMINI_MEAL_TIMEOUT_MS')
    expect(geminiClient).toContain('GEMINI_LABEL_TIMEOUT_MS')
    expect(readFileSync('server/integrations/gemini/config.ts', 'utf8')).toContain('GEMINI_DESCRIPTION_MODEL_DEFAULT')
    expect(readFileSync('server/nutrition/gemini-jobs.ts', 'utf8')).toContain('45_000')
    expect(example).not.toContain('VITE_GEMINI')
    expect(config).toContain('GEMINI_API_KEY')
    expect(config).not.toContain('VITE_')
    expect(clientApi).not.toContain('GEMINI_API_KEY')
    expect(clientApi).not.toContain('HOME_AI_API_KEY')
    expect(workout).not.toContain('gemini')
    expect(workout).not.toContain('@google/genai')
    expect(describeHandler).toContain('geminiFoodDescriptionInterpreter')
    expect(describeHandler).toContain("provider === 'home_ai'")
    expect(describeHandler).not.toContain('localFoodDescriptionInterpreter')
    const geminiCreate = meal.slice(meal.indexOf('async function createGeminiMealJob'), meal.indexOf('async function createHomeAiMealJob'))
    expect(geminiCreate).not.toContain('getHomeAiClient')
    expect(geminiCreate).toContain("provider: 'gemini'")
    expect(meal).toContain('requeueCaptureJob')
    expect(nutritionMealJobFingerprint('job-1')).toBe(nutritionMealJobFingerprint('job-1'))
    expect(mealUi).toContain('Analyze meal')
    expect(mealUi).toContain('Add context (optional)')
    expect(mealUi).toContain('Retry Gemini')
    expect(mealUi).toContain('Try local AI')
    expect(mealUi).toContain('Edit context')
    expect(mealUi).toContain('text-base')
    expect(mealUi).not.toContain('createNutritionMealJob(prepared.file)')
    expect(labelUi).toContain('Analyze label')
    expect(labelUi).toContain('HOME_AI_UNAVAILABLE')
    expect(readFileSync('server/nutrition/label-jobs.ts', 'utf8')).toContain('user_context')
    expect(readFileSync('server/handlers/nutrition-meal-jobs.ts', 'utf8')).toContain('withOwnerAuth')
  })
})
