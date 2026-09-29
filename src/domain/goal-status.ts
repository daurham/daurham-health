import { metricDefinition } from './body-manual.js'
import { resolveCadence, type CadenceConfig, type CadenceObservation } from './body-cadence.js'
import { formatGoalQuantity, formatGoalTarget, type GoalEvidence, type GoalKind, type GoalStatus, type GoalTarget } from './goals.js'
import type { GoalProjection } from './goal-projection.js'
import type { BenchmarkRetestView } from './lab-retests.js'
import { calendarDaysBetween } from './progress/dates.js'

export const GOAL_STATUS_CALCULATION_VERSION = 'goal-status-v1'
export const GOAL_DEADLINE_SOON_DAYS = 7
export const GOAL_ATTENTION_LIMIT = 2

const POINT_KINDS = new Set<GoalKind>([
  'body_metric',
  'strength_e1rm',
  'benchmark_result',
  'training_reps',
  'training_duration',
  'training_distance',
  'training_pace',
  'training_skill',
])

export type GoalTargetState = 'satisfied' | 'below_target' | 'above_target' | 'outside_range_low' | 'outside_range_high' | 'unknown'

export type GoalDeadlineState =
  | 'none'
  | 'future_no_projection'
  | 'projected_before_deadline'
  | 'projected_overlaps_deadline'
  | 'projected_after_deadline'
  | 'due_today'
  | 'passed_satisfied'
  | 'passed_unmet'

export type GoalDisplayStatus =
  | 'paused'
  | 'completed'
  | 'on_track'
  | 'off_track'
  | 'target_met'
  | 'above_target'
  | 'below_target'
  | 'outside_range'
  | 'current_window_meeting'
  | 'current_window_below'
  | 'current_window_above'
  | 'unknown'
  | 'timing_uncertain'

export type GoalStatusView = {
  goalId: string
  goalVersionId: string
  asOf: string
  lifecycle: GoalStatus
  targetState: GoalTargetState
  deadlineState: GoalDeadlineState
  displayStatus: GoalDisplayStatus
  targetLabel: string
  deadlineLabel: string | null
  calculationVersion: typeof GOAL_STATUS_CALCULATION_VERSION
}

export type GoalAttentionKind = 'deadline_passed' | 'deadline_today' | 'measurement_due' | 'deadline_soon'

export type GoalAttentionItem = {
  key: string
  goalId: string
  kind: GoalAttentionKind
  rank: number
  targetDate: string | null
  dueDate: string | null
  title: string
  detail: string
  href: string
  action: string
}

type StatusInput = {
  goalId: string
  goalVersionId: string
  goalKind: GoalKind
  lifecycle: GoalStatus
  displayName: string
  target: GoalTarget
  evidence: Pick<GoalEvidence, 'current' | 'unit' | 'coverage' | 'provisional'>
  projection: GoalProjection | null
  asOf: string
  bodyMetricKey?: string | null
  benchmarkDefinitionId?: string | null
  benchmarkProtocolVersionId?: string | null
  cadence?: { configs: readonly CadenceConfig[]; observations: readonly CadenceObservation[] } | null
  retests?: readonly BenchmarkRetestView[] | null
}

export function goalTargetState(target: GoalTarget, current: number | null): GoalTargetState {
  if (current == null || !Number.isFinite(current)) {
    return 'unknown'
  }
  if (target.targetMode === 'at_least') {
    if (target.targetMin == null) {
      return 'unknown'
    }
    return current >= target.targetMin ? 'satisfied' : 'below_target'
  }
  if (target.targetMode === 'at_most') {
    if (target.targetMax == null) {
      return 'unknown'
    }
    return current <= target.targetMax ? 'satisfied' : 'above_target'
  }
  if (target.targetMin == null || target.targetMax == null) {
    return 'unknown'
  }
  if (current < target.targetMin) {
    return 'outside_range_low'
  }
  if (current > target.targetMax) {
    return 'outside_range_high'
  }
  return 'satisfied'
}

