import { randomUUID } from 'node:crypto'
import { NutritionInterpretError } from '../../src/domain/nutrition/interpret.js'
import { buildBenchmarkRetestView, type RetestResultInput } from '../../src/domain/lab-retests.js'
import {
  SUGGESTION_AI_FALLBACK_COPY,
  SUGGESTION_EMPTY_COPY,
  SUGGESTION_LIST_LIMIT,
  EXPERIMENT_SUGGESTION_PROMPT_VERSION,
  SUGGESTION_STALE_COPY,
  SUGGESTION_SYSTEM_PROMPT,
  buildExperimentSuggestions,
  compileAcceptedExperiment,
  findExperimentCandidate,
  suggestionPacket,
  suggestionUserPrompt,
  validateSuggestionModel,
  type CompiledExperiment,
  type ExperimentCandidate,
  type SuggestionInput,
  type SuggestionProtocolFact,
} from '../../src/domain/experiment-suggestions/index.js'
import { boundedProviderCostUsd } from '../ai-usage/cost.js'
import { readAiUsageConfig } from '../ai-usage/config.js'
import { getSql } from '../db.js'
import { HttpError } from '../http.js'
import { currentHealthDate } from '../health-time.js'
import { listGoals } from '../goals/service.js'
import { getExperiment } from './service.js'
import { getSuggestionGate, suggestionCacheKey, type SuggestionGate } from './suggestion-gate.js'
import { experimentSuggestionGemini, experimentSuggestionModel } from './suggestion-provider.js'

export type SuggestionProvider = (input: { system: string; user: string; model: string }) => Promise<{
  text: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
}>

export type SuggestionCommit = (plan: CompiledExperiment) => Promise<{ experimentId: string } | { conflict: true }>

type VersionRow = {
  benchmark_id: string
  title: string
  is_active: boolean
  protocol_version_id: string
  version: number | string
  is_current: boolean
  instructions: string
  minimum_retest_days: number | string | null
  suggested_retest_days: number | string | null
}

type ResultRow = {
  id: string
  benchmark_definition_id: string
  protocol_version_id: string
  result_date: string
  created_at: string
  requirement_id: string | null
  label: string | null
  value: unknown
  unit: string | null
}

function days(value: number | string | null): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

