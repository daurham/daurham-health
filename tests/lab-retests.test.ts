import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  activeProtocolRetests,
  benchmarkIdsWithActionableExperiment,
  buildBenchmarkRetestView,
  orderAutomaticRetests,
  parseRetestAsOf,
  prominentRetests,
  selectTodayRetest,
  type BenchmarkRetestView,
  type RetestProtocolInput,
  type RetestResultInput,
} from '../src/domain/lab-retests.ts'
import { buildTodayView, type TodaySources } from '../src/domain/today/index.ts'
import { BACKUP_TABLES, LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.ts'

const BENCHMARK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const VERSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const VERSION_2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function protocol(overrides: Partial<RetestProtocolInput> = {}): RetestProtocolInput {
  return {
    benchmarkDefinitionId: BENCHMARK,
    benchmarkTitle: 'Push-up 10-minute capacity',
    protocolVersionId: VERSION,
    protocolVersion: 1,
    minimumRetestDays: 30,
    suggestedRetestDays: 90,
    ...overrides,
  }
}

function result(overrides: Partial<RetestResultInput> = {}): RetestResultInput {
  return {
    id: 'result-a',
    benchmarkDefinitionId: BENCHMARK,
    protocolVersionId: VERSION,
    status: 'valid',
    resultDate: '2026-09-01',
    createdAt: '2026-09-01T12:00:00.000Z',
    primaryValues: [{ requirementId: 'req-1', label: 'Total reps', value: 67, unit: 'reps' }],
    ...overrides,
  }
}

function view(asOf: string, protocolOverrides: Partial<RetestProtocolInput> = {}, results: RetestResultInput[] = [result()]): BenchmarkRetestView {
  return buildBenchmarkRetestView(protocol(protocolOverrides), results, asOf)
}

describe('benchmark retest state', () => {
  it('covers every guidance combination and inclusive boundaries', () => {
    expect(view('2026-09-20', { minimumRetestDays: null, suggestedRetestDays: null }, []).status).toBe('unconfigured')
    expect(view('2026-09-20', { minimumRetestDays: 30, suggestedRetestDays: 90 }, []).status).toBe('no_baseline')
    expect(view('2026-09-20', { minimumRetestDays: 30, suggestedRetestDays: null }).status).toBe('waiting_minimum')
    expect(view('2026-10-01', { minimumRetestDays: 30, suggestedRetestDays: null }).status).toBe('available')
    expect(view('2026-10-02', { minimumRetestDays: 30, suggestedRetestDays: null }).status).toBe('available')
    expect(view('2026-10-16', { minimumRetestDays: null, suggestedRetestDays: 90 }).status).toBe('available')
    expect(view('2026-11-30', { minimumRetestDays: null, suggestedRetestDays: 90 }).status).toBe('due')
    expect(view('2026-12-03', { minimumRetestDays: null, suggestedRetestDays: 90 }).status).toBe('due')
    expect(view('2026-09-20').status).toBe('waiting_minimum')
    expect(view('2026-10-01').status).toBe('available')
    expect(view('2026-10-16').status).toBe('available')
    expect(view('2026-11-30').status).toBe('due')
    expect(view('2026-12-03').status).toBe('due')
    const due = view('2026-12-03')
    expect(due.minimumDate).toBe('2026-10-01')
    expect(due.suggestedDate).toBe('2026-11-30')
    expect(due.daysSinceResult).toBe(93)
    expect(due.latestResult?.primaryValues[0]?.value).toBe(67)
  })

  it('schedules only the current protocol version', () => {
    const v1 = result()
    const current = view('2026-12-03', {}, [v1])
    expect(current.status).toBe('due')
    const nextProtocol = view('2026-12-03', { protocolVersionId: VERSION_2, protocolVersion: 2 }, [v1])
    expect(nextProtocol.status).toBe('no_baseline')
    expect(nextProtocol.latestResult).toBeNull()
    const anchored = view('2026-12-03', { protocolVersionId: VERSION_2, protocolVersion: 2 }, [
      v1,
      result({ id: 'result-v2', protocolVersionId: VERSION_2, resultDate: '2026-12-01', createdAt: '2026-12-01T12:00:00.000Z', primaryValues: [{ requirementId: 'req-1', label: 'Total reps', value: 81, unit: 'reps' }] }),
    ])
    expect(anchored.status).toBe('waiting_minimum')
    expect(anchored.latestResult?.id).toBe('result-v2')
    expect(anchored.minimumDate).toBe('2026-12-31')
  })

  it('reanchors when the latest result is invalidated or replaced', () => {
    const june = result({ id: 'june', resultDate: '2026-06-01', createdAt: '2026-06-01T12:00:00.000Z' })
    const september = result({ id: 'september', resultDate: '2026-09-01', createdAt: '2026-09-01T12:00:00.000Z' })
    expect(view('2026-12-03', {}, [june, september]).latestResult?.id).toBe('september')
    const invalidated = view('2026-12-03', {}, [june, { ...september, status: 'invalidated' }])
    expect(invalidated.latestResult?.id).toBe('june')
    expect(invalidated.suggestedDate).toBe('2026-08-30')
    const replacement = view('2026-12-03', {}, [
      { ...june, status: 'invalidated' },
      result({ id: 'replacement', resultDate: '2026-09-01', createdAt: '2026-09-02T12:00:00.000Z', primaryValues: [{ requirementId: 'req-1', label: 'Total reps', value: 70, unit: 'reps' }] }),
    ])
    expect(replacement.latestResult?.id).toBe('replacement')
    expect(replacement.minimumDate).toBe('2026-10-01')
  })

  it('keeps the result date when two valid attempts share a day', () => {
    const earlyWrite = result({ id: 'early-write', createdAt: '2026-09-01T08:00:00.000Z' })
    const lateWrite = result({ id: 'late-write', createdAt: '2026-09-01T20:00:00.000Z', primaryValues: [{ requirementId: 'req-1', label: 'Total reps', value: 70, unit: 'reps' }] })
    const first = view('2026-10-01', {}, [earlyWrite, lateWrite])
    const swapped = view('2026-10-01', {}, [lateWrite, earlyWrite])
    expect(first.minimumDate).toBe(swapped.minimumDate)
    expect(first.suggestedDate).toBe(swapped.suggestedDate)
    expect(first.latestResult?.id).toBe('late-write')
    expect(swapped.latestResult?.id).toBe('late-write')
  })

  it('anchors an early valid retest on its own result date', () => {
    const early = view('2026-09-20', {}, [
      result({ createdAt: '2026-09-16T12:00:00.000Z' }),
      result({ id: 'early', resultDate: '2026-09-15', createdAt: '2026-09-15T12:00:00.000Z' }),
    ])
    expect(early.latestResult?.resultDate).toBe('2026-09-15')
    expect(early.minimumDate).toBe('2026-10-15')
    expect(early.status).toBe('waiting_minimum')
  })

  it('excludes archived benchmarks from automatic lists and ranks due work', () => {
    const dueOld = view('2026-12-03', { benchmarkDefinitionId: BENCHMARK, benchmarkTitle: 'Push-up' })
    const dueFurther = view('2026-12-03', { benchmarkDefinitionId: OTHER, benchmarkTitle: 'Plank', protocolVersionId: VERSION_2 }, [
      result({ id: 'plank', benchmarkDefinitionId: OTHER, protocolVersionId: VERSION_2, resultDate: '2026-06-01' }),
    ])
    const waistId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    const available = view('2026-10-16', { benchmarkDefinitionId: waistId, benchmarkTitle: 'Waist' }, [
      result({ id: 'waist', benchmarkDefinitionId: waistId, resultDate: '2026-09-01' }),
    ])
    const listed = activeProtocolRetests([
      { isActive: true, isCurrent: true, view: dueOld },
      { isActive: false, isCurrent: true, view: dueFurther },
      { isActive: true, isCurrent: false, view: available },
    ])
    expect(listed.map((item) => item.benchmarkDefinitionId)).toEqual([BENCHMARK])
    const ranked = orderAutomaticRetests([available, dueOld, dueFurther])
    expect(ranked.map((item) => item.benchmarkDefinitionId)).toEqual([OTHER, BENCHMARK, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'])
    expect(prominentRetests([available, dueOld]).map((item) => item.status)).toEqual(['due', 'available'])
    const today = selectTodayRetest([dueOld, dueFurther, available], new Set())
    expect(today.retest?.benchmarkDefinitionId).toBe(OTHER)
    expect(today.otherDueCount).toBe(1)
    const tied = selectTodayRetest(
      [
        view('2026-12-03', { benchmarkDefinitionId: OTHER, benchmarkTitle: 'Zebra' }),
        view('2026-12-03', { benchmarkDefinitionId: BENCHMARK, benchmarkTitle: 'Alpha' }),
      ],
      new Set(),
    )
    expect(tied.retest?.benchmarkTitle).toBe('Alpha')
  })

  it('suppresses a Today retest only for a scheduled or active linked experiment', () => {
    const due = view('2026-12-03')
    const links = [
      { benchmarkDefinitionId: BENCHMARK, status: 'scheduled' },
      { benchmarkDefinitionId: OTHER, status: 'accepted' },
      { benchmarkDefinitionId: 'unrelated', status: 'active' },
    ]
    const covered = benchmarkIdsWithActionableExperiment(links)
    expect(covered.has(BENCHMARK)).toBe(true)
    expect(covered.has(OTHER)).toBe(false)
    expect(selectTodayRetest([due], covered).retest).toBeNull()
    expect(selectTodayRetest([due], benchmarkIdsWithActionableExperiment([{ benchmarkDefinitionId: BENCHMARK, status: 'active' }])).retest).toBeNull()
    expect(selectTodayRetest([due], benchmarkIdsWithActionableExperiment([{ benchmarkDefinitionId: BENCHMARK, status: 'accepted' }])).retest?.benchmarkDefinitionId).toBe(BENCHMARK)
    expect(selectTodayRetest([due], benchmarkIdsWithActionableExperiment([{ benchmarkDefinitionId: OTHER, status: 'active' }])).retest?.benchmarkDefinitionId).toBe(BENCHMARK)
  })

  it('derives the same state from restored protocol and result facts', () => {
    const facts = {
      protocol: protocol(),
      results: [result({ resultDate: '2026-06-01', createdAt: '2026-06-01T12:00:00.000Z' })],
      asOf: '2026-09-01',
    }
    const before = buildBenchmarkRetestView(facts.protocol, facts.results, facts.asOf)
    const restored = JSON.parse(JSON.stringify(facts)) as typeof facts
    const after = buildBenchmarkRetestView(restored.protocol, restored.results, restored.asOf)
    expect(before.status).toBe('due')
    expect(after).toEqual(before)
    expect(LATEST_SCHEMA_MIGRATION).toBe('0040_goal_training_units_fix.sql')
    expect(BACKUP_TABLES.map((table) => table.name)).not.toContain('benchmark_retests')
  })

  it('rejects a non-date asOf and does not write schedule rows', () => {
    expect(parseRetestAsOf(null, '2026-09-26')).toEqual({ asOf: '2026-09-26' })
    expect(parseRetestAsOf('tomorrow', '2026-09-26')).toEqual({ error: 'asOf must be a calendar date.' })
    const retests = readFileSync('server/lab/retests.ts', 'utf8')
    const results = readFileSync('server/lab/results.ts', 'utf8')
    const today = readFileSync('server/today/service.ts', 'utf8')
    const todayApi = readFileSync('src/features/today/api.ts', 'utf8')
    expect(retests).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/)
    expect(results).not.toContain('minimum_retest')
    expect(today).toContain('listBenchmarkRetests')
    expect(today).not.toContain('benchmark_results')
    expect(today).not.toContain('Retest overdue')
    expect(todayApi).not.toContain('/api/lab/retests')
  })
})

describe('today retest payload', () => {
  it('shows one due retest from the Today sources and keeps experiments', () => {
    const due = view('2026-09-26', { suggestedRetestDays: 1, minimumRetestDays: null }, [
      result({ resultDate: '2026-09-01' }),
    ])
    const sources: TodaySources = {
      now: new Date('2026-09-26T18:00:00.000Z'),
      activityDays: [],
      sleepNights: [],
      latestCompleteSleep: null,
      nutritionEntries: [],
      nutritionTargets: [],
      trainingToday: [],
      trainingSessions: [],
      pendingJobs: [],
      bodyWeights: [],
      lab: {
        experiments: [{ id: 'exp', title: 'Other experiment', status: 'active', windowStart: '2026-09-01', windowEnd: '2026-09-30' }],
        retests: [due, view('2026-09-26', { minimumRetestDays: 30, suggestedRetestDays: null })],
        coveredBenchmarkIds: [],
      },
    }
    const today = buildTodayView(sources)
    expect(today.lab.experiments).toHaveLength(1)
    expect(today.lab.retest?.status).toBe('due')
    expect(today.lab.retest?.benchmarkDefinitionId).toBe(BENCHMARK)
    expect(today.pendingItems.some((item) => item.title.toLowerCase().includes('retest'))).toBe(false)
  })
})
