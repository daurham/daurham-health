import { z } from 'zod'
import type { CoachTaskView } from './coach.js'
import type { ExperimentCandidate, SuggestionKind } from './experiment-suggestions/types.js'
import { sha256Hex, stableJson } from './experiment-suggestions/sha256.js'
import { prominentRetests, type BenchmarkRetestView } from './lab-retests.js'
import { addCalendarDays } from './progress/dates.js'
import { isCalendarDate } from './training.js'

export const COACH_LAB_ITEM_KINDS = ['benchmark_retest', 'experiment_suggestion'] as const
export type CoachLabItemKind = (typeof COACH_LAB_ITEM_KINDS)[number]
export type CoachAttentionReason = 'challenge' | 'goal' | 'due' | 'lab' | 'general'
export const COACH_LAB_SNOOZE_DAYS = 7 as const
export const COACH_LAB_VISIBLE_LIMIT = 3 as const
export const COACH_LAB_RETEST_FINGERPRINT_VERSION = 'coach-lab-retest-v1' as const

/** Derived attention is neither a frozen task nor a rewardable commitment. */
export type CoachLabItem = {
  kind: CoachLabItemKind
  sourceKey: string
  sourceFingerprint: string
  title: string
  detail: string
  attentionReason: 'due' | 'lab'
  urgency: 'due' | 'available' | 'normal'
  href: string
  benchmarkDefinitionId?: string
  protocolVersionId?: string
  suggestionCandidateId?: string
  suggestionCandidateFingerprint?: string
  suggestionKind?: SuggestionKind
}

export type CoachLabSnooze = {
  kind: CoachLabItemKind
  sourceKey: string
  sourceFingerprint: string
  snoozedUntil: string
}

export const coachLabSnoozeSchema = z.object({
  kind: z.enum(COACH_LAB_ITEM_KINDS),
  sourceKey: z.string().min(1).max(512).regex(/^[A-Za-z0-9:_./-]+$/, 'Invalid Lab source key.'),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid Lab fingerprint.'),
}).strict()
export type CoachLabSnoozeInput = z.infer<typeof coachLabSnoozeSchema>

/** Relative age and display prose change without changing the canonical opportunity. */
export function coachRetestFingerprint(view: BenchmarkRetestView): string {
  return sha256Hex(stableJson({
    calculationVersion: COACH_LAB_RETEST_FINGERPRINT_VERSION,
    benchmarkDefinitionId: view.benchmarkDefinitionId,
    protocolVersionId: view.protocolVersionId,
    protocolVersion: view.protocolVersion,
    status: view.status,
    anchorResultId: view.latestResult?.id ?? null,
    anchorResultDate: view.latestResult?.resultDate ?? null,
    minimumRetestDays: view.minimumRetestDays,
    suggestedRetestDays: view.suggestedRetestDays,
    minimumDate: view.minimumDate,
    suggestedDate: view.suggestedDate,
  }))
}

export function coachLabSnoozedUntil(date: string): string {
  return addCalendarDays(date, COACH_LAB_SNOOZE_DAYS)
}

type CoachLabSourceInput = {
  retests: readonly BenchmarkRetestView[]
  suggestions: readonly ExperimentCandidate[]
  coveredBenchmarkIds?: ReadonlySet<string>
}

function retestPair(benchmarkId: string, protocolId: string): string {
  return `${benchmarkId}:${protocolId}`
}

/**
 * Eligibility and ordering come from Lab. This maps existing authority output;
 * it does not calculate retest state, draft proposals, or accept an Experiment.
 * Keep this unbounded/pre-snooze so mutations can validate any current source.
 */
