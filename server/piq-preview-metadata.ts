import type { PiqNeonBranchEvidence } from './piq-preview-preflight.js'
import { independentlyVerifiedEmptyRoot, type PiqIndependentRootEvidence } from './piq-neon-root-provenance.js'

/**
 * Offline PIQ preview metadata check. Input MUST come from independently
 * authenticated GitHub Actions, Vercel and Neon read-only provider metadata.
 * Never use process-env assertions as the source for these three records.
 *
 * Even when metadata agrees, the preview is NOT authorized for personal-row
 * access or owner QA: runtime DB binding, Auth tenant, disposable identity and
 * empty owner-data attestation still need separate evidence.
 */
export type PiqCandidateMetadata = {
  source: 'github_api'
  ref: string
  headSha: string
  ci: {
    source: 'github_actions'
    workflowPath: string
    headSha: string
    status: string
    conclusion: string | null
  } | null
}

export type PiqDeploymentMetadata = {
  source: 'vercel_api'
  projectId: string
  ref: string
  sha: string
  state: string
  target: string | null
}

export type PiqPreviewMetadataBlocker =
  | 'CANDIDATE_GITHUB_EVIDENCE_UNAVAILABLE'
  | 'CANDIDATE_REF_NOT_PIQ'
  | 'CANDIDATE_SHA_INVALID'
  | 'EXACT_SHA_CI_UNVERIFIED'
  | 'CI_FULL_VALIDATION_WORKFLOW_UNVERIFIED'
  | 'CI_NOT_SUCCESSFUL'
  | 'DEPLOYMENT_METADATA_UNAVAILABLE'
  | 'DEPLOYMENT_PROJECT_MISMATCH'
  | 'DEPLOYMENT_NOT_PREVIEW'
  | 'DEPLOYMENT_REF_MISMATCH'
  | 'DEPLOYMENT_COMMIT_MISMATCH'
  | 'DEPLOYMENT_NOT_READY'
  | 'NEON_METADATA_UNAVAILABLE'
  | 'NEON_PROJECT_OR_BRANCH_MISMATCH'
  | 'NEON_PREVIEW_BRANCH_IS_PRODUCTION'
  | 'NEON_PREVIEW_PARENT_IS_PRODUCTION'
  | 'NEON_PARENT_DATA_CLONE'
  | 'NEON_EMPTY_ORIGIN_UNVERIFIED'

export type PiqPreviewRuntimeRequirement =
  | 'RUNTIME_DB_BINDING_ATTESTATION_REQUIRED'
  | 'RUNTIME_AUTH_AND_OWNER_ISOLATION_REQUIRED'
  | 'EMPTY_OWNER_DATA_ATTESTATION_REQUIRED'
  | 'MIGRATION_AND_BACKUP_READINESS_REQUIRED'
  | 'EXPLICIT_OWNER_APPROVAL_REQUIRED'

export type PiqPreviewMetadataResult = {
  status: 'blocked' | 'metadata_consistent_not_authorized'
  blockers: PiqPreviewMetadataBlocker[]
  outstanding: PiqPreviewRuntimeRequirement[]
}

const hexSha = /^[a-f0-9]{40}$/i
const fullValidationWorkflow = '.github/workflows/validation.yml'
const outstanding: PiqPreviewRuntimeRequirement[] = [
  'RUNTIME_DB_BINDING_ATTESTATION_REQUIRED',
  'RUNTIME_AUTH_AND_OWNER_ISOLATION_REQUIRED',
  'EMPTY_OWNER_DATA_ATTESTATION_REQUIRED',
  'MIGRATION_AND_BACKUP_READINESS_REQUIRED',
  'EXPLICIT_OWNER_APPROVAL_REQUIRED',
]

