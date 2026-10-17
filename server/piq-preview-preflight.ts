import { pathToFileURL } from 'node:url'
import { assessAuthBinding } from './auth/binding.js'
import { assessDatabaseBinding } from './database-binding.js'
import { loadLocalEnv } from './env.js'
import { independentlyVerifiedEmptyRoot, type PiqIndependentRootEvidence } from './piq-neon-root-provenance.js'

/**
 * PIQ read-only PREVIEW QA boundary.
 *
 * A matching URL is not proof of an isolated owner or sanitized database.
 * This result can AT MOST permit a separate manual/provider-backed runtime
 * attestation. It NEVER grants permission to log in or load personal rows.
 * Caller must independently obtain the branch metadata from the Neon API;
 * no env flag or user-entered assertion substitutes for that evidence.
 */
export type PiqNeonBranchEvidence = {
  source: 'neon_api'
  projectId: string
  branchId: string
  parentId: string | null
  initSource: string
}

export type PiqPreviewBlocker =
  | 'NOT_PREVIEW'
  | 'DATABASE_BINDING_NOT_VERIFIED'
  | 'PREVIEW_DATABASE_CREDENTIALS_NOT_READY'
  | 'AUTH_BINDING_NOT_VERIFIED'
  | 'PREVIEW_COOKIE_SECRET_NOT_READY'
  | 'RUNTIME_GUARDS_NOT_ENFORCED'
  | 'COMMIT_PIN_MISSING_OR_INVALID'
  | 'DEPLOYED_COMMIT_MISMATCH'
  | 'OWNER_IDS_MISSING_OR_NOT_ISOLATED'
  | 'NEON_METADATA_UNAVAILABLE'
  | 'NEON_PROJECT_OR_BRANCH_MISMATCH'
  | 'PREVIEW_BRANCH_IS_PRODUCTION'
  | 'PARENT_DATA_CLONE'
  | 'DATA_ORIGIN_NOT_INDEPENDENTLY_EMPTY'

export type PiqPreviewSafetyReview =
  | { status: 'blocked'; blockers: PiqPreviewBlocker[] }
  | { status: 'configuration_eligible_for_manual_attestation'; blockers: [] }

const shaPattern = /^[a-f0-9]{40}$/i

function present(value: string | undefined): string {
  return value?.trim() ?? ''
}

/** Read-only, non-cryptographic sanity check for a separately generated QA cookie secret.
 * Strength/randomness and difference from production require an independent
 * operator check; this only refuses missing, malformed and known placeholder values.
 * Never include the candidate secret in a diagnostic or log.
 */
function previewDatabaseCredentialsReady(raw: string | undefined): boolean {
  if (!raw?.trim()) return false
  try {
    const url = new URL(raw)
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return false
    // URL credentials can be percent-encoded. Decode first to prevent
    // simple encoding of an unsafe sentinel bypassing the release check.
    const user = decodeURIComponent(url.username)
    const password = decodeURIComponent(url.password)
    if (!user || user.trim() !== user || /\s/.test(user) ||
        !password || password.length < 16 || /\s/.test(password)) return false
    // These are intentionally broad QA placeholder indicators, not a
    // password-strength estimator. Never include the values in the result.
    const placeholder = /(?:not[_-]?configured|placeholder|change[_-]?me|dummy|example|default[_-]?(?:user|password)|test[_-]?only)/i
    if (placeholder.test(user) || placeholder.test(password)) return false
    if (/^(.)\1+$/.test(password)) return false
    return true
  } catch {
    return false
  }
}

function plausiblePreviewCookieSecret(raw: string | undefined): boolean {
  const secret = present(raw)
  if (secret.length < 32 || /\s/.test(secret)) return false
  if (/(?:not[_-]?configured|placeholder|change[_-]?me|example|dummy|default[_-]?secret)/i.test(secret)) return false
  if (/^(.)\1+$/.test(secret)) return false
  return true
}

