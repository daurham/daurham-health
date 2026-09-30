import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NutritionInterpretError } from '../src/domain/nutrition/interpret.ts'
import {
  RECIPE_ASSIST_ALREADY_HAS_INGREDIENTS,
  RECIPE_ASSIST_LINE_MAX,
  RECIPE_ASSIST_MAX_LINES,
  RECIPE_ASSIST_PROMPT_VERSION,
  RECIPE_ASSIST_REQUEST_TYPE,
  RECIPE_ASSIST_TEXT_MAX,
  RECIPE_ASSIST_VERSION,
  applyRecipeAssistToBuilder,
  assistedLinesBlockSave,
  parseRecipeAssistModelOutput,
  parseRecipeAssistRequest,
  recipeAssistPrompt,
  recipeAssistSourcePacket,
  replaceOneUnresolved,
  transferSuggestedMeasure,
  type RecipeAssistDraft,
} from '../src/domain/nutrition/recipe-assist.ts'
import { supportedDisplayUnits } from '../src/domain/nutrition/recipes.ts'
import { AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD, readAiUsageConfig } from '../server/ai-usage/config.ts'
import { createMemoryAiUsageLedger } from '../server/ai-usage/memory.ts'
import { LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.ts'
import { withGeminiRetry } from '../server/integrations/gemini/client.ts'
import type { GeminiConfig } from '../server/integrations/gemini/config.ts'
import { getGeminiConfig } from '../server/integrations/gemini/config.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import nutritionRecipesRoute from '../server/handlers/nutrition-recipes.ts'
import { sendJson, type ApiRequest, type ApiResponse } from '../server/http.ts'
import { draftRecipeAssist } from '../server/nutrition/recipe-assist.ts'
import { nutritionGeminiRequestHash, runNutritionGeminiAttempt } from '../server/nutrition/gemini-usage.ts'
import type { NutritionGeminiResult } from '../server/nutrition/gemini-usage.ts'

const TEXT = 'Turkey chili\nServes 6\n1 lb ground turkey\n1 can black beans, drained'
const CONFIG: GeminiConfig = {
  apiKey: 'test-key',
  descriptionModel: 'desc-model',
  mealModel: 'meal-model',
  labelModel: 'label-model',
  recipeModel: 'recipe-model',
}

function request(text = TEXT) {
  return { version: RECIPE_ASSIST_VERSION, text }
}

function packet() {
  const parsed = recipeAssistSourcePacket(TEXT)
  if ('error' in parsed) throw new Error(parsed.error)
  return parsed.lines
}

function modelIngredient(overrides: Record<string, unknown> = {}) {
  return {
    sourceRefs: ['L3'],
    name: 'ground turkey',
    quantity: 1,
    unit: 'lb',
    ...overrides,
  }
}

function modelDraft(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Turkey chili',
    yieldServings: 6,
    ingredients: [modelIngredient()],
    ...overrides,
  }
}

function result(text: string): NutritionGeminiResult {
  return {
    text,
    model: 'recipe-model',
    latencyMs: 10,
    inputTokens: 4,
    outputTokens: 5,
    thinkingTokens: null,
    providerRequestId: null,
  }
}