export function reviewPiqPreviewMetadata(input: {
  expectedRef: string
  expectedVercelProjectId: string
  expectedNeonProjectId: string
  expectedNeonBranchId: string
  productionNeonBranchId: string
  productionNeonProjectId?: string
  independentRoot?: PiqIndependentRootEvidence | null
  candidate: PiqCandidateMetadata | null
  deployment: PiqDeploymentMetadata | null
  neonBranch: PiqNeonBranchEvidence | null
}): PiqPreviewMetadataResult {
  const blockers: PiqPreviewMetadataBlocker[] = []
  const { expectedRef, candidate, deployment, neonBranch } = input
  const branchAllowed = /^piq\/[a-z0-9][a-z0-9/._-]*$/i.test(expectedRef)
  if (!branchAllowed) blockers.push('CANDIDATE_REF_NOT_PIQ')

  if (!candidate || candidate.source !== 'github_api') {
    blockers.push('CANDIDATE_GITHUB_EVIDENCE_UNAVAILABLE')
  } else {
    if (!branchAllowed || candidate.ref !== expectedRef) {
      blockers.push('CANDIDATE_REF_NOT_PIQ')
    }
    if (!hexSha.test(candidate.headSha)) blockers.push('CANDIDATE_SHA_INVALID')
    // A green short-lived PostgreSQL or other partial workflow is not the
    // full TS/lint/Vitest/build validation required for a PIQ preview.
    if (!candidate.ci || candidate.ci.source !== 'github_actions' ||
        candidate.ci.workflowPath !== fullValidationWorkflow) {
      blockers.push('CI_FULL_VALIDATION_WORKFLOW_UNVERIFIED')
    }
    if (!candidate.ci || candidate.ci.source !== 'github_actions' ||
        !hexSha.test(candidate.ci.headSha) ||
        candidate.headSha.toLowerCase() !== candidate.ci.headSha.toLowerCase()) {
      blockers.push('EXACT_SHA_CI_UNVERIFIED')
    } else if (candidate.ci.status !== 'completed' ||
               candidate.ci.conclusion !== 'success') {
      blockers.push('CI_NOT_SUCCESSFUL')
    }
  }

  if (!deployment || deployment.source !== 'vercel_api') {
    blockers.push('DEPLOYMENT_METADATA_UNAVAILABLE')
  } else {
    // A ready deployment of this SHA in a different Vercel project says
    // nothing about the intended Health preview runtime or its bindings.
    if (!input.expectedVercelProjectId || !deployment.projectId ||
        deployment.projectId !== input.expectedVercelProjectId) {
      blockers.push('DEPLOYMENT_PROJECT_MISMATCH')
    }
    // Vercel currently represents preview as target:null, not "preview".
    if (deployment.target !== null && deployment.target !== 'preview') {
      blockers.push('DEPLOYMENT_NOT_PREVIEW')
    }
    if (!branchAllowed || deployment.ref !== expectedRef) {
      blockers.push('DEPLOYMENT_REF_MISMATCH')
    }
    if (!candidate || !hexSha.test(candidate.headSha) ||
        !hexSha.test(deployment.sha) ||
        deployment.sha.toLowerCase() !== candidate.headSha.toLowerCase()) {
      blockers.push('DEPLOYMENT_COMMIT_MISMATCH')
    }
    if (deployment.state !== 'READY') blockers.push('DEPLOYMENT_NOT_READY')
  }

  if (!neonBranch || neonBranch.source !== 'neon_api') {
    blockers.push('NEON_METADATA_UNAVAILABLE')
  } else {
    if (!input.expectedNeonProjectId || !input.expectedNeonBranchId ||
        neonBranch.projectId !== input.expectedNeonProjectId ||
        neonBranch.branchId !== input.expectedNeonBranchId) {
      blockers.push('NEON_PROJECT_OR_BRANCH_MISMATCH')
    }
    if (!input.productionNeonBranchId ||
        neonBranch.branchId === input.productionNeonBranchId) {
      blockers.push('NEON_PREVIEW_BRANCH_IS_PRODUCTION')
    }
    if (neonBranch.parentId !== null &&
        neonBranch.parentId === input.productionNeonBranchId) {
      blockers.push('NEON_PREVIEW_PARENT_IS_PRODUCTION')
    }
    if (neonBranch.initSource === 'parent-data' && !independentlyVerifiedEmptyRoot({
      expectedProjectId: input.expectedNeonProjectId,
      expectedBranchId: input.expectedNeonBranchId,
      productionProjectId: input.productionNeonProjectId ?? '',
      branch: neonBranch,
      proof: input.independentRoot,
    })) {
      blockers.push('NEON_PARENT_DATA_CLONE')
    } else if (neonBranch.initSource !== 'empty' && neonBranch.initSource !== 'parent-data') {
      blockers.push('NEON_EMPTY_ORIGIN_UNVERIFIED')
    }
  }

  return {
    status: blockers.length > 0 ? 'blocked' : 'metadata_consistent_not_authorized',
    blockers: [...new Set(blockers)],
    outstanding: [...outstanding],
  }
}
