import { buildMaintenanceState, type MaintenanceState, type MaintenanceWeightGoal } from '../../src/domain/maintenance.js'
import type { HealthIntelligenceSnapshot } from '../../src/domain/intelligence/shared.js'
import { addCalendarDays } from '../../src/domain/training-plan.js'
import { listDailyContexts } from '../context/service.js'
import { currentHealthDate } from '../health-time.js'
import { listGoals } from '../goals/service.js'
import { loadHealthIntelligenceSnapshot } from './snapshot.js'

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

export async function loadMaintenanceState(input: {
  asOf: string
  snapshot?: HealthIntelligenceSnapshot
  listedGoals?: GoalList
}): Promise<MaintenanceState> {
  const today = await currentHealthDate()
  const snapshot = input.snapshot ?? await loadHealthIntelligenceSnapshot({ range: '30d', asOf: input.asOf })
  const contextStart = addCalendarDays(input.asOf, -29)
  const [contexts, weightGoal] = await Promise.all([
    listDailyContexts(contextStart, input.asOf),
    currentWeightGoal(input.asOf, today, input.listedGoals),
  ])
  return buildMaintenanceState({
    asOf: input.asOf,
    today,
    intelligence: snapshot,
    contexts,
    weightGoal,
  })
}
