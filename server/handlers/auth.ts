import { proxyNeonAuth } from '../auth/proxy.js'
import type { ApiRequest, ApiResponse } from '../http.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await proxyNeonAuth(req, res)
}
