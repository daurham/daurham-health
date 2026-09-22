import { GoogleGenAI, MediaResolution, ThinkingLevel } from '@google/genai'
import {
  GEMINI_DESCRIPTION_MAX_OUTPUT_TOKENS,
  GEMINI_DESCRIPTION_TIMEOUT_MS,
  GEMINI_LABEL_MAX_OUTPUT_TOKENS,
  GEMINI_LABEL_TIMEOUT_MS,
  GEMINI_MEAL_MAX_OUTPUT_TOKENS,
  GEMINI_MEAL_TIMEOUT_MS,
  NutritionInterpretError,
  foodDescriptionPrompt,
  interpretFoodDescriptionResponse,
  interpretMealPhotoResponse,
  interpretNutritionLabelResponse,
  isGeminiAutoRetryCode,
  mealPhotoPrompt,
  nutritionLabelPrompt,
  type InterpretationMetadata,
} from '../../../src/domain/nutrition/interpret.js'
import type { FoodDescriptionCandidate } from '../../../src/domain/nutrition/describe.js'
import type { MealEstimateCandidate } from '../../../src/domain/nutrition/meal.js'
import type { NutritionLabelCandidate } from '../../../src/domain/nutrition/label.js'
import { getGeminiConfig, type GeminiConfig } from './config.js'

export type GeminiGenerateRequest = {
  model: string
  prompt: string
  timeoutMs: number
  maxOutputTokens: number
  mediaResolution?: MediaResolution
  image?: { mimeType: string; base64: string }
}

export type GeminiGenerateResult = {
  text: string
  model: string
  latencyMs: number
  inputTokens: number | null
  outputTokens: number | null
  thinkingTokens: number | null
  providerRequestId: string | null
}

export type GeminiGenerate = (request: GeminiGenerateRequest) => Promise<GeminiGenerateResult>

export type InterpretedMeal = { candidate: MealEstimateCandidate; metadata: InterpretationMetadata }
export type InterpretedLabel = { candidate: NutritionLabelCandidate; metadata: InterpretationMetadata }
export type InterpretedDescription = { candidate: FoodDescriptionCandidate; metadata: InterpretationMetadata }

export function classifyGeminiError(error: unknown): string {
  if (error instanceof NutritionInterpretError) {
    return error.code
  }
  const message = error instanceof Error ? error.message : ''
  const status = statusFrom(error)
  if (status === 401 || status === 403 || /api[_ ]?key|unauth|permission denied/i.test(message)) {
    return 'GEMINI_AUTH'
  }
  if (status === 429 || /resource_exhausted|quota|rate limit/i.test(message)) {
    return 'GEMINI_QUOTA'
  }
  if (status === 400) {
    return 'GEMINI_SCHEMA'
  }
  if (status === 408 || /timeout|timed out|deadline|etimedout|abort/i.test(message)) {
    return 'GEMINI_TIMEOUT'
  }
  if (/not configured/i.test(message)) {
    return 'GEMINI_NOT_CONFIGURED'
  }
  return 'GEMINI_UNAVAILABLE'
}

export async function withGeminiRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    const code = classifyGeminiError(error)
    if (!isGeminiAutoRetryCode(code)) {
      throw error instanceof NutritionInterpretError ? error : new NutritionInterpretError(code, 'Meal analysis is temporarily unavailable.')
    }
    try {
      return await run()
    } catch (retryError) {
      const retryCode = classifyGeminiError(retryError)
      throw retryError instanceof NutritionInterpretError
        ? retryError
        : new NutritionInterpretError(retryCode, 'Meal analysis is temporarily unavailable.')
    }
  }
}

export class GeminiNutritionInterpreter {
  private readonly generate: GeminiGenerate
  private readonly model: string
  private readonly descriptionModel: string
  private readonly labelModel: string

  constructor(options: { generate: GeminiGenerate; model: string; descriptionModel?: string; labelModel?: string }) {
    this.generate = options.generate
    this.model = options.model
    this.descriptionModel = options.descriptionModel ?? options.model
    this.labelModel = options.labelModel ?? options.model
  }

  async interpretMealPhoto(input: { image: Uint8Array; mimeType: string; userContext: string | null }): Promise<InterpretedMeal> {
    const result = await this.generate({
      model: this.model,
      prompt: mealPhotoPrompt(input.userContext),
      timeoutMs: GEMINI_MEAL_TIMEOUT_MS,
      maxOutputTokens: GEMINI_MEAL_MAX_OUTPUT_TOKENS,
      image: { mimeType: input.mimeType, base64: Buffer.from(input.image).toString('base64') },
    })
    return {
      candidate: interpretMealPhotoResponse(result.text, input.userContext, result.model),
      metadata: metadataFrom(result),
    }
  }