export function goalDeadlineState(
  targetDate: string | null,
  asOf: string,
  targetState: GoalTargetState,
  projection: GoalProjection | null,
): GoalDeadlineState {
  if (!targetDate) {
    return 'none'
  }
  if (targetDate < asOf) {
    return targetState === 'satisfied' ? 'passed_satisfied' : 'passed_unmet'
  }
  if (targetDate === asOf) {
    return targetState === 'satisfied' ? 'none' : 'due_today'
  }
  const start = projection?.estimatedWindowStart
  const end = projection?.estimatedWindowEnd
  if (projection?.state !== 'available' || !start || !end) {
    return 'future_no_projection'
  }
  if (end <= targetDate) {
    return 'projected_before_deadline'
  }
  if (start > targetDate) {
    return 'projected_after_deadline'
  }
  return 'projected_overlaps_deadline'
}

function aggregate(kind: GoalKind): boolean {
  return !POINT_KINDS.has(kind)
}

function projectable(kind: GoalKind): boolean {
  return kind === 'body_metric' || kind === 'strength_e1rm'
}

function targetLabel(kind: GoalKind, state: GoalTargetState): string {
  if (aggregate(kind)) {
    if (state === 'satisfied') return 'Currently meeting target'
    if (state === 'below_target' || state === 'outside_range_low') return 'Current window below target'
    if (state === 'above_target' || state === 'outside_range_high') return 'Current window above range'
    return 'No usable evidence yet'
  }
  if (state === 'satisfied') return 'Target currently met'
  if (state === 'below_target') return 'Below target'
  if (state === 'above_target') return 'Above target'
  if (state === 'outside_range_low' || state === 'outside_range_high') return 'Outside target range'
  return 'No observation yet'
}

function deadlineLabel(kind: GoalKind, deadline: GoalDeadlineState, projection: GoalProjection | null, targetState: GoalTargetState): string | null {
  if (targetState === 'satisfied') {
    if (deadline === 'passed_satisfied') return 'Target date passed'
    return null
  }
  if (deadline === 'projected_before_deadline') return 'On track'
  if (deadline === 'projected_after_deadline') return 'Off track'
  if (deadline === 'projected_overlaps_deadline') return 'Projection overlaps target date'
  if (deadline === 'due_today') return 'Target date today'
  if (deadline === 'passed_unmet') return 'Target date passed'
  if (deadline !== 'future_no_projection') return null
  if (aggregate(kind) || projection == null || projection.state === 'not_applicable' || projection.state === 'not_applicable_lifecycle' || projection.state === 'target_currently_satisfied') {
    return null
  }
  if (projection.state === 'unstable_trend') return 'Recent trend is too variable for a deadline estimate'
  if (projection.state === 'trend_not_toward_target') return 'Recent trend is not moving toward this target'
  if (projection.state === 'beyond_projection_horizon') return 'Projected crossing is too far beyond the observed evidence window'
  return 'Not enough history for a deadline projection'
}

function displayStatus(lifecycle: GoalStatus, kind: GoalKind, targetState: GoalTargetState, deadline: GoalDeadlineState): GoalDisplayStatus {
  if (lifecycle === 'paused') return 'paused'
  if (lifecycle === 'completed') return 'completed'
  if (targetState !== 'satisfied' && targetState !== 'unknown' && deadline === 'projected_before_deadline') return 'on_track'
  if (targetState !== 'satisfied' && deadline === 'projected_after_deadline') return 'off_track'
  if (deadline === 'projected_overlaps_deadline') return 'timing_uncertain'
  if (aggregate(kind)) {
    if (targetState === 'satisfied') return 'current_window_meeting'
    if (targetState === 'below_target' || targetState === 'outside_range_low') return 'current_window_below'
    if (targetState === 'above_target' || targetState === 'outside_range_high') return 'current_window_above'
    return 'unknown'
  }
  if (targetState === 'satisfied') return 'target_met'
  if (targetState === 'above_target') return 'above_target'
  if (targetState === 'below_target') return 'below_target'
  if (targetState === 'outside_range_low' || targetState === 'outside_range_high') return 'outside_range'
  return 'unknown'
}

