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
  | 'MISSING_EXPECTED_DATABASE'
  | 'INVALID_EXPECTED_DATABASE'
  | 'WRONG_DATABASE_NAME'
  | 'TLS_REQUIRED'
  | 'UNEXPECTED_GIT_REF'
  | 'WRONG_DATABASE_ENDPOINT'

export type DatabaseBindingResult =
  | { status: 'verified'; reason: 'VERIFIED_EXPECTED_ENDPOINT' }
  | { status: 'blocked'; reason: Exclude<DatabaseBindingReason, 'VERIFIED_EXPECTED_ENDPOINT'> }

const blocked = (reason: Exclude<DatabaseBindingReason, 'VERIFIED_EXPECTED_ENDPOINT'>): DatabaseBindingResult =>
  ({ status: 'blocked', reason })

/** Require a simple canonical PostgreSQL database identifier; no paths, credentials, or URLs. */
function validDatabaseName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(name)
}

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
  for (const key of ['host', 'hostaddr', 'service', 'servicefile', 'options', 'dbname', 'database', 'port']) {
    if (url.searchParams.has(key)) return blocked('UNSAFE_CONNECTION_OVERRIDE')
  }
  if (url.port && url.port !== '5432') return blocked('INVALID_DATABASE_URL')
  const actual = normalizeNeonEndpoint(url.hostname)
  if (!actual) return blocked('INVALID_DATABASE_URL')
  // Neon connections must not be able to silently drop or downgrade TLS.
  const sslModes = url.searchParams.getAll('sslmode')
  if (sslModes.length !== 1 || !['require', 'verify-ca', 'verify-full'].includes(sslModes[0]!)) {
    return blocked('TLS_REQUIRED')
  }

  // A matching host could still route to a different database.
  let actualDatabaseName: string
  try {
    actualDatabaseName = decodeURIComponent(url.pathname.slice(1))
  } catch {
    return blocked('INVALID_DATABASE_URL')
  }
  if (!validDatabaseName(actualDatabaseName)) return blocked('INVALID_DATABASE_URL')

  const productionRaw = env.HEALTH_DB_PRODUCTION_ENDPOINT_HOST?.trim()
  const previewRaw = env.HEALTH_DB_PREVIEW_ENDPOINT_HOST?.trim()
  if (!productionRaw || !previewRaw) return blocked('MISSING_EXPECTED_ENDPOINT')
  const productionHost = normalizeNeonEndpoint(productionRaw)
  const previewHost = normalizeNeonEndpoint(previewRaw)
  if (!productionHost || !previewHost) return blocked('INVALID_EXPECTED_ENDPOINT')
  if (productionHost === previewHost) return blocked('ENDPOINTS_NOT_DISTINCT')
  const productionDb = env.HEALTH_DB_PRODUCTION_DATABASE_NAME?.trim()
  const previewDb = env.HEALTH_DB_PREVIEW_DATABASE_NAME?.trim()
  if (!productionDb || !previewDb) return blocked('MISSING_EXPECTED_DATABASE')
  if (!validDatabaseName(productionDb) || !validDatabaseName(previewDb)) {
    return blocked('INVALID_EXPECTED_DATABASE')
  }

  if (target === 'production') {
    if (env.VERCEL_GIT_COMMIT_REF !== 'main') return blocked('UNEXPECTED_GIT_REF')
    if (actualDatabaseName !== productionDb) return blocked('WRONG_DATABASE_NAME')
    return actual === productionHost
      ? { status: 'verified', reason: 'VERIFIED_EXPECTED_ENDPOINT' }
      : blocked('WRONG_DATABASE_ENDPOINT')
  }
  const previewRef = env.HEALTH_DB_PREVIEW_GIT_REF?.trim()
  if (!previewRef) return blocked('MISSING_PREVIEW_REF')
  if (env.VERCEL_GIT_COMMIT_REF !== previewRef) return blocked('UNEXPECTED_GIT_REF')
  if (actualDatabaseName !== previewDb) return blocked('WRONG_DATABASE_NAME')
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