describe('recipe text draft assistant', () => {
  it('accepts recipe-assist-v1 and rejects unknown, blank, extra, and overlong text', () => {
    expect(parseRecipeAssistRequest(request())).toEqual({ version: RECIPE_ASSIST_VERSION, text: TEXT })
    expect(parseRecipeAssistRequest({ version: 'recipe-assist-v2', text: TEXT })).toMatchObject({ code: 'UNKNOWN_VERSION' })
    expect(parseRecipeAssistRequest({ version: RECIPE_ASSIST_VERSION, text: ' \n\t ' })).toMatchObject({ code: 'BLANK' })
    expect(parseRecipeAssistRequest({ version: RECIPE_ASSIST_VERSION, text: 'a'.repeat(RECIPE_ASSIST_TEXT_MAX + 1) })).toMatchObject({
      code: 'TOO_LONG',
    })
    expect(parseRecipeAssistRequest({ version: RECIPE_ASSIST_VERSION, text: TEXT, goals: ['lose weight'] })).toMatchObject({
      code: 'UNKNOWN_VERSION',
    })
  })

  it('normalizes source lines in order and keeps the packet bounded', () => {
    const parsed = recipeAssistSourcePacket('  Turkey chili\r\n\r\nServes 6\r1 lb ground turkey  ')
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.lines.map((line) => line.ref)).toEqual(['L1', 'L2', 'L3'])
    expect(parsed.lines.map((line) => line.text)).toEqual(['Turkey chili', 'Serves 6', '1 lb ground turkey'])
    const long = recipeAssistSourcePacket(`x${'y'.repeat(RECIPE_ASSIST_LINE_MAX)}`)
    if ('error' in long) throw new Error(long.error)
    expect(long.lines[0]?.text.length).toBe(RECIPE_ASSIST_LINE_MAX)
    expect(recipeAssistSourcePacket(Array.from({ length: RECIPE_ASSIST_MAX_LINES + 1 }, (_, index) => `item ${index}`).join('\n'))).toMatchObject({
      code: 'TOO_MANY_LINES',
    })
  })

  it('parses a grounded draft and derives source text from the packet', () => {
    const lines = packet()
    const draft = parseRecipeAssistModelOutput(modelDraft({ title: null, yieldServings: null, ingredients: [modelIngredient({ quantity: null, unit: null })] }), lines, () => 'draft-1')
    expect(draft.title).toBeNull()
    expect(draft.yieldServings).toBeNull()
    expect(draft.ingredients[0]).toMatchObject({
      draftId: 'draft-1',
      sourceRefs: ['L3'],
      sourceText: '1 lb ground turkey',
      name: 'ground turkey',
      quantity: null,
      unit: null,
    })
    expect(parseRecipeAssistModelOutput(modelDraft(), lines, () => 'draft-2').yieldServings).toBe(6)
    expect(parseRecipeAssistModelOutput({ yieldServings: null, ingredients: [modelIngredient()] }, lines, () => 'draft-3').title).toBeNull()
  })

  it('rejects ungrounded, blank, numeric, and nutrition-bearing model output', () => {
    const lines = packet()
    const reject = (value: unknown) => expect(() => parseRecipeAssistModelOutput(value, lines, () => 'id')).toThrow(NutritionInterpretError)
    reject(modelDraft({ ingredients: [modelIngredient({ sourceRefs: [] })] }))
    reject(modelDraft({ ingredients: [modelIngredient({ sourceRefs: ['L99'] })] }))
    reject(modelDraft({ ingredients: [modelIngredient({ name: '  ' })] }))
    reject(modelDraft({ ingredients: [modelIngredient({ quantity: 0 })] }))
    reject(modelDraft({ ingredients: [modelIngredient({ quantity: -1 })] }))
    reject(modelDraft({ ingredients: [modelIngredient({ quantity: Number.NaN })] }))
    reject(modelDraft({ yieldServings: -2 }))
    reject(modelDraft({ yieldServings: Number.POSITIVE_INFINITY }))
    reject(modelDraft({ calories: 100 }))
    reject(modelDraft({ ingredients: [modelIngredient({ protein: 20 })] }))
    reject(modelDraft({ ingredients: [modelIngredient({ foodId: 'food-1' })] }))
    reject(modelDraft({ confidence: 0.9 }))
    reject(modelDraft({ ingredients: Array.from({ length: 41 }, () => modelIngredient()) }))
    reject(modelDraft({ title: 'x'.repeat(201) }))
    reject(modelDraft({ ingredients: [modelIngredient({ name: 'n'.repeat(121) })] }))
    reject(modelDraft({ ingredients: [modelIngredient({ unit: 'u'.repeat(41) })] }))
    const sneaky = modelDraft({ ingredients: [{ ...modelIngredient(), sourceText: 'invented pantry oil' }] })
    reject(sneaky)
  })

  it('tells the model not to invent ingredients or calculate nutrition', () => {
    const prompt = recipeAssistPrompt(packet())
    expect(RECIPE_ASSIST_PROMPT_VERSION).toBe('recipe-assist-v1')
    expect(RECIPE_ASSIST_REQUEST_TYPE).toBe('nutrition_recipe_assist')
    expect(prompt).toContain('Do not invent pantry items.')
    expect(prompt).toContain('Do not infer Nutrition values.')
    expect(prompt).toContain('Do not calculate calories or macros.')
    expect(prompt).toContain('If quantity is not stated, use null.')
    expect(prompt).toContain('If unit is not stated, use null.')
    expect(prompt).toContain('L3: 1 lb ground turkey')
    expect(prompt).not.toContain('https://')
  })

  it('shares the monthly budget and falls back through the recipe model chain', async () => {
    const config = readAiUsageConfig({})
    expect(config.nutritionRecipeAssistMaxRequestCostUsd).toBe(AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD)
    expect(config.monthlyBudgetUsd).toBe(readAiUsageConfig({}).monthlyBudgetUsd)
    expect(readAiUsageConfig({ AI_NUTRITION_RECIPE_ASSIST_MAX_REQUEST_COST_USD: '0.02' }).nutritionRecipeAssistMaxRequestCostUsd).toBe(0.02)
    expect(readAiUsageConfig({ AI_NUTRITION_RECIPE_ASSIST_MAX_REQUEST_COST_USD: 'nope' }).nutritionRecipeAssistMaxRequestCostUsd).toBe(
      AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD,
    )
    const recipe = await getGeminiConfig({ GEMINI_API_KEY: 'test-key', GEMINI_NUTRITION_RECIPE_MODEL: 'recipe-model' })
    const description = await getGeminiConfig({ GEMINI_API_KEY: 'test-key', GEMINI_NUTRITION_DESCRIPTION_MODEL: 'desc-model' })
    const general = await getGeminiConfig({ GEMINI_API_KEY: 'test-key', GEMINI_NUTRITION_MODEL: 'general-model' })
    const fallback = await getGeminiConfig({ GEMINI_API_KEY: 'test-key' })
    expect(recipe.recipeModel).toBe('recipe-model')
    expect(description.recipeModel).toBe('desc-model')
    expect(general.recipeModel).toBe('general-model')
    expect(fallback.recipeModel).toBe(fallback.descriptionModel)
    expect(readFileSync('.env.example', 'utf8')).toContain('GEMINI_NUTRITION_RECIPE_MODEL=')
    expect(readFileSync('.env.example', 'utf8')).toContain('AI_NUTRITION_RECIPE_ASSIST_MAX_REQUEST_COST_USD=')
  })

  it('reserves one recipe assist attempt, completes invalid output, and keeps denials off the provider', async () => {
    const ledger = createMemoryAiUsageLedger()
    const now = Date.parse('2026-09-27T22:00:00.000Z')
    let calls = 0
    let seenHash = ''
    const usage = { ...readAiUsageConfig({}), minIntervalMs: 0, monthlyBudgetUsd: 3 }
    const denied = createMemoryAiUsageLedger()
    await expect(
      draftRecipeAssist(request('SECRET_RECIPE\n1 egg'), {
        interpret: ({ prompt }) =>
          runNutritionGeminiAttempt(CONFIG, { model: 'recipe-model', prompt, timeoutMs: 1000, maxOutputTokens: 100, usageKind: 'recipe_assist' }, {
            ledger: {
              ...denied,
              reserve: async (input) => {
                seenHash = input.requestHash
                return denied.reserve(input)
              },
            },
            usageConfig: { ...usage, monthlyBudgetUsd: 0 },
            now: () => now,
            call: async () => {
              calls += 1
              return result('{}')
            },
          }).then((generated) => generated),
      }),
    ).rejects.toMatchObject({ statusCode: 429, code: 'AI_BUDGET_REACHED' })
    expect(calls).toBe(0)
    expect(denied.rows()).toHaveLength(0)

    calls = 0
    await expect(
      draftRecipeAssist(request(), {
        interpret: ({ prompt }) =>
          runNutritionGeminiAttempt(CONFIG, { model: 'recipe-model', prompt, timeoutMs: 1000, maxOutputTokens: 100, usageKind: 'recipe_assist' }, {
            ledger,
            usageConfig: { ...usage, maxPerMinute: 0 },
            now: () => now,
            call: async () => {
              calls += 1
              return result('{}')
            },
          }),
      }),
    ).rejects.toMatchObject({ statusCode: 429, code: 'AI_RATE_LIMITED' })
    expect(calls).toBe(0)

    const completed = createMemoryAiUsageLedger()
    await expect(
      draftRecipeAssist(request(), {
        interpret: ({ prompt }) =>
          runNutritionGeminiAttempt(CONFIG, { model: 'recipe-model', prompt, timeoutMs: 1000, maxOutputTokens: 100, usageKind: 'recipe_assist' }, {
            ledger: completed,
            usageConfig: usage,
            now: () => now,
            call: async () => result(JSON.stringify(modelDraft({ calories: 400 }))),
          }),
      }),
    ).rejects.toMatchObject({ code: 'GEMINI_SCHEMA' })
    expect(completed.rows()[0]?.status).toBe('completed')
    expect(completed.rows()).toHaveLength(1)

    const uncertain = createMemoryAiUsageLedger()
    await expect(
      draftRecipeAssist(request(), {
        interpret: ({ prompt }) =>
          runNutritionGeminiAttempt(CONFIG, { model: 'recipe-model', prompt, timeoutMs: 1000, maxOutputTokens: 100, usageKind: 'recipe_assist' }, {
            ledger: uncertain,
            usageConfig: usage,
            now: () => now + 10_000,
            call: async () => {
              throw new Error('socket')
            },
          }),
      }),
    ).rejects.toMatchObject({ code: 'GEMINI_UNAVAILABLE' })
    expect(uncertain.rows()[0]?.status).toBe('uncertain')

    await expect(draftRecipeAssist(request(), { env: { GEMINI_API_KEY: '' } })).rejects.toMatchObject({
      statusCode: 503,
      code: 'GEMINI_NOT_CONFIGURED',
    })
    expect(seenHash).not.toContain('SECRET_RECIPE')
    const hash = nutritionGeminiRequestHash({ requestType: RECIPE_ASSIST_REQUEST_TYPE, model: 'recipe-model', prompt: recipeAssistPrompt(packet()) })
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('ground turkey')

    const retried = createMemoryAiUsageLedger()
    let attempt = 0
    await withGeminiRetry(() =>
      runNutritionGeminiAttempt(CONFIG, { model: 'recipe-model', prompt: 'packet', timeoutMs: 1000, maxOutputTokens: 100, usageKind: 'recipe_assist' }, {
        ledger: retried,
        usageConfig: usage,
        now: () => now + 20_000 + attempt,
        call: async () => {
          attempt += 1
          if (attempt === 1) throw new NutritionInterpretError('GEMINI_UNAVAILABLE', 'down')
          return result('{}')
        },
      }),
    )
    expect(retried.rows()).toHaveLength(2)
    expect(completed.rows()[0]?.status).toBe('completed')
  })

  it('applies a draft without overwriting owner metadata and blocks unresolved lines', () => {
    const draft: RecipeAssistDraft = {
      version: RECIPE_ASSIST_VERSION,
      title: 'Turkey chili',
      yieldServings: 6,
      ingredients: [
        { draftId: 'a', sourceRefs: ['L3'], sourceText: '1 lb ground turkey', name: 'ground turkey', quantity: 1, unit: 'lb' },
        { draftId: 'b', sourceRefs: ['L4'], sourceText: '1 can black beans, drained', name: 'black beans', quantity: null, unit: 'can' },
      ],
    }
    const notes = 'family recipe'
    const weight = '2400'
    const applied = applyRecipeAssistToBuilder({ name: '', notes, yieldServings: '', finishedWeightG: weight, ingredientCount: 0, draft })
    if ('error' in applied) throw new Error(applied.error)
    expect(applied.name).toBe('Turkey chili')
    expect(applied.yieldServings).toBe('6')
    expect(applied.notes).toBe(notes)
    expect(applied.finishedWeightG).toBe(weight)
    expect(applied.lines.every((line) => line.status === 'unresolved')).toBe(true)
    const kept = applyRecipeAssistToBuilder({ name: 'My chili', notes, yieldServings: '8', finishedWeightG: weight, ingredientCount: 0, draft })
    if ('error' in kept) throw new Error(kept.error)
    expect(kept.name).toBe('My chili')
    expect(kept.yieldServings).toBe('8')
    expect(applyRecipeAssistToBuilder({ name: '', notes, yieldServings: '', finishedWeightG: '', ingredientCount: 1, draft })).toEqual({
      error: RECIPE_ASSIST_ALREADY_HAS_INGREDIENTS,
    })
    expect(assistedLinesBlockSave(applied.lines)).toBe(true)
    const units = supportedDisplayUnits({ baseServingUnitSnapshot: 'serving', baseWeightGramsSnapshot: 100 })
    expect(transferSuggestedMeasure({ quantity: 1, unit: 'lb', supportedUnits: units })).toEqual({ amount: '1', unit: 'lb', transferredUnit: true })
    expect(transferSuggestedMeasure({ quantity: null, unit: 'can', supportedUnits: units })).toEqual({
      amount: '1',
      unit: 'serving',
      transferredUnit: false,
    })
    const replaced = replaceOneUnresolved(
      [
        { key: 'a', status: 'unresolved' as const, name: 'ground turkey' },
        { key: 'b', status: 'unresolved' as const, name: 'black beans' },
      ],
      'a',
      { key: 'a', status: 'resolved' as const, name: 'Ground turkey' },
    )
    expect(replaced[0]?.status).toBe('resolved')
    expect(replaced[1]).toMatchObject({ key: 'b', status: 'unresolved', name: 'black beans' })
  })

  it('keeps the route owner-only, makes no database write, and leaves recipe commit unchanged', async () => {
    expect(matchHealthApiRoute('/api/nutrition/recipes/assist')).toBe('nutrition-recipes')
    const captured = captureResponse()
    await nutritionRecipesRoute({ method: 'GET', url: '/api/nutrition/recipes/assist', headers: {} } as ApiRequest, captured.res)
    expect(captured.status()).toBe(405)
    const assist = readFileSync('server/nutrition/recipe-assist.ts', 'utf8')
    const handler = readFileSync('server/handlers/nutrition-recipes.ts', 'utf8')
    const recipes = readFileSync('server/nutrition/recipes.ts', 'utf8')
    const inventory = readFileSync('server/backup/inventory.ts', 'utf8')
    const pages = readFileSync('src/features/nutrition/RecipesPages.tsx', 'utf8')
    const sheet = readFileSync('src/features/nutrition/RecipeIngredientSheet.tsx', 'utf8')
    const assistUi = readFileSync('src/features/nutrition/RecipeAssistSheet.tsx', 'utf8')
    const edit = pages.slice(pages.indexOf('export function RecipeEditPage'))
    expect(assist).not.toContain('getSql')
    expect(assist).not.toContain('INSERT')
    expect(assist).not.toContain('fetch(')
    expect(readFileSync('src/domain/nutrition/recipe-assist.ts', 'utf8')).not.toContain('fetch(')
    expect(assistUi).not.toContain('fetch(')
    expect(assistUi).not.toContain('useEffect')
    expect(assistUi).toContain('Draft ingredients')
    expect(assistUi).toContain('Apply draft')
    expect(assistUi).toContain('Retry draft')
    expect(assistUi).toContain('Continue manually')
    expect(assistUi).toContain('Paste the ingredient list or recipe text.')
    expect(pages).toContain('Draft from recipe text')
    expect(pages).toContain('applyRecipeAssistToBuilder')
    expect(pages).toContain('composeRecipe')
    expect(pages).toContain('createRecipe')
    expect(pages).toContain('Resolve food')
    expect(pages).toContain('initialQuery')
    expect(pages).toContain('RecipeIngredientSheet')
    expect(sheet).toContain('Search My Foods')
    expect(sheet).toContain('Search USDA')
    expect(sheet).toContain('describeFoodText')
    expect(sheet).not.toMatch(/useEffect\([\s\S]*searchNutritionFoods/)
    expect(edit).not.toContain('Draft from recipe text')
    expect(edit).not.toContain('draftRecipeFromText')
    expect(recipes).toContain('calculationVersion')
    expect(recipes).not.toContain('recipe_assist')
    expect(handler).not.toContain('BODY_CAPTURE_TOKEN')
    expect(inventory).not.toContain('recipe_assist')
    expect(LATEST_SCHEMA_MIGRATION).toBe('0041_exercise_library_calisthenics.sql')
    expect(readdirSync('migrations')).toContain('0035_coach_tasks.sql')
    expect(readFileSync('src/demo/dataset.ts', 'utf8')).not.toContain('healthFetch')
    expect(readFileSync('src/features/demo/DemoNutritionPage.tsx', 'utf8')).not.toContain('/api/nutrition/recipes/assist')
    expect(sendJson).toBeTypeOf('function')
  })
})

function captureResponse(): { res: ApiResponse; status: () => number } {
  let statusCode = 200
  const res = {
    setHeader: () => res,
    status: (code: number) => {
      statusCode = code
      return res
    },
    json: () => res,
  } as unknown as ApiResponse
  return { res, status: () => statusCode }
}