export function evaluateGoalStatus(input: StatusInput): GoalStatusView {
  const targetState = input.lifecycle === 'active' ? goalTargetState(input.target, input.evidence.current) : 'unknown'
  const deadlineState = input.lifecycle === 'active' ? goalDeadlineState(input.target.targetDate, input.asOf, targetState, input.projection) : 'none'
  return {
    goalId: input.goalId,
    goalVersionId: input.goalVersionId,
    asOf: input.asOf,
    lifecycle: input.lifecycle,
    targetState: input.lifecycle === 'active' ? targetState : 'unknown',
    deadlineState,
    displayStatus: displayStatus(input.lifecycle, input.goalKind, targetState, deadlineState),
    targetLabel: input.lifecycle === 'paused' ? 'Paused' : input.lifecycle === 'completed' ? 'Completed' : targetLabel(input.goalKind, targetState),
    deadlineLabel:
      input.lifecycle === 'active' && input.target.targetDate === input.asOf && targetState === 'satisfied'
        ? 'Target date today'
        : input.lifecycle === 'active'
          ? deadlineLabel(input.goalKind, deadlineState, input.projection, targetState)
          : null,
    calculationVersion: GOAL_STATUS_CALCULATION_VERSION,
  }
}

function currentPhrase(input: StatusInput): string {
  if (input.evidence.current == null) return 'No current measurement available.'
  return `Current: ${formatGoalQuantity(input.evidence.current, input.evidence.unit)}`
}

export function goalAttentionCandidates(input: StatusInput): GoalAttentionItem[] {
  if (input.lifecycle !== 'active') return []
  const status = evaluateGoalStatus(input)
  const items: GoalAttentionItem[] = []
  const href = `/goals/${input.goalId}`
  const unmet = status.targetState !== 'satisfied'
  if (unmet && status.deadlineState === 'passed_unmet' && input.target.targetDate) {
    items.push({
      key: `goal_deadline:${input.goalId}`,
      goalId: input.goalId,
      kind: 'deadline_passed',
      rank: 1,
      targetDate: input.target.targetDate,
      dueDate: input.target.targetDate,
      title: `${input.displayName} goal target date passed`,
      detail: `${currentPhrase(input)} Target: ${formatGoalTarget(input.target)}`,
      href,
      action: 'View goal',
    })
  }
  if (unmet && status.deadlineState === 'due_today') {
    items.push({
      key: `goal_deadline:${input.goalId}`,
      goalId: input.goalId,
      kind: 'deadline_today',
      rank: 2,
      targetDate: input.target.targetDate,
      dueDate: input.target.targetDate,
      title: `${input.displayName} goal target date is today`,
      detail: `${currentPhrase(input)} Target: ${formatGoalTarget(input.target)}`,
      href,
      action: 'View goal',
    })
  }
  const bodyKey = input.bodyMetricKey
  if (bodyKey && input.cadence) {
    const config = input.cadence.configs.find((item) => item.metricKey === bodyKey)
    if (config) {
      const resolution = resolveCadence(config, input.cadence.observations, input.asOf)
      if (resolution.status !== 'current' && input.asOf >= config.enabledFrom) {
        const name = metricDefinition(bodyKey)?.label ?? 'Body metric'
        items.push({
          key: `body_metric_due:${bodyKey}`,
          goalId: input.goalId,
          kind: 'measurement_due',
          rank: 3,
          targetDate: input.target.targetDate,
          dueDate: resolution.dueDate,
          title: resolution.status === 'initial_due' ? `${name} baseline measurement due` : `${name} measurement due`,
          detail: `Supports your ${name} goal.`,
          href: `/body?action=measure&metric=${encodeURIComponent(bodyKey)}`,
          action: 'Measure',
        })
      }
    }
  }
  const retest = (input.retests ?? []).find(
    (item) =>
      item.benchmarkDefinitionId === input.benchmarkDefinitionId &&
      item.protocolVersionId === input.benchmarkProtocolVersionId &&
      item.status === 'due',
  )
  if (retest) {
    items.push({
      key: `benchmark_retest_due:${retest.benchmarkDefinitionId}/${retest.protocolVersionId}`,
      goalId: input.goalId,
      kind: 'measurement_due',
      rank: 3,
      targetDate: input.target.targetDate,
      dueDate: retest.suggestedDate,
      title: `${retest.benchmarkTitle} retest due`,
      detail: `Supports your ${input.displayName} goal.`,
      href: `/lab/benchmarks/${retest.benchmarkDefinitionId}`,
      action: 'Open benchmark',
    })
  }
  const daysUntil = input.target.targetDate ? calendarDaysBetween(input.asOf, input.target.targetDate) : null
  const soon = unmet && daysUntil != null && daysUntil >= 1 && daysUntil <= GOAL_DEADLINE_SOON_DAYS
  const projectionConcern =
    status.deadlineState === 'projected_after_deadline' ||
    status.deadlineState === 'projected_overlaps_deadline' ||
    (status.deadlineState === 'future_no_projection' && input.projection != null && input.projection.state !== 'not_applicable') ||
    status.targetState === 'unknown'
  const soonConcern = projectable(input.goalKind) ? projectionConcern : true
  const hasMeasurement = items.some((item) => item.kind === 'measurement_due')
  if (soon && soonConcern && !hasMeasurement && !items.some((item) => item.key.startsWith('goal_deadline:'))) {
    const unknown = status.targetState === 'unknown'
    items.push({
      key: `goal_deadline:${input.goalId}`,
      goalId: input.goalId,
      kind: 'deadline_soon',
      rank: 4,
      targetDate: input.target.targetDate,
      dueDate: input.target.targetDate,
      title: unknown ? `Goal deadline in ${daysUntil} days` : `${input.displayName} goal target date in ${daysUntil} days`,
      detail: unknown ? 'No current measurement available.' : `${currentPhrase(input)} Target: ${formatGoalTarget(input.target)}`,
      href,
      action: 'View goal',
    })
  }
  return items
}