export function reviewPiqPreviewSafety(input: {
  env: NodeJS.ProcessEnv
  neonBranch: PiqNeonBranchEvidence | null
  independentRoot?: PiqIndependentRootEvidence | null
}): PiqPreviewSafetyReview {
  const { env, neonBranch } = input
  const blockers: PiqPreviewBlocker[] = []
  if (env.VERCEL_ENV !== 'preview') blockers.push('NOT_PREVIEW')
  if (assessDatabaseBinding(env).status !== 'verified') blockers.push('DATABASE_BINDING_NOT_VERIFIED')
  if (!previewDatabaseCredentialsReady(env.DATABASE_URL)) {
    blockers.push('PREVIEW_DATABASE_CREDENTIALS_NOT_READY')
  }
  if (assessAuthBinding(env).status !== 'verified') blockers.push('AUTH_BINDING_NOT_VERIFIED')
  if (!plausiblePreviewCookieSecret(env.NEON_AUTH_COOKIE_SECRET)) {
    blockers.push('PREVIEW_COOKIE_SECRET_NOT_READY')
  }
  if (present(env.HEALTH_DB_BINDING_ENFORCE).toLowerCase() !== 'true' ||
      present(env.HEALTH_AUTH_BINDING_ENFORCE).toLowerCase() !== 'true') {
    blockers.push('RUNTIME_GUARDS_NOT_ENFORCED')
  }

  const expectedSha = present(env.HEALTH_PIQ_EXPECTED_PREVIEW_SHA)
  const deployedSha = present(env.VERCEL_GIT_COMMIT_SHA)
  if (!shaPattern.test(expectedSha) || !shaPattern.test(deployedSha)) {
    blockers.push('COMMIT_PIN_MISSING_OR_INVALID')
  } else if (expectedSha.toLowerCase() !== deployedSha.toLowerCase()) {
    blockers.push('DEPLOYED_COMMIT_MISMATCH')
  }

  const owner = present(env.HEALTH_OWNER_USER_ID)
  const testOwner = present(env.HEALTH_PIQ_PREVIEW_TEST_OWNER_USER_ID)
  const productionOwner = present(env.HEALTH_PIQ_PRODUCTION_OWNER_USER_ID)
  if (!owner || !testOwner || !productionOwner ||
      owner !== testOwner || owner === productionOwner ||
      testOwner === productionOwner) {
    blockers.push('OWNER_IDS_MISSING_OR_NOT_ISOLATED')
  }

  if (!neonBranch || neonBranch.source !== 'neon_api') {
    blockers.push('NEON_METADATA_UNAVAILABLE')
  } else {
    const expectedProject = present(env.HEALTH_PIQ_EXPECTED_NEON_PROJECT_ID)
    const expectedBranch = present(env.HEALTH_PIQ_EXPECTED_PREVIEW_BRANCH_ID)
    const productionBranch = present(env.HEALTH_PIQ_PRODUCTION_BRANCH_ID)
    if (!expectedProject || !expectedBranch || !productionBranch ||
        neonBranch.projectId !== expectedProject ||
        neonBranch.branchId !== expectedBranch) {
      blockers.push('NEON_PROJECT_OR_BRANCH_MISMATCH')
    }
    if (!neonBranch.branchId || neonBranch.branchId === productionBranch ||
        (neonBranch.parentId != null && neonBranch.parentId === productionBranch)) {
      blockers.push('PREVIEW_BRANCH_IS_PRODUCTION')
    }
    if (neonBranch.initSource === 'parent-data' && !independentlyVerifiedEmptyRoot({
      expectedProjectId: expectedProject,
      expectedBranchId: expectedBranch,
      productionProjectId: present(env.HEALTH_PIQ_PRODUCTION_NEON_PROJECT_ID),
      branch: neonBranch,
      proof: input.independentRoot,
    })) {
      blockers.push('PARENT_DATA_CLONE')
    } else if (neonBranch.initSource !== 'empty' && neonBranch.initSource !== 'parent-data') {
      // If Neon does not independently attest an empty branch, static
      // configuration cannot establish that owner rows are absent.
      blockers.push('DATA_ORIGIN_NOT_INDEPENDENTLY_EMPTY')
    }
  }
  return blockers.length === 0
    ? { status: 'configuration_eligible_for_manual_attestation', blockers: [] }
    : { status: 'blocked', blockers }
}

/**
 * Safe to run without credentials: intentionally has no independently supplied
 * Neon metadata and MUST report blocked, even if all process env URLs match.
 * It never queries Neon, fetches sessions, or prints URLs/IDs/secrets.
 * To review actual Neon API metadata, use the pure function with verified
 * provider metadata supplied by a trusted caller, NOT a preview env string.
 */
export async function runPiqPreviewPreflight(): Promise<void> {
  await loadLocalEnv()
  const result = reviewPiqPreviewSafety({ env: process.env, neonBranch: null })
  console.log('PIQ preview QA preflight — ' + result.status.toUpperCase())
  if (result.status === 'blocked') {
    for (const blocker of result.blockers) console.log('BLOCKED (' + blocker + ')')
    process.exitCode = 2
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runPiqPreviewPreflight().catch(() => {
    console.error('PIQ preview QA preflight — BLOCKED (UNEXPECTED_ERROR)')
    process.exitCode = 2
  })
}
