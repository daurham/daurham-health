import type { GoalControlState } from '@/domain/goal-control'
import { healthFetch, readApiError } from '@/lib'

export async function fetchGoalControl(signal?: AbortSignal): Promise<GoalControlState> {
  const response = await healthFetch('/api/intelligence/goal-control', { signal })
  if (!response.ok) throw new Error(await readApiError(response))
  const body = await response.json() as { goalControl: GoalControlState }
  return body.goalControl
}
