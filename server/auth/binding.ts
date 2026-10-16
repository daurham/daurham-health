/**
 * PIQ preview/production Neon Auth URL identity boundary.
 *
 * This is an independent, read-only *configuration comparison*, NOT proof of
 * session, cookie, user, ownership, or inherited health-data segregation.
 * Enabled at runtime only with HEALTH_AUTH_BINDING_ENFORCE=true.
 */
export type AuthBindingReason =
  | 'VERIFIED_EXPECTED_AUTH'
  | 'UNSUPPORTED_ENVIRONMENT'
  | 'MISSING_AUTH_URL'
  | 'INVALID_AUTH_URL'
  | 'MISSING_EXPECTED_AUTH_URL'
  | 'INVALID_EXPECTED_AUTH_URL'
  | 'AUTH_URLS_NOT_DISTINCT'
  | 'MISSING_PREVIEW_REF'
  | 'UNEXPECTED_GIT_REF'
  | 'WRONG_AUTH_URL'

export type AuthBindingResult =
  | { status: 'verified'; reason: 'VERIFIED_EXPECTED_AUTH' }
  | { status: 'blocked'; reason: Exclude<AuthBindingReason, 'VERIFIED_EXPECTED_AUTH'> }

const blocked = (reason: Exclude<AuthBindingReason, 'VERIFIED_EXPECTED_AUTH'>): AuthBindingResult =>
  ({ status: 'blocked', reason })

/** A canonical secure Auth endpoint; reject URL credentials, fragments and routing queries. */
function normalizeAuthUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
        url.search || url.hash || url.port) return null
    // Trailing slash variance is harmless, but hostname and full path still must match.
    return url.origin + url.pathname.replace(/\/+$/, '')
  } catch {
    return null
  }
}

/** Pure validator. No network, database read, session access or output of endpoint details. */
export function assessAuthBinding(env: NodeJS.ProcessEnv): AuthBindingResult {
  const target = env.VERCEL_ENV
  if (target !== 'production' && target !== 'preview') return blocked('UNSUPPORTED_ENVIRONMENT')

  if (!env.NEON_AUTH_BASE_URL?.trim()) return blocked('MISSING_AUTH_URL')
  const current = normalizeAuthUrl(env.NEON_AUTH_BASE_URL)
  if (!current) return blocked('INVALID_AUTH_URL')

  const prodRaw = env.HEALTH_AUTH_PRODUCTION_BASE_URL
  const prevRaw = env.HEALTH_AUTH_PREVIEW_BASE_URL
  if (!prodRaw?.trim() || !prevRaw?.trim()) return blocked('MISSING_EXPECTED_AUTH_URL')
  const production = normalizeAuthUrl(prodRaw)
  const preview = normalizeAuthUrl(prevRaw)
  if (!production || !preview) return blocked('INVALID_EXPECTED_AUTH_URL')
  if (production === preview) return blocked('AUTH_URLS_NOT_DISTINCT')

  if (target === 'production') {
    if (env.VERCEL_GIT_COMMIT_REF !== 'main') return blocked('UNEXPECTED_GIT_REF')
    return current === production
      ? { status: 'verified', reason: 'VERIFIED_EXPECTED_AUTH' }
      : blocked('WRONG_AUTH_URL')
  }
  const previewRef = env.HEALTH_AUTH_PREVIEW_GIT_REF?.trim()
  if (!previewRef) return blocked('MISSING_PREVIEW_REF')
  if (env.VERCEL_GIT_COMMIT_REF !== previewRef) return blocked('UNEXPECTED_GIT_REF')
  return current === preview
    ? { status: 'verified', reason: 'VERIFIED_EXPECTED_AUTH' }
    : blocked('WRONG_AUTH_URL')
}

/** Fail closed only when expressly enabled; do not disclose URLs or secrets. */
export function assertAuthBindingIfEnabled(env: NodeJS.ProcessEnv): void {
  const flag = env.HEALTH_AUTH_BINDING_ENFORCE?.trim().toLowerCase()
  if (!flag || flag === 'false') return
  if (flag !== 'true') throw new Error('Auth binding blocked (INVALID_GUARD_FLAG)')
  const result = assessAuthBinding(env)
  if (result.status === 'blocked') throw new Error('Auth binding blocked (' + result.reason + ')')
}