export function deriveCoachLabItems(input: CoachLabSourceInput): CoachLabItem[] {
  const prominent = prominentRetests(input.retests).filter((view) => !input.coveredBenchmarkIds?.has(view.benchmarkDefinitionId))
  const directPairs = new Set(prominent.map((view) => retestPair(view.benchmarkDefinitionId, view.protocolVersionId)))
  const seen = new Set<string>()
  const retests: CoachLabItem[] = prominent.flatMap((view) => {
    const sourceKey = `benchmark-retest:${retestPair(view.benchmarkDefinitionId, view.protocolVersionId)}`
    if (seen.has(sourceKey)) return []
    seen.add(sourceKey)
    const due = view.status === 'due'
    return [{
      kind: 'benchmark_retest', sourceKey, sourceFingerprint: coachRetestFingerprint(view),
      title: `${view.benchmarkTitle} retest`,
      detail: `${due ? 'Retest suggested' : 'Retest available'} under protocol v${view.protocolVersion}.${view.latestResult ? ` Latest valid result: ${view.latestResult.resultDate}.` : ''}`,
      attentionReason: due ? 'due' : 'lab', urgency: due ? 'due' : 'available',
      href: `/lab/benchmarks/${encodeURIComponent(view.benchmarkDefinitionId)}`,
      benchmarkDefinitionId: view.benchmarkDefinitionId, protocolVersionId: view.protocolVersionId,
    }]
  })
  const suggestions: CoachLabItem[] = input.suggestions.flatMap((candidate) => {
    // Goal observation is reserved and deliberately outside H2C.
    if (candidate.kind !== 'benchmark_missing_baseline' && candidate.kind !== 'benchmark_retest_due') return []
    const benchmarkId = candidate.protocol.benchmarkDefinitionId
    const protocolId = candidate.protocol.benchmarkProtocolVersionId
    if (candidate.kind === 'benchmark_retest_due' && benchmarkId && protocolId &&
      directPairs.has(retestPair(benchmarkId, protocolId))) return []
    const sourceKey = candidate.candidateId
    if (seen.has(`suggestion:${sourceKey}`)) return []
    seen.add(`suggestion:${sourceKey}`)
    return [{
      kind: 'experiment_suggestion', sourceKey, sourceFingerprint: candidate.candidateFingerprint,
      title: candidate.title, detail: candidate.why,
      attentionReason: 'lab', urgency: 'normal',
      href: `/lab/suggestions/${encodeURIComponent(candidate.candidateId)}`,
      ...(benchmarkId ? { benchmarkDefinitionId: benchmarkId } : {}),
      ...(protocolId ? { protocolVersionId: protocolId } : {}),
      suggestionCandidateId: candidate.candidateId,
      suggestionCandidateFingerprint: candidate.candidateFingerprint,
      suggestionKind: candidate.kind,
    }]
  })
  return [...retests, ...suggestions]
}

export function coachLabItemSnoozed(
  item: CoachLabItem,
  snoozes: readonly CoachLabSnooze[],
  date: string,
): boolean {
  return snoozes.some((snooze) => snooze.kind === item.kind && snooze.sourceKey === item.sourceKey &&
    snooze.sourceFingerprint === item.sourceFingerprint && isCalendarDate(snooze.snoozedUntil) && date < snooze.snoozedUntil)
}

export function selectVisibleCoachLabItems(
  items: readonly CoachLabItem[],
  snoozes: readonly CoachLabSnooze[],
  date: string,
): { labItems: CoachLabItem[]; labOverflowCount: number } {
  const visible = items.filter((item) => !coachLabItemSnoozed(item, snoozes, date))
  return { labItems: visible.slice(0, COACH_LAB_VISIBLE_LIMIT), labOverflowCount: Math.max(0, visible.length - COACH_LAB_VISIBLE_LIMIT) }
}

export function coachTaskAttentionReason(
  task: Pick<CoachTaskView, 'taskKind' | 'ruleKey' | 'goalId' | 'metadata'>,
): CoachAttentionReason {
  if (task.taskKind === 'stretch_quest') return 'challenge'
  if (task.ruleKey.startsWith('body-cadence:') || task.metadata.completionRule === 'body_metric') return 'due'
  if (task.goalId != null || task.ruleKey.startsWith('goal:')) return 'goal'
  return 'general'
}
