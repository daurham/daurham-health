import { describe, expect, it } from 'vitest'
import {
  coachLabItemSnoozed,
  coachLabSnoozeSchema,
  coachLabSnoozedUntil,
  coachRetestFingerprint,
  coachTaskAttentionReason,
  deriveCoachLabItems,
  selectVisibleCoachLabItems,
  type CoachLabItem,
  type CoachLabSnooze,
} from '../src/domain/coach-lab.ts'
import { buildExperimentSuggestions } from '../src/domain/experiment-suggestions/registry.ts'
import type { ExperimentCandidate, SuggestionProtocolFact } from '../src/domain/experiment-suggestions/types.ts'
import {
  benchmarkIdsWithActionableExperiment,
  buildBenchmarkRetestView,
  prominentRetests,
  type BenchmarkRetestView,
  type RetestProtocolInput,
} from '../src/domain/lab-retests.ts'

const DATE = '2026-09-29'

function retest(
  id = 'bench-a',
  protocol: Partial<RetestProtocolInput> = {},
  resultDate: string | null = '2026-09-01',
  asOf = DATE,
): BenchmarkRetestView {
  const input: RetestProtocolInput = {
    benchmarkDefinitionId: id, benchmarkTitle: id, protocolVersionId: `${id}-v1`, protocolVersion: 1,
    minimumRetestDays: 7, suggestedRetestDays: 21, ...protocol,
  }
  return buildBenchmarkRetestView(input, resultDate == null ? [] : [{
    id: `${id}-result`, benchmarkDefinitionId: id, protocolVersionId: input.protocolVersionId,
    status: 'valid', resultDate, createdAt: `${resultDate}T20:00:00.123456Z`,
    primaryValues: [{ requirementId: 'primary', label: 'Total reps', value: 42, unit: 'reps' }],
  }], asOf)
}

function candidate(view: BenchmarkRetestView, patch: Partial<SuggestionProtocolFact> = {}): ExperimentCandidate {
  const primary = view.latestResult?.primaryValues[0]
  return buildExperimentSuggestions({ protocols: [{
    benchmarkDefinitionId: view.benchmarkDefinitionId, title: view.benchmarkTitle,
    active: true, isCurrent: true, protocolVersionId: view.protocolVersionId,
    protocolVersion: view.protocolVersion, instructions: 'Repeat the pinned protocol.',
    minimumRetestDays: view.minimumRetestDays, suggestedRetestDays: view.suggestedRetestDays,
    retestStatus: view.status, anchorResultId: view.latestResult?.id ?? null,
    anchorResultDate: view.latestResult?.resultDate ?? null,
    anchorValueLabel: primary ? `${primary.value} ${primary.unit}` : null, ...patch,
  }], covers: [], goals: [] })[0]!
}

function item(view = retest()): CoachLabItem {
  return deriveCoachLabItems({ retests: [view], suggestions: [] })[0]!
}

function snooze(source: CoachLabItem, snoozedUntil = coachLabSnoozedUntil(DATE)): CoachLabSnooze {
  return { kind: source.kind, sourceKey: source.sourceKey, sourceFingerprint: source.sourceFingerprint, snoozedUntil }
}

