import { latestValidBenchmarkResult } from './lab-results.js'
import { addCalendarDays, calendarDaysBetween } from './progress/dates.js'
import { isCalendarDate } from './training.js'

/**
 * Retest state is derived. It is not stored.
 *
 * minimum_retest_days is the earliest suggested repeat. It does not block recording.
 * suggested_retest_days is the point where Health surfaces "Retest suggested".
 * Only the current protocol version of an active benchmark schedules automatic reminders.
 * The anchor is the latest valid result for that exact version, by result_date.
 */

export const BENCHMARK_RETEST_STATES = [
  'unconfigured',
  'no_baseline',
  'waiting_minimum',
  'available',
  'due',
] as const

export type BenchmarkRetestState = (typeof BENCHMARK_RETEST_STATES)[number]

export type BenchmarkRetestPrimaryValue = {
  requirementId: string
  label: string
  value: number
  unit: string
}

export type BenchmarkRetestLatestResult = {
  id: string
  resultDate: string
  primaryValues: BenchmarkRetestPrimaryValue[]
}

export type BenchmarkRetestView = {
  benchmarkDefinitionId: string
  benchmarkTitle: string
  protocolVersionId: string
  protocolVersion: number
  status: BenchmarkRetestState
  latestResult: BenchmarkRetestLatestResult | null
  minimumRetestDays: number | null
  suggestedRetestDays: number | null
  minimumDate: string | null
  suggestedDate: string | null
  daysSinceResult: number | null
  daysUntilMinimum: number | null
  daysUntilSuggested: number | null
}

export type RetestProtocolInput = {
  benchmarkDefinitionId: string
  benchmarkTitle: string
  protocolVersionId: string
  protocolVersion: number
  minimumRetestDays: number | null
  suggestedRetestDays: number | null
}

export type RetestResultInput = {
  id: string
  benchmarkDefinitionId: string
  protocolVersionId: string
  status: string
  resultDate: string
  createdAt: string
  primaryValues: BenchmarkRetestPrimaryValue[]
}

export type RetestExperimentLink = {
  benchmarkDefinitionId: string
  status: string
}

export function parseRetestAsOf(value: string | null | undefined, today: string): { asOf: string } | { error: string } {
  if (value == null || value.trim() === '') {
    return { asOf: today }
  }
  if (!isCalendarDate(value)) {
    return { error: 'asOf must be a calendar date.' }
  }
  return { asOf: value }
}

export function buildBenchmarkRetestView(
  protocol: RetestProtocolInput,
  results: readonly RetestResultInput[],
  asOf: string,
): BenchmarkRetestView {
  const latest = latestValidBenchmarkResult(results, protocol.benchmarkDefinitionId, protocol.protocolVersionId)
  const minimumDays = protocol.minimumRetestDays
  const suggestedDays = protocol.suggestedRetestDays
  const base = {
    benchmarkDefinitionId: protocol.benchmarkDefinitionId,
    benchmarkTitle: protocol.benchmarkTitle,
    protocolVersionId: protocol.protocolVersionId,
    protocolVersion: protocol.protocolVersion,
    minimumRetestDays: minimumDays,
    suggestedRetestDays: suggestedDays,
  }
  if (minimumDays == null && suggestedDays == null) {
    return {
      ...base,
      status: 'unconfigured',
      latestResult: latest ? latestResult(latest) : null,
      minimumDate: null,
      suggestedDate: null,
      daysSinceResult: latest ? calendarDaysBetween(latest.resultDate, asOf) : null,
      daysUntilMinimum: null,
      daysUntilSuggested: null,
    }
  }
  if (!latest) {
    return {
      ...base,
      status: 'no_baseline',
      latestResult: null,
      minimumDate: null,
      suggestedDate: null,
      daysSinceResult: null,
      daysUntilMinimum: null,
      daysUntilSuggested: null,
    }
  }
  const minimumDate = minimumDays == null ? null : addCalendarDays(latest.resultDate, minimumDays)
  const suggestedDate = suggestedDays == null ? null : addCalendarDays(latest.resultDate, suggestedDays)
  const status = retestStatus(asOf, minimumDate, suggestedDate)
  return {
    ...base,
    status,
    latestResult: latestResult(latest),
    minimumDate,
    suggestedDate,
    daysSinceResult: calendarDaysBetween(latest.resultDate, asOf),
    daysUntilMinimum: minimumDate == null ? null : calendarDaysBetween(asOf, minimumDate),
    daysUntilSuggested: suggestedDate == null ? null : calendarDaysBetween(asOf, suggestedDate),
  }
}

