import { EXPERIMENT_SUGGESTION_CALCULATION_VERSION } from './config.js'
import { sha256Hex, stableJson } from './sha256.js'
import type {
  ExperimentCandidate,
  GoalCompileResult,
  SuggestionCover,
  SuggestionGoalFact,
  SuggestionInput,
  SuggestionKind,
  MaintenanceCalibrationFact,
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

function maintenanceCalibrationCandidate(
  fact: MaintenanceCalibrationFact,
  covers: readonly SuggestionCover[],
): ExperimentCandidate | null {
  if (!fact.eligible) return null
  if (fact.linkedGoalId && openCover(covers, (cover) => cover.goalId === fact.linkedGoalId)) return null
  const candidateId = `maintenance-calibration:${fact.linkedGoalId ?? 'unlinked'}`
  const evidence = fact.evidenceRefs.map((ref) => ({
    ref,
    label:
      ref === 'maintenance:estimate'
        ? 'Observed maintenance estimate'
        : ref === 'maintenance:nutrition-quality'
          ? 'Nutrition evidence quality'
          : ref === 'maintenance:body-quality'
            ? 'Body-measurement comparability'
            : 'Plateau classification',
  }))
  const spec: SuggestionProtocolSpec = {
    instructions: [
      `For ${fact.durationDays} consecutive days, keep the current intended calorie and activity plan stable when practical.`,
      'Log all calorie-containing food and drinks.',
      'Record body weight under usual comparable conditions on at least five days.',
      'Continue carbohydrate, sodium, logged-water, bowel, and Daily Context tracking so short-term scale noise is visible.',
      'Do not deliberately manipulate hydration or sodium to change the scale reading.',
    ].join(' '),
    durationLabel: `${fact.durationDays}-day observation`,
    requirements: [
      {
        position: 1,
        role: 'primary_outcome',
        domain: 'body',
        requirementKind: 'body_metric',
        selector: { metricKey: 'weight' },
        label: 'Body weight',
        required: true,
        criteria: { minimumObservations: fact.requiredWeightMeasurements, minimumCoveragePercent: null, minimumAdherencePercent: null },
      },
      {
        position: 2,
        role: 'adherence',
        domain: 'nutrition',
        requirementKind: 'nutrition_metric',
        selector: { metricKey: 'calories' },
        label: 'Calories',
        required: true,
        criteria: { minimumObservations: fact.requiredNutritionDays, minimumCoveragePercent: 70, minimumAdherencePercent: null },
      },
      {
        position: 3,
        role: 'context',
        domain: 'nutrition',
        requirementKind: 'nutrition_metric',
        selector: { metricKey: 'carbs' },
        label: 'Carbohydrate',
        required: false,
        criteria: { minimumObservations: 7, minimumCoveragePercent: 50, minimumAdherencePercent: null },
      },
    ],
    contextControls: [
      'travel',
      'alcohol',
      'late_meal',
      'unusual_stress',
      'poor_sleep_opportunity',
      'baby_night_interruption',
      'sick',
      'unusual_physical_labor',
    ].map((tagKey) => ({ tagKey, controlMode: 'observe' as const })),
    benchmarkDefinitionId: null,
    benchmarkProtocolVersionId: null,
    protocolVersionNumber: null,
    goalId: fact.linkedGoalId,
    goalVersionId: fact.linkedGoalVersionId,
  }
  return {
    candidateId,
    candidateFingerprint: fingerprint('maintenance_calibration', {
      asOf: fact.asOf,
      goalId: fact.linkedGoalId,
      goalVersionId: fact.linkedGoalVersionId,
      estimatePeriodStart: fact.estimatePeriodStart,
      estimatePeriodEnd: fact.estimatePeriodEnd,
      observedMaintenanceKcal: fact.observedMaintenanceKcal,
      plateauState: fact.plateauState,
      protocol: spec,
      evidenceRefs: fact.evidenceRefs,
    }),
    calculationVersion: EXPERIMENT_SUGGESTION_CALCULATION_VERSION,
    kind: 'maintenance_calibration',
    presentation: 'observation',
    title: 'Weight-response calibration',
    question: 'Does body weight remain broadly stable when intake, weigh-ins, and short-term scale context are observed more consistently?',
    hypothesis: 'A controlled observation period will reduce uncertainty around observed maintenance and plateau classification.',
    rationale: fact.why,
    limitations: 'This is an observation protocol. It does not prescribe a calorie target, dehydration, sodium manipulation, or a weight-loss rate.',
    why: fact.why,
    protocol: spec,
    evidence,
    linkedGoalLabel: null,
    linkedBenchmarkLabel: null,
  }
}

function rank(kind: SuggestionKind): number {
  if (kind === 'benchmark_retest_due') return 0
  if (kind === 'benchmark_missing_baseline') return 1
  if (kind === 'maintenance_calibration') return 2
  return 3
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
  const maintenance = input.maintenanceCalibration
    ? maintenanceCalibrationCandidate(input.maintenanceCalibration, input.covers)
    : null
  if (maintenance) candidates.push(maintenance)
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