function finite(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function loadSuggestionInput(asOf?: string): Promise<SuggestionInput> {
  const resolvedAsOf = asOf ?? await currentHealthDate()
  const sql = await getSql()
  const versions = (await sql.query(
    `SELECT b.id::text AS benchmark_id,
            p.title,
            b.is_active,
            v.id::text AS protocol_version_id,
            v.version,
            v.is_current,
            v.instructions,
            v.minimum_retest_days,
            v.suggested_retest_days
     FROM benchmark_definitions b
     JOIN lab_protocols p ON p.id = b.protocol_id
     JOIN lab_protocol_versions v ON v.protocol_id = p.id
     ORDER BY p.title, v.version`,
    [],
  )) as VersionRow[]
  const results = (await sql.query(
    `SELECT r.id::text AS id,
            r.benchmark_definition_id::text AS benchmark_definition_id,
            r.protocol_version_id::text AS protocol_version_id,
            r.result_date::text AS result_date,
            r.created_at::text AS created_at,
            req.id::text AS requirement_id,
            req.label,
            val.value,
            val.unit
     FROM benchmark_results r
     LEFT JOIN benchmark_result_values val ON val.benchmark_result_id = r.id
     LEFT JOIN lab_protocol_requirements req
       ON req.id = val.requirement_id
      AND req.role = 'primary_outcome'
     WHERE r.status = 'valid'`,
    [],
  )) as ResultRow[]
  const covers = (await sql.query(
    `SELECT e.status,
            eb.benchmark_definition_id::text AS benchmark_definition_id,
            eg.goal_id::text AS goal_id
     FROM experiments e
     LEFT JOIN experiment_benchmarks eb ON eb.experiment_id = e.id AND eb.role = 'primary'
     LEFT JOIN experiment_goals eg ON eg.experiment_id = e.id
     WHERE e.status IN ('proposed', 'accepted', 'scheduled', 'active')`,
    [],
  )) as Array<{ status: string; benchmark_definition_id: string | null; goal_id: string | null }>
  const protocols = versions.map((version) => protocolFact(version, results, resolvedAsOf))
  const listed = await listGoals()
  return {
    protocols,
    covers: covers.map((row) => ({
      status: row.status,
      benchmarkDefinitionId: row.benchmark_definition_id,
      goalId: row.goal_id,
    })),
    goals: listed.goals.map((goal) => ({
      goalId: goal.id,
      goalVersionId: goal.currentVersion.id,
      version: goal.currentVersion.version,
      status: goal.status,
      goalKind: goal.goalKind,
      displayName: goal.displayName,
      selector: goal.selector,
      target: {
        targetMode: goal.currentVersion.targetMode,
        targetMin: goal.currentVersion.targetMin,
        targetMax: goal.currentVersion.targetMax,
        targetUnit: goal.currentVersion.targetUnit,
        targetDate: goal.currentVersion.targetDate,
        evaluationWindowDays: goal.currentVersion.evaluationWindowDays,
        notes: goal.currentVersion.notes,
      },
      targetState:
        goal.goalStatus.targetState === 'satisfied' || goal.goalStatus.targetState === 'unknown'
          ? goal.goalStatus.targetState
          : 'unmet',
    })),
  }
}

function protocolFact(version: VersionRow, results: readonly ResultRow[], asOf: string): SuggestionProtocolFact {
  const grouped = new Map<string, RetestResultInput>()
  for (const row of results) {
    if (row.protocol_version_id !== version.protocol_version_id) continue
    let result = grouped.get(row.id)
    if (!result) {
      result = {
        id: row.id,
        benchmarkDefinitionId: row.benchmark_definition_id,
        protocolVersionId: row.protocol_version_id,
        status: 'valid',
        resultDate: row.result_date,
        createdAt: row.created_at,
        primaryValues: [],
      }
      grouped.set(row.id, result)
    }
    const value = finite(row.value)
    if (row.requirement_id && row.label && row.unit && value != null) {
      result.primaryValues.push({
        requirementId: row.requirement_id,
        label: row.label,
        value,
        unit: row.unit,
      })
    }
  }
  const view = buildBenchmarkRetestView(
    {
      benchmarkDefinitionId: version.benchmark_id,
      benchmarkTitle: version.title,
      protocolVersionId: version.protocol_version_id,
      protocolVersion: Number(version.version),
      minimumRetestDays: days(version.minimum_retest_days),
      suggestedRetestDays: days(version.suggested_retest_days),
    },
    [...grouped.values()],
    asOf,
  )
  const primary = view.latestResult?.primaryValues[0]
  return {
    benchmarkDefinitionId: version.benchmark_id,
    title: version.title,
    active: version.is_active,
    protocolVersionId: version.protocol_version_id,
    protocolVersion: Number(version.version),
    isCurrent: version.is_current,
    instructions: version.instructions,
    minimumRetestDays: days(version.minimum_retest_days),
    suggestedRetestDays: days(version.suggested_retest_days),
    retestStatus: view.status,
    anchorResultId: view.latestResult?.id ?? null,
    anchorResultDate: view.latestResult?.resultDate ?? null,
    anchorValueLabel: primary ? `${primary.value} ${primary.unit}` : null,
  }
}

export async function listExperimentSuggestions(load: () => Promise<SuggestionInput> = loadSuggestionInput) {
  const suggestions = buildExperimentSuggestions(await load()).slice(0, SUGGESTION_LIST_LIMIT)
  return {
    suggestions,
    empty: suggestions.length === 0 ? SUGGESTION_EMPTY_COPY : null,
  }
}

export async function readExperimentSuggestion(candidateId: string, load: () => Promise<SuggestionInput> = loadSuggestionInput) {
  const candidate = findExperimentCandidate(await load(), candidateId)
  if (!candidate) {
    throw new HttpError(404, 'That suggestion is no longer eligible.')
  }
  return { suggestion: candidate }
}

export async function draftExperimentSuggestion(
  candidateId: string,
  input: {
    load?: () => Promise<SuggestionInput>
    provider?: SuggestionProvider
    gate?: SuggestionGate
    model?: string
    now?: number
  } = {},
) {
  const candidate = findExperimentCandidate(await (input.load ?? loadSuggestionInput)(), candidateId)
  if (!candidate) {
    throw new HttpError(404, 'That suggestion is no longer eligible.')
  }
  const model = input.model ?? experimentSuggestionModel()
  const gate = input.gate ?? getSuggestionGate()
  const packet = suggestionPacket(candidate)
  const key = suggestionCacheKey(packet, EXPERIMENT_SUGGESTION_PROMPT_VERSION, model)
  const now = input.now ?? Date.now()
  const decision = await gate.take(key, now, model)
  if (!decision.ok) {
    return draftResponse(candidate, null, SUGGESTION_AI_FALLBACK_COPY, model)
  }
  if (decision.cached) {
    return draftResponse(candidate, decision.cached, null, model)
  }
  const usageId = decision.usageId
  if (!usageId) {
    return draftResponse(candidate, null, SUGGESTION_AI_FALLBACK_COPY, model)
  }
  try {
    const generated = await (input.provider ?? experimentSuggestionGemini)({
      system: SUGGESTION_SYSTEM_PROMPT,
      user: suggestionUserPrompt(packet),
      model,
    })
    const draft = validateSuggestionModel(generated.text, candidate)
    const reserved = readAiUsageConfig().experimentSuggestionMaxRequestCostUsd
    const cost = boundedProviderCostUsd(generated.inputTokens, generated.outputTokens, reserved)
    await gate.complete(usageId, cost, generated.inputTokens, generated.outputTokens, now)
    if (!draft) {
      return draftResponse(candidate, null, SUGGESTION_AI_FALLBACK_COPY, generated.model)
    }
    gate.store(key, draft)
    return draftResponse(candidate, draft, null, generated.model)
  } catch (error) {
    if (error instanceof NutritionInterpretError && error.code === 'GEMINI_NOT_CONFIGURED') {
      await gate.release(usageId, now)
    } else {
      await gate.uncertain(usageId, now)
    }
    return draftResponse(candidate, null, SUGGESTION_AI_FALLBACK_COPY, model)
  }
}

export async function acceptExperimentSuggestion(
  candidateId: string,
  body: unknown,
  input: {
    load?: () => Promise<SuggestionInput>
    commit?: SuggestionCommit
  } = {},
) {
  const record = body != null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const fingerprint = typeof record.candidateFingerprint === 'string' ? record.candidateFingerprint : ''
  const candidate = findExperimentCandidate(await (input.load ?? loadSuggestionInput)(), candidateId)
  if (!candidate || candidate.candidateFingerprint !== fingerprint) {
    throw new HttpError(409, SUGGESTION_STALE_COPY, undefined, 'stale_candidate')
  }
  const plan = compileAcceptedExperiment(candidate, {
    title: typeof record.title === 'string' ? record.title : null,
    notes: typeof record.notes === 'string' ? record.notes : null,
    usedAiDraft: record.usedAiDraft === true,
  })
  const committed = await (input.commit ?? commitCompiledExperiment)(plan)
  if ('conflict' in committed) {
    throw new HttpError(409, SUGGESTION_STALE_COPY, undefined, 'stale_candidate')
  }
  if (input.commit) {
    return {
      id: committed.experimentId,
      status: 'accepted' as const,
      originKind: plan.originKind,
      originTrigger: plan.originTrigger,
      originFingerprint: plan.originFingerprint,
    }
  }
  return getExperiment(committed.experimentId)
}

async function commitCompiledExperiment(plan: CompiledExperiment): Promise<{ experimentId: string } | { conflict: true }> {
  const sql = await getSql()
  const sourceRows = (await sql.query(`SELECT id::text AS id FROM data_sources WHERE key = 'manual'`, [])) as Array<{ id?: string }>
  const sourceId = sourceRows[0]?.id
  if (!sourceId) {
    throw new HttpError(503, 'Manual data source is not configured')
  }
  const protocolId = randomUUID()
  const versionId = randomUUID()
  const experimentId = randomUUID()
  const queries = [
    sql.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [plan.originFingerprint]),
    sql.query(
      `INSERT INTO lab_protocols (id, protocol_kind, title, description, source_id)
       VALUES ($1::uuid, 'experiment', $2, NULL, $3::uuid)`,
      [protocolId, plan.title, sourceId],
    ),
    sql.query(
      `INSERT INTO lab_protocol_versions (
         id, protocol_id, version, instructions, minimum_retest_days, suggested_retest_days, is_current
       ) VALUES ($1::uuid, $2::uuid, 1, $3, NULL, NULL, true)`,
      [versionId, protocolId, plan.instructions],
    ),
  ]
  for (const requirement of plan.requirements) {
    queries.push(
      sql.query(
        `INSERT INTO lab_protocol_requirements (
           id, protocol_version_id, position, role, domain, requirement_kind, selector, label, required, criteria
         ) VALUES ($1::uuid, $2::uuid, $3::int, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb)`,
        [
          randomUUID(),
          versionId,
          requirement.position,
          requirement.role,
          requirement.domain,
          requirement.requirementKind,
          JSON.stringify(requirement.selector),
          requirement.label,
          requirement.required,
          JSON.stringify(requirement.criteria),
        ],
      ),
    )
  }
  queries.push(
    sql.query(
      `INSERT INTO experiments (
         id, title, question, hypothesis, rationale, origin, status, protocol_version_id, source_id,
         origin_kind, origin_trigger, origin_fingerprint, origin_evidence
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6, 'accepted', $7::uuid, $8::uuid,
         $9, $10, $11, $12::jsonb
       )`,
      [
        experimentId,
        plan.title,
        plan.question,
        plan.hypothesis,
        plan.rationale,
        plan.legacyOrigin,
        versionId,
        sourceId,
        plan.originKind,
        plan.originTrigger,
        plan.originFingerprint,
        JSON.stringify(plan.originEvidence),
      ],
    ),
  )
  if (plan.benchmarkDefinitionId) {
    queries.push(
      sql.query(
        `INSERT INTO experiment_benchmarks (experiment_id, benchmark_definition_id, role)
         VALUES ($1::uuid, $2::uuid, 'primary')`,
        [experimentId, plan.benchmarkDefinitionId],
      ),
    )
  }
  if (plan.goalId && plan.goalVersionId) {
    queries.push(
      sql.query(
        `INSERT INTO experiment_goals (experiment_id, goal_id, goal_version_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid)`,
        [experimentId, plan.goalId, plan.goalVersionId],
      ),
    )
  }
  try {
    await sql.transaction(queries)
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { conflict: true }
    }
    throw error
  }
  return { experimentId }
}

function draftResponse(
  suggestion: ExperimentCandidate,
  draft: { candidateRef: string; title: string; rationale: string; evidenceRefs: string[] } | null,
  notice: string | null,
  model: string | null,
) {
  return {
    suggestion,
    draft,
    notice,
    meta: {
      packetVersion: 'experiment-suggestion-evidence-v1' as const,
      promptVersion: EXPERIMENT_SUGGESTION_PROMPT_VERSION,
      requestType: 'experiment_suggestion' as const,
      model,
    },
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505') {
    return true
  }
  const message = error instanceof Error ? error.message : ''
  return message.includes('experiments_open_origin_fingerprint') || message.includes('duplicate key')
}
