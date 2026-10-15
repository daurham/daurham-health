import { buildMaintenanceState, type MaintenanceState, type MaintenanceWeightGoal, type MaintenanceAdjustmentContext } from '../../src/domain/maintenance.js'
import type { HealthIntelligenceSnapshot } from '../../src/domain/intelligence/shared.js'
import { addCalendarDays } from '../../src/domain/training-plan.js'
import { listDailyContexts } from '../context/service.js'
import { currentHealthDate } from '../health-time.js'
import { listGoals } from '../goals/service.js'
import { loadHealthIntelligenceSnapshot } from './snapshot.js'
import { loadVerifiedNutritionDays } from '../nutrition/maintenance-eligibility.js'
import { getSql } from '../db.js'

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

/** One deterministic, read-only check. A failed query never means "no experiments". */
export async function loadMaintenanceAdjustmentContext(asOf: string): Promise<MaintenanceAdjustmentContext> {
  try {
    const sql = await getSql()
    const rows = await sql.query(
      `SELECT
         (SELECT calories_target FROM nutrition_targets
           WHERE effective_from <= $1::date
           ORDER BY effective_from DESC LIMIT 1) AS calorie_target,
         (SELECT count(*)::int FROM experiments
           WHERE status = 'active'
              OR (status = 'scheduled' AND window_start <= $1::date + 14
                  AND window_end >= $1::date)) AS experiment_count`,
      [asOf],
    ) as Array<{ calorie_target: number | string | null; experiment_count: number | string }>
    const result = rows[0]
    const experiments = Number(result?.experiment_count)
    const current = result?.calorie_target == null ? null : Number(result.calorie_target)
    if (!result || !Number.isSafeInteger(experiments) || experiments < 0 ||
        (current != null && (!Number.isFinite(current) || current <= 0))) {
      return { status: 'unavailable', currentCalorieTarget: null, activeExperimentCount: 0 }
    }
    return { status: 'available', currentCalorieTarget: current, activeExperimentCount: experiments }
  } catch {
    return { status: 'unavailable', currentCalorieTarget: null, activeExperimentCount: 0 }
  }
}

export async function loadMaintenanceState(input: {
  asOf: string
  snapshot?: HealthIntelligenceSnapshot
  listedGoals?: GoalList
}): Promise<MaintenanceState> {
  const today = await currentHealthDate()
  const snapshot = input.snapshot ?? await loadHealthIntelligenceSnapshot({ range: '30d', asOf: input.asOf })
  const contextStart = addCalendarDays(input.asOf, -29)
  const [contexts, weightGoal, eligibleNutritionDates, adjustmentContext] = await Promise.all([
    listDailyContexts(contextStart, input.asOf),
    currentWeightGoal(input.asOf, today, input.listedGoals),
    // Database/source failures fail CLOSED, never to pre-PIQ source-quality-only behavior.
    loadVerifiedNutritionDays({ snapshot, asOf: input.asOf, today }).catch(() => new Set<string>()),
    loadMaintenanceAdjustmentContext(input.asOf),
  ])
  return buildMaintenanceState({
    asOf: input.asOf,
    today,
    intelligence: snapshot,
    contexts,
    weightGoal,
    eligibleNutritionDates,
    adjustmentContext,
  })
}
