import { ASK_BLOCK_MAX, ASK_BLOCK_TEXT_MAX } from '../../src/domain/ask-health/config.js'
import { GEMINI_NUTRITION_MODEL_DEFAULT } from '../../src/domain/nutrition/interpret.js'
import { getGeminiConfig } from '../integrations/gemini/config.js'
import { classifyGeminiError, generateWithGemini } from '../integrations/gemini/client.js'

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
  const request = {
    model: input.model,
    prompt: `${input.system}\n\n${input.user}`,
    timeoutMs: 30_000,
    maxOutputTokens: 1200,
  }
  let result
  try {
    result = await generateWithGemini(config, {
      ...request,
      responseJsonSchema: askHealthResponseSchema(),
    })
  } catch (error) {
    if (classifyGeminiError(error) !== 'GEMINI_SCHEMA') {
      throw error
    }
    // Keep Ask Health usable if Gemini rejects a structured-output schema.
    // JSON mode plus local validation is a safer fallback than failing the whole question.
    result = await generateWithGemini(config, request)
  }
  return {
    text: result.text,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  }
}


function askHealthResponseSchema(): Record<string, unknown> {
  const evidenceRef = {
    type: 'string',
    description: 'Use an evidence id exactly as it appears in EVIDENCE. Leave the array empty for general health context that is not a claim about the owner.',
  }
  const factualBlock = {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: { type: 'string', description: `Concise evidence-grounded explanation. Keep under ${ASK_BLOCK_TEXT_MAX} characters.` },
      evidence_refs: {
        type: 'array',
        items: evidenceRef,
      },
    },
    required: ['text', 'evidence_refs'],
  }
  const limitationBlock = {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: { type: 'string', description: `Concise limitation or uncertainty. Keep under ${ASK_BLOCK_TEXT_MAX} characters.` },
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
        items: { type: 'string', description: 'Short optional follow-up question, under 160 characters.' },
      },
    },
    required: ['blocks', 'limitations', 'follow_ups'],
  }
}
