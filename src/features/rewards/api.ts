import type { RewardItemInput, RewardsState } from '@/domain/rewards'
import { healthFetch, readApiError } from '@/lib'

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
  return (await response.json()) as RewardsState
}

export function fetchRewards(): Promise<RewardsState> {
  return send('/api/rewards', 'GET')
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
