import { GoogleGenAI, MediaResolution, ThinkingLevel } from '@google/genai'
import {
  GEMINI_DESCRIPTION_MAX_OUTPUT_TOKENS,
  GEMINI_DESCRIPTION_TIMEOUT_MS,
  GEMINI_LABEL_MAX_OUTPUT_TOKENS,
  GEMINI_LABEL_TIMEOUT_MS,
  GEMINI_MEAL_MAX_OUTPUT_TOKENS,
  GEMINI_MEAL_TIMEOUT_MS,
  GEMINI_RECIPE_MAX_OUTPUT_TOKENS,
  GEMINI_RECIPE_TIMEOUT_MS,
  NutritionInterpretError,
  foodDescriptionPrompt,
  interpretFoodDescriptionResponse,
  interpretMealPhotoResponse,
  interpretNutritionLabelResponse,
  isGeminiAutoRetryCode,
  MEAL_PHOTO_PROMPT_VERSION,
  mealPhotoPrompt,
  nutritionLabelPrompt,
  type InterpretationMetadata,
} from '../../../src/domain/nutrition/interpret.js'
import type { DescriptionEstimateCandidate } from '../../../src/domain/nutrition/describe.js'
import type { MealEstimateCandidate } from '../../../src/domain/nutrition/meal.js'
import type { NutritionLabelCandidate } from '../../../src/domain/nutrition/label.js'
import { getGeminiConfig, type GeminiConfig } from './config.js'
import { runNutritionGeminiAttempt, type NutritionGeminiAttemptDeps } from '../../nutrition/gemini-usage.js'
import type { NutritionGeminiUsageKind } from '../../../src/domain/nutrition/interpret.js'

export type GeminiGenerateRequest = {
  model: string
  prompt: string
  timeoutMs: number
  maxOutputTokens: number
  mediaResolution?: MediaResolution
  image?: { mimeType: string; base64: string }
  images?: Array<{ mimeType: string; base64: string }>
  usageKind?: NutritionGeminiUsageKind
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
export type InterpretedDescription = { candidate: DescriptionEstimateCandidate; metadata: InterpretationMetadata }

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
  private readonly recipeModel: string

  constructor(options: { generate: GeminiGenerate; model: string; descriptionModel?: string; labelModel?: string; recipeModel?: string }) {
    this.generate = options.generate
    this.model = options.model
    this.descriptionModel = options.descriptionModel ?? options.model
    this.labelModel = options.labelModel ?? options.model
    this.recipeModel = options.recipeModel ?? options.descriptionModel ?? options.model
  }

  async interpretMealPhoto(input: {
    image?: Uint8Array
    mimeType?: string
    images?: Array<{ image: Uint8Array; mimeType: string }>
    userContext: string | null
  }): Promise<InterpretedMeal> {
    const images =
      input.images && input.images.length > 0
        ? input.images
        : input.image && input.mimeType
          ? [{ image: input.image, mimeType: input.mimeType }]
          : []
    const result = await this.generate({
      model: this.model,
      prompt: mealPhotoPrompt(input.userContext, images.length),
      timeoutMs: GEMINI_MEAL_TIMEOUT_MS,
      maxOutputTokens: GEMINI_MEAL_MAX_OUTPUT_TOKENS,
      usageKind: 'meal_photo',
      images: images.map((item) => ({ mimeType: item.mimeType, base64: Buffer.from(item.image).toString('base64') })),
    })
    return {
      candidate: interpretMealPhotoResponse(result.text, input.userContext, result.model),
      metadata: { ...metadataFrom(result), promptVersion: MEAL_PHOTO_PROMPT_VERSION },
    }
  }

  async interpretFoodDescription(input: { text: string }): Promise<InterpretedDescription> {
    const result = await this.generate({
      model: this.descriptionModel,
      prompt: foodDescriptionPrompt(input.text),
      timeoutMs: GEMINI_DESCRIPTION_TIMEOUT_MS,
      maxOutputTokens: GEMINI_DESCRIPTION_MAX_OUTPUT_TOKENS,
      usageKind: 'description',
    })
    return {
      candidate: interpretFoodDescriptionResponse(result.text, input.text.trim()),
      metadata: metadataFrom(result),
    }
  }

  async interpretRecipeAssist(input: { prompt: string }): Promise<{ text: string; model: string }> {
    const result = await this.generate({
      model: this.recipeModel,
      prompt: input.prompt,
      timeoutMs: GEMINI_RECIPE_TIMEOUT_MS,
      maxOutputTokens: GEMINI_RECIPE_MAX_OUTPUT_TOKENS,
      usageKind: 'recipe_assist',
    })
    return { text: result.text, model: result.model }
  }

  async interpretNutritionLabel(input: { image: Uint8Array; mimeType: string; userContext: string | null }): Promise<InterpretedLabel> {
    const result = await this.generate({
      model: this.labelModel,
      prompt: nutritionLabelPrompt(input.userContext),
      timeoutMs: GEMINI_LABEL_TIMEOUT_MS,
      maxOutputTokens: GEMINI_LABEL_MAX_OUTPUT_TOKENS,
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
      usageKind: 'nutrition_label',
      image: { mimeType: input.mimeType, base64: Buffer.from(input.image).toString('base64') },
    })
    return {
      candidate: interpretNutritionLabelResponse(result.text, input.userContext, result.model),
      metadata: metadataFrom(result),
    }
  }
}

export async function createGeminiNutritionInterpreter(deps?: Omit<NutritionGeminiAttemptDeps, 'call'>): Promise<GeminiNutritionInterpreter> {
  const config = await getGeminiConfig()
  return new GeminiNutritionInterpreter({
    model: config.mealModel,
    descriptionModel: config.descriptionModel,
    labelModel: config.labelModel,
    recipeModel: config.recipeModel,
    generate: (request) =>
      withGeminiRetry(() =>
        runNutritionGeminiAttempt(config, request, {
          ...deps,
          call: (active, next) => generateOnce(active, { ...next, usageKind: next.usageKind }),
        }),
      ),
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
  const images = request.images ?? (request.image ? [request.image] : [])
  const parts = geminiInlineParts(request.prompt, images)
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

export function geminiInlineParts(
  prompt: string,
  images: Array<{ mimeType: string; base64: string }>,
): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  return [{ text: prompt }, ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.base64 } }))]
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
