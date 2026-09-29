import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildBenchmarkRetestView, type BenchmarkRetestView, type RetestExperimentLink } from '../src/domain/lab-retests.ts'
import type { SuggestionInput } from '../src/domain/experiment-suggestions/types.ts'

type SnoozeRow = { id: string; item_kind: string; source_key: string; source_fingerprint: string; snoozed_until: string; created_at: string; updated_at: string }
const state = vi.hoisted(() => ({
  retests: [] as BenchmarkRetestView[],
  links: [] as RetestExperimentLink[],
  input: { protocols: [], covers: [], goals: [] } as SuggestionInput,
  snoozes: [] as SnoozeRow[],
  queries: [] as Array<{ text: string; params: unknown[] }>,
  provider: vi.fn(() => { throw new Error('Coach may not call providers') }),
  gate: vi.fn(() => { throw new Error('Coach may not reserve AI usage') }),
}))
vi.mock('../server/lab/retests.ts', () => ({
  listBenchmarkRetests: vi.fn(async () => ({ retests: state.retests })),
  listRetestExperimentLinks: vi.fn(async () => state.links),
}))
vi.mock('../server/lab/suggestions.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/lab/suggestions.ts')>()
  return {
    ...actual,
    listExperimentSuggestions: vi.fn(actual.listExperimentSuggestions),
    loadSuggestionInput: vi.fn(async () => state.input),
  }
})
vi.mock('../server/lab/suggestion-provider.ts', () => ({ experimentSuggestionGemini: state.provider, experimentSuggestionModel: () => 'unused' }))
vi.mock('../server/lab/suggestion-gate.ts', () => ({ getSuggestionGate: state.gate, suggestionCacheKey: state.gate }))
vi.mock('../server/goals/service.ts', () => ({ listGoals: async () => ({ goals: [] }) }))
vi.mock('../server/body/cadence-service.ts', () => ({ loadCadenceEvidence: async () => ({ configs: [], observations: [] }) }))
vi.mock('../server/context/service.ts', () => ({ getDailyContext: async () => ({ tags: [] }) }))
vi.mock('../server/db.ts', () => ({
  getSql: async () => {
    const sql = {
      query: async (text: string, params: unknown[] = []) => {
        state.queries.push({ text, params })
        if (text.includes('INSERT INTO coach_lab_snoozes')) {
          let row = state.snoozes.find((row) => row.item_kind === params[1] && row.source_key === params[2] && row.source_fingerprint === params[3])
          if (!row) {
            row = { id: String(params[0]), item_kind: String(params[1]), source_key: String(params[2]), source_fingerprint: String(params[3]), snoozed_until: String(params[4]), created_at: String(params[5]), updated_at: String(params[5]) }
            state.snoozes.push(row)
          } else if (row.snoozed_until <= String(params[6])) {
            row.snoozed_until = String(params[4]); row.updated_at = String(params[5])
          }
          return [{ snoozed_until: row.snoozed_until }]
        }
        if (text.includes('FROM coach_lab_snoozes')) return state.snoozes
        return []
      },
      transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
    }
    return sql
  },
}))

import { readCoach, ensureCoach, snoozeCoachLabItem } from '../server/coach/service.ts'
import { listBenchmarkRetests } from '../server/lab/retests.ts'
import { listExperimentSuggestions, loadSuggestionInput } from '../server/lab/suggestions.ts'

const NOW = new Date('2026-09-29T19:00:00.000Z')
const DATE = '2026-09-29'

function retest(id: string, resultDate = '2026-09-01', version = 'protocol-1') {
  return buildBenchmarkRetestView({
    benchmarkDefinitionId: id, benchmarkTitle: `Benchmark ${id}`, protocolVersionId: version,
    protocolVersion: 1, minimumRetestDays: 7, suggestedRetestDays: 14,
  }, [{ id: `result-${id}-${resultDate}`, benchmarkDefinitionId: id, protocolVersionId: version,
    status: 'valid', resultDate, createdAt: `${resultDate}T19:00:00.000Z`, primaryValues: [] }], DATE)
}

function missingBaseline(benchmarkDefinitionId = 'missing') {
  state.input = { protocols: [{ benchmarkDefinitionId, title: 'Missing baseline benchmark', active: true,
    protocolVersionId: 'missing-protocol', protocolVersion: 1, isCurrent: true, instructions: 'Perform and record this benchmark.',
    minimumRetestDays: 7, suggestedRetestDays: 14, retestStatus: 'no_baseline',
    anchorResultId: null, anchorResultDate: null, anchorValueLabel: null }], covers: [], goals: [] }
}

