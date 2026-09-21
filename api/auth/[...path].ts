import { proxyNeonAuth } from '../../server/auth/proxy.js'
import type { ApiRequest, ApiResponse } from '../../server/http.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await proxyNeonAuth(req, res)
}
