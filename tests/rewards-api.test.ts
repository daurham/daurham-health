import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { handleRewards, matchRewardsRoute } from '../server/handlers/rewards.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const service = vi.hoisted(() => ({
  readRewards: vi.fn(),
  readRewardSummary: vi.fn(),
  createRewardItem: vi.fn(),
  updateRewardItem: vi.fn(),
  archiveRewardItem: vi.fn(),
  purchaseReward: vi.fn(),
  refundRewardPurchase: vi.fn(),
}))

vi.mock('../server/rewards/service.ts', () => service)

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

const ITEM = '11111111-1111-4111-8111-111111111111'
const PURCHASE = '22222222-2222-4222-8222-222222222222'
const EMPTY = {
  ruleVersion: 'xp-rule-v1',
  balances: { lifetimeXp: 0, spendableXp: 0 },
  items: [],
  purchases: [],
  activity: [],
}

function request(method: string, url: string, body?: unknown): ApiRequest {
  return { method, url, headers: {}, body, async *[Symbol.asyncIterator]() {} } as ApiRequest
}

function response() {
  const nodeRes = new ServerResponse(new IncomingMessage(new Socket()))
  const res = wrapNodeResponse(nodeRes)
  let statusCode = 200
  const headers = new Map<string, string>()
  res.setHeader = ((name: string, value: string) => {
    headers.set(name.toLowerCase(), value)
    return res
  }) as ApiResponse['setHeader']
  res.status = (code: number) => {
    statusCode = code
    return res
  }
  res.json = () => res
  return { res, status: () => statusCode, allow: () => headers.get('allow') }
}

function call(method: string, url: string, identity: { id: string; email: string } | null, body?: unknown) {
  const captured = response()
  return withOwnerAuth(handleRewards, {
    config: ownerConfig,
    readSession: async () => identity,
  })(request(method, url, body), captured.res).then(() => captured)
}

describe('Rewards API routing', () => {
  beforeEach(() => {
    for (const fn of Object.values(service)) fn.mockReset()
    service.readRewards.mockResolvedValue(EMPTY)
    service.readRewardSummary.mockResolvedValue({ lifetimeXp: 125, spendableXp: 75 })
    service.createRewardItem.mockResolvedValue(EMPTY)
    service.updateRewardItem.mockResolvedValue(EMPTY)
    service.archiveRewardItem.mockResolvedValue(EMPTY)
    service.purchaseReward.mockResolvedValue(EMPTY)
    service.refundRewardPurchase.mockResolvedValue(EMPTY)
  })

  it('matches every wallet route through the single API dispatcher', () => {
    expect(matchRewardsRoute('/api/rewards')).toEqual({ kind: 'root' })
    expect(matchRewardsRoute('/api/rewards/summary')).toEqual({ kind: 'summary' })
    expect(matchRewardsRoute('/api/rewards/items')).toEqual({ kind: 'items' })
    expect(matchRewardsRoute(`/api/rewards/items/${ITEM}`)).toEqual({ kind: 'item', id: ITEM })
    expect(matchRewardsRoute('/api/rewards/purchases')).toEqual({ kind: 'purchases' })
    expect(matchRewardsRoute(`/api/rewards/purchases/${PURCHASE}/refund`)).toEqual({ kind: 'refund', id: PURCHASE })
    expect(matchRewardsRoute('/api/rewards/items/not-a-uuid')).toBeNull()
    expect(matchHealthApiRoute('/api/rewards')).toBe('rewards')
    expect(matchHealthApiRoute('/api/rewards/summary')).toBe('rewards')
    expect(matchHealthApiRoute(`/api/rewards/items/${ITEM}`)).toBe('rewards')
    expect(matchHealthApiRoute(`/api/rewards/purchases/${PURCHASE}/refund`)).toBe('rewards')
  })

  it('keeps wallet reads owner-only and enforces methods', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    expect((await call('GET', '/api/rewards', null)).status()).toBe(401)
    expect((await call('GET', '/api/rewards', { id: 'someone', email: 'other@example.com' })).status()).toBe(403)
    expect((await call('GET', '/api/rewards', owner)).status()).toBe(200)
    expect((await call('GET', '/api/rewards/summary', owner)).status()).toBe(200)
    expect(service.readRewardSummary).toHaveBeenCalledTimes(1)
    const wrong = await call('POST', '/api/rewards', owner, {})
    expect(wrong.status()).toBe(405)
    expect(wrong.allow()).toBe('GET')
  })

  it('passes item, purchase, and refund mutations to the service', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    const itemBody = { name: 'Takeout', costXp: 300, note: null }
    const purchaseBody = { rewardItemId: ITEM, submissionId: PURCHASE }

    expect((await call('POST', '/api/rewards/items', owner, itemBody)).status()).toBe(200)
    expect((await call('PATCH', `/api/rewards/items/${ITEM}`, owner, itemBody)).status()).toBe(200)
    expect((await call('DELETE', `/api/rewards/items/${ITEM}`, owner)).status()).toBe(200)
    expect((await call('POST', '/api/rewards/purchases', owner, purchaseBody)).status()).toBe(200)
    expect((await call('POST', `/api/rewards/purchases/${PURCHASE}/refund`, owner, {})).status()).toBe(200)

    expect(service.createRewardItem).toHaveBeenCalledWith(itemBody)
    expect(service.updateRewardItem).toHaveBeenCalledWith(ITEM, itemBody)
    expect(service.archiveRewardItem).toHaveBeenCalledWith(ITEM)
    expect(service.purchaseReward).toHaveBeenCalledWith(purchaseBody)
    expect(service.refundRewardPurchase).toHaveBeenCalledWith(PURCHASE)
  })

  it('returns 405 with the route-specific Allow header', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    const wrongItem = await call('GET', `/api/rewards/items/${ITEM}`, owner)
    expect(wrongItem.status()).toBe(405)
    expect(wrongItem.allow()).toBe('PATCH, DELETE')
    const wrongPurchase = await call('GET', '/api/rewards/purchases', owner)
    expect(wrongPurchase.status()).toBe(405)
    expect(wrongPurchase.allow()).toBe('POST')
  })
})
