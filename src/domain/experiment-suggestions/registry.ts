import { EXPERIMENT_SUGGESTION_CALCULATION_VERSION } from './config.js'
import { sha256Hex, stableJson } from './sha256.js'
import type {
  ExperimentCandidate,
  GoalCompileResult,
  SuggestionCover,
  SuggestionGoalFact,
  SuggestionInput,
  SuggestionKind,
  SuggestionProtocolFact,
  SuggestionProtocolSpec,
} from './types.js'
import { OPEN_EXPERIMENT_STATUSES } from './types.js'

const LIMITATION = 'This observes an existing measurement. It does not change a dose, start a supplement, or prescribe a treatment.'

function openCover(covers: readonly SuggestionCover[], match: (cover: SuggestionCover) => boolean): boolean {
  return covers.some((cover) => (OPEN_EXPERIMENT_STATUSES as readonly string[]).includes(cover.status) && match(cover))
}

function durationLabel(minimum: number | null, suggested: number | null): string {
  if (suggested != null) {
    return `Suggested repeat after ${suggested} days`
  }
  if (minimum != null) {
    return `Earliest suggested repeat after ${minimum} days`
  }
  return 'No retest interval is configured. The owner schedules the experiment window later.'
}

function fingerprint(kind: SuggestionKind, payload: Record<string, unknown>): string {
  return sha256Hex(
    stableJson({
      calculationVersion: EXPERIMENT_SUGGESTION_CALCULATION_VERSION,
      kind,
      ...payload,
    }),
  )
}

function benchmarkCandidate(protocol: SuggestionProtocolFact, kind: SuggestionKind): ExperimentCandidate {
  const anchor = protocol.anchorResultId
  const candidateId =
    kind === 'benchmark_retest_due'
      ? `benchmark-retest:${protocol.benchmarkDefinitionId}:${protocol.protocolVersionId}:${anchor}`
      : `benchmark-missing-baseline:${protocol.benchmarkDefinitionId}:${protocol.protocolVersionId}`
  const evidence = [
    { ref: `benchmark:${protocol.benchmarkDefinitionId}`, label: protocol.title },
    { ref: `protocol-version:${protocol.protocolVersionId}`, label: `${protocol.title} · v${protocol.protocolVersion}` },
  ]
  if (anchor && protocol.anchorValueLabel && protocol.anchorResultDate) {
    evidence.push({
      ref: `result:${anchor}`,
      label: `${protocol.anchorValueLabel} · ${protocol.anchorResultDate}`,
    })
  }
  const why =
    kind === 'benchmark_retest_due'
      ? `${protocol.title} retest is due.`
      : `${protocol.title} has no valid comparable result.`
  const spec: SuggestionProtocolSpec = {
    instructions: `Use ${protocol.title} protocol v${protocol.protocolVersion} exactly. ${protocol.instructions}`,
    durationLabel: durationLabel(protocol.minimumRetestDays, protocol.suggestedRetestDays),
    requirements: [
      {
        position: 1,
        role: 'primary_outcome',
        domain: 'benchmark',
        requirementKind: 'benchmark_definition',
        selector: {
          benchmarkDefinitionId: protocol.benchmarkDefinitionId,
          benchmarkProtocolVersionId: protocol.protocolVersionId,
        },
        label: protocol.title,
        required: true,
        criteria: { minimumObservations: 1, minimumCoveragePercent: null, minimumAdherencePercent: null },
      },
    ],
    contextControls: [],
    benchmarkDefinitionId: protocol.benchmarkDefinitionId,
    benchmarkProtocolVersionId: protocol.protocolVersionId,
    protocolVersionNumber: protocol.protocolVersion,
    goalId: null,
    goalVersionId: null,
  }
  return {
    candidateId,
    candidateFingerprint: fingerprint(kind, {
      benchmarkDefinitionId: protocol.benchmarkDefinitionId,
      protocolVersionId: protocol.protocolVersionId,
      protocolVersion: protocol.protocolVersion,
      anchorResultId: anchor,
      retestStatus: protocol.retestStatus,
      instructions: spec.instructions,
      requirement: spec.requirements[0],
      evidenceRefs: evidence.map((item) => item.ref),
    }),
    calculationVersion: EXPERIMENT_SUGGESTION_CALCULATION_VERSION,
    kind,
    presentation: 'challenge',
    title: kind === 'benchmark_retest_due' ? `${protocol.title} retest` : `${protocol.title} baseline`,
    question:
      kind === 'benchmark_retest_due'
        ? `Does repeating ${protocol.title} under protocol v${protocol.protocolVersion} produce a comparable result?`
        : `What is the first valid result for ${protocol.title} under protocol v${protocol.protocolVersion}?`,
    hypothesis: 'The pinned protocol version can be repeated and measured without changing the test.',
    rationale: why,
    limitations: `${LIMITATION} Health will reuse exactly protocol v${protocol.protocolVersion}.`,
    why,
    protocol: spec,
    evidence,
    linkedGoalLabel: null,
    linkedBenchmarkLabel: `${protocol.title} · v${protocol.protocolVersion}`,
  }
}

const GOAL_EVIDENCE_MISSING =
  'Missing current goal evidence is not an unmet target. A goal suggestion requires a current observation.'

const GOAL_TARGET_UNSUPPORTED =
  'Personal Lab cannot yet represent the complete goal target and evaluation semantics. Body, activity, nutrition, sleep, and supplement requirements do not evaluate the goal threshold and window.'

export function compileGoalToExperimentCandidate(
  goal: SuggestionGoalFact,
  covers: readonly SuggestionCover[] = [],
): GoalCompileResult {
  if (goal.targetState === 'unknown') {
    return { supported: false, reason: GOAL_EVIDENCE_MISSING }
  }
  const covered = openCover(covers, (cover) => cover.goalId === goal.goalId)
  return {
    supported: false,
    reason: covered ? `${GOAL_TARGET_UNSUPPORTED} An open experiment also covers this goal.` : GOAL_TARGET_UNSUPPORTED,
  }
}

function rank(kind: SuggestionKind): number {
  if (kind === 'benchmark_retest_due') return 0
  if (kind === 'benchmark_missing_baseline') return 1
  return 2
}

export function buildExperimentSuggestions(input: SuggestionInput): ExperimentCandidate[] {
  const candidates: ExperimentCandidate[] = []
  for (const protocol of input.protocols) {
    if (!protocol.active) {
      continue
    }
    const covered = openCover(input.covers, (cover) => cover.benchmarkDefinitionId === protocol.benchmarkDefinitionId)
    if (covered) {
      continue
    }
    if (protocol.retestStatus === 'due' && protocol.anchorResultId) {
      candidates.push(benchmarkCandidate(protocol, 'benchmark_retest_due'))
      continue
    }
    if (protocol.isCurrent && protocol.anchorResultId == null) {
      candidates.push(benchmarkCandidate(protocol, 'benchmark_missing_baseline'))
    }
  }
  for (const goal of input.goals) {
    const compiled = compileGoalToExperimentCandidate(goal, input.covers)
    if (compiled.supported) {
      candidates.push(compiled.candidate)
    }
  }
  return candidates.sort((left, right) => rank(left.kind) - rank(right.kind) || left.candidateId.localeCompare(right.candidateId))
}

export function findExperimentCandidate(input: SuggestionInput, candidateId: string): ExperimentCandidate | null {
  return buildExperimentSuggestions(input).find((candidate) => candidate.candidateId === candidateId) ?? null
}
