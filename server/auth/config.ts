import { loadLocalEnv } from '../env.js'
import { HttpError } from '../http.js'

export type NeonAuthProxyConfig = {
  authBaseUrl: string
  cookieSecret: string
  sameSite: 'lax'
  sessionDataTtl: number
}

export type HealthOwnerConfig = NeonAuthProxyConfig & {
  ownerUserId: string | null
  ownerEmail: string | null
}

function trim(value: string | undefined): string | null {
  const next = value?.trim()
  return next && next.length > 0 ? next : null
}

export async function getNeonAuthProxyConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<NeonAuthProxyConfig> {
  await loadLocalEnv()
  const authBaseUrl = trim(env.NEON_AUTH_BASE_URL)?.replace(/\/+$/, '')
  const cookieSecret = trim(env.NEON_AUTH_COOKIE_SECRET)

  if (!authBaseUrl || authBaseUrl.toLowerCase().includes('vite_')) {
    throw new HttpError(503, 'Health authentication is not configured')
  }
  if (!cookieSecret || cookieSecret.length < 32) {
    throw new HttpError(503, 'Health authentication is not configured')
  }

  return {
    authBaseUrl,
    cookieSecret,
    sameSite: 'lax',
    sessionDataTtl: 300,
  }
}

export async function getHealthOwnerConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<HealthOwnerConfig> {
  const proxy = await getNeonAuthProxyConfig(env)
  const ownerUserId = trim(env.HEALTH_OWNER_USER_ID)
  const ownerEmail = trim(env.HEALTH_OWNER_EMAIL)?.toLowerCase() ?? null
  if (!ownerUserId && !ownerEmail) {
    throw new HttpError(503, 'Health owner is not configured')
  }
  return {
    ...proxy,
    ownerUserId,
    ownerEmail,
  }
}