  async interpretFoodDescription(input: { text: string }): Promise<InterpretedDescription> {
    const result = await this.generate({
      model: this.descriptionModel,
      prompt: foodDescriptionPrompt(input.text),
      timeoutMs: GEMINI_DESCRIPTION_TIMEOUT_MS,
      maxOutputTokens: GEMINI_DESCRIPTION_MAX_OUTPUT_TOKENS,
    })
    return {
      candidate: interpretFoodDescriptionResponse(result.text, input.text.trim()),
      metadata: metadataFrom(result),
    }
  }

  async interpretNutritionLabel(input: { image: Uint8Array; mimeType: string; userContext: string | null }): Promise<InterpretedLabel> {
    const result = await this.generate({
      model: this.labelModel,
      prompt: nutritionLabelPrompt(input.userContext),
      timeoutMs: GEMINI_LABEL_TIMEOUT_MS,
      maxOutputTokens: GEMINI_LABEL_MAX_OUTPUT_TOKENS,
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
      image: { mimeType: input.mimeType, base64: Buffer.from(input.image).toString('base64') },
    })
    return {
      candidate: interpretNutritionLabelResponse(result.text, input.userContext, result.model),
      metadata: metadataFrom(result),
    }
  }
}

export async function createGeminiNutritionInterpreter(): Promise<GeminiNutritionInterpreter> {
  const config = await getGeminiConfig()
  return new GeminiNutritionInterpreter({
    model: config.mealModel,
    descriptionModel: config.descriptionModel,
    labelModel: config.labelModel,
    generate: (request) => generateWithGemini(config, request),
  })
}

export async function generateWithGemini(config: GeminiConfig, request: GeminiGenerateRequest): Promise<GeminiGenerateResult> {
  return withGeminiRetry(() => generateOnce(config, request))
}

async function generateOnce(config: GeminiConfig, request: GeminiGenerateRequest): Promise<GeminiGenerateResult> {
  const httpOptions = {
    timeout: request.timeoutMs,
    retryOptions: { attempts: 1 },
  }
  const ai = new GoogleGenAI({ apiKey: config.apiKey, httpOptions })
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: request.prompt }]
  if (request.image) {
    parts.push({ inlineData: { mimeType: request.image.mimeType, data: request.image.base64 } })
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), request.timeoutMs)
  const started = Date.now()
  try {
    const response = await ai.models.generateContent({
      model: request.model,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        maxOutputTokens: request.maxOutputTokens,
        mediaResolution: request.mediaResolution,
        abortSignal: controller.signal,
        httpOptions,
      },
    })
    const text = typeof response.text === 'string' ? response.text : ''
    if (!text.trim()) {
      throw new NutritionInterpretError('GEMINI_SCHEMA', "We couldn't confidently interpret this meal.")
    }
    const usage = response.usageMetadata
    return {
      text,
      model: request.model,
      latencyMs: Date.now() - started,
      inputTokens: typeof usage?.promptTokenCount === 'number' ? usage.promptTokenCount : null,
      outputTokens: typeof usage?.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : null,
      thinkingTokens: typeof usage?.thoughtsTokenCount === 'number' ? usage.thoughtsTokenCount : null,
      providerRequestId: typeof response.responseId === 'string' ? response.responseId : null,
    }
  } catch (error) {
    if (error instanceof NutritionInterpretError) {
      throw error
    }
    const code = classifyGeminiError(error)
    if (code === 'GEMINI_QUOTA') {
      console.error('gemini failure code=GEMINI_QUOTA provider_status=rate_limited')
    } else {
      console.error(`gemini failure code=${code}`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function metadataFrom(result: GeminiGenerateResult): InterpretationMetadata {
  return {
    provider: 'gemini',
    model: result.model,
    latencyMs: result.latencyMs,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    thinkingTokens: result.thinkingTokens,
    providerRequestId: result.providerRequestId,
  }
}

function statusFrom(error: unknown): number {
  if (!error || typeof error !== 'object') {
    return 0
  }
  if ('status' in error && typeof error.status === 'number') {
    return error.status
  }
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode
  }
  return 0
}
