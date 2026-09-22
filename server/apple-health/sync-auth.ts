import { createHash, timingSafeEqual } from 'node:crypto'
import { loadLocalEnv } from '../env.js'

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

export function syncTokensMatch(provided: string, expected: string): boolean {
  if (provided.length === 0 || expected.length === 0) {
    return false
  }
  return timingSafeEqual(digest(provided), digest(expected))
}

export function bearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header
  if (!value || !value.startsWith('Bearer ')) {
    return null
  }
  const token = value.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

export async function appleHealthSyncToken(): Promise<string | null> {
  await loadLocalEnv()
  const token = process.env.APPLE_HEALTH_SYNC_TOKEN
  if (typeof token !== 'string') {
    return null
  }
  const trimmed = token.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function appleHealthSyncAuthorized(header: string | string[] | undefined): Promise<boolean> {
  const expected = await appleHealthSyncToken()
  const provided = bearerToken(header)
  if (!expected || !provided) {
    return false
  }
  return syncTokensMatch(provided, expected)
}