function identity(item: NonNullable<Awaited<ReturnType<typeof readCoach>>['labItems']>[number]) {
  return { kind: item.kind, sourceKey: item.sourceKey, sourceFingerprint: item.sourceFingerprint }
}

describe('derived Personal Lab Coach state and fingerprint snoozes', () => {
  beforeEach(() => {
    state.retests = [retest('due-a'), retest('due-b', '2026-09-10'), retest('available', '2026-09-20'), retest('waiting', '2026-09-27')]
    state.links = []; state.input = { protocols: [], covers: [], goals: [] }; state.snoozes = []; state.queries = []
    state.provider.mockClear(); state.gate.mockClear()
    vi.mocked(listBenchmarkRetests).mockClear(); vi.mocked(listExperimentSuggestions).mockClear(); vi.mocked(loadSuggestionInput).mockClear()
  })

  it('reads due/available Lab authorities and excludes ineligible retests without creating commitments', async () => {
    const result = await readCoach(NOW)
    expect(result.labItems?.map((item) => item.urgency)).toEqual(['due', 'due', 'available'])
    expect(result.labItems?.map((item) => item.benchmarkDefinitionId)).toEqual(['due-a', 'due-b', 'available'])
    expect(listBenchmarkRetests).toHaveBeenCalledWith(DATE)
    expect(loadSuggestionInput).toHaveBeenCalledWith(DATE)
    expect(listExperimentSuggestions).toHaveBeenCalledTimes(1)
    expect(state.queries.some((query) => /INSERT|UPDATE|DELETE/.test(query.text))).toBe(false)
    expect(result.labItems?.every((item) => !('rewardBand' in item))).toBe(true)
  })

  it('ensures Coach with Lab attention without persisting Lab items or invoking provider/AI gates', async () => {
    missingBaseline()
    await ensureCoach(NOW)
    const commitments = state.queries.filter((query) => query.text.includes('INSERT INTO coach_tasks'))
    expect(commitments.every((query) => ['weekly_focus', 'daily_quest', 'stretch_quest'].includes(String(query.params[1])))).toBe(true)
    expect(state.queries.some((query) => /INSERT INTO (experiments|benchmark_results|ai_usage)/.test(query.text))).toBe(false)
    expect(state.provider).not.toHaveBeenCalled(); expect(state.gate).not.toHaveBeenCalled()
  })

  it('maps real deterministic missing-baseline suggestions and removes them after accepted coverage', async () => {
    state.retests = []
    missingBaseline()
    const first = await readCoach(NOW)
    expect(first.labItems).toHaveLength(1)
    expect(first.labItems?.[0]).toMatchObject({ kind: 'experiment_suggestion', suggestionKind: 'benchmark_missing_baseline', urgency: 'normal' })
    expect(first.labItems?.[0].sourceFingerprint).toHaveLength(64)
    state.input = { ...state.input, covers: [{ status: 'accepted', benchmarkDefinitionId: 'missing', goalId: null }] }
    expect((await readCoach(NOW)).labItems).toEqual([])
    expect(state.provider).not.toHaveBeenCalled(); expect(state.gate).not.toHaveBeenCalled()
  })

  it('deduplicates a due-retest suggestion against canonical direct retest attention', async () => {
    state.retests = [retest('due-a')]
    state.input = { protocols: [{ benchmarkDefinitionId: 'due-a', title: 'Benchmark due-a', active: true,
      protocolVersionId: 'protocol-1', protocolVersion: 1, isCurrent: true, instructions: 'Repeat benchmark.',
      minimumRetestDays: 7, suggestedRetestDays: 14, retestStatus: 'due',
      anchorResultId: 'result-due-a-2026-09-01', anchorResultDate: '2026-09-01', anchorValueLabel: null }], covers: [], goals: [] }
    expect((await listExperimentSuggestions(() => Promise.resolve(state.input))).suggestions).toHaveLength(1)
    const result = await readCoach(NOW)
    expect(result.labItems).toHaveLength(1)
    expect(result.labItems?.[0].kind).toBe('benchmark_retest')
  })

  it('hides benchmarks covered by scheduled/active experiments and resurfaces when the cover closes', async () => {
    state.links = [{ benchmarkDefinitionId: 'due-a', status: 'active' }]
    expect((await readCoach(NOW)).labItems?.map((item) => item.benchmarkDefinitionId)).not.toContain('due-a')
    state.links = []
    expect((await readCoach(NOW)).labItems?.[0].benchmarkDefinitionId).toBe('due-a')
  })

  it('snoozes for seven Phoenix dates, returns the next item, and duplicate/concurrent retries never extend', async () => {
    const item = (await readCoach(NOW)).labItems![0]
    const payload = identity(item)
    const results = await Promise.all([snoozeCoachLabItem(payload, NOW), snoozeCoachLabItem(payload, NOW)])
    expect(results[0].snoozedUntil).toBe('2026-10-06')
    expect(results[0].labItems?.[0].benchmarkDefinitionId).toBe('due-b')
    const id = state.snoozes[0].id
    const updated = state.snoozes[0].updated_at
    expect((await snoozeCoachLabItem(payload, new Date('2026-10-01T19:00:00.000Z'))).snoozedUntil).toBe('2026-10-06')
    expect(state.snoozes).toHaveLength(1); expect(state.snoozes[0].id).toBe(id); expect(state.snoozes[0].updated_at).toBe(updated)
    expect((await readCoach(new Date('2026-10-06T06:59:59.000Z'))).labItems?.some((visible) => visible.sourceKey === item.sourceKey)).toBe(false)
    expect((await readCoach(new Date('2026-10-06T07:00:00.000Z'))).labItems?.[0].sourceKey).toBe(item.sourceKey)
    expect((await snoozeCoachLabItem(payload, new Date('2026-10-06T19:00:00.000Z'))).snoozedUntil).toBe('2026-10-13')
    const mutations = state.queries.filter((query) => /INSERT|UPDATE|DELETE/.test(query.text))
    expect(mutations.every((query) => query.text.includes('INSERT INTO coach_lab_snoozes'))).toBe(true)
  })

  it('immediately resurfaces a changed result/protocol fingerprint during an old snooze and rejects stale payloads', async () => {
    const item = (await readCoach(NOW)).labItems![0]
    await snoozeCoachLabItem(identity(item), NOW)
    state.retests[0] = retest('due-a', '2026-09-20')
    const changed = (await readCoach(NOW)).labItems!.find((visible) => visible.benchmarkDefinitionId === 'due-a')!
    expect(changed.sourceFingerprint).not.toBe(item.sourceFingerprint)
    await expect(snoozeCoachLabItem(identity(item), NOW)).rejects.toMatchObject({ statusCode: 409 })
    state.retests[0] = retest('due-a', '2026-09-20', 'protocol-2')
    expect((await readCoach(NOW)).labItems!.find((visible) => visible.benchmarkDefinitionId === 'due-a')?.sourceFingerprint).not.toBe(changed.sourceFingerprint)
    state.retests = []
    await expect(snoozeCoachLabItem(identity(changed), NOW)).rejects.toMatchObject({ statusCode: 409 })
    expect(state.snoozes).toHaveLength(1)
  })

  it('revalidates snoozed/overflow items before presentation limiting and bounds visible overflow', async () => {
    state.retests = ['a', 'b', 'c', 'd', 'e'].map((id) => retest(id))
    const first = await readCoach(NOW)
    expect(first.labItems).toHaveLength(3); expect(first.labOverflowCount).toBe(2)
    const hiddenKey = first.labItems![0].sourceKey
    const response = await snoozeCoachLabItem(identity(first.labItems![0]), NOW)
    expect(response.labItems).toHaveLength(3); expect(response.labOverflowCount).toBe(1)
    expect(response.labItems?.some((item) => item.sourceKey === hiddenKey)).toBe(false)
    expect((await snoozeCoachLabItem(identity(first.labItems![0]), NOW)).snoozedUntil).toBe('2026-10-06')
  })

  it('validates exact mutation identity and uses the Phoenix date at UTC day edges', async () => {
    const item = (await readCoach(NOW)).labItems![0]
    await expect(snoozeCoachLabItem({ ...identity(item), extra: true }, NOW)).rejects.toMatchObject({ statusCode: 400 })
    await expect(snoozeCoachLabItem({ ...identity(item), sourceFingerprint: 'invalid' }, NOW)).rejects.toMatchObject({ statusCode: 400 })
    await expect(snoozeCoachLabItem({ ...identity(item), sourceKey: 'not-current' }, NOW)).rejects.toMatchObject({ statusCode: 409 })
    expect((await snoozeCoachLabItem(identity(item), new Date('2026-09-29T06:59:59.000Z'))).snoozedUntil).toBe('2026-10-05')
  })
})