function retestStatus(asOf: string, minimumDate: string | null, suggestedDate: string | null): BenchmarkRetestState {
  if (minimumDate != null && asOf < minimumDate) {
    return 'waiting_minimum'
  }
  if (suggestedDate != null && asOf >= suggestedDate) {
    return 'due'
  }
  return 'available'
}

function latestResult(result: RetestResultInput): BenchmarkRetestLatestResult {
  return {
    id: result.id,
    resultDate: result.resultDate,
    primaryValues: result.primaryValues.map((value) => ({ ...value })),
  }
}

export function activeProtocolRetests(
  items: ReadonlyArray<{ isActive: boolean; isCurrent: boolean; view: BenchmarkRetestView }>,
): BenchmarkRetestView[] {
  return items.filter((item) => item.isActive && item.isCurrent).map((item) => item.view)
}

export function orderAutomaticRetests(views: readonly BenchmarkRetestView[]): BenchmarkRetestView[] {
  const due = rankDueRetests(views.filter((view) => view.status === 'due'))
  const available = views.filter((view) => view.status === 'available').sort(byTitleThenId)
  const rest = views.filter((view) => view.status !== 'due' && view.status !== 'available').sort(byTitleThenId)
  return [...due, ...available, ...rest]
}

export function prominentRetests(views: readonly BenchmarkRetestView[]): BenchmarkRetestView[] {
  return orderAutomaticRetests(views).filter((view) => view.status === 'due' || view.status === 'available')
}

export function benchmarkIdsWithActionableExperiment(links: readonly RetestExperimentLink[]): Set<string> {
  const ids = new Set<string>()
  for (const link of links) {
    if (link.status === 'scheduled' || link.status === 'active') {
      ids.add(link.benchmarkDefinitionId)
    }
  }
  return ids
}

export function selectTodayRetest(
  views: readonly BenchmarkRetestView[],
  coveredBenchmarkIds: ReadonlySet<string>,
): { retest: BenchmarkRetestView | null; otherDueCount: number } {
  const eligible = rankDueRetests(views.filter((view) => view.status === 'due' && !coveredBenchmarkIds.has(view.benchmarkDefinitionId)))
  return {
    retest: eligible[0] ?? null,
    otherDueCount: Math.max(0, eligible.length - 1),
  }
}

function rankDueRetests(views: readonly BenchmarkRetestView[]): BenchmarkRetestView[] {
  return [...views].sort((left, right) => {
    const beyond = daysBeyondSuggested(right) - daysBeyondSuggested(left)
    if (beyond !== 0) {
      return beyond
    }
    const leftDate = left.latestResult?.resultDate ?? ''
    const rightDate = right.latestResult?.resultDate ?? ''
    if (leftDate !== rightDate) {
      return leftDate < rightDate ? -1 : 1
    }
    return byTitleThenId(left, right)
  })
}

function daysBeyondSuggested(view: BenchmarkRetestView): number {
  if (view.daysUntilSuggested == null) {
    return 0
  }
  return -view.daysUntilSuggested
}

function byTitleThenId(left: BenchmarkRetestView, right: BenchmarkRetestView): number {
  if (left.benchmarkTitle !== right.benchmarkTitle) {
    return left.benchmarkTitle < right.benchmarkTitle ? -1 : 1
  }
  if (left.benchmarkDefinitionId !== right.benchmarkDefinitionId) {
    return left.benchmarkDefinitionId < right.benchmarkDefinitionId ? -1 : 1
  }
  return 0
}

export function retestAgePhrase(days: number): string {
  if (days <= 0) {
    return 'today'
  }
  if (days === 1) {
    return '1 day ago'
  }
  return `${days} days ago`
}

export function otherRetestsPhrase(count: number): string | null {
  if (count <= 0) {
    return null
  }
  if (count === 1) {
    return '1 other retest suggested'
  }
  return `${count} other retests suggested`
}
