import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildBenchmarkRetestView } from '../src/domain/lab-retests.ts'
import {
  SUGGESTION_AI_FALLBACK_COPY,
  SUGGESTION_EMPTY_COPY,
  buildExperimentSuggestions,
  compileAcceptedExperiment,
  compileGoalToExperimentCandidate,
  sha256Hex,
  validateSuggestionModel,
  type ExperimentCandidate,
  type SuggestionGoalFact,
  type SuggestionInput,
  type SuggestionProtocolFact,
} from '../src/domain/experiment-suggestions/index.ts'
import { SUGGESTION_KINDS } from '../src/domain/experiment-suggestions/types.ts'
import { LATEST_SCHEMA_MIGRATION, tablesForProfile } from '../server/backup/inventory.ts'
import { withPortableExperimentOrigin } from '../server/backup/format.ts'
import {
  acceptExperimentSuggestion,
  draftExperimentSuggestion,
  listExperimentSuggestions,
  readExperimentSuggestion,
} from '../server/lab/suggestions.ts'
import { demoDueSuggestion, demoEmptySuggestionCopy } from '../src/demo/experiment-suggestions.ts'
import { HttpError } from '../server/http.ts'

const BENCHMARK = '11111111-1111-4111-8111-111111111111'
const VERSION_2 = '22222222-2222-4222-8222-222222222222'
const VERSION_3 = '33333333-3333-4333-8333-333333333333'
const RESULT = '44444444-4444-4444-8444-444444444444'
const GOAL = '55555555-5555-4555-8555-555555555555'
const GOAL_VERSION = '66666666-6666-4666-8666-666666666666'
const SUPPLEMENT = '77777777-7777-4777-8777-777777777777'

function protocol(overrides: Partial<SuggestionProtocolFact> = {}): SuggestionProtocolFact {
  return {
    benchmarkDefinitionId: BENCHMARK,
    title: 'Push-up Capacity',
    active: true,
    protocolVersionId: VERSION_2,
    protocolVersion: 2,
    isCurrent: true,
    instructions: 'As many strict push-ups as possible in 10 minutes.',
    minimumRetestDays: 30,
    suggestedRetestDays: 90,
    retestStatus: 'due',
    anchorResultId: RESULT,
    anchorResultDate: '2026-06-18',
    anchorValueLabel: '67 reps',
    ...overrides,
  }
}

function goal(overrides: Partial<SuggestionGoalFact> = {}): SuggestionGoalFact {
  return {
    goalId: GOAL,
    goalVersionId: GOAL_VERSION,
    version: 1,
    status: 'active',
    goalKind: 'body_metric',
    displayName: 'Weight',
    selector: {
      goalKind: 'body_metric',
      bodyMetricKey: 'weight',
      exerciseDefinitionId: null,
      benchmarkDefinitionId: null,
      benchmarkProtocolVersionId: null,
      benchmarkRequirementId: null,
      supplementId: null,
    },
    target: {
      targetMode: 'at_most',
      targetMin: null,
      targetMax: 180,
      targetUnit: 'lb',
      targetDate: null,
      evaluationWindowDays: null,
      notes: null,
    },
    targetState: 'unmet',
    ...overrides,
  }
}

function input(overrides: Partial<SuggestionInput> = {}): SuggestionInput {
  return {
    protocols: [protocol()],
    covers: [],
    goals: [],
    ...overrides,
  }
}

function dueCandidate(): ExperimentCandidate {
  const candidate = buildExperimentSuggestions(input())[0]
  if (!candidate) throw new Error('missing due candidate')
  return candidate
}

