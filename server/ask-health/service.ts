import {
  ASK_HEALTH_PACKET_VERSION,
  ASK_HEALTH_PROMPT_VERSION,
  ASK_HEALTH_REQUEST_TYPE,
  ASK_HEALTH_SYSTEM_PROMPT,
  askHealthUserPrompt,
  buildAskHealthEvidencePacket,
  insufficientAskHealthAnswer,
  normalizeAskQuestion,
  packetFingerprintMaterial,
  packetHasSubstantiveEvidence,
  type AskHealthAnswer,
  type AskHealthPacket,
  type AskTurn,
} from '../../src/domain/ask-health/index.js'
import { validateAskHealthAnswer } from '../../src/domain/ask-health/validate.js'
import type { AskEvidence } from '../../src/domain/ask-health/types.js'
import { NutritionInterpretError } from '../../src/domain/nutrition/interpret.js'
import { boundedProviderCostUsd } from '../ai-usage/cost.js'
import { HttpError } from '../http.js'
import { askHealthCacheKey, getAskHealthGate, type AskHealthGate } from './gate.js'
import { loadAskHealthPacketInput } from './load.js'
import { classifyGeminiError } from '../integrations/gemini/client.js'
import { askHealthGemini, askHealthModel } from './provider.js'

const FAILURE = "Ask Health couldn't generate an explanation. Your Health data is unchanged."
const BUDGET = 'Ask Health unavailable — AI monthly budget reached.'
const RATE = 'Ask Health is receiving requests too quickly. Wait a moment and try again.'
const READ_FAILURE = "Ask Health couldn't read Health evidence. Your Health data is unchanged."

export type AskHealthProvider = (input: { system: string; user: string; model: string; evidenceIds: string[] }) => Promise<{
  text: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
}>

export type AskHealthResponse = {
  answer: AskHealthAnswer
  evidence: AskEvidence[]
  meta: {
    packetVersion: typeof ASK_HEALTH_PACKET_VERSION
    promptVersion: typeof ASK_HEALTH_PROMPT_VERSION
    provider: string
    model: string
    cached: boolean
    asOf: string
    lens: string
    range: string
    requestType: typeof ASK_HEALTH_REQUEST_TYPE
  }
}

export async function answerAskHealth(input: {
  question: string
  lens: AskHealthPacket['lens']
  range: AskHealthPacket['range']
  asOf: string
  conversation: AskTurn[]
  provider?: AskHealthProvider
  gate?: AskHealthGate
  model?: string
  now?: number
  generatedAt?: string
}): Promise<AskHealthResponse> {
  let packet: AskHealthPacket
  try {
    packet = buildAskHealthEvidencePacket(
      await loadAskHealthPacketInput({
        lens: input.lens,
        range: input.range,
        asOf: input.asOf,
        question: input.question,
        generatedAt: input.generatedAt ?? new Date().toISOString(),
      }),
    )
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }
    console.error('ask-health failure stage=evidence_load')
    throw new HttpError(503, READ_FAILURE, undefined, 'ASK_HEALTH_EVIDENCE_LOAD')
  }
  return explainAskHealth({
    packet,
    question: input.question,
    conversation: input.conversation,
    provider: input.provider ?? askHealthGemini,
    gate: input.gate ?? getAskHealthGate(),
    model: input.model ?? askHealthModel(),
    now: input.now,
  })
}

