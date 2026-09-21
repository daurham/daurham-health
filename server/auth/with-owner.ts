import { handleApiError, type ApiRequest, type ApiResponse } from '../http.js'
import { requireHealthOwner, type AuthSessionReader } from './owner.js'
import type { HealthOwnerConfig } from './config.js'

type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void

export function withOwnerAuth(
  handler: ApiHandler,
  deps?: {
    readSession?: AuthSessionReader
    config?: HealthOwnerConfig
  },
): (req: ApiRequest, res: ApiResponse) => Promise<void> {
  return async (req, res) => {
    try {
      await requireHealthOwner(req, deps)
      await handler(req, res)
    } catch (error) {
      handleApiError(res, error)
    }
  }
}
