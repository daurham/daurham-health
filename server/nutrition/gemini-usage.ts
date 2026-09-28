import { createHash } from 'node:crypto'
import {
  AI_BUDGET_REACHED,
  AI_RATE_LIMITED,
  NUTRITION_GEMINI_REQUEST_TYPES,
  NutritionInterpretError,
  nutritionBudgetMessage,
  nutritionRateMessage,
  type NutritionGeminiUsageKind,
} from '../../src/domain/nutrition/interpret.js'
import { readAiUsageConfig, type AiUsageConfig } from '../ai-usage/config.js'
import { boundedProviderCostUsd } from '../ai-usage/cost.js'
import { createSqlAiUsageLedger, neonAiUsageSession, type AiUsageLedger } from '../ai-usage/ledger.js'
import type { GeminiConfig } from '../integrations/gemini/config.js'

export type NutritionGeminiRequest = {
  model: string
  prompt: string
  timeoutMs: number
  maxOutputTokens: number
  usageKind?: NutritionGeminiUsageKind
  image?: { mimeType: string; base64: string }
}

export type NutritionGeminiResult = {
  text: string
  model: string
  latencyMs: number
  inputTokens: number | null
  outputTokens: number | null
  thinkingTokens: number | null
  providerRequestId: string | null
}

export type NutritionGeminiCall = (config: GeminiConfig, request: NutritionGeminiRequest) => Promise<NutritionGeminiResult>

export type NutritionGeminiAttemptDeps = {
  call: NutritionGeminiCall
  ledger?: AiUsageLedger
  now?: () => number
  usageConfig?: AiUsageConfig
}

export function nutritionGeminiRequestHash(input: {
  requestType: string
  model: string
  prompt: string
  imageBase64?: string | null
}): string {
  const imageDigest = input.imageBase64
    ? createHash('sha256').update(Buffer.from(input.imageBase64, 'base64')).digest('hex')
    : ''
  return createHash('sha256').update([input.requestType, input.model, input.prompt, imageDigest].join('\n')).digest('hex')
}

export function nutritionGeminiReservedUsd(config: AiUsageConfig, kind: NutritionGeminiUsageKind): number {
  if (kind === 'description') {
    return config.nutritionDescriptionMaxRequestCostUsd
  }
  if (kind === 'meal_photo') {
    return config.nutritionMealMaxRequestCostUsd
  }
  return config.nutritionLabelMaxRequestCostUsd
}

export async function runNutritionGeminiAttempt(
  config: GeminiConfig,
  request: NutritionGeminiRequest,
  deps: NutritionGeminiAttemptDeps,
): Promise<NutritionGeminiResult> {
  const kind = request.usageKind
  if (kind !== 'description' && kind !== 'meal_photo' && kind !== 'nutrition_label') {
    throw new NutritionInterpretError('GEMINI_UNAVAILABLE', 'Meal analysis is temporarily unavailable.')
  }
  const usageConfig = deps.usageConfig ?? readAiUsageConfig()
  const ledger = deps.ledger ?? createSqlAiUsageLedger(neonAiUsageSession())
  const now = deps.now?.() ?? Date.now()
  const requestType = NUTRITION_GEMINI_REQUEST_TYPES[kind]
  const reservedCostUsd = nutritionGeminiReservedUsd(usageConfig, kind)
  const requestHash = nutritionGeminiRequestHash({
    requestType,
    model: request.model,
    prompt: request.prompt,
    imageBase64: request.image?.base64,
  })
  let reserved: Awaited<ReturnType<AiUsageLedger['reserve']>>
  try {
    reserved = await ledger.reserve({
      requestType,
      provider: 'gemini',
      model: request.model,
      requestHash,
      reservedCostUsd,
      now,
      budgetUsd: usageConfig.monthlyBudgetUsd,
      minIntervalMs: usageConfig.minIntervalMs,
      maxPerMinute: usageConfig.maxPerMinute,
    })
  } catch {
    throw new NutritionInterpretError('GEMINI_UNAVAILABLE', 'Meal analysis is temporarily unavailable.')
  }
  if (!reserved.ok) {
    throw new NutritionInterpretError(
      reserved.reason === 'budget' ? AI_BUDGET_REACHED : AI_RATE_LIMITED,
      reserved.reason === 'budget' ? nutritionBudgetMessage() : nutritionRateMessage(),
    )
  }
  try {
    const result = await deps.call(config, request)
    await ledger.complete(reserved.id, actualCost(result, reservedCostUsd), result.inputTokens, result.outputTokens, deps.now?.() ?? Date.now())
    return result
  } catch (error) {
    if (isReturnedUnusable(error)) {
      await ledger.complete(reserved.id, null, null, null, deps.now?.() ?? Date.now())
    } else if (isUnconfigured(error)) {
      await ledger.release(reserved.id, deps.now?.() ?? Date.now())
    } else {
      await ledger.uncertain(reserved.id, deps.now?.() ?? Date.now())
    }
    throw error
  }
}

function actualCost(result: NutritionGeminiResult, reservedCostUsd: number): number | null {
  if (result.inputTokens == null && result.outputTokens == null) {
    return null
  }
  return boundedProviderCostUsd(result.inputTokens, result.outputTokens, reservedCostUsd)
}

function isReturnedUnusable(error: unknown): boolean {
  return error instanceof NutritionInterpretError && (error.code === 'GEMINI_SCHEMA' || error.code === 'GEMINI_SEMANTIC')
}

function isUnconfigured(error: unknown): boolean {
  return error instanceof NutritionInterpretError && error.code === 'GEMINI_NOT_CONFIGURED'
}
