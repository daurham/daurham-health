import {
  handleAuthProxyRequest,
  parseSessionData,
} from '@neondatabase/neon-js/auth/server'
import { HttpError, type ApiRequest } from '../http.js'
import { getHealthOwnerConfig, type HealthOwnerConfig } from './config.js'
import type { NeonAuthProxyConfig } from './config.js'
import { sessionProbeRequest } from './node-request.js'

export type AuthIdentity = {
  id: string
  email: string | null
}

export type AuthSessionReader = (req: ApiRequest) => Promise<AuthIdentity | null>

export const SIGN_IN_REQUIRED = 'Sign in required'
export const ACCOUNT_NOT_AUTHORIZED = 'This account cannot access this Health data'

export async function readNeonAuthSession(
  req: ApiRequest,
  config?: NeonAuthProxyConfig,
): Promise<AuthIdentity | null> {
  const resolved = config ?? (await getHealthOwnerConfig())
  const response = await handleAuthProxyRequest({
    request: sessionProbeRequest(req),
    path: 'get-session',
    baseUrl: resolved.authBaseUrl,
    cookieSecret: resolved.cookieSecret,
    sessionDataTtl: resolved.sessionDataTtl,
    sameSite: resolved.sameSite,
  })
  if (!response.ok) {
    return null
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return null
  }
  return identityFromSessionBody(body)
}

function userFromUnknown(value: unknown): AuthIdentity | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const user = value as { id?: unknown; email?: unknown }
  if (typeof user.id !== 'string' || user.id.length === 0) {
    return null
  }
  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email.toLowerCase() : null,
  }
}

export function identityFromSessionBody(body: unknown): AuthIdentity | null {
  if (!body || typeof body !== 'object') {
    return null
  }
  const record = body as Record<string, unknown>
  const nested = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : null
  const direct = userFromUnknown(record.user) ?? userFromUnknown(nested?.user)
  if (direct) {
    return direct
  }
  try {
    return userFromUnknown(parseSessionData(body).user)
  } catch {
    return null
  }
}

export function isConfiguredOwner(identity: AuthIdentity, config: HealthOwnerConfig): boolean {
  if (config.ownerUserId) {
    return identity.id === config.ownerUserId
  }
  if (config.ownerEmail && identity.email) {
    return identity.email === config.ownerEmail
  }
  return false
}

export async function requireHealthOwner(
  req: ApiRequest,
  deps?: {
    readSession?: AuthSessionReader
    config?: HealthOwnerConfig
  },
): Promise<AuthIdentity> {
  const config = deps?.config ?? (await getHealthOwnerConfig())
  const identity = deps?.readSession
    ? await deps.readSession(req)
    : await readNeonAuthSession(req, config)
  if (!identity) {
    throw new HttpError(401, SIGN_IN_REQUIRED)
  }
  if (!isConfiguredOwner(identity, config)) {
    throw new HttpError(403, ACCOUNT_NOT_AUTHORIZED)
  }
  return identity
}
