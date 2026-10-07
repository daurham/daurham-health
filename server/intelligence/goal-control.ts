import { buildGoalControlState, type GoalControlState } from '../../src/domain/goal-control.js'
import { buildWeeklyCoachBrief, type WeeklyCoachBrief, type WeeklyCoachInput } from '../../src/domain/weekly-coach/index.js'
import { loadWeeklyCoachInput } from '../weekly-coach/load.js'
import { loadHealthIntelligenceSnapshot } from './snapshot.js'

export async function loadGoalControlState(
  asOf: string,
  preloaded?: { weeklyInput: WeeklyCoachInput; brief: WeeklyCoachBrief },
): Promise<GoalControlState> {
  const weeklyInput = preloaded?.weeklyInput ?? await loadWeeklyCoachInput(asOf)
  const brief = preloaded?.brief ?? buildWeeklyCoachBrief(weeklyInput)
  const intelligence = await loadHealthIntelligenceSnapshot({ range: '30d', asOf })
  return buildGoalControlState({
    asOf,
    brief,
    intelligence,
    goals: weeklyInput.goals,
    trainingPlan: weeklyInput.trainingPlan ?? null,
  })
}