export async function explainAskHealth(input: {
  packet: AskHealthPacket
  question: string
  conversation: readonly AskTurn[]
  provider: AskHealthProvider
  gate: AskHealthGate
  model: string
  now?: number
}): Promise<AskHealthResponse> {
  const now = input.now ?? Date.now()
  if (input.packet.clarification) {
    const refs = input.packet.evidence.filter((item) => item.id.startsWith('training.exercise.')).map((item) => item.id)
    return responseFor(input, {
      answer: {
        blocks: [{ text: input.packet.clarification, evidenceRefs: refs.length > 0 ? refs : ['ask.range'] }],
        limitations: [],
        followUps: [],
      },
      provider: 'health',
      model: 'deterministic',
      cached: false,
    })
  }
  if (!packetHasSubstantiveEvidence(input.packet)) {
    return responseFor(input, {
      answer: insufficientAskHealthAnswer(input.packet),
      provider: 'health',
      model: 'deterministic',
      cached: false,
    })
  }
  const key = askHealthCacheKey([
    normalizeAskQuestion(input.question),
    input.packet.lens,
    input.packet.range,
    input.packet.asOf,
    packetFingerprintMaterial(input.packet),
    ASK_HEALTH_PROMPT_VERSION,
    input.model,
    JSON.stringify(input.conversation),
  ])
  let decision: Awaited<ReturnType<AskHealthGate['take']>>
  try {
    decision = await input.gate.take(key, now, input.model)
  } catch (error) {
    console.error('ask-health failure stage=usage_gate')
    throw new HttpError(503, FAILURE, undefined, 'ASK_HEALTH_USAGE_GATE')
  }
  if (!decision.ok) {
    throw new HttpError(429, decision.reason === 'budget' ? BUDGET : RATE)
  }
  if (decision.cached) {
    return {
      answer: decision.cached.answer,
      evidence: citedEvidence(input.packet, decision.cached.answer),
      meta: metaFor(input, { provider: 'gemini', model: input.model, cached: true }),
    }
  }
  let generated: Awaited<ReturnType<AskHealthProvider>>
  try {
    generated = await input.provider({
      system: ASK_HEALTH_SYSTEM_PROMPT,
      user: askHealthUserPrompt({ packet: input.packet, question: input.question, conversation: input.conversation }),
      model: input.model,
      evidenceIds: input.packet.evidence.map((item) => item.id),
    })
  } catch (error) {
    await settleFailure(input.gate, decision.usageId, error, now)
    const code = classifyGeminiError(error)
    console.error(`ask-health failure stage=provider code=${code} model=${input.model}`)
    throw new HttpError(502, FAILURE, undefined, `ASK_HEALTH_${code}`)
  }
  const validated = validateAskHealthAnswer(generated.text, input.packet.evidence)
  await settleComplete(input.gate, decision.usageId, generated, now)
  if (!validated.ok) {
    console.error(`ask-health failure stage=validation reason=${validated.error} model=${generated.model}`)
    throw new HttpError(502, FAILURE, undefined, 'ASK_HEALTH_INVALID_RESPONSE')
  }
  input.gate.store(key, { answer: validated.answer, evidence: citedEvidence(input.packet, validated.answer) })
  return responseFor(input, {
    answer: validated.answer,
    provider: 'gemini',
    model: generated.model,
    cached: false,
  })
}

async function settleComplete(
  gate: AskHealthGate,
  usageId: string | null,
  generated: { inputTokens: number | null; outputTokens: number | null },
  now: number,
): Promise<void> {
  if (!usageId) {
    return
  }
  const actual =
    generated.inputTokens == null && generated.outputTokens == null
      ? null
      : boundedProviderCostUsd(generated.inputTokens, generated.outputTokens, Number.MAX_SAFE_INTEGER)
  try {
    await gate.complete(usageId, actual, generated.inputTokens, generated.outputTokens, now)
  } catch {
    // The reservation stays reserved and still counts toward the ceiling.
  }
}

async function settleFailure(gate: AskHealthGate, usageId: string | null, error: unknown, now: number): Promise<void> {
  if (!usageId) {
    return
  }
  try {
    if (error instanceof NutritionInterpretError && error.code === 'GEMINI_NOT_CONFIGURED') {
      await gate.release(usageId, now)
      return
    }
    await gate.uncertain(usageId, now)
  } catch {
    // A leftover reservation still counts toward the ceiling.
  }
}

function responseFor(
  input: { packet: AskHealthPacket },
  result: { answer: AskHealthAnswer; provider: string; model: string; cached: boolean },
): AskHealthResponse {
  return {
    answer: result.answer,
    evidence: citedEvidence(input.packet, result.answer),
    meta: metaFor(input, result),
  }
}

function metaFor(
  input: { packet: AskHealthPacket },
  result: { provider: string; model: string; cached: boolean },
): AskHealthResponse['meta'] {
  return {
    packetVersion: ASK_HEALTH_PACKET_VERSION,
    promptVersion: ASK_HEALTH_PROMPT_VERSION,
    provider: result.provider,
    model: result.model,
    cached: result.cached,
    asOf: input.packet.asOf,
    lens: input.packet.lens,
    range: input.packet.range,
    requestType: ASK_HEALTH_REQUEST_TYPE,
  }
}

function citedEvidence(packet: AskHealthPacket, answer: AskHealthAnswer): AskEvidence[] {
  const ids = new Set<string>()
  for (const block of [...answer.blocks, ...answer.limitations]) {
    for (const id of block.evidenceRefs) {
      ids.add(id)
    }
  }
  return packet.evidence.filter((item) => ids.has(item.id))
}