export function selectGoalAttention(items: readonly GoalAttentionItem[], limit = GOAL_ATTENTION_LIMIT): GoalAttentionItem[] {
  const seen = new Set<string>()
  return [...items]
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank
      const leftDate = left.targetDate ?? '9999-12-31'
      const rightDate = right.targetDate ?? '9999-12-31'
      if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1
      const leftDue = left.dueDate ?? '9999-12-31'
      const rightDue = right.dueDate ?? '9999-12-31'
      if (leftDue !== rightDue) return leftDue < rightDue ? -1 : 1
      return left.goalId < right.goalId ? -1 : left.goalId > right.goalId ? 1 : 0
    })
    .filter((item) => {
      if (seen.has(item.key)) return false
      seen.add(item.key)
      return true
    })
    .slice(0, limit)
}

export function coverageLabel(kind: GoalKind, evidence: Pick<GoalEvidence, 'coverage'>, targetMin?: number | null): string | null {
  const coverage = evidence.coverage
  if (!coverage) return null
  if (kind === 'activity_steps') return `${coverage.observedDays} observed completed days / ${coverage.windowDays}-day window`
  if (kind === 'nutrition_protein') return `${coverage.observedDays} logged days`
  if (kind === 'sleep_duration') {
    const partial = coverage.partialNights === 1 ? '1 partial night excluded' : `${coverage.partialNights} partial nights excluded`
    return `${coverage.observedDays} analysis-eligible nights. ${partial}`
  }
  if (kind === 'supplement_adherence') return `${coverage.takenDays} taken / ${coverage.observedDays} resolved days`
  if (kind === 'training_frequency') {
    return targetMin == null
      ? `${coverage.observedDays} sessions this ${coverage.windowDays}-day window`
      : `${coverage.observedDays} / ${targetMin} sessions this ${coverage.windowDays}-day window`
  }
  return null
}
