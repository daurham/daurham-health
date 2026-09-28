import { loadLocalEnv } from '../env.js'
import { bearerToken, syncTokensMatch } from '../apple-health/sync-auth.js'

export async function bodyCaptureToken(): Promise<string | null> {
  await loadLocalEnv()
  const token = process.env.BODY_CAPTURE_TOKEN
  if (typeof token !== 'string') {
    return null
  }
  const trimmed = token.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function bodyCaptureAuthorized(header: string | string[] | undefined): Promise<boolean> {
  const expected = await bodyCaptureToken()
  const provided = bearerToken(header)
  if (!expected || !provided) {
    return false
  }
  return syncTokensMatch(provided, expected)
}
