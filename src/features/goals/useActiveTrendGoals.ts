import { useCallback, useEffect, useState } from 'react'
import type { TrendGoalIntent } from '@/domain/trend-intent'
import { subscribeHealthDataChanges } from '@/lib/health-changes'
import { fetchGoals, type GoalView } from './api'

function toTrendGoal(goal: GoalView): TrendGoalIntent {
  return {
    id: goal.id,
    goalKind: goal.goalKind,
    status: goal.status,
    bodyMetricKey: goal.selector.bodyMetricKey,
    exerciseDefinitionId: goal.selector.exerciseDefinitionId,
    targetMode: goal.currentVersion.targetMode,
    relation: goal.evidence.relation,
  }
}

export function useActiveTrendGoals(enabled: boolean): {
  goals: TrendGoalIntent[]
  pending: boolean
  refresh: () => void
} {
  const [goals, setGoals] = useState<TrendGoalIntent[]>([])
  const [pending, setPending] = useState(enabled)
  const [generation, setGeneration] = useState(0)

  const refresh = useCallback(() => {
    if (enabled) setGeneration((value) => value + 1)
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setGoals([])
      setPending(false)
      return
    }
    let active = true
    setPending(true)
    fetchGoals()
      .then((result) => {
        if (active) setGoals(result.goals.filter((goal) => goal.status === 'active').map(toTrendGoal))
      })
      .catch(() => {
        if (active) setGoals([])
      })
      .finally(() => {
        if (active) setPending(false)
      })
    return () => {
      active = false
    }
  }, [enabled, generation])

  useEffect(() => enabled ? subscribeHealthDataChanges(refresh) : () => undefined, [enabled, refresh])

  return { goals, pending, refresh }
}