describe('canonical Coach Lab mapping', () => {
  it('maps existing due/available authority and routes to the existing benchmark workflow', () => {
    const due = retest('due')
    const available = retest('available', {}, '2026-09-20')
    const result = deriveCoachLabItems({ retests: [available, due], suggestions: [] })
    expect(result).toMatchObject([
      { kind: 'benchmark_retest', benchmarkDefinitionId: 'due', protocolVersionId: 'due-v1', urgency: 'due', attentionReason: 'due', href: '/lab/benchmarks/due' },
      { kind: 'benchmark_retest', benchmarkDefinitionId: 'available', urgency: 'available', attentionReason: 'lab' },
    ])
    expect(result[0]?.sourceKey).toBe('benchmark-retest:due:due-v1')
    expect(result[0]?.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('does not invent direct retests for unconfigured/waiting/no-baseline states', () => {
    const views = [
      retest('unconfigured', { minimumRetestDays: null, suggestedRetestDays: null }),
      retest('waiting', {}, '2026-09-26'), retest('missing', {}, null),
    ]
    expect(views.map((view) => view.status)).toEqual(['unconfigured', 'waiting_minimum', 'no_baseline'])
    expect(deriveCoachLabItems({ retests: views, suggestions: [] })).toEqual([])
  })

  it('preserves prominentRetests ordering, overdue priority, and canonical title/id tie-breaks', () => {
    const views = [
      retest('available', {}, '2026-09-20'), retest('tie-z', { benchmarkTitle: 'Zebra' }),
      retest('tie-a', { benchmarkTitle: 'Alpha' }), retest('older', {}, '2026-08-01'),
    ]
    const expected = prominentRetests(views).map((view) => view.benchmarkDefinitionId)
    expect(deriveCoachLabItems({ retests: views, suggestions: [] }).map((source) => source.benchmarkDefinitionId)).toEqual(expected)
    expect(deriveCoachLabItems({ retests: [...views].reverse(), suggestions: [] }).map((source) => source.benchmarkDefinitionId)).toEqual(expected)
    expect(expected).toEqual(['older', 'tie-a', 'tie-z', 'available'])
  })

  it('reuses existing scheduled/active experiment coverage without altering retest truth', () => {
    const view = retest()
    const coveredBenchmarkIds = benchmarkIdsWithActionableExperiment([{ benchmarkDefinitionId: view.benchmarkDefinitionId, status: 'scheduled' }])
    expect(deriveCoachLabItems({ retests: [view], suggestions: [], coveredBenchmarkIds })).toEqual([])
    expect(view.status).toBe('due')
    const accepted = benchmarkIdsWithActionableExperiment([{ benchmarkDefinitionId: view.benchmarkDefinitionId, status: 'accepted' }])
    expect(deriveCoachLabItems({ retests: [view], suggestions: [], coveredBenchmarkIds: accepted })).toHaveLength(1)
  })

  it('maps existing no-baseline suggestions with the exact candidate identity/fingerprint', () => {
    const source = candidate(retest('missing', {}, null))
    const result = deriveCoachLabItems({ retests: [], suggestions: [source] })[0]!
    expect(result).toMatchObject({
      kind: 'experiment_suggestion', sourceKey: source.candidateId, sourceFingerprint: source.candidateFingerprint,
      title: source.title, detail: source.why, attentionReason: 'lab', urgency: 'normal',
      suggestionCandidateId: source.candidateId, suggestionCandidateFingerprint: source.candidateFingerprint,
      suggestionKind: 'benchmark_missing_baseline', benchmarkDefinitionId: 'missing', protocolVersionId: 'missing-v1',
      href: `/lab/suggestions/${encodeURIComponent(source.candidateId)}`,
    })
    expect(result).not.toHaveProperty('rewardBand')
    expect(result).not.toHaveProperty('difficulty')
    expect(result).not.toHaveProperty('taskKind')
  })

  it('does not emit reserved Goal observation suggestions or filler', () => {
    const source = candidate(retest('missing', {}, null))
    expect(deriveCoachLabItems({ retests: [], suggestions: [{ ...source, kind: 'goal_observation' }] })).toEqual([])
    expect(deriveCoachLabItems({ retests: [], suggestions: [] })).toEqual([])
  })

  it('retains existing deterministic suggestion-authority order', () => {
    const first = candidate(retest('due-z'))
    const second = candidate(retest('missing-a', {}, null))
    expect(deriveCoachLabItems({ retests: [], suggestions: [first, second] }).map((source) => source.sourceKey)).toEqual([first.candidateId, second.candidateId])
  })

  it('deduplicates equivalent due suggestions behind direct benchmark/protocol retests', () => {
    const due = retest()
    const suggestion = candidate(due)
    const result = deriveCoachLabItems({ retests: [due], suggestions: [suggestion] })
    expect(result).toHaveLength(1)
    expect(result[0]?.kind).toBe('benchmark_retest')
    expect(suggestion.kind).toBe('benchmark_retest_due')
  })

  it('keeps due suggestions for different protocol states and keeps missing-baseline attention', () => {
    const due = retest()
    const previousProtocol = candidate(due, { protocolVersionId: 'bench-a-v0', protocolVersion: 0, isCurrent: false })
    const missing = candidate(retest('missing', {}, null))
    const result = deriveCoachLabItems({ retests: [due], suggestions: [candidate(due), previousProtocol, missing] })
    expect(result.map((source) => source.kind)).toEqual(['benchmark_retest', 'experiment_suggestion', 'experiment_suggestion'])
    expect(result[1]?.protocolVersionId).toBe('bench-a-v0')
    expect(result[2]?.suggestionKind).toBe('benchmark_missing_baseline')
  })

  it('deduplicates repeated authority rows without creating duplicate attention', () => {
    const due = retest()
    const missing = candidate(retest('missing', {}, null))
    expect(deriveCoachLabItems({ retests: [due, due], suggestions: [missing, missing] })).toHaveLength(2)
  })
})

describe('Coach retest fingerprint authority', () => {
  it('ignores changing display prose and relative age while due state remains the same', () => {
    const original = retest()
    const nextDay = retest('bench-a', {}, '2026-09-01', '2026-09-30')
    expect(coachRetestFingerprint(original)).toBe(coachRetestFingerprint(nextDay))
    expect(coachRetestFingerprint({ ...original, benchmarkTitle: 'Renamed display title' })).toBe(coachRetestFingerprint(original))
  })

  it.each([
    { protocolVersionId: 'new-version-id' }, { protocolVersion: 2 }, { status: 'available' as const },
    { minimumRetestDays: 8 }, { suggestedRetestDays: 22 },
    { minimumDate: '2026-09-09' }, { suggestedDate: '2026-09-23' },
  ])('changes for canonical identity/state/date input %j', (patch) => {
    const view = retest()
    expect(coachRetestFingerprint({ ...view, ...patch })).not.toBe(coachRetestFingerprint(view))
  })

  it('changes when a result is replaced, invalidated to an older anchor, or re-dated', () => {
    const view = retest()
    expect(coachRetestFingerprint({ ...view, latestResult: { ...view.latestResult!, id: 'replacement' } })).not.toBe(coachRetestFingerprint(view))
    expect(coachRetestFingerprint({ ...view, latestResult: { ...view.latestResult!, resultDate: '2026-08-31' } })).not.toBe(coachRetestFingerprint(view))
    expect(coachRetestFingerprint({ ...view, latestResult: null })).not.toBe(coachRetestFingerprint(view))
  })
})

describe('fingerprint-sensitive bounded Coach visibility', () => {
  it('hides the same fingerprint until exactly D+7 Phoenix dates, then resurfaces', () => {
    const source = item()
    const saved = snooze(source)
    expect(saved.snoozedUntil).toBe('2026-10-06')
    expect(coachLabItemSnoozed(source, [saved], '2026-10-05')).toBe(true)
    expect(coachLabItemSnoozed(source, [saved], '2026-10-06')).toBe(false)
    expect(coachLabSnoozedUntil('2028-02-26')).toBe('2028-03-04')
  })

  it('resurfaces changed retest and suggestion fingerprints before an old snooze ends', () => {
    const original = item()
    const changedView = retest()
    changedView.latestResult = { ...changedView.latestResult!, id: 'new-anchor' }
    expect(coachLabItemSnoozed(item(changedView), [snooze(original)], DATE)).toBe(false)
    const missing = retest('missing', {}, null)
    const oldSuggestion = deriveCoachLabItems({ retests: [], suggestions: [candidate(missing)] })[0]!
    const changedSuggestion = deriveCoachLabItems({ retests: [], suggestions: [candidate(missing, { instructions: 'A changed pinned protocol cue.' })] })[0]!
    expect(changedSuggestion.sourceKey).toBe(oldSuggestion.sourceKey)
    expect(coachLabItemSnoozed(changedSuggestion, [snooze(oldSuggestion)], DATE)).toBe(false)
  })

  it('snoozes kind/key/fingerprint identity exactly and ignores malformed persisted dates', () => {
    const source = item()
    const saved = snooze(source)
    expect(coachLabItemSnoozed(source, [{ ...saved, sourceKey: 'unrelated' }], DATE)).toBe(false)
    expect(coachLabItemSnoozed(source, [{ ...saved, kind: 'experiment_suggestion' }], DATE)).toBe(false)
    expect(coachLabItemSnoozed(source, [{ ...saved, snoozedUntil: '2099-99-99' }], DATE)).toBe(false)
  })

  it('does not replace a snoozed direct retest with its equivalent suggestion', () => {
    const view = retest()
    const all = deriveCoachLabItems({ retests: [view], suggestions: [candidate(view)] })
    expect(selectVisibleCoachLabItems(all, [snooze(all[0]!)], DATE)).toEqual({ labItems: [], labOverflowCount: 0 })
  })

  it('keeps three visible items with overflow counted after fingerprint snooze filtering', () => {
    const all = deriveCoachLabItems({ retests: ['a', 'b', 'c', 'd', 'e'].map((id) => retest(id)), suggestions: [] })
    const first = selectVisibleCoachLabItems(all, [], DATE)
    expect(first.labItems.map((source) => source.benchmarkDefinitionId)).toEqual(['a', 'b', 'c'])
    expect(first.labOverflowCount).toBe(2)
    const afterSnooze = selectVisibleCoachLabItems(all, [snooze(all[0]!), snooze(all[1]!)], DATE)
    expect(afterSnooze.labItems.map((source) => source.benchmarkDefinitionId)).toEqual(['c', 'd', 'e'])
    expect(afterSnooze.labOverflowCount).toBe(0)
    expect(all).toHaveLength(5)
  })
})

describe('Lab snooze input and task attention', () => {
  it('accepts exact canonical source identity without adding reward state', () => {
    const source = item()
    expect(coachLabSnoozeSchema.parse({ kind: source.kind, sourceKey: source.sourceKey, sourceFingerprint: source.sourceFingerprint })).toEqual({
      kind: source.kind, sourceKey: source.sourceKey, sourceFingerprint: source.sourceFingerprint,
    })
  })

  it.each([
    { kind: 'daily_quest' }, { sourceKey: '' }, { sourceKey: 'a'.repeat(513) },
    { sourceKey: 'unsafe\nkey' }, { sourceKey: ' key ' }, { sourceFingerprint: '' },
    { sourceFingerprint: 'a'.repeat(63) }, { sourceFingerprint: 'A'.repeat(64) },
    { rewardBand: 'stretch' },
  ])('rejects invalid/unbounded snooze identity %j', (patch) => {
    const source = item()
    expect(coachLabSnoozeSchema.safeParse({ kind: source.kind, sourceKey: source.sourceKey, sourceFingerprint: source.sourceFingerprint, ...patch }).success).toBe(false)
  })

  it('classifies persisted tasks from current rule/metadata without changing tasks', () => {
    const base = { taskKind: 'daily_quest' as const, ruleKey: 'manual:yoga:10m', goalId: null, metadata: {} }
    expect(coachTaskAttentionReason(base)).toBe('general')
    expect(coachTaskAttentionReason({ ...base, taskKind: 'stretch_quest' })).toBe('challenge')
    expect(coachTaskAttentionReason({ ...base, goalId: 'goal-1' })).toBe('goal')
    expect(coachTaskAttentionReason({ ...base, ruleKey: 'goal:training-frequency:goal-1' })).toBe('goal')
    expect(coachTaskAttentionReason({ ...base, ruleKey: 'body-cadence:waist' })).toBe('due')
    expect(coachTaskAttentionReason({ ...base, metadata: { completionRule: 'body_metric' } })).toBe('due')
    expect(base).toEqual({ taskKind: 'daily_quest', ruleKey: 'manual:yoga:10m', goalId: null, metadata: {} })
  })
})
