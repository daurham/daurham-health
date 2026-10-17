import { describe, expect, it } from 'vitest'
import {
  reviewPiqPreviewMetadata, type PiqCandidateMetadata,
  type PiqDeploymentMetadata,
} from '../server/piq-preview-metadata.js'
import type { PiqNeonBranchEvidence } from '../server/piq-preview-preflight.js'

/** PIQ-4 metadata-only owner-preview rehearsals. Never read owner data or connect to external services. */
const expectedRef = 'piq/00-baseline-20261014'
const gitSha = 'a'.repeat(40)
const ciSha = 'b'.repeat(40)
const github: PiqCandidateMetadata = {
  source: 'github_api', ref: expectedRef, headSha: gitSha,
  ci: { source: 'github_actions', headSha: gitSha, status: 'completed', conclusion: 'success' },
}
const deployed: PiqDeploymentMetadata = {
  source: 'vercel_api', ref: expectedRef, sha: gitSha,
  state: 'READY', target: null,
}
const neon: PiqNeonBranchEvidence = {
  source: 'neon_api', projectId: 'project-synthetic',
  branchId: 'br-empty-preview', parentId: null, initSource: 'empty',
}
const args = {
  expectedRef,
  expectedNeonProjectId: 'project-synthetic',
  expectedNeonBranchId: 'br-empty-preview',
  productionNeonBranchId: 'br-production',
  candidate: github,
  deployment: deployed,
  neonBranch: neon,
}
const check = (changes: Partial<typeof args> = {}) =>
  reviewPiqPreviewMetadata({ ...args, ...changes })

describe('PIQ-4 read-only, exact-SHA preview metadata gate', () => {
  it('even fully consistent metadata cannot authorize runtime access or owner data', () => {
    const result = check()
    expect(result.status).toBe('metadata_consistent_not_authorized')
    expect(result.blockers).toEqual([])
    expect(result.outstanding).toEqual(expect.arrayContaining([
      'RUNTIME_DB_BINDING_ATTESTATION_REQUIRED',
      'RUNTIME_AUTH_AND_OWNER_ISOLATION_REQUIRED',
      'EMPTY_OWNER_DATA_ATTESTATION_REQUIRED',
      'MIGRATION_AND_BACKUP_READINESS_REQUIRED',
      'EXPLICIT_OWNER_APPROVAL_REQUIRED',
    ]))
  })

  it('rejects missing or differently-versioned GitHub CI, including green CI for a parent', () => {
    for (const candidate of [
      null,
      { ...github, headSha: 'not-a-sha' },
      { ...github, ci: null },
      { ...github, ci: { ...github.ci!, headSha: ciSha } },
    ]) {
      const r = check({ candidate })
      expect(r.status).toBe('blocked')
      expect(r.blockers).toEqual(expect.arrayContaining([
        expect.stringMatching(/CANDIDATE_|EXACT_SHA_CI_/),
      ]))
    }
    for (const ci of [
      { ...github.ci!, status: 'queued', conclusion: null },
      { ...github.ci!, status: 'completed', conclusion: 'failure' },
    ]) {
      expect(check({ candidate: { ...github, ci } }).blockers).toContain('CI_NOT_SUCCESSFUL')
    }
  })

  it('rejects ready preview at older SHA, wrong branch, non-preview or non-ready deployment', () => {
    expect(check({ deployment: { ...deployed, sha: ciSha } }).blockers)
      .toContain('DEPLOYMENT_COMMIT_MISMATCH')
    expect(check({ deployment: { ...deployed, ref: 'main' } }).blockers)
      .toContain('DEPLOYMENT_REF_MISMATCH')
    expect(check({ deployment: { ...deployed, target: 'production' } }).blockers)
      .toContain('DEPLOYMENT_NOT_PREVIEW')
    expect(check({ deployment: { ...deployed, state: 'BUILDING' } }).blockers)
      .toContain('DEPLOYMENT_NOT_READY')
    expect(check({ deployment: null }).blockers).toContain('DEPLOYMENT_METADATA_UNAVAILABLE')
    expect(check({ expectedRef: 'main' }).blockers).toContain('CANDIDATE_REF_NOT_PIQ')
  })

  it('blocks inherited owner data and mismatch in provider-verified branch identity', () => {
    const cloned = {
      ...neon, parentId: 'br-production', initSource: 'parent-data',
    }
    expect(check({ neonBranch: cloned }).blockers).toEqual(expect.arrayContaining([
      'NEON_PREVIEW_PARENT_IS_PRODUCTION', 'NEON_PARENT_DATA_CLONE',
    ]))
    expect(check({ neonBranch: { ...neon, initSource: 'unknown' } }).blockers)
      .toContain('NEON_EMPTY_ORIGIN_UNVERIFIED')
    expect(check({ neonBranch: { ...neon, branchId: 'br-production' } }).blockers)
      .toContain('NEON_PREVIEW_BRANCH_IS_PRODUCTION')
    expect(check({ neonBranch: null }).blockers).toContain('NEON_METADATA_UNAVAILABLE')
    expect(check({ neonBranch: { ...neon, projectId: 'foreign-project' } }).blockers)
      .toContain('NEON_PROJECT_OR_BRANCH_MISMATCH')
  })

  it('reports only enum blockers with no raw IDs or secrets, even in a hostile mismatch', () => {
    const secret = 'should-never-print-private-connection-string'
    const result = check({
      expectedNeonProjectId: secret,
      deployment: { ...deployed, ref: secret, sha: ciSha },
      neonBranch: { ...neon, projectId: secret + '-other', initSource: 'parent-data' },
    })
    expect(result.status).toBe('blocked')
    const out = JSON.stringify(result)
    expect(out).not.toContain(secret)
    expect(out).not.toContain('br-production')
    expect(out).not.toContain(expectedRef)
    expect(out).not.toContain(gitSha)
  })
})