describe('experiment suggestions', () => {
  it('hashes with sha256 and keeps a fingerprint stable', () => {
    expect(sha256Hex('abc')).toBe(createHash('sha256').update('abc').digest('hex'))
    const first = dueCandidate()
    const second = dueCandidate()
    expect(first.candidateFingerprint).toBe(second.candidateFingerprint)
    expect(first.candidateId).toBe(`benchmark-retest:${BENCHMARK}:${VERSION_2}:${RESULT}`)
    const changed = buildExperimentSuggestions(input({ protocols: [protocol({ instructions: 'Different cue.' })] }))[0]
    expect(changed?.candidateFingerprint).not.toBe(first.candidateFingerprint)
  })

  it('suggests a missing baseline and drops it after a valid result', () => {
    const missing = buildExperimentSuggestions(
      input({ protocols: [protocol({ retestStatus: 'no_baseline', anchorResultId: null, anchorResultDate: null, anchorValueLabel: null })] }),
    )
    expect(missing.map((item) => item.kind)).toEqual(['benchmark_missing_baseline'])
    const recorded = buildExperimentSuggestions(input({ protocols: [protocol({ retestStatus: 'available' })] }))
    expect(recorded.some((item) => item.kind === 'benchmark_missing_baseline')).toBe(false)
  })

  it('uses B3 due and ignores available and waiting_minimum', () => {
    const dueView = buildBenchmarkRetestView(
      {
        benchmarkDefinitionId: BENCHMARK,
        benchmarkTitle: 'Push-up Capacity',
        protocolVersionId: VERSION_2,
        protocolVersion: 2,
        minimumRetestDays: 30,
        suggestedRetestDays: 90,
      },
      [
        {
          id: RESULT,
          benchmarkDefinitionId: BENCHMARK,
          protocolVersionId: VERSION_2,
          status: 'valid',
          resultDate: '2026-09-01',
          createdAt: '2026-09-01T12:00:00.000Z',
          primaryValues: [{ requirementId: 'req', label: 'Total reps', value: 67, unit: 'reps' }],
        },
      ],
      '2026-12-03',
    )
    expect(dueView.status).toBe('due')
    const due = buildExperimentSuggestions(input({ protocols: [protocol({ retestStatus: dueView.status })] }))
    expect(due[0]?.kind).toBe('benchmark_retest_due')
    expect(buildExperimentSuggestions(input({ protocols: [protocol({ retestStatus: 'available' })] }))).toEqual([])
    expect(buildExperimentSuggestions(input({ protocols: [protocol({ retestStatus: 'waiting_minimum' })] }))).toEqual([])
    expect(buildExperimentSuggestions(input({ protocols: [protocol({ retestStatus: 'unconfigured', anchorResultId: null })] })).map((item) => item.kind)).toEqual([
      'benchmark_missing_baseline',
    ])
  })

  it('pins the due protocol version and does not substitute a newer one', () => {
    const suggestions = buildExperimentSuggestions(
      input({
        protocols: [
          protocol({ isCurrent: false, retestStatus: 'due' }),
          protocol({
            protocolVersionId: VERSION_3,
            protocolVersion: 3,
            isCurrent: true,
            retestStatus: 'no_baseline',
            anchorResultId: null,
            anchorResultDate: null,
            anchorValueLabel: null,
          }),
        ],
      }),
    )
    const retest = suggestions.find((item) => item.kind === 'benchmark_retest_due')
    expect(retest?.protocol.benchmarkProtocolVersionId).toBe(VERSION_2)
    expect(retest?.protocol.protocolVersionNumber).toBe(2)
    expect(suggestions.some((item) => item.protocol.benchmarkProtocolVersionId === VERSION_3 && item.kind === 'benchmark_retest_due')).toBe(false)
  })

  it('suppresses a candidate covered by an open experiment', () => {
    const covered = buildExperimentSuggestions(
      input({ covers: [{ status: 'active', benchmarkDefinitionId: BENCHMARK, goalId: null }] }),
    )
    expect(covered).toEqual([])
    const finished = buildExperimentSuggestions(
      input({ covers: [{ status: 'completed', benchmarkDefinitionId: BENCHMARK, goalId: null }] }),
    )
    expect(finished[0]?.kind).toBe('benchmark_retest_due')
  })

  it('fails closed for every current goal kind, including missing evidence', () => {
    const unknown = compileGoalToExperimentCandidate(goal({ targetState: 'unknown' }))
    expect(unknown.supported).toBe(false)
    if (!unknown.supported) {
      expect(unknown.reason).toMatch(/Missing current goal evidence/)
      expect(unknown.reason).not.toMatch(/not satisfied/)
    }
    const kinds = [
      goal(),
      goal({
        goalKind: 'activity_steps',
        displayName: 'Daily steps',
        selector: { ...goal().selector, goalKind: 'activity_steps', bodyMetricKey: null },
        target: { ...goal().target, targetMode: 'at_least', targetMin: 8000, targetMax: null, targetUnit: 'steps/day' },
      }),
      goal({
        goalKind: 'nutrition_protein',
        displayName: 'Protein',
        selector: { ...goal().selector, goalKind: 'nutrition_protein', bodyMetricKey: null },
        target: { ...goal().target, targetMode: 'at_least', targetMin: 160, targetMax: null, targetUnit: 'g/day' },
      }),
      goal({
        goalKind: 'sleep_duration',
        displayName: 'Sleep',
        selector: { ...goal().selector, goalKind: 'sleep_duration', bodyMetricKey: null },
        target: { ...goal().target, targetMode: 'at_least', targetMin: 420, targetMax: null, targetUnit: 'min/night' },
      }),
      goal({
        goalKind: 'supplement_adherence',
        displayName: 'Creatine adherence',
        selector: { ...goal().selector, goalKind: 'supplement_adherence', bodyMetricKey: null, supplementId: SUPPLEMENT },
        target: { ...goal().target, targetMode: 'at_least', targetMin: 90, targetMax: null, targetUnit: '%', evaluationWindowDays: 30 },
      }),
    ] as const
    for (const fact of kinds) {
      const compiled = compileGoalToExperimentCandidate(fact)
      expect(compiled.supported).toBe(false)
      if (!compiled.supported) {
        expect(compiled.reason).toMatch(/cannot yet represent the complete goal target/)
      }
    }
    expect(buildExperimentSuggestions(input({ protocols: [], goals: [...kinds] }))).toEqual([])
    expect(SUGGESTION_KINDS).toEqual(['benchmark_missing_baseline', 'benchmark_retest_due', 'goal_observation'])
    expect(SUGGESTION_KINDS).toContain('goal_observation')
    expect(buildExperimentSuggestions(input({ protocols: [], goals: [goal()] })).some((item) => item.kind === 'goal_observation')).toBe(false)
  })

  it('rejects invalid model output and keeps protocol fields out of the draft', () => {
    const candidate = dueCandidate()
    const good = validateSuggestionModel(
      JSON.stringify({
        candidate_ref: candidate.candidateId,
        title: 'Repeat the same test',
        rationale: 'The existing protocol is due for another result.',
        evidence_refs: [`benchmark:${BENCHMARK}`],
      }),
      candidate,
    )
    expect(good?.title).toBe('Repeat the same test')
    expect(validateSuggestionModel(JSON.stringify({ candidate_ref: 'other', title: 'Repeat', rationale: 'Due', evidence_refs: [`benchmark:${BENCHMARK}`] }), candidate)).toBeNull()
    expect(
      validateSuggestionModel(
        JSON.stringify({
          candidate_ref: candidate.candidateId,
          title: 'Repeat',
          rationale: 'Due',
          evidence_refs: ['result:missing'],
        }),
        candidate,
      ),
    ).toBeNull()
    expect(
      validateSuggestionModel(
        JSON.stringify({
          candidate_ref: candidate.candidateId,
          title: 'Repeat',
          rationale: 'Due',
          evidence_refs: [`benchmark:${BENCHMARK}`],
          protocol: { version: 9 },
        }),
        candidate,
      ),
    ).toBeNull()
    expect(
      validateSuggestionModel(
        JSON.stringify({
          candidate_ref: candidate.candidateId,
          title: 'Start a new supplement',
          rationale: 'Due',
          evidence_refs: [`benchmark:${BENCHMARK}`],
        }),
        candidate,
      ),
    ).toBeNull()
    expect(
      validateSuggestionModel(
        JSON.stringify({
          candidate_ref: candidate.candidateId,
          title: 'Repeat',
          rationale: 'A citation will fix this',
          evidence_refs: [`benchmark:${BENCHMARK}`],
          literature: ['doi:10.1/example'],
        }),
        candidate,
      ),
    ).toBeNull()
    const compiled = compileAcceptedExperiment(candidate, { title: 'Owner title', notes: 'Owner note', usedAiDraft: false })
    expect(compiled.instructions).toBe(candidate.protocol.instructions)
    expect(compiled.requirements).toEqual(candidate.protocol.requirements)
    expect(compiled.originKind).toBe('deterministic_candidate')
    expect(compiled.originTrigger).toBe('benchmark_retest_due')
    const assisted = compileAcceptedExperiment(candidate, { usedAiDraft: true })
    expect(assisted.originKind).toBe('ai_assisted')
    expect(assisted.originTrigger).toBe('benchmark_retest_due')
    expect(assisted.legacyOrigin).toBe('ai_assisted')
  })

  it('keeps the deterministic candidate when drafting fails and does not write Lab rows', async () => {
    const candidate = dueCandidate()
    const load = async () => input()
    const budget = await draftExperimentSuggestion(candidate.candidateId, {
      load,
      gate: { take: async () => ({ ok: false, reason: 'budget' }), store() {}, complete: async () => undefined, uncertain: async () => undefined, release: async () => undefined },
    })
    expect(budget.suggestion.candidateId).toBe(candidate.candidateId)
    expect(budget.notice).toBe(SUGGESTION_AI_FALLBACK_COPY)
    const failed = await draftExperimentSuggestion(candidate.candidateId, {
      load,
      gate: {
        take: async () => ({ ok: true, cached: null, usageId: 'usage-1' }),
        store() {},
        complete: async () => undefined,
        uncertain: async () => undefined,
        release: async () => undefined,
      },
      provider: async () => {
        throw new Error('provider down')
      },
    })
    expect(failed.suggestion.protocol.benchmarkProtocolVersionId).toBe(VERSION_2)
    expect(failed.draft).toBeNull()
    const source = readFileSync('server/lab/suggestions.ts', 'utf8')
    const draftSource = source.slice(source.indexOf('export async function draftExperimentSuggestion'), source.indexOf('export async function acceptExperimentSuggestion'))
    const listSource = source.slice(source.indexOf('export async function listExperimentSuggestions'), source.indexOf('export async function readExperimentSuggestion'))
    expect(draftSource).not.toContain('INSERT')
    expect(listSource).not.toContain('INSERT')
    expect(listSource).not.toContain('gate')
    const listed = await listExperimentSuggestions(load)
    expect(listed.suggestions).toHaveLength(1)
    const reviewed = await readExperimentSuggestion(candidate.candidateId, load)
    expect(reviewed.suggestion.candidateFingerprint).toBe(candidate.candidateFingerprint)
  })

  it('accepts once, records origin, and rejects a stale fingerprint', async () => {
    const candidate = dueCandidate()
    const created: string[] = []
    const commit = async (plan: { originFingerprint: string; originKind: string; originTrigger: string }) => {
      if (created.includes(plan.originFingerprint)) return { conflict: true as const }
      created.push(plan.originFingerprint)
      return { experimentId: '99999999-9999-4999-8999-999999999999' }
    }
    const load = async () => input()
    const settled = await Promise.allSettled([
      acceptExperimentSuggestion(candidate.candidateId, { candidateFingerprint: candidate.candidateFingerprint, usedAiDraft: false }, { load, commit }),
      acceptExperimentSuggestion(candidate.candidateId, { candidateFingerprint: candidate.candidateFingerprint, usedAiDraft: true }, { load, commit }),
    ])
    const accepted = settled.flatMap((item) => (item.status === 'fulfilled' ? [item.value] : []))
    expect(created).toHaveLength(1)
    expect(accepted).toHaveLength(1)
    expect(accepted[0]).toMatchObject({ originTrigger: 'benchmark_retest_due', status: 'accepted' })
    await expect(
      acceptExperimentSuggestion(candidate.candidateId, { candidateFingerprint: '0'.repeat(64) }, { load, commit }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'stale_candidate' })
    const completed = async () => input({ protocols: [protocol({ retestStatus: 'available' })] })
    await expect(
      acceptExperimentSuggestion(candidate.candidateId, { candidateFingerprint: candidate.candidateFingerprint }, { load: completed, commit }),
    ).rejects.toBeInstanceOf(HttpError)
  })

  it('ranks due retests ahead of baselines and caps the list at three', async () => {
    const facts = input({
      protocols: [
        protocol(),
        protocol({
          benchmarkDefinitionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
          protocolVersionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
          retestStatus: 'no_baseline',
          anchorResultId: null,
          anchorResultDate: null,
          anchorValueLabel: null,
          isCurrent: true,
        }),
        protocol({
          benchmarkDefinitionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
          protocolVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
          anchorResultId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
          retestStatus: 'due',
        }),
      ],
      goals: [goal()],
    })
    const ranked = buildExperimentSuggestions(facts)
    expect(ranked.map((item) => item.kind)).toEqual(['benchmark_retest_due', 'benchmark_retest_due', 'benchmark_missing_baseline'])
    expect(ranked.some((item) => item.kind === 'goal_observation')).toBe(false)
    const listed = await listExperimentSuggestions(async () => facts)
    expect(listed.suggestions).toHaveLength(3)
    expect(listed.empty).toBeNull()
    const empty = await listExperimentSuggestions(async () => ({ protocols: [], covers: [], goals: [] }))
    expect(empty.empty).toBe(SUGGESTION_EMPTY_COPY)
  })

  it('round-trips origin fields in backup inventory and portable labels', () => {
    expect(LATEST_SCHEMA_MIGRATION).toBe('0038_training_measurements_goals_routines.sql')
    const experiments = tablesForProfile('full').find((table) => table.name === 'experiments')
    expect(experiments?.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['origin_kind', 'origin_trigger', 'origin_fingerprint', 'origin_evidence']),
    )
    expect(tablesForProfile('portable').map((table) => table.name)).toContain('experiment_goals')
    const migration = readFileSync('migrations/0031_experiment_origins.sql', 'utf8')
    expect(migration).toContain('experiments_open_origin_fingerprint')
    expect(migration).toContain("ELSE 'owner_created'")
    const portable = withPortableExperimentOrigin([
      {
        origin_kind: 'ai_assisted',
        origin_trigger: 'benchmark_retest_due',
        origin_fingerprint: 'a'.repeat(64),
      },
    ])
    expect(portable[0]).toMatchObject({
      origin_label: 'AI-assisted Experiment',
      origin_trigger_label: 'benchmark retest due',
    })
  })

  it('keeps the demo fictional and provider-free', () => {
    const suggestion = demoDueSuggestion()
    expect(suggestion.kind).toBe('benchmark_retest_due')
    expect(suggestion.kind).not.toBe('goal_observation')
    expect(suggestion.linkedBenchmarkLabel).toContain('v2')
    expect(demoEmptySuggestionCopy()).toBe(SUGGESTION_EMPTY_COPY)
    const page = readFileSync('src/features/demo/DemoLabPage.tsx', 'utf8')
    const data = readFileSync('src/demo/experiment-suggestions.ts', 'utf8')
    expect(page).not.toMatch(/healthFetch|gemini|getSql/i)
    expect(data).not.toMatch(/healthFetch|gemini|getSql/i)
    expect(data).toContain('Example proposal — not generated live')
    expect(page).toContain('DEMO_SUGGESTION_LABEL')
  })
})
