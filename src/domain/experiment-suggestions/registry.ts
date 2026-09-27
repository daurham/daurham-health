import { bodyGoalUnit } from '../goals.js'
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

function goalDuration(goal: SuggestionGoalFact): string {
  if (goal.target.evaluationWindowDays != null) {
    return `Observation window ${goal.target.evaluationWindowDays} days, from the current goal version`
  }
  return 'Point observation of the current goal version. The owner schedules the experiment window later.'
}

function targetText(goal: SuggestionGoalFact): string {
  const unit = goal.target.targetUnit
  if (goal.target.targetMode === 'at_least') {
    return `at least ${goal.target.targetMin} ${unit}`
  }
  if (goal.target.targetMode === 'at_most') {
    return `at most ${goal.target.targetMax} ${unit}`
  }
  return `${goal.target.targetMin}–${goal.target.targetMax} ${unit}`
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

function goalRequirement(goal: SuggestionGoalFact): SuggestionProtocolSpec['requirements'][number] | null {
  const criteria = { minimumObservations: 1, minimumCoveragePercent: null, minimumAdherencePercent: null }
  if (goal.goalKind === 'body_metric' && goal.selector.bodyMetricKey && bodyGoalUnit(goal.selector.bodyMetricKey) === goal.target.targetUnit) {
    return {
      position: 1,
      role: 'primary_outcome',
      domain: 'body',
      requirementKind: 'body_metric',
      selector: { metricKey: goal.selector.bodyMetricKey },
      label: goal.displayName,
      required: true,
      criteria,
    }
  }
  if (goal.goalKind === 'activity_steps' && goal.target.targetUnit === 'steps/day') {
    return {
      position: 1,
      role: 'primary_outcome',
      domain: 'activity',
      requirementKind: 'activity_metric',
      selector: { metricKey: 'steps_count' },
      label: goal.displayName,
      required: true,
      criteria,
    }
  }
  if (goal.goalKind === 'nutrition_protein' && goal.target.targetUnit === 'g/day') {
    return {
      position: 1,
      role: 'primary_outcome',
      domain: 'nutrition',
      requirementKind: 'nutrition_metric',
      selector: { metricKey: 'protein' },
      label: goal.displayName,
      required: true,
      criteria,
    }
  }
  if (goal.goalKind === 'sleep_duration' && goal.target.targetUnit === 'min/night') {
    return {
      position: 1,
      role: 'primary_outcome',
      domain: 'sleep',
      requirementKind: 'sleep_metric',
      selector: { metricKey: 'total_sleep_minutes' },
      label: goal.displayName,
      required: true,
      criteria,
    }
  }
  if (
    goal.goalKind === 'supplement_adherence' &&
    goal.selector.supplementId &&
    goal.target.targetMode === 'at_least' &&
    goal.target.targetUnit === '%' &&
    goal.target.targetMin != null &&
    goal.target.targetMin >= 0 &&
    goal.target.targetMin <= 100
  ) {
    return {
      position: 1,
      role: 'primary_outcome',
      domain: 'supplements',
      requirementKind: 'supplement_adherence',
      selector: { supplementId: goal.selector.supplementId },
      label: goal.displayName,
      required: true,
      criteria: {
        minimumObservations: null,
        minimumCoveragePercent: null,
        minimumAdherencePercent: goal.target.targetMin,
      },
    }
  }
  return null
}

export function compileGoalToExperimentCandidate(
  goal: SuggestionGoalFact,
  covers: readonly SuggestionCover[] = [],
): GoalCompileResult {
  if (goal.status !== 'active') {
    return { supported: false, reason: 'Only an active goal can be observed.' }
  }
  if (!goal.goalVersionId) {
    return { supported: false, reason: 'The current goal version is missing.' }
  }
  if (goal.targetState === 'satisfied') {
    return { supported: false, reason: 'The current target is already satisfied.' }
  }
  if (openCover(covers, (cover) => cover.goalId === goal.goalId)) {
    return { supported: false, reason: 'An open experiment already covers this goal.' }
  }
  const requirement = goalRequirement(goal)
  if (!requirement) {
    return { supported: false, reason: 'Personal Lab cannot represent this goal target exactly.' }
  }
  const evidence = [
    { ref: `goal:${goal.goalId}`, label: goal.displayName },
    { ref: `goal-version:${goal.goalVersionId}`, label: `${goal.displayName} · v${goal.version}` },
  ]
  const described = targetText(goal)
  const spec: SuggestionProtocolSpec = {
    instructions: `Observe ${goal.displayName}. Keep the existing target: ${described}. Do not change the target, the unit, or the owner's intent.`,
    durationLabel: goalDuration(goal),
    requirements: [requirement],
    contextControls: [],
    benchmarkDefinitionId: null,
    benchmarkProtocolVersionId: null,
    protocolVersionNumber: null,
    goalId: goal.goalId,
    goalVersionId: goal.goalVersionId,
  }
  const candidate: ExperimentCandidate = {
    candidateId: `goal-observation:${goal.goalId}:${goal.goalVersionId}`,
    candidateFingerprint: fingerprint('goal_observation', {
      goalId: goal.goalId,
      goalVersionId: goal.goalVersionId,
      goalKind: goal.goalKind,
      targetMode: goal.target.targetMode,
      targetMin: goal.target.targetMin,
      targetMax: goal.target.targetMax,
      targetUnit: goal.target.targetUnit,
      evaluationWindowDays: goal.target.evaluationWindowDays,
      selector: goal.selector,
      requirement,
      evidenceRefs: evidence.map((item) => item.ref),
    }),
    calculationVersion: EXPERIMENT_SUGGESTION_CALCULATION_VERSION,
    kind: 'goal_observation',
    presentation: 'observation',
    title: `Observe ${goal.displayName}`,
    question: `Does the current ${goal.displayName} observation still sit against the existing target of ${described}?`,
    hypothesis: 'The experiment records the measurement the goal already uses. It does not prescribe how to reach the target.',
    rationale: `${goal.displayName} is active and the current target is not satisfied.`,
    limitations: LIMITATION,
    why: `${goal.displayName} is an active unmet goal that Personal Lab can measure.`,
    protocol: spec,
    evidence,
    linkedGoalLabel: `${goal.displayName} · v${goal.version} · ${described}`,
    linkedBenchmarkLabel: null,
  }
  return { supported: true, candidate }
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
