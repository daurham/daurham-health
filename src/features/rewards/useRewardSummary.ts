import { useCallback, useEffect, useState } from 'react'
import type { RewardSummary } from '@/domain/rewards'
import { subscribeRewardStateChanges } from '@/lib/reward-events'
import { fetchRewardSummary } from './api'

export type RewardSummaryResource = {
  summary: RewardSummary | null
  pending: boolean
  error: string | null
  refresh: () => void
}

export function useRewardSummary(enabled = true): RewardSummaryResource {
  const [summary, setSummary] = useState<RewardSummary | null>(null)
  const [pending, setPending] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)

  const refresh = useCallback(() => {
    if (enabled) setGeneration((value) => value + 1)
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setSummary(null)
      setError(null)
      setPending(false)
      return
    }
    let active = true
    setPending(true)
    fetchRewardSummary()
      .then((next) => {
        if (!active) return
        setSummary(next)
        setError(null)
      })
      .catch((caught: unknown) => {
        if (!active) return
        setError(caught instanceof Error ? caught.message : 'XP is unavailable')
      })
      .finally(() => {
        if (active) setPending(false)
      })
    return () => {
      active = false
    }
  }, [enabled, generation])

  useEffect(() => subscribeRewardStateChanges(refresh), [refresh])

  return { summary, pending, error, refresh }
}
