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
import { groundHistoricalAnswer } from '../../src/domain/ask-health/temporal-citations.js'
import { describeAskHealthResponsePath, type AskHealthResponseDiagnostic } from '../../src/domain/ask-health/diagnostics.js'
import type { AskEvidence } from '../../src/domain/ask-health/types.js'
import { NutritionInterpretError } from '../../src/domain/nutrition/interpret.js'
import { routeAskHealthIntent } from '../../src/domain/ask-health/intent.js'
import type { AskContextMode } from '../../src/domain/ask-health/config.js'
import { detectImmediateSafety, immediateSafetyAnswer } from '../../src/domain/ask-health/immediate-safety.js'
import { askHealthNonOwnerSubject, NON_OWNER_ASK_HEALTH_TEXT } from '../../src/domain/ask-health/person-scope.js'
import {
  ASK_HEALTH_GENERAL_PROMPT_VERSION, GENERAL_ASK_SYSTEM_PROMPT,
  blankGeneralAskPacket, generalAskUserPrompt, generalAnswerInventsPersonalRecord,
  sanitizeCachedGeneralAnswer,
} from '../../src/domain/ask-health/general.js'
import { billableOutputTokens, boundedProviderCostUsd } from '../ai-usage/cost.js'
import { HttpError } from '../http.js'
import { askHealthCacheKey, getAskHealthGate, type AskHealthGate } from './gate.js'
import { loadAskHealthPacketInput } from './load.js'
import { classifyGeminiError } from '../integrations/gemini/client.js'
import { askHealthGemini, askHealthModel } from './provider.js'

const FAILURE = "Ask Health couldn't generate an explanation. Your Health data is unchanged."
const BUDGET = 'Ask Health unavailable — AI monthly budget reached.'
const RATE = 'Ask Health is receiving requests too quickly. Wait a moment and try again.'
const DUPLICATE = 'This question was recently requested. Please try again shortly to avoid another AI charge.'
const READ_FAILURE = "Ask Health couldn't read Health evidence. Your Health data is unchanged."

export type AskHealthProvider = (input: { system: string; user: string; model: string; evidenceIds: string[] }) => Promise<{
  text: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
  thinkingTokens?: number | null
}>

