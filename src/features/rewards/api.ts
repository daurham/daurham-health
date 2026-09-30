import type { RewardItemInput, RewardSummary, RewardsState } from '@/domain/rewards'
import { healthFetch, readApiError } from '@/lib'
import { notifyRewardStateChanged } from '@/lib/reward-events'

async function send(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<RewardsState> {
  const response = await healthFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  const state = (await response.json()) as RewardsState
  if (method !== 'GET') {
    notifyRewardStateChanged({
      kind: path.includes('/refund')
        ? 'refund'
        : path.includes('/purchases')
          ? 'purchase'
          : 'catalog',
    })
  }
  return state
}

export function fetchRewards(): Promise<RewardsState> {
  return send('/api/rewards', 'GET')
}

export async function fetchRewardSummary(): Promise<RewardSummary> {
  const response = await healthFetch('/api/rewards/summary')
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as RewardSummary
}

export function createReward(input: RewardItemInput): Promise<RewardsState> {
  return send('/api/rewards/items', 'POST', input)
}

export function updateReward(id: string, input: RewardItemInput): Promise<RewardsState> {
  return send(`/api/rewards/items/${id}`, 'PATCH', input)
}

export function archiveReward(id: string): Promise<RewardsState> {
  return send(`/api/rewards/items/${id}`, 'DELETE')
}

export function purchaseReward(rewardItemId: string, submissionId: string): Promise<RewardsState> {
  return send('/api/rewards/purchases', 'POST', { rewardItemId, submissionId })
}

export function refundPurchase(purchaseId: string): Promise<RewardsState> {
  return send(`/api/rewards/purchases/${purchaseId}/refund`, 'POST', {})
}
