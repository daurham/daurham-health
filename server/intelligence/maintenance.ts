import { buildMaintenanceState, type MaintenanceState, type MaintenanceWeightGoal, type MaintenanceAdjustmentContext } from '../../src/domain/maintenance.js'
import type { HealthIntelligenceSnapshot } from '../../src/domain/intelligence/shared.js'
import { addCalendarDays } from '../../src/domain/training-plan.js'
import { listDailyContexts } from '../context/service.js'
import { currentHealthDate } from '../health-time.js'
import { listGoals } from '../goals/service.js'
import { loadHealthIntelligenceSnapshot } from './snapshot.js'
import { loadVerifiedNutritionDays } from '../nutrition/maintenance-eligibility.js'
import { readMaintenanceDecisionSnapshot } from './maintenance-revision.js'
import { compareMaintenanceDecisionRevisions } from '../../src/domain/maintenance-revision.js'
import { assessMaintenancePerformanceSafety } from '../../src/domain/maintenance-performance.js'
import { loadTrainingProgressionState } from './training-progression.js'
import type { TrainingProgressionState } from '../../src/domain/training-progression.js'

type GoalList = Awaited<ReturnType<typeof listGoals>>['goals']

async function currentWeightGoal(
  asOf: string,
  today: string,
  listedGoals?: GoalList,
): Promise<MaintenanceWeightGoal | null> {
  if (asOf !== today) return null
  const goals = listedGoals ?? (await listGoals()).goals
  const weightGoals = goals.filter((item) =>
    item.status === 'active' &&
    item.goalKind === 'body_metric' &&
    item.selector?.bodyMetricKey === 'weight',
  )
  if (weightGoals.length !== 1) return null
  const goal = weightGoals[0]!
  const version = goal.currentVersion
  const targetState = goal.goalStatus.targetState
  let direction: MaintenanceWeightGoal['direction'] = 'unknown'
  if (targetState === 'satisfied') {
    direction = 'maintain'
  } else if (version.targetMode === 'at_most' && targetState === 'above_target') {
    direction = 'lose'
  } else if (version.targetMode === 'at_least' && targetState === 'below_target') {
    direction = 'gain'
  } else if (version.targetMode === 'range' && targetState === 'outside_range_high') {
    direction = 'lose'
  } else if (version.targetMode === 'range' && targetState === 'outside_range_low') {
    direction = 'gain'
  }
  return {
    goalId: goal.id,
    goalVersionId: version.id,
    label: goal.displayName,
    targetState,
    direction,
  }
}

/** The target/experiment payload shares the same single-statement goal revision. */
export async function loadMaintenanceAdjustmentContext(asOf: string): Promise<MaintenanceAdjustmentContext> {
  const snapshot = await readMaintenanceDecisionSnapshot(asOf)
  return {
    status: snapshot.status,
    currentCalorieTarget: snapshot.currentCalorieTarget,
    activeExperimentCount: snapshot.activeExperimentCount,
    decisionRevision: snapshot.revision,
  }
}

export async function loadMaintenanceState(input: {
  asOf: string
  snapshot?: HealthIntelligenceSnapshot
  listedGoals?: GoalList
  /** Share canonical training evidence with Goal Control; avoid duplicate SQL. */
  trainingProgressionPromise?: Promise<TrainingProgressionState>
}): Promise<MaintenanceState> {
  const today = await currentHealthDate()
  const snapshot = input.snapshot ?? await loadHealthIntelligenceSnapshot({ range: '30d', asOf: input.asOf })
  const contextStart = addCalendarDays(input.asOf, -29)
  // Bracket the independent Goal Control/Training/Nutrition reads with
  // decision-setting revisions; a concurrent edit must fail closed.
  const adjustmentContext = await loadMaintenanceAdjustmentContext(input.asOf)
  const [contexts, listedGoals, training, eligibleNutritionDates] = await Promise.all([
    listDailyContexts(contextStart, input.asOf),
    input.listedGoals
      ? Promise.resolve(input.listedGoals)
      : input.asOf === today ? listGoals().then((value) => value.goals) : Promise.resolve([] as GoalList),
    (input.trainingProgressionPromise ?? loadTrainingProgressionState(input.asOf)).catch(() => null),
    // Database/source failures fail CLOSED, never to pre-PIQ source-quality-only behavior.
    loadVerifiedNutritionDays({ snapshot, asOf: input.asOf, today }).catch(() => new Set<string>()),
  ])
  const fresh = await readMaintenanceDecisionSnapshot(input.asOf)
  const revisionStatus = compareMaintenanceDecisionRevisions(adjustmentContext.decisionRevision, fresh.revision)
  const weightGoal = await currentWeightGoal(input.asOf, today, listedGoals)
  const performance = assessMaintenancePerformanceSafety({
    asOf: input.asOf,
    training,
    goals: listedGoals.map((goal) => ({
      label: goal.displayName, kind: goal.goalKind, lifecycle: goal.status,
      targetState: goal.goalStatus.targetState, deadlineState: goal.goalStatus.deadlineState,
    })),
  })
  return buildMaintenanceState({
    asOf: input.asOf,
    today,
    intelligence: snapshot,
    contexts,
    weightGoal,
    eligibleNutritionDates,
    adjustmentContext: { ...adjustmentContext, performance, revisionStatus },
  })
}
