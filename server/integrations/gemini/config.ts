import {
  GEMINI_DESCRIPTION_MODEL_DEFAULT,
  GEMINI_LABEL_MODEL_DEFAULT,
  GEMINI_MEAL_MODEL_DEFAULT,
  NutritionInterpretError,
} from '../../../src/domain/nutrition/interpret.js'
import { loadLocalEnv } from '../../env.js'

export type GeminiConfig = {
  apiKey: string
  descriptionModel: string
  mealModel: string
  labelModel: string
}

export async function getGeminiConfig(env: NodeJS.ProcessEnv = process.env): Promise<GeminiConfig> {
  await loadLocalEnv()
  const apiKey = env.GEMINI_API_KEY?.trim() ?? ''
  if (!apiKey || apiKey.toLowerCase().includes('vite_')) {
    throw new NutritionInterpretError('GEMINI_NOT_CONFIGURED', 'Meal analysis is temporarily unavailable.')
  }
  const fallback = env.GEMINI_NUTRITION_MODEL?.trim() || ''
  return {
    apiKey,
    descriptionModel: env.GEMINI_NUTRITION_DESCRIPTION_MODEL?.trim() || fallback || GEMINI_DESCRIPTION_MODEL_DEFAULT,
    mealModel: env.GEMINI_NUTRITION_MEAL_MODEL?.trim() || fallback || GEMINI_MEAL_MODEL_DEFAULT,
    labelModel: env.GEMINI_NUTRITION_LABEL_MODEL?.trim() || fallback || GEMINI_LABEL_MODEL_DEFAULT,
  }
}
