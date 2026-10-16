/**
 * PIQ release boundary: compare the configured Postgres endpoint against
 * independently obtained Neon endpoint HOST metadata (never against secrets).
 *
 * This is a deterministic *configuration* check, not a live SQL/Neon attestation.
 * Run inside the intended deployment to inspect its effective environment.
 * The production runtime guard is explicitly opt-in; existing instances are
 * unaffected unless HEALTH_DB_BINDING_ENFORCE=true is set by the owner.
 */
export type DatabaseBindingReason =
  | 'VERIFIED_EXPECTED_ENDPOINT'
  | 'UNSUPPORTED_ENVIRONMENT'
  | 'MISSING_DATABASE_URL'
  | 'INVALID_DATABASE_URL'
  | 'UNSAFE_CONNECTION_OVERRIDE'
  | 'MISSING_EXPECTED_ENDPOINT'
  | 'INVALID_EXPECTED_ENDPOINT'
  | 'ENDPOINTS_NOT_DISTINCT'
  | 'MISSING_PREVIEW_REF'
  | 'UNEXPECTED_GIT_REF'
  | 'WRONG_DATABASE_ENDPOINT'

export type DatabaseBindingResult =
  | { status: 'verified'; reason: 'VERIFIED_EXPECTED_ENDPOINT' }
  | { status: 'blocked'; reason: Exclude<DatabaseBindingReason, 'VERIFIED_EXPECTED_ENDPOINT'> }

const blocked = (reason: Exclude<DatabaseBindingReason, 'VERIFIED_EXPECTED_ENDPOINT'>): DatabaseBindingResult =>
  ({ status: 'blocked', reason })

/** Normalize the pooled and direct host variants of the same Neon endpoint. */
function normalizeNeonEndpoint(raw: string | undefined): string | null {
  if (!raw) return null
  const host = raw.trim().toLowerCase()
  // Accept ONLY a hostname, not a URL, port, credential, IP, path or wildcard.
  if (!/^ep-[a-z0-9-]+(?:-pooler)?\.(?:[a-z0-9-]+\.)+neon\.tech$/.test(host)) {
    return null
  }
  return host.replace(/^([^.]+)-pooler\./, '$1.')
}

export function assessDatabaseBinding(env: NodeJS.ProcessEnv): DatabaseBindingResult {
  const target = env.VERCEL_ENV
  if (target !== 'production' && target !== 'preview') return blocked('UNSUPPORTED_ENVIRONMENT')

  const rawUrl = env.DATABASE_URL
  if (!rawUrl?.trim()) return blocked('MISSING_DATABASE_URL')
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return blocked('INVALID_DATABASE_URL')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return blocked('INVALID_DATABASE_URL')
  // libpq routing flags can override a hostname even if the URL host matches.
  for (const key of ['host', 'hostaddr', 'service', 'servicefile', 'options']) {
    if (url.searchParams.has(key)) return blocked('UNSAFE_CONNECTION_OVERRIDE')
  }
  if (url.port && url.port !== '5432') return blocked('INVALID_DATABASE_URL')
  const actual = normalizeNeonEndpoint(url.hostname)
  if (!actual) return blocked('INVALID_DATABASE_URL')

  const productionRaw = env.HEALTH_DB_PRODUCTION_ENDPOINT_HOST?.trim()
  const previewRaw = env.HEALTH_DB_PREVIEW_ENDPOINT_HOST?.trim()
  if (!productionRaw || !previewRaw) return blocked('MISSING_EXPECTED_ENDPOINT')
  const productionHost = normalizeNeonEndpoint(productionRaw)
  const previewHost = normalizeNeonEndpoint(previewRaw)
  if (!productionHost || !previewHost) return blocked('INVALID_EXPECTED_ENDPOINT')
  if (productionHost === previewHost) return blocked('ENDPOINTS_NOT_DISTINCT')

  if (target === 'production') {
    if (env.VERCEL_GIT_COMMIT_REF !== 'main') return blocked('UNEXPECTED_GIT_REF')
    return actual === productionHost
      ? { status: 'verified', reason: 'VERIFIED_EXPECTED_ENDPOINT' }
      : blocked('WRONG_DATABASE_ENDPOINT')
  }
  const previewRef = env.HEALTH_DB_PREVIEW_GIT_REF?.trim()
  if (!previewRef) return blocked('MISSING_PREVIEW_REF')
  if (env.VERCEL_GIT_COMMIT_REF !== previewRef) return blocked('UNEXPECTED_GIT_REF')
  return actual === previewHost
    ? { status: 'verified', reason: 'VERIFIED_EXPECTED_ENDPOINT' }
    : blocked('WRONG_DATABASE_ENDPOINT')
}

/** Runtime enforcement is owner-controlled; unknown enabled values block too. */
export function assertDatabaseBindingIfEnabled(env: NodeJS.ProcessEnv): void {
  const flag = env.HEALTH_DB_BINDING_ENFORCE?.trim().toLowerCase()
  if (!flag || flag === 'false') return
  if (flag !== 'true') throw new Error('Database binding blocked (INVALID_GUARD_FLAG)')
  const result = assessDatabaseBinding(env)
  if (result.status === 'blocked') {
    // Never interpolate host, connection string, password or model data.
    throw new Error('Database binding blocked (' + result.reason + ')')
  }
}