export type AskHealthResponse = {
  answer: AskHealthAnswer
  evidence: AskEvidence[]
  meta: {
    packetVersion: typeof ASK_HEALTH_PACKET_VERSION
    promptVersion: string
    answerScope: 'general' | 'personal' | 'urgent_safety'
    contextMode: AskContextMode
    evidenceOverview: {
      availableCount: number
      domains: string[]
      omittedCount: number
      limited: boolean
      /** Deterministic scope caveat for clinical facts omitted by the cap; never raw PHI. */
      clinicalScopeWarning: string | null
      /** Owner-only bounded list of facts supplied to the model, not all DB records. */
      items: Array<{
        id: string
        label: string
        domain: string
        detailPath: string | null
        dates: string[]
        provenance: string | null
      }>
      unlistedCount: number
    }
    provider: string
    model: string
    cached: boolean
    asOf: string
    lens: string
    range: string
    requestType: typeof ASK_HEALTH_REQUEST_TYPE
    context: AskHealthPacket['contextSummary']
    diagnostic: AskHealthResponseDiagnostic
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
  contextMode?: AskContextMode
}): Promise<AskHealthResponse> {
  // PIQ-3: a standalone education question should not retrieve or send
  // private Health data at all. Owner authentication still happens in handler;
  // the existing AI rate/budget ledger still applies to provider calls.
  const contextMode = input.contextMode ?? 'smart'
  // No owner-data read, provider call, conversation reuse or budget charge
  // for an explicitly different person's health question.
  // First-person immediate safety still has priority when both appear.
  if (!detectImmediateSafety(input.question) && askHealthNonOwnerSubject(input.question)) {
    return nonOwnerResponse({
      lens: input.lens, range: input.range, asOf: input.asOf,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
    }, contextMode)
  }
  const route = routeAskHealthIntent(input.question, input.conversation)
  if (detectImmediateSafety(input.question) || contextMode === 'general_only' ||
      (contextMode === 'smart' && route.route === 'general')) {
    return explainAskHealth({
      packet: blankGeneralAskPacket({
        lens: input.lens, range: input.range, asOf: input.asOf,
        generatedAt: input.generatedAt ?? new Date().toISOString(),
      }),
      question: input.question,
      conversation: [],
      contextMode,
      provider: input.provider ?? askHealthGemini,
      gate: input.gate ?? getAskHealthGate(),
      model: input.model ?? askHealthModel(),
      now: input.now,
    })
  }

  let packet: AskHealthPacket
  try {
    packet = buildAskHealthEvidencePacket(
      await loadAskHealthPacketInput({
        // Deep Dive chooses the broadest existing evidence lens, regardless
        // of tab. It remains range- and packet-size bounded.
        lens: contextMode === 'deep' || (contextMode === 'personalized' && route.route === 'general') ? 'general' : input.lens,
        range: input.range,
        asOf: input.asOf,
        question: input.question,
        generatedAt: input.generatedAt ?? new Date().toISOString(),
        contextMode,
      }),
    )
  } catch (error) {
    // Preserve expected owner/client 4xx errors; never expose internal 5xx
    // loader messages (potential SQL or clinical content) to the caller.
    if (error instanceof HttpError && error.statusCode >= 400 && error.statusCode < 500) {
      throw error
    }
    console.error('ask-health failure stage=evidence_load')
    throw new HttpError(503, READ_FAILURE, undefined, 'ASK_HEALTH_EVIDENCE_LOAD')
  }
  return explainAskHealth({
    packet,
    question: input.question,
    conversation: input.conversation,
    contextMode,
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
  contextMode?: AskContextMode
}): Promise<AskHealthResponse> {
  const contextMode = input.contextMode ?? 'smart'
  const immediate = detectImmediateSafety(input.question)
  if (immediate) {
    // A stated current emergency must never require Health records, Gemini,
    // an AI budget reservation, or an empty-evidence insufficiency response.
    return responseFor({ packet: blankGeneralAskPacket(input.packet) }, {
      answer: immediateSafetyAnswer(immediate),
      provider: 'health', model: 'deterministic', cached: false,
      urgentSafety: true,
      contextMode,
    })
  }
  if (askHealthNonOwnerSubject(input.question)) {
    // Do not trust a pre-built personal packet from a direct caller.
    return nonOwnerResponse(input.packet, contextMode)
  }
  const intent = routeAskHealthIntent(input.question, input.conversation)
  if (contextMode === 'general_only' &&
      (intent.intent === 'personal_metric' || intent.intent === 'personal_trend' ||
       intent.intent === 'historical_reference')) {
    // General Only is an explicit instruction not to consult personal records.
    // A data-dependent owner metric has no honest educational numerical answer.
    // Do not spend AI budget asking a model to guess the owner's history.
    return responseFor({ packet: blankGeneralAskPacket(input.packet) }, {
      answer: {
        blocks: [{ text: 'General Only cannot check your personal measurements or history. Choose Personalized or Deep Dive, then ask again to use saved Health evidence.', evidenceRefs: [] }],
        limitations: [],
        followUps: [],
      },
      provider: 'health', model: 'deterministic', cached: false, general: true, contextMode,
    })
  }
  const general = contextMode === 'general_only' || (contextMode === 'smart' && intent.route === 'general')
  // Also sanitize direct callers supplying an owner packet for a purely
  // educational prompt. No private record or prior personal chat reaches AI.
  const work = general ? {
    ...input, packet: blankGeneralAskPacket(input.packet), conversation: [],
  } : input
  const now = work.now ?? Date.now()
  const personalPrompt = contextMode === 'deep'
    ? ASK_HEALTH_SYSTEM_PROMPT + '\nDeep Dive requested: synthesize relevant evidence across supplied domains, distinguish missing observations, and NEVER claim to have reviewed the full database or records omitted by the packet limit.'
    : ASK_HEALTH_SYSTEM_PROMPT
  if (work.packet.clarification) {
    const refs = work.packet.evidence.filter((item) => item.id.startsWith('training.exercise.')).map((item) => item.id)
    return responseFor(input, {
      answer: {
        blocks: [{ text: work.packet.clarification, evidenceRefs: refs.length > 0 ? refs : ['ask.range'] }],
        limitations: [],
        followUps: [],
      },
      provider: 'health',
      model: 'deterministic',
      cached: false,
      contextMode,
    })
  }
  const canExplainWithoutOwnerFacts = contextMode !== 'smart' &&
    (intent.route === 'general' || intent.intent === 'ambiguous' || intent.intent === 'compare_options')
  if (!general && !packetHasSubstantiveEvidence(work.packet) && !canExplainWithoutOwnerFacts) {
    return responseFor(input, {
      answer: insufficientAskHealthAnswer(work.packet),
      provider: 'health',
      model: 'deterministic',
      cached: false,
      contextMode,
    })
  }
  const key = askHealthCacheKey([
    normalizeAskQuestion(work.question),
    work.packet.lens,
    work.packet.range,
    work.packet.asOf,
    packetFingerprintMaterial(work.packet),
    general ? ASK_HEALTH_GENERAL_PROMPT_VERSION : ASK_HEALTH_PROMPT_VERSION,
    general ? 'general' : 'personal',
    contextMode,
    work.model,
    JSON.stringify(work.conversation),
  ])
  let decision: Awaited<ReturnType<AskHealthGate['take']>>
  try {
    decision = await work.gate.take(key, now, work.model)
  } catch {
    console.error('ask-health failure stage=usage_gate')
    throw new HttpError(503, FAILURE, undefined, 'ASK_HEALTH_USAGE_GATE')
  }
  if (!decision.ok) {
    const message = decision.reason === 'budget' ? BUDGET
      : decision.reason === 'duplicate' ? DUPLICATE : RATE
    const code = decision.reason === 'budget' ? 'ASK_HEALTH_BUDGET_EXCEEDED'
      : decision.reason === 'duplicate' ? 'ASK_HEALTH_DUPLICATE_REQUEST' : 'ASK_HEALTH_RATE_LIMIT'
    throw new HttpError(429, message, undefined, code)
  }
  if (decision.cached) {
    // Defensive against older cache entries or future scope-rule changes.
    const cachedAnswer = general ? sanitizeCachedGeneralAnswer(decision.cached.answer) :
      groundHistoricalAnswer(decision.cached.answer, work.packet, work.question)
    return {
      answer: cachedAnswer,
      evidence: citedEvidence(work.packet, cachedAnswer),
      meta: metaFor(work, { provider: 'gemini', model: work.model, cached: true, general, contextMode }),
    }
  }
  let generated: Awaited<ReturnType<AskHealthProvider>>
  try {
    generated = await work.provider({
      system: general ? GENERAL_ASK_SYSTEM_PROMPT : personalPrompt,
      user: general ? generalAskUserPrompt(work.question) : askHealthUserPrompt({ packet: work.packet, question: work.question, conversation: work.conversation }),
      model: work.model,
      evidenceIds: work.packet.evidence.map((item) => item.id),
    })
  } catch (error) {
    await settleFailure(work.gate, decision.usageId, error, now)
    const code = classifyGeminiError(error)
    console.error(`ask-health failure stage=provider code=${code} model=${work.model}`)
    throw new HttpError(502, FAILURE, undefined, `ASK_HEALTH_${code}`)
  }
  let validated = validateAskHealthAnswer(generated.text, work.packet.evidence)
  if (validated.ok && general && generalAnswerInventsPersonalRecord(validated.answer)) {
    validated = { ok: false, error: 'unsupported personal-data claim in general response' }
  }
  if (!validated.ok) {
    console.warn(`ask-health retry stage=validation reason=${validated.error} model=${generated.model}`)
    try {
      const repaired = await work.provider({
        system: `${general ? GENERAL_ASK_SYSTEM_PROMPT : personalPrompt}\nThe previous attempt did not validate. Regenerate valid JSON. Never invent private records, sources, or evidence ids.`,
        user: general ? generalAskUserPrompt(work.question) : askHealthUserPrompt({ packet: work.packet, question: work.question, conversation: work.conversation }),
        model: work.model,
        evidenceIds: work.packet.evidence.map((item) => item.id),
      })
      generated = {
        ...repaired,
        inputTokens: addTokenCounts(generated.inputTokens, repaired.inputTokens),
        outputTokens: addTokenCounts(generated.outputTokens, repaired.outputTokens),
        thinkingTokens: addTokenCounts(generated.thinkingTokens, repaired.thinkingTokens),
      }
      validated = validateAskHealthAnswer(repaired.text, work.packet.evidence)
      if (validated.ok && general && generalAnswerInventsPersonalRecord(validated.answer)) {
        validated = { ok: false, error: 'unsupported personal-data claim in general response' }
      }
    } catch (error) {
      await settleFailure(work.gate, decision.usageId, error, now)
      const code = classifyGeminiError(error)
      console.error(`ask-health failure stage=repair code=${code} model=${work.model}`)
      throw new HttpError(502, FAILURE, undefined, `ASK_HEALTH_${code}`)
    }
  }
  await settleComplete(work.gate, decision.usageId, generated, now, generated.model)
  if (!validated.ok) {
    console.error(`ask-health failure stage=validation reason=${validated.error} model=${generated.model}`)
    throw new HttpError(502, FAILURE, undefined, 'ASK_HEALTH_INVALID_RESPONSE')
  }
  const finalAnswer = general ? validated.answer :
    groundHistoricalAnswer(validated.answer, work.packet, work.question)
  work.gate.store(key, { answer: finalAnswer, evidence: citedEvidence(work.packet, finalAnswer) })
  return responseFor(work, {
    answer: finalAnswer,
    provider: 'gemini',
    model: generated.model,
    cached: false,
    general,
    contextMode,
  })
}

function nonOwnerResponse(
  packet: Pick<AskHealthPacket, 'lens' | 'range' | 'asOf' | 'generatedAt'>,
  contextMode: AskContextMode,
): AskHealthResponse {
  return responseFor({ packet: blankGeneralAskPacket(packet) }, {
    answer: {
      blocks: [{ text: NON_OWNER_ASK_HEALTH_TEXT, evidenceRefs: [] }],
      limitations: [],
      followUps: [],
    },
    provider: 'health',
    model: 'deterministic',
    cached: false,
    general: true,
    personScopeBlocked: true,
    contextMode,
  })
}

function addTokenCounts(left: number | null | undefined, right: number | null | undefined): number | null {
  if (left == null && right == null) {
    return null
  }
  return (left ?? 0) + (right ?? 0)
}

async function settleComplete(
  gate: AskHealthGate,
  usageId: string | null,
  generated: { inputTokens: number | null; outputTokens: number | null; thinkingTokens?: number | null },
  now: number,
  model: string,
): Promise<void> {
  if (!usageId) {
    return
  }
  const billedOutput = billableOutputTokens(generated.outputTokens, generated.thinkingTokens)
  const actual =
    generated.inputTokens == null && billedOutput == null
      ? null
      : boundedProviderCostUsd(generated.inputTokens, billedOutput, Number.MAX_SAFE_INTEGER, model)
  try {
    await gate.complete(usageId, actual, generated.inputTokens, billedOutput, now)
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
  result: { answer: AskHealthAnswer; provider: string; model: string; cached: boolean; general?: boolean; urgentSafety?: boolean; personScopeBlocked?: boolean; contextMode?: AskContextMode },
): AskHealthResponse {
  return {
    answer: result.answer,
    evidence: citedEvidence(input.packet, result.answer),
    meta: metaFor(input, result),
  }
}

function metaFor(
  input: { packet: AskHealthPacket },
  result: { provider: string; model: string; cached: boolean; general?: boolean; urgentSafety?: boolean; personScopeBlocked?: boolean; contextMode?: AskContextMode },
): AskHealthResponse['meta'] {
  return {
    packetVersion: ASK_HEALTH_PACKET_VERSION,
    promptVersion: result.urgentSafety ? 'ask-health-immediate-safety-v1' : result.general ? ASK_HEALTH_GENERAL_PROMPT_VERSION : ASK_HEALTH_PROMPT_VERSION,
    answerScope: result.urgentSafety ? 'urgent_safety' : result.general ? 'general' : 'personal',
    contextMode: result.contextMode ?? 'smart',
    evidenceOverview: {
      availableCount: input.packet.evidence.length,
      domains: [...new Set(input.packet.evidence.filter(e => e.substantive).map(e => e.domain))].sort(),
      omittedCount: input.packet.evidenceSelectionAudit?.removedCount ?? 0,
      limited: (input.packet.evidenceSelectionAudit?.removedCount ?? 0) > 0 || Boolean(input.packet.evidenceSelectionAudit?.exceedsMaxChars),
      clinicalScopeWarning: input.packet.limitations.find(item => item.code === 'clinical_evidence_limited')?.text ?? null,
      items: input.packet.evidence.filter(item => item.substantive).slice(0, 24).map(item => ({
        id: item.id,
        label: item.label,
        domain: item.domain,
        detailPath: item.detailPath,
        dates: item.evidenceDates ?? [],
        provenance: item.provenance ?? null,
      })),
      unlistedCount: Math.max(0, input.packet.evidence.filter(item => item.substantive).length - 24),
    },
    provider: result.provider,
    model: result.model,
    cached: result.cached,
    asOf: input.packet.asOf,
    lens: input.packet.lens,
    range: input.packet.range,
    requestType: ASK_HEALTH_REQUEST_TYPE,
    context: input.packet.contextSummary,
    diagnostic: describeAskHealthResponsePath(input.packet, result),
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
