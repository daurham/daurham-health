import { GEMINI_NUTRITION_MODEL_DEFAULT } from '../../src/domain/nutrition/interpret.js'
import { getGeminiConfig } from '../integrations/gemini/config.js'
import { generateWithGemini } from '../integrations/gemini/client.js'

export function literatureModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.AI_LITERATURE_MODEL?.trim() || env.AI_ASK_HEALTH_MODEL?.trim() || env.GEMINI_NUTRITION_MODEL?.trim() || GEMINI_NUTRITION_MODEL_DEFAULT
}

export async function literatureGemini(input: { system: string; user: string; model: string }): Promise<{
  text: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
}> {
  const config = await getGeminiConfig()
  const result = await generateWithGemini(config, {
    model: input.model,
    prompt: `${input.system}\n\n${input.user}`,
    timeoutMs: 30_000,
    maxOutputTokens: 700,
  })
  return {
    text: result.text,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  }
}
