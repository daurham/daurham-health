import { ASK_BLOCK_MAX, ASK_BLOCK_TEXT_MAX } from '../../src/domain/ask-health/config.js'
import { GEMINI_NUTRITION_MODEL_DEFAULT } from '../../src/domain/nutrition/interpret.js'
import { getGeminiConfig } from '../integrations/gemini/config.js'
import { generateWithGemini } from '../integrations/gemini/client.js'

export function askHealthModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.AI_ASK_HEALTH_MODEL?.trim() || env.GEMINI_NUTRITION_MODEL?.trim() || GEMINI_NUTRITION_MODEL_DEFAULT
}

export async function askHealthGemini(input: { system: string; user: string; model: string; evidenceIds: string[] }): Promise<{
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
    maxOutputTokens: 1200,
    responseJsonSchema: askHealthResponseSchema(input.evidenceIds),
  })
  return {
    text: result.text,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  }
}


function askHealthResponseSchema(evidenceIds: string[]): Record<string, unknown> {
  const evidenceRef = {
    type: 'string',
    enum: evidenceIds,
  }
  const factualBlock = {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: { type: 'string', maxLength: ASK_BLOCK_TEXT_MAX },
      evidence_refs: {
        type: 'array',
        minItems: 1,
        items: evidenceRef,
      },
    },
    required: ['text', 'evidence_refs'],
  }
  const limitationBlock = {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: { type: 'string', maxLength: ASK_BLOCK_TEXT_MAX },
      evidence_refs: {
        type: 'array',
        items: evidenceRef,
      },
    },
    required: ['text', 'evidence_refs'],
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      blocks: {
        type: 'array',
        minItems: 1,
        maxItems: ASK_BLOCK_MAX,
        items: factualBlock,
      },
      limitations: {
        type: 'array',
        maxItems: ASK_BLOCK_MAX,
        items: limitationBlock,
      },
      follow_ups: {
        type: 'array',
        maxItems: 3,
        items: { type: 'string', maxLength: 160 },
      },
    },
    required: ['blocks', 'limitations', 'follow_ups'],
  }
}
