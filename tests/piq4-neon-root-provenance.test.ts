import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES, LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.js'
import { independentlyVerifiedEmptyRoot, REQUIRED_EMPTY_OWNER_TABLES,
  type PiqIndependentRootEvidence } from '../server/piq-neon-root-provenance.js'
import { reviewPiqPreviewSafety, type PiqNeonBranchEvidence } from '../server/piq-preview-preflight.js'
import { reviewPiqPreviewMetadata } from '../server/piq-preview-metadata.js'

const branch: PiqNeonBranchEvidence = { source: 'neon_api', projectId: 'qa-new-project',
  branchId: 'br-new-root', parentId: null, initSource: 'parent-data' }
const proof: PiqIndependentRootEvidence = {
  project: { source: 'neon_api', id: 'qa-new-project',
    createdAt: '2026-10-17T06:13:43Z' },
  branch: { source: 'neon_api', projectId: 'qa-new-project', id: 'br-new-root',
    parentId: null, isDefault: true, createdAt: '2026-10-17T06:13:43Z' },
  initialSql: { source: 'neon_sql', projectId: 'qa-new-project', branchId: 'br-new-root',
    publicTableCount: 0, authUserCount: 0, authSessionCount: 0 },
  migratedSql: { source: 'neon_sql', projectId: 'qa-new-project', branchId: 'br-new-root',
    migrationCount: Number(LATEST_SCHEMA_MIGRATION.slice(0, 4)), migrationSequenceValid: true,
    lastMigration: LATEST_SCHEMA_MIGRATION,
    ownerTableCounts: Object.fromEntries(REQUIRED_EMPTY_OWNER_TABLES.map(t => [t, 0])) as
      PiqIndependentRootEvidence['migratedSql']['ownerTableCounts'],
    nonSeededTableCounts: Object.fromEntries(BACKUP_TABLES.filter(t => !t.seeded)
      .map(t => [t.name, 0])),
    authUserCount: 0, authSessionCount: 0 },
  auth: { source: 'neon_auth_api', projectId: 'qa-new-project', branchId: 'br-new-root',
    provider: 'better_auth', qaAuthProjectId: 'qa-auth', productionAuthProjectId: 'prod-auth' },
}
const args = { expectedProjectId: 'qa-new-project', expectedBranchId: 'br-new-root',
  productionProjectId: 'production-project', branch, proof }
const verdict = (change: Partial<typeof args> = {}) =>
  independentlyVerifiedEmptyRoot({ ...args, ...change })

