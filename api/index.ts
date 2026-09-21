import { dispatchHealthApi } from '../server/dispatch.js'
import type { ApiRequest, ApiResponse } from '../server/http.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await dispatchHealthApi(req, res)
}
