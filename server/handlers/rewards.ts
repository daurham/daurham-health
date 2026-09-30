import { withOwnerAuth } from '../auth/with-owner.js'
import { requestApiPathname, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import {
  archiveRewardItem,
  createRewardItem,
  purchaseReward,
  readRewards,
  refundRewardPurchase,
  updateRewardItem,
} from '../rewards/service.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RewardsRoute =
  | { kind: 'root' }
  | { kind: 'items' }
  | { kind: 'item'; id: string }
  | { kind: 'purchases' }
  | { kind: 'refund'; id: string }

export function matchRewardsRoute(pathname: string): RewardsRoute | null {
  if (pathname === '/api/rewards') return { kind: 'root' }
  if (pathname === '/api/rewards/items') return { kind: 'items' }
  if (pathname === '/api/rewards/purchases') return { kind: 'purchases' }

  const item = /^\/api\/rewards\/items\/([^/]+)$/.exec(pathname)
  if (item && UUID.test(item[1] ?? '')) return { kind: 'item', id: item[1]! }

  const refund = /^\/api\/rewards\/purchases\/([^/]+)\/refund$/.exec(pathname)
  if (refund && UUID.test(refund[1] ?? '')) return { kind: 'refund', id: refund[1]! }

  return null
}

export async function handleRewards(req: ApiRequest, res: ApiResponse) {
  const route = matchRewardsRoute(requestApiPathname(req))
  if (!route) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  if (route.kind === 'root') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await readRewards())
    return
  }

  if (route.kind === 'items') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await createRewardItem(await readJsonBody(req)))
    return
  }

  if (route.kind === 'item') {
    if (req.method === 'PATCH') {
      sendJson(res, 200, await updateRewardItem(route.id, await readJsonBody(req)))
      return
    }
    if (req.method === 'DELETE') {
      sendJson(res, 200, await archiveRewardItem(route.id))
      return
    }
    res.setHeader('Allow', 'PATCH, DELETE')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  if (route.kind === 'purchases') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await purchaseReward(await readJsonBody(req)))
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  sendJson(res, 200, await refundRewardPurchase(route.id))
}

export default withOwnerAuth(handleRewards)