describe('PIQ independently verified new-project root provenance', () => {
  it('recognizes Neon new-root parent-data metadata only with complete independent proof', () => {
    expect(verdict()).toBe(true)
    expect(verdict({ proof: undefined })).toBe(false)
    expect(verdict({ productionProjectId: 'qa-new-project' })).toBe(false)
    expect(verdict({ branch: { ...branch, parentId: 'br-production' } })).toBe(false)
    expect(verdict({ branch: { ...branch, parentId: 'br-another' } })).toBe(false)
  })

  it('rejects mismatched or stale project/root creation metadata', () => {
    expect(verdict({ proof: { ...proof, project: { ...proof.project, id: 'other' } } })).toBe(false)
    expect(verdict({ proof: { ...proof, branch: { ...proof.branch, isDefault: false } } })).toBe(false)
    expect(verdict({ proof: { ...proof, branch: { ...proof.branch, createdAt: '2026-10-18T06:13:43Z' } } })).toBe(false)
    expect(verdict({ proof: { ...proof, project: { ...proof.project, createdAt: 'not-a-date' } } })).toBe(false)
  })

  it('rejects any empty-database or seeded-owner evidence anomaly', () => {
    expect(verdict({ proof: { ...proof, initialSql: { ...proof.initialSql, publicTableCount: 1 } } })).toBe(false)
    expect(verdict({ proof: { ...proof, migratedSql: { ...proof.migratedSql, migrationCount: Number(LATEST_SCHEMA_MIGRATION.slice(0, 4)) - 1 } } })).toBe(false)
    expect(verdict({ proof: { ...proof, migratedSql: { ...proof.migratedSql, migrationSequenceValid: false } } })).toBe(false)
    expect(verdict({ proof: { ...proof, migratedSql: { ...proof.migratedSql, ownerTableCounts: {
      ...proof.migratedSql.ownerTableCounts, nutrition_entries: 1,
    } } } })).toBe(false)
    expect(verdict({ proof: { ...proof, migratedSql: { ...proof.migratedSql, authUserCount: 1 } } })).toBe(false)
  })

  it('requires a census of ALL non-seeded application tables, not only 13 owner sentinels', () => {
    const clean = proof.migratedSql.nonSeededTableCounts
    expect(BACKUP_TABLES.filter(table => !table.seeded).length).toBeGreaterThan(REQUIRED_EMPTY_OWNER_TABLES.length)
    expect(verdict()).toBe(true)
    // A Pantry food or unreviewed capture can contain personal data even when
    // the original 13 monitored owner tables all report zero rows.
    for (const name of ['nutrition_foods', 'import_jobs']) {
      expect(Object.prototype.hasOwnProperty.call(clean, name)).toBe(true)
      expect(verdict({ proof: { ...proof, migratedSql: {
        ...proof.migratedSql, nonSeededTableCounts: { ...clean, [name]: 1 },
      } } })).toBe(false)
    }
    const withoutOne = { ...clean }
    delete withoutOne.nutrition_foods
    expect(verdict({ proof: { ...proof, migratedSql: {
      ...proof.migratedSql, nonSeededTableCounts: withoutOne,
    } } })).toBe(false)
    expect(verdict({ proof: { ...proof, migratedSql: {
      ...proof.migratedSql, nonSeededTableCounts: { ...clean, invented_table: 0 },
    } } })).toBe(false)
    expect(verdict({ proof: { ...proof, migratedSql: {
      ...proof.migratedSql, nonSeededTableCounts: {},
    } } })).toBe(false)
  })

  it('rejects missing, shared, or mismatched Auth identities', () => {
    expect(verdict({ proof: { ...proof, auth: { ...proof.auth, qaAuthProjectId: 'prod-auth' } } })).toBe(false)
    expect(verdict({ proof: { ...proof, auth: { ...proof.auth, qaAuthProjectId: '' } } })).toBe(false)
    expect(verdict({ proof: { ...proof, auth: { ...proof.auth, projectId: 'prod-project' } } })).toBe(false)
  })

  it('keeps live preflight blocked without verified runtime owner and DB/Auth environment', () => {
    const result = reviewPiqPreviewSafety({
      env: { VERCEL_ENV: 'preview', HEALTH_PIQ_EXPECTED_NEON_PROJECT_ID: 'qa-new-project',
        HEALTH_PIQ_EXPECTED_PREVIEW_BRANCH_ID: 'br-new-root',
        HEALTH_PIQ_PRODUCTION_BRANCH_ID: 'br-prod',
        HEALTH_PIQ_PRODUCTION_NEON_PROJECT_ID: 'production-project' },
      neonBranch: branch, independentRoot: proof,
    })
    expect(result.status).toBe('blocked')
    expect(result.blockers).not.toContain('PARENT_DATA_CLONE')
    expect(result.blockers).toContain('DATABASE_BINDING_NOT_VERIFIED')
    expect(result.blockers).toContain('AUTH_BINDING_NOT_VERIFIED')
    expect(result.blockers).toContain('OWNER_IDS_MISSING_OR_NOT_ISOLATED')
    expect(result.blockers).toContain('RUNTIME_GUARDS_NOT_ENFORCED')
  })

  it('can clear only the origin metadata blocker, never confer owner QA authorization', () => {
    const candidate = {
      source: 'github_api' as const, ref: 'piq/new-review', headSha: 'a'.repeat(40),
      ci: { source: 'github_actions' as const, workflowPath: '.github/workflows/validation.yml',
        headSha: 'a'.repeat(40), status: 'completed', conclusion: 'success' },
      postgresCi: { source: 'github_actions' as const, workflowPath: '.github/workflows/piq1-postgres.yml',
        headSha: 'a'.repeat(40), status: 'completed', conclusion: 'success' },
    }
    const deployment = { source: 'vercel_api' as const, projectId: 'health',
      ref: 'piq/new-review', sha: 'a'.repeat(40), state: 'READY', target: null }
    const base = { expectedRef: 'piq/new-review', expectedVercelProjectId: 'health',
      expectedNeonProjectId: 'qa-new-project', expectedNeonBranchId: 'br-new-root',
      productionNeonBranchId: 'br-prod', productionNeonProjectId: 'production-project',
      candidate, deployment, neonBranch: branch }
    expect(reviewPiqPreviewMetadata(base).blockers).toContain('NEON_PARENT_DATA_CLONE')
    const result = reviewPiqPreviewMetadata({ ...base, independentRoot: proof })
    expect(result.blockers).toEqual([])
    expect(result.status).toBe('metadata_consistent_not_authorized')
    expect(result.outstanding).toContain('EXPLICIT_OWNER_APPROVAL_REQUIRED')
    expect(result.outstanding).toContain('RUNTIME_AUTH_AND_OWNER_ISOLATION_REQUIRED')
    expect(reviewPiqPreviewMetadata({
      ...base, independentRoot: { ...proof, initialSql: { ...proof.initialSql, publicTableCount: 1 } },
    }).blockers).toContain('NEON_PARENT_DATA_CLONE')
  })

  it('does not leak project IDs, account identities, endpoint hosts or health data in blockers', () => {
    const s = reviewPiqPreviewMetadata({ expectedRef: 'piq/new-review',
      expectedVercelProjectId: 'health', expectedNeonProjectId: 'qa-new-project',
      expectedNeonBranchId: 'br-new-root', productionNeonBranchId: 'br-prod',
      productionNeonProjectId: 'production-project', candidate: null,
      deployment: null, neonBranch: branch, independentRoot: {
        ...proof, auth: { ...proof.auth, qaAuthProjectId: 'prod-auth' },
      } })
    const out = JSON.stringify(s)
    for (const privateValue of ['qa-new-project', 'br-new-root', 'production-project',
      'qa-auth', 'prod-auth']) expect(out).not.toContain(privateValue)
  })
})
