import {
  LITERATURE_LIMITATION,
  LITERATURE_NO_RESULTS,
  LITERATURE_PROVIDER,
  LITERATURE_PROVIDER_FAILURE,
  LITERATURE_RETRIEVAL_VERSION,
  LITERATURE_SYNTHESIS_FALLBACK,
  literatureSystemPrompt,
  literatureUserPrompt,
  parseLiteratureQuery,
  synthesisEvidence,
  toSourceCard,
  validateLiteratureSynthesis,
  type LiteratureRecord,
  type LiteratureSearchResponse,
  type LiteratureSynthesisBlock,
} from '../../src/domain/literature/index.js'
import { NutritionInterpretError } from '../../src/domain/nutrition/interpret.js'
import { boundedProviderCostUsd } from '../ai-usage/cost.js'
import { HttpError } from '../http.js'
import { fetchEuropePmc } from './europe-pmc.js'
import { getLiteratureGate, literatureCacheKey, type LiteratureGate } from './gate.js'
import { literatureGemini, literatureModel } from './provider.js'

export type LiteratureGemini = (input: { system: string; user: string; model: string }) => Promise<{
  text: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
}>

export async function searchLiterature(input: {
  query: string
  search?: (query: string) => Promise<LiteratureRecord[]>
  provider?: LiteratureGemini
  gate?: LiteratureGate
  model?: string
  now?: number
}): Promise<LiteratureSearchResponse> {
  const parsed = parseLiteratureQuery({ query: input.query })
  if (!parsed.ok) {
    throw new HttpError(400, parsed.error)
  }
  const search = input.search ?? fetchEuropePmc
  const provider = input.provider ?? literatureGemini
  const gate = input.gate ?? getLiteratureGate()
  const model = input.model ?? literatureModel()
  const now = input.now ?? Date.now()
  let records: LiteratureRecord[]
  try {
    records = await search(parsed.query)
  } catch {
      return responseFor(parsed.query, [], null, LITERATURE_PROVIDER_FAILURE)
  }
  if (records.length === 0) {
    return responseFor(parsed.query, [], null, LITERATURE_NO_RESULTS)
  }
  const evidence = synthesisEvidence(parsed.query, records)
  const fingerprint = evidence.sources.map((source) => `${source.sourceRef}|${source.studyType}|${source.title}`).join('\n')
  const key = literatureCacheKey(parsed.query, fingerprint, model)
  let decision: Awaited<ReturnType<LiteratureGate['take']>>
  try {
    decision = await gate.take(key, now, model)
  } catch {
    return responseFor(parsed.query, records, null, LITERATURE_SYNTHESIS_FALLBACK)
  }
  if (!decision.ok || decision.cached) {
    return responseFor(parsed.query, records, decision.ok ? decision.cached : null, decision.ok ? null : LITERATURE_SYNTHESIS_FALLBACK)
  }
  let generated: Awaited<ReturnType<LiteratureGemini>>
  try {
    generated = await provider({
      system: literatureSystemPrompt(),
      user: literatureUserPrompt(evidence),
      model,
    })
  } catch (error) {
    await settleFailure(gate, decision.usageId, error, now)
    return responseFor(parsed.query, records, null, LITERATURE_SYNTHESIS_FALLBACK)
  }
  const validated = validateLiteratureSynthesis(generated.text, new Set(records.map((record) => record.sourceRef)))
  await settleComplete(gate, decision.usageId, generated, now)
  if (!validated.ok) {
    return responseFor(parsed.query, records, null, LITERATURE_SYNTHESIS_FALLBACK)
  }
  gate.store(key, validated.blocks)
  return responseFor(parsed.query, records, validated.blocks, null)
}

function responseFor(
  query: string,
  records: readonly LiteratureRecord[],
  blocks: LiteratureSynthesisBlock[] | null,
  notice: string | null,
): LiteratureSearchResponse {
  return {
    calculationVersion: LITERATURE_RETRIEVAL_VERSION,
    provider: LITERATURE_PROVIDER,
    query,
    sources: records.map((record, index) => toSourceCard(record, index)),
    synthesis: blocks ? { blocks } : null,
    notice,
    limitation: LITERATURE_LIMITATION,
  }
}

async function settleComplete(
  gate: LiteratureGate,
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

async function settleFailure(gate: LiteratureGate, usageId: string | null, error: unknown, now: number): Promise<void> {
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
