import {
  parseRecipeAssistModelOutput,
  parseRecipeAssistRequest,
  recipeAssistFailureMessage,
  recipeAssistPrompt,
  recipeAssistSourcePacket,
  type RecipeAssistDraft,
} from '../../src/domain/nutrition/recipe-assist.js'
import { NutritionInterpretError } from '../../src/domain/nutrition/interpret.js'
import { HttpError } from '../http.js'
import { getGeminiConfig } from '../integrations/gemini/config.js'
import { createGeminiNutritionInterpreter } from '../integrations/gemini/client.js'

export type RecipeAssistInterpreter = (input: { prompt: string }) => Promise<{ text: string }>

export async function draftRecipeAssist(
  body: unknown,
  deps?: {
    interpret?: RecipeAssistInterpreter
    createId?: () => string
    env?: NodeJS.ProcessEnv
  },
): Promise<RecipeAssistDraft> {
  const request = parseRecipeAssistRequest(body)
  if ('error' in request) {
    throw new HttpError(400, request.error, undefined, request.code)
  }
  const packet = recipeAssistSourcePacket(request.text)
  if ('error' in packet) {
    throw new HttpError(400, packet.error, undefined, packet.code)
  }
  const prompt = recipeAssistPrompt(packet.lines)
  let generated: { text: string }
  try {
    const interpret = deps?.interpret ?? (await geminiRecipeAssist(deps?.env))
    generated = await interpret({ prompt })
  } catch (error) {
    throw recipeAssistHttpError(error)
  }
  try {
    return parseRecipeAssistModelOutput(generated.text, packet.lines, deps?.createId)
  } catch (error) {
    throw recipeAssistHttpError(error)
  }
}

async function geminiRecipeAssist(env?: NodeJS.ProcessEnv): Promise<RecipeAssistInterpreter> {
  await getGeminiConfig(env)
  const gemini = await createGeminiNutritionInterpreter()
  return (input) => gemini.interpretRecipeAssist(input)
}

function recipeAssistHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error
  if (error instanceof NutritionInterpretError) {
    const status =
      error.code === 'AI_BUDGET_REACHED' || error.code === 'AI_RATE_LIMITED'
        ? 429
        : error.code === 'GEMINI_NOT_CONFIGURED'
          ? 503
          : 502
    return new HttpError(status, recipeAssistFailureMessage(error.code), undefined, error.code)
  }
  return new HttpError(502, recipeAssistFailureMessage('GEMINI_UNAVAILABLE'), undefined, 'GEMINI_UNAVAILABLE')
}
