import {
  sanitizeDescriptionEstimate,
  type DescriptionEstimateCandidate,
  type DescriptionEstimateInterpreter,
} from '../../src/domain/nutrition/describe.js'
import { NutritionInterpretError, descriptionFailureMessage } from '../../src/domain/nutrition/interpret.js'
import { getHomeAiConfig } from '../integrations/home-ai/config.js'
import { createGeminiNutritionInterpreter } from '../integrations/gemini/client.js'

export async function geminiFoodDescriptionInterpreter(): Promise<DescriptionEstimateInterpreter> {
  const gemini = await createGeminiNutritionInterpreter()
  return {
    async interpret(text: string): Promise<DescriptionEstimateCandidate> {
      const interpreted = await gemini.interpretFoodDescription({ text })
      return interpreted.candidate
    },
  }
}

export async function homeAiFoodDescriptionInterpreter(): Promise<DescriptionEstimateInterpreter> {
  let config: Awaited<ReturnType<typeof getHomeAiConfig>>
  try {
    config = await getHomeAiConfig()
  } catch {
    throw new NutritionInterpretError('HOME_AI_UNAVAILABLE', 'Meal analysis is temporarily unavailable.')
  }
  return {
    async interpret(text: string): Promise<DescriptionEstimateCandidate> {
      let response: Response
      try {
        response = await fetch(`${config.baseUrl}/api/nutrition/describe`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.apiKey,
          },
          body: JSON.stringify({ text }),
        })
      } catch {
        throw new NutritionInterpretError('HOME_AI_UNAVAILABLE', 'Meal analysis is temporarily unavailable.')
      }
      if (response.status === 404) {
        throw new NutritionInterpretError('HOME_AI_ROUTE_MISSING', 'Meal analysis is temporarily unavailable.')
      }
      if (response.status === 401 || response.status === 403) {
        throw new NutritionInterpretError('HOME_AI_AUTH', 'Meal analysis is temporarily unavailable.')
      }
      if (!response.ok) {
        throw new NutritionInterpretError('HOME_AI_UNAVAILABLE', 'Meal analysis is temporarily unavailable.')
      }
      const body = (await response.json().catch(() => null)) as unknown
      const candidate = sanitizeDescriptionEstimate(body && typeof body === 'object' ? body : {}, { original: text })
      if (candidate.items.length === 0 || candidate.calories <= 0) {
        throw new NutritionInterpretError('GEMINI_SEMANTIC', descriptionFailureMessage('GEMINI_SEMANTIC'))
      }
      return candidate
    },
  }
}
