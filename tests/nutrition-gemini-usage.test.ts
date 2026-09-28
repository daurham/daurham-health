import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  AI_BUDGET_REACHED,
  AI_RATE_LIMITED,
  NUTRITION_GEMINI_REQUEST_TYPES,
  NutritionInterpretError,
  foodDescriptionPrompt,
  isLabelRetryCode,
  isMealRetryCode,
} from '../src/domain/nutrition/index.ts'
import { GEMINI_AUTO_RETRY_CODES } from '../src/domain/nutrition/interpret.ts'
import {
  AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD,
  AI_USAGE_MAX_PER_MINUTE,
  AI_USAGE_MIN_INTERVAL_MS,
  readAiUsageConfig,
  type AiUsageConfig,
} from '../server/ai-usage/config.ts'
import { createMemoryAiUsageLedger } from '../server/ai-usage/memory.ts'
import type { AiUsageLedger, AiUsageReserveInput } from '../server/ai-usage/ledger.ts'
import { LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.ts'
import { GeminiNutritionInterpreter, withGeminiRetry } from '../server/integrations/gemini/client.ts'
import type { GeminiConfig } from '../server/integrations/gemini/config.ts'
import { getGeminiConfig } from '../server/integrations/gemini/config.ts'
import { advanceGeminiCapture, interpretErrorToHttp } from '../server/nutrition/gemini-jobs.ts'
import { nutritionGeminiRequestHash, runNutritionGeminiAttempt } from '../server/nutrition/gemini-usage.ts'
import type { NutritionGeminiRequest, NutritionGeminiResult } from '../server/nutrition/gemini-usage.ts'
import type { NutritionCaptureJobRecord } from '../server/nutrition/label-jobs.ts'

const NOW = Date.parse('2026-09-27T20:00:00.000Z')
const CONFIG: GeminiConfig = {
  apiKey: 'test-key',
  descriptionModel: 'desc-model',
  mealModel: 'meal-model',
  labelModel: 'label-model',
}

function usageConfig(overrides: Partial<AiUsageConfig> = {}): AiUsageConfig {
  return { ...readAiUsageConfig({}), ...overrides }
}

function recordingLedger() {
  const base = createMemoryAiUsageLedger()
  const reserves: AiUsageReserveInput[] = []
  const completions: Array<{ actual: number | null; inputTokens: number | null; outputTokens: number | null }> = []
  const ledger: AiUsageLedger = {
    async reserve(input) {
      reserves.push(input)
      return base.reserve(input)
    },
    async complete(id, actualCostUsd, inputTokens, outputTokens, now) {
      completions.push({ actual: actualCostUsd, inputTokens, outputTokens })
      return base.complete(id, actualCostUsd, inputTokens, outputTokens, now)
    },
    uncertain: (id, now) => base.uncertain(id, now),
    release: (id, now) => base.release(id, now),
    chargedUsd: (now) => base.chargedUsd(now),
  }
  return { ledger, reserves, completions, rows: base.rows }
}

function result(text: string, tokens?: { input?: number | null; output?: number | null }): NutritionGeminiResult {
  return {
    text,
    model: 'desc-model',
    latencyMs: 10,
    inputTokens: tokens?.input === undefined ? 11 : tokens.input,
    outputTokens: tokens?.output === undefined ? 7 : tokens.output,
    thinkingTokens: 0,
    providerRequestId: 'req-1',
  }
}

function request(kind: NutritionGeminiRequest['usageKind'], extras: Partial<NutritionGeminiRequest> = {}): NutritionGeminiRequest {
  return {
    model: kind === 'description' ? 'desc-model' : kind === 'nutrition_label' ? 'label-model' : 'meal-model',
    prompt: kind === 'description' ? foodDescriptionPrompt('two eggs and SECRET_TEXT') : 'prompt without a filename',
    timeoutMs: 1000,
    maxOutputTokens: 128,
    usageKind: kind,
    ...extras,
  }
}

function mealJson(calories = 400): string {
  return JSON.stringify({
    name: 'Eggs',
    foodsSeen: ['eggs'],
    assumptions: [],
    calories,
    proteinGrams: 12,
    carbsGrams: 1,
    fatGrams: 10,
    fiberGrams: 0,
  })
}

function queuedJob(kind: NutritionCaptureJobRecord['captureKind']): NutritionCaptureJobRecord {
  return {
    id: 'job-1',
    status: 'queued',
    captureKind: kind,
    filename: 'secret-file.jpg',
    failureMessage: null,
    candidate: null,
    createdAt: '2026-09-27T19:00:00.000Z',
    updatedAt: '2026-09-27T19:00:00.000Z',
    committedAt: null,
    userContext: 'SECRET_CONTEXT',
    provider: 'gemini',
    imageStored: true,
    interpretation: { attempt: 1 },
  }
}

describe('Nutrition Gemini durable usage', () => {
  it('names three request types and shares the monthly budget, rate gate, and max-cost config', () => {
    expect(NUTRITION_GEMINI_REQUEST_TYPES).toEqual({
      description: 'nutrition_description',
      meal_photo: 'nutrition_meal_photo',
      nutrition_label: 'nutrition_label',
    })
    const config = readAiUsageConfig({})
    expect(config.monthlyBudgetUsd).toBe(readAiUsageConfig({}).monthlyBudgetUsd)
    expect(config.minIntervalMs).toBe(AI_USAGE_MIN_INTERVAL_MS)
    expect(config.maxPerMinute).toBe(AI_USAGE_MAX_PER_MINUTE)
    expect(config.nutritionDescriptionMaxRequestCostUsd).toBe(AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD)
    expect(config.nutritionMealMaxRequestCostUsd).toBe(AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD)
    expect(config.nutritionLabelMaxRequestCostUsd).toBe(AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD)
    const explicit = readAiUsageConfig({
      AI_NUTRITION_DESCRIPTION_MAX_REQUEST_COST_USD: '0.02',
      AI_NUTRITION_MEAL_MAX_REQUEST_COST_USD: '0.03',
      AI_NUTRITION_LABEL_MAX_REQUEST_COST_USD: '0.04',
    })
    expect(explicit.nutritionDescriptionMaxRequestCostUsd).toBe(0.02)
    expect(explicit.nutritionMealMaxRequestCostUsd).toBe(0.03)
    expect(explicit.nutritionLabelMaxRequestCostUsd).toBe(0.04)
    const invalid = readAiUsageConfig({
      AI_NUTRITION_DESCRIPTION_MAX_REQUEST_COST_USD: 'nope',
      AI_NUTRITION_MEAL_MAX_REQUEST_COST_USD: '',
      AI_NUTRITION_LABEL_MAX_REQUEST_COST_USD: '-1',
    })
    expect(invalid.nutritionDescriptionMaxRequestCostUsd).toBe(AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD)
    expect(invalid.nutritionMealMaxRequestCostUsd).toBe(AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD)
    expect(invalid.nutritionLabelMaxRequestCostUsd).toBe(AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD)
    expect(readFileSync('server/nutrition/gemini-usage.ts', 'utf8')).toContain('usageConfig.monthlyBudgetUsd')
    expect(readFileSync('server/nutrition/gemini-usage.ts', 'utf8')).not.toContain('AI_NUTRITION_MONTHLY')
  })

  it('reserves before each Gemini attempt and completes a returned response with bounded token cost', async () => {
    const recorded = recordingLedger()
    const events: string[] = []
    const shared = usageConfig({ minIntervalMs: 0, monthlyBudgetUsd: 3 })
    for (const kind of ['description', 'meal_photo', 'nutrition_label'] as const) {
      await runNutritionGeminiAttempt(CONFIG, request(kind, { image: kind === 'description' ? undefined : { mimeType: 'image/jpeg', base64: 'YQ==' } }), {
        ledger: recorded.ledger,
        usageConfig: shared,
        now: () => NOW + recorded.reserves.length,
        call: async () => {
          events.push(`call:${kind}`)
          return result('{"ok":true}')
        },
      })
    }
    expect(events).toEqual(['call:description', 'call:meal_photo', 'call:nutrition_label'])
    expect(recorded.reserves.map((row) => row.requestType)).toEqual([
      'nutrition_description',
      'nutrition_meal_photo',
      'nutrition_label',
    ])
    expect(new Set(recorded.reserves.map((row) => row.budgetUsd))).toEqual(new Set([shared.monthlyBudgetUsd]))
    expect(new Set(recorded.reserves.map((row) => row.minIntervalMs))).toEqual(new Set([shared.minIntervalMs]))
    expect(new Set(recorded.reserves.map((row) => row.maxPerMinute))).toEqual(new Set([shared.maxPerMinute]))
    expect(recorded.completions[0]).toMatchObject({ inputTokens: 11, outputTokens: 7 })
    expect(recorded.rows().every((row) => row.status === 'completed')).toBe(true)
    expect(recorded.rows().every((row) => (row.actual ?? 0) <= row.reserved)).toBe(true)
    const order = events[0] === 'call:description' && recorded.reserves[0]?.requestType === 'nutrition_description'
    expect(order).toBe(true)
    const before = recordingLedger()
    const sequence: string[] = []
    await runNutritionGeminiAttempt(CONFIG, request('description'), {
      ledger: before.ledger,
      usageConfig: shared,
      now: () => NOW,
      call: async () => {
        sequence.push(before.rows().length === 1 ? 'after-reserve' : 'before-reserve')
        return result('{"ok":true}')
      },
    })
    expect(sequence).toEqual(['after-reserve'])
  })

  it('denies budget and rate before any provider call and maps description denial to 429', async () => {
    const budget = recordingLedger()
    let calls = 0
    await expect(
      runNutritionGeminiAttempt(CONFIG, request('description'), {
        ledger: budget.ledger,
        usageConfig: usageConfig({ monthlyBudgetUsd: 0, minIntervalMs: 0 }),
        now: () => NOW,
        call: async () => {
          calls += 1
          return result('{}')
        },
      }),
    ).rejects.toMatchObject({ code: AI_BUDGET_REACHED })
    expect(calls).toBe(0)
    expect(budget.rows()).toHaveLength(0)
    expect(interpretErrorToHttp(new NutritionInterpretError(AI_BUDGET_REACHED, 'budget'), 'description').statusCode).toBe(429)

    const rate = recordingLedger()
    await rate.ledger.reserve({
      requestType: 'ask_health',
      provider: 'gemini',
      model: 'other',
      requestHash: 'abc',
      reservedCostUsd: 0.01,
      now: NOW,
      budgetUsd: 3,
      minIntervalMs: 1_500,
      maxPerMinute: 8,
    })
    await expect(
      runNutritionGeminiAttempt(CONFIG, request('meal_photo'), {
        ledger: rate.ledger,
        usageConfig: usageConfig({ minIntervalMs: 1_500 }),
        now: () => NOW,
        call: async () => {
          calls += 1
          return result('{}')
        },
      }),
    ).rejects.toMatchObject({ code: AI_RATE_LIMITED })
    expect(calls).toBe(0)
    expect(interpretErrorToHttp(new NutritionInterpretError(AI_RATE_LIMITED, 'rate'), 'description').statusCode).toBe(429)
    expect(AI_BUDGET_REACHED).not.toBe('GEMINI_QUOTA')
    expect(AI_RATE_LIMITED).not.toBe('GEMINI_QUOTA')
  })

  it('fails a claimed meal or label job when the local gate denies the attempt', async () => {
    async function denied(kind: 'meal_photo' | 'nutrition_label', code: string) {
      const finishes: Array<{ status: string; failureCode?: string | null }> = []
      let status = 'processing'
      const interpreter = new GeminiNutritionInterpreter({
        model: 'meal-model',
        labelModel: 'label-model',
        generate: async () => {
          throw new NutritionInterpretError(code, code === AI_BUDGET_REACHED ? "This month's AI budget is used up." : 'AI requests are coming too quickly. Try again in a moment.')
        },
      })
      const job = queuedJob(kind)
      const ready = await advanceGeminiCapture(job, {
        claimCaptureJob: async () => true,
        getCaptureImage: async () => ({ bytes: Uint8Array.from([1, 2, 3]), mimeType: 'image/jpeg' }),
        finishCaptureInterpretation: async (input) => {
          finishes.push({ status: input.status, failureCode: input.metadata.failureCode })
          status = input.status
        },
        getLabelJobRecord: async () => ({
          ...job,
          status: status === 'failed' ? 'failed' : 'processing',
          interpretation: { failureCode: finishes.at(-1)?.failureCode },
        }),
        createInterpreter: async () => interpreter,
      })
      expect(finishes).toEqual([{ status: 'failed', failureCode: code }])
      expect(ready.status).toBe('failed')
      expect(status).toBe('failed')
    }
    await denied('meal_photo', AI_BUDGET_REACHED)
    await denied('nutrition_label', AI_RATE_LIMITED)
    expect(isMealRetryCode(AI_BUDGET_REACHED)).toBe(true)
    expect(isLabelRetryCode(AI_RATE_LIMITED)).toBe(true)
  })

  it('keeps Home-AI and a missing Gemini configuration off the ledger', async () => {
    const recorded = recordingLedger()
    let called = false
    await advanceGeminiCapture(
      { ...queuedJob('meal_photo'), provider: 'home_ai' },
      {
        createInterpreter: async () => {
          called = true
          throw new Error('should not run')
        },
      },
    )
    expect(called).toBe(false)
    expect(recorded.rows()).toHaveLength(0)
    await expect(getGeminiConfig({ GEMINI_API_KEY: '' })).rejects.toMatchObject({ code: 'GEMINI_NOT_CONFIGURED' })
    const factory = readFileSync('server/integrations/gemini/client.ts', 'utf8')
    expect(factory.indexOf('await getGeminiConfig()')).toBeLessThan(factory.indexOf('runNutritionGeminiAttempt(config'))
    expect(factory).not.toContain('ai_usage')
    const released = recordingLedger()
    await expect(
      runNutritionGeminiAttempt(CONFIG, request('description'), {
        ledger: released.ledger,
        usageConfig: usageConfig({ minIntervalMs: 0 }),
        now: () => NOW,
        call: async () => {
          throw new NutritionInterpretError('GEMINI_NOT_CONFIGURED', 'Meal analysis is temporarily unavailable.')
        },
      }),
    ).rejects.toMatchObject({ code: 'GEMINI_NOT_CONFIGURED' })
    expect(released.rows()[0]?.status).toBe('released')
    const home = readFileSync('server/nutrition/description-interpreter.ts', 'utf8')
    const homeFn = home.slice(home.indexOf('export async function homeAiFoodDescriptionInterpreter'))
    expect(homeFn).not.toContain('runNutritionGeminiAttempt')
    expect(homeFn).not.toContain('ai_usage')
    expect(readFileSync('server/integrations/home-ai/client.ts', 'utf8')).not.toContain('ai_usage')
    const meal = readFileSync('server/nutrition/meal.ts', 'utf8')
    expect(meal).toContain("input.provider === 'home_ai'")
    expect(meal).toContain('createHomeAiMealJob')
  })

  it('completes unusable returned output, and marks an in-flight provider failure uncertain', async () => {
    const shared = usageConfig({ minIntervalMs: 0 })
    const invalid = recordingLedger()
    const interpreter = new GeminiNutritionInterpreter({
      model: 'meal-model',
      descriptionModel: 'desc-model',
      labelModel: 'label-model',
      generate: (next) =>
        runNutritionGeminiAttempt(CONFIG, next, {
          ledger: invalid.ledger,
          usageConfig: shared,
          now: () => NOW + invalid.rows().length,
          call: async () => result('{'),
        }),
    })
    await expect(interpreter.interpretMealPhoto({ image: Uint8Array.from([1]), mimeType: 'image/jpeg', userContext: null })).rejects.toMatchObject({
      code: 'GEMINI_SCHEMA',
    })
    expect(invalid.rows()[0]?.status).toBe('completed')

    const semantic = recordingLedger()
    const semanticInterpreter = new GeminiNutritionInterpreter({
      model: 'meal-model',
      generate: (next) =>
        runNutritionGeminiAttempt(CONFIG, next, {
          ledger: semantic.ledger,
          usageConfig: shared,
          now: () => NOW + 10,
          call: async () => result(mealJson(0)),
        }),
    })
    await expect(semanticInterpreter.interpretMealPhoto({ image: Uint8Array.from([1]), mimeType: 'image/jpeg', userContext: null })).rejects.toMatchObject({
      code: 'GEMINI_SEMANTIC',
    })
    expect(semantic.rows()[0]?.status).toBe('completed')

    const empty = recordingLedger()
    await expect(
      runNutritionGeminiAttempt(CONFIG, request('nutrition_label'), {
        ledger: empty.ledger,
        usageConfig: shared,
        now: () => NOW + 20,
        call: async () => {
          throw new NutritionInterpretError('GEMINI_SCHEMA', 'empty')
        },
      }),
    ).rejects.toMatchObject({ code: 'GEMINI_SCHEMA' })
    expect(empty.rows()[0]?.status).toBe('completed')

    const timeout = recordingLedger()
    await expect(
      runNutritionGeminiAttempt(CONFIG, request('description'), {
        ledger: timeout.ledger,
        usageConfig: shared,
        now: () => NOW + 30,
        call: async () => {
          throw Object.assign(new Error('timed out'), { status: 408 })
        },
      }),
    ).rejects.toThrow(/timed out/)
    expect(timeout.rows()[0]?.status).toBe('uncertain')

    const provider = recordingLedger()
    await expect(
      runNutritionGeminiAttempt(CONFIG, request('meal_photo'), {
        ledger: provider.ledger,
        usageConfig: shared,
        now: () => NOW + 40,
        call: async () => {
          throw Object.assign(new Error('provider down'), { status: 500 })
        },
      }),
    ).rejects.toThrow(/provider down/)
    expect(provider.rows()[0]?.status).toBe('uncertain')

    const priced = recordingLedger()
    await runNutritionGeminiAttempt(CONFIG, request('description'), {
      ledger: priced.ledger,
      usageConfig: usageConfig({ minIntervalMs: 0, nutritionDescriptionMaxRequestCostUsd: 0.05 }),
      now: () => NOW + 50,
      call: async () => result('{"ok":true}', { input: 10_000_000, output: 10_000_000 }),
    })
    expect(priced.completions[0]?.inputTokens).toBe(10_000_000)
    expect(priced.completions[0]?.outputTokens).toBe(10_000_000)
    expect(priced.rows()[0]?.actual).toBe(0.05)
  })

  it('stores a digest, gives every retry its own reservation, and keeps schema failures from a new retry', async () => {
    const hash = nutritionGeminiRequestHash({
      requestType: 'nutrition_description',
      model: 'desc-model',
      prompt: foodDescriptionPrompt('two eggs and SECRET_TEXT'),
    })
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).not.toContain('SECRET_TEXT')
    expect(hash).not.toContain('secret-file.jpg')
    const firstImage = nutritionGeminiRequestHash({
      requestType: 'nutrition_meal_photo',
      model: 'meal-model',
      prompt: 'plate',
      imageBase64: Buffer.from('one').toString('base64'),
    })
    const secondImage = nutritionGeminiRequestHash({
      requestType: 'nutrition_meal_photo',
      model: 'meal-model',
      prompt: 'plate',
      imageBase64: Buffer.from('two').toString('base64'),
    })
    expect(firstImage).not.toBe(secondImage)

    const shared = usageConfig({ minIntervalMs: 0, monthlyBudgetUsd: 3 })
    const retried = recordingLedger()
    let calls = 0
    await withGeminiRetry(() =>
      runNutritionGeminiAttempt(CONFIG, request('description'), {
        ledger: retried.ledger,
        usageConfig: shared,
        now: () => NOW + calls,
        call: async () => {
          calls += 1
          if (calls === 1) {
            throw Object.assign(new Error('unavailable'), { status: 503 })
          }
          return result('{"ok":true}')
        },
      }),
    )
    expect(calls).toBe(2)
    expect(retried.rows().map((row) => row.status)).toEqual(['uncertain', 'completed'])

    const rated = recordingLedger()
    let ratedCalls = 0
    await expect(
      withGeminiRetry(() =>
        runNutritionGeminiAttempt(CONFIG, request('meal_photo'), {
          ledger: rated.ledger,
          usageConfig: usageConfig({ minIntervalMs: 1_500 }),
          now: () => NOW,
          call: async () => {
            ratedCalls += 1
            throw Object.assign(new Error('unavailable'), { status: 503 })
          },
        }),
      ),
    ).rejects.toMatchObject({ code: AI_RATE_LIMITED })
    expect(ratedCalls).toBe(1)
    expect(rated.rows().map((row) => row.status)).toEqual(['uncertain'])

    const blocked = recordingLedger()
    let blockedCalls = 0
    await expect(
      withGeminiRetry(() =>
        runNutritionGeminiAttempt(CONFIG, request('nutrition_label'), {
          ledger: blocked.ledger,
          usageConfig: usageConfig({ minIntervalMs: 0, monthlyBudgetUsd: 0.05, nutritionLabelMaxRequestCostUsd: 0.05 }),
          now: () => NOW + blockedCalls,
          call: async () => {
            blockedCalls += 1
            throw Object.assign(new Error('unavailable'), { status: 503 })
          },
        }),
      ),
    ).rejects.toMatchObject({ code: AI_BUDGET_REACHED })
    expect(blockedCalls).toBe(1)
    expect(blocked.rows()[0]?.status).toBe('uncertain')

    expect(GEMINI_AUTO_RETRY_CODES).toEqual(['GEMINI_UNAVAILABLE', 'GEMINI_QUOTA'])
    const schema = recordingLedger()
    let schemaCalls = 0
    await expect(
      withGeminiRetry(() =>
        runNutritionGeminiAttempt(CONFIG, request('description'), {
          ledger: schema.ledger,
          usageConfig: shared,
          now: () => NOW + 80,
          call: async () => {
            schemaCalls += 1
            throw new NutritionInterpretError('GEMINI_SCHEMA', 'bad json')
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'GEMINI_SCHEMA' })
    expect(schemaCalls).toBe(1)
    expect(schema.rows()).toHaveLength(1)
  })

  it('does not reserve for a finished poll or a requeue, and a later Gemini attempt does', async () => {
    let created = 0
    await advanceGeminiCapture(
      { ...queuedJob('meal_photo'), status: 'completed' },
      {
        createInterpreter: async () => {
          created += 1
          throw new Error('no')
        },
      },
    )
    expect(created).toBe(0)
    const requeue = readFileSync('server/nutrition/label-jobs.ts', 'utf8')
    const requeueStart = requeue.indexOf('export async function requeueCaptureJob')
    expect(requeue.slice(requeueStart, requeueStart + 900)).not.toContain('ai_usage')
    const meal = readFileSync('server/nutrition/meal.ts', 'utf8')
    const reanalyze = meal.slice(meal.indexOf('export async function reanalyzeNutritionMeal'), meal.indexOf('export async function dismissNutritionMealJob'))
    expect(reanalyze).toContain('requeueCaptureJob')
    expect(reanalyze).not.toContain('runNutritionGeminiAttempt')
    expect(reanalyze).not.toContain('createGeminiNutritionInterpreter')

    const recorded = recordingLedger()
    const job = queuedJob('nutrition_label')
    let savedMetadata: { provider?: string; model?: string | null; inputTokens?: number | null; outputTokens?: number | null } | undefined
    const ready = await advanceGeminiCapture(job, {
      claimCaptureJob: async () => true,
      getCaptureImage: async () => ({ bytes: Uint8Array.from([9]), mimeType: 'image/jpeg' }),
      finishCaptureInterpretation: async (input) => {
        savedMetadata = input.metadata
      },
      getLabelJobRecord: async () => ({ ...job, status: 'completed' }),
      createInterpreter: async () =>
        new GeminiNutritionInterpreter({
          model: 'label-model',
          labelModel: 'label-model',
          generate: (next) =>
            runNutritionGeminiAttempt(CONFIG, next, {
              ledger: recorded.ledger,
              usageConfig: usageConfig({ minIntervalMs: 0 }),
              now: () => NOW + 90,
              call: async () =>
                result(
                  JSON.stringify({
                    productName: 'Yogurt',
                    calories: 120,
                    proteinGrams: 12,
                    carbsGrams: 15,
                    fatGrams: 2,
                    fiberGrams: null,
                    basis: 'per_serving',
                  }),
                  { input: 4, output: 5 },
                ),
            }),
        }),
    })
    expect(recorded.reserves).toHaveLength(1)
    expect(recorded.reserves[0]?.requestType).toBe('nutrition_label')
    expect(ready.status).toBe('completed')
    expect(recorded.completions[0]).toMatchObject({ inputTokens: 4, outputTokens: 5 })
    expect(savedMetadata).toMatchObject({ provider: 'gemini', inputTokens: 4, outputTokens: 5 })
  })

  it('leaves canonical commit, backup, and the schema head unchanged', () => {
    const describe = readFileSync('server/nutrition/describe.ts', 'utf8')
    const commit = describe.slice(describe.indexOf('export async function commitFoodDescription'))
    expect(commit).not.toContain('createGeminiNutritionInterpreter')
    expect(commit).not.toContain('ai_usage')
    const inventory = readFileSync('server/backup/inventory.ts', 'utf8')
    expect(inventory).toMatch(/name: 'ai_usage'[\s\S]{0,180}portable: false/)
    expect(LATEST_SCHEMA_MIGRATION).toBe('0033_nutrition_capture_images.sql')
    expect(readdirSync('migrations').includes('0033_nutrition_capture_images.sql')).toBe(true)
    expect(readdirSync('migrations').some((name) => name.startsWith('0034'))).toBe(false)
    expect(readFileSync('server/nutrition/gemini-jobs.ts', 'utf8')).toContain('metadata: { ...interpreted.metadata, attempt: job.interpretation.attempt }')
  })
})
