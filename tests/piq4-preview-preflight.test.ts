import { describe, expect, it } from 'vitest'
import { reviewPiqPreviewSafety, type PiqNeonBranchEvidence } from '../server/piq-preview-preflight.js'

const prodHost='ep-synthetic-main.c-12.us-east-1.aws.neon.tech'
const previewHost='ep-synthetic-preview.c-12.us-east-1.aws.neon.tech'
const prodAuth='https://synthetic-prod.neon.example.test/api/auth'
const previewAuth='https://synthetic-preview.neon.example.test/api/auth'
const sha='a'.repeat(40)
const secret='synthetic-private-password-do-not-print'
const cookieSecret='8290b7c5c0de12a4db28e41e56a74d8b320be27391d6cb7f5c893a061ed429a1'
const sql=(host:string)=>'postgresql://owner:'+secret+'@'+host+'/neondb?sslmode=require'
const env:NodeJS.ProcessEnv={
  VERCEL_ENV:'preview',
  VERCEL_GIT_COMMIT_REF:'piq/00-baseline-20261014',
  VERCEL_GIT_COMMIT_SHA:sha,
  HEALTH_PIQ_EXPECTED_PREVIEW_SHA:sha,
  DATABASE_URL:sql(previewHost),
  HEALTH_DB_BINDING_ENFORCE:'true',
  HEALTH_DB_PRODUCTION_ENDPOINT_HOST:prodHost,
  HEALTH_DB_PREVIEW_ENDPOINT_HOST:previewHost,
  HEALTH_DB_PRODUCTION_DATABASE_NAME:'neondb',
  HEALTH_DB_PREVIEW_DATABASE_NAME:'neondb',
  HEALTH_DB_PREVIEW_GIT_REF:'piq/00-baseline-20261014',
  HEALTH_AUTH_BINDING_ENFORCE:'true',
  NEON_AUTH_BASE_URL:previewAuth,
  NEON_AUTH_COOKIE_SECRET:cookieSecret,
  HEALTH_AUTH_PRODUCTION_BASE_URL:prodAuth,
  HEALTH_AUTH_PREVIEW_BASE_URL:previewAuth,
  HEALTH_AUTH_PREVIEW_GIT_REF:'piq/00-baseline-20261014',
  HEALTH_OWNER_USER_ID:'qa-disposable-owner',
  HEALTH_PIQ_PREVIEW_TEST_OWNER_USER_ID:'qa-disposable-owner',
  HEALTH_PIQ_PRODUCTION_OWNER_USER_ID:'prod-owner-not-qa',
  HEALTH_PIQ_EXPECTED_NEON_PROJECT_ID:'project-synthetic',
  HEALTH_PIQ_PRODUCTION_NEON_PROJECT_ID:'production-project-synthetic',
  HEALTH_PIQ_EXPECTED_PREVIEW_BRANCH_ID:'br-synthetic-qa',
  HEALTH_PIQ_PRODUCTION_BRANCH_ID:'br-synthetic-prod',
}
const branch:PiqNeonBranchEvidence={
  source:'neon_api',projectId:'project-synthetic',branchId:'br-synthetic-qa',
  parentId:null,initSource:'empty',
}
function blocked(
  patch: NodeJS.ProcessEnv,
  branchInfo:PiqNeonBranchEvidence|null=branch,
):string[]{
  const review=reviewPiqPreviewSafety({env:{...env,...patch},neonBranch:branchInfo})
  expect(review.status).toBe('blocked')
  return review.blockers
}
describe('PIQ-4.1 preview QA static fail-closed isolation preflight',()=>{
  it('only considers metadata-attested EMPTY previews eligible for later manual attestation',()=>{
    expect(reviewPiqPreviewSafety({env,neonBranch:branch})).toEqual({
      status:'configuration_eligible_for_manual_attestation',blockers:[],
    })
    expect(blocked({},null)).toContain('NEON_METADATA_UNAVAILABLE')
    expect(blocked({}, {...branch,initSource:'parent-data',parentId:'br-synthetic-prod'}))
      .toContain('PARENT_DATA_CLONE')
    expect(blocked({}, {...branch,initSource:'schema-only'}))
      .toContain('DATA_ORIGIN_NOT_INDEPENDENTLY_EMPTY')
    expect(blocked({}, {...branch,initSource:'unknown'}))
      .toContain('DATA_ORIGIN_NOT_INDEPENDENTLY_EMPTY')
  })
  it('does not confuse a deployed branch with the production branch or a cloned child',()=>{
    expect(blocked({}, {...branch,branchId:'br-synthetic-prod'}))
      .toContain('PREVIEW_BRANCH_IS_PRODUCTION')
    expect(blocked({}, {...branch,parentId:'br-synthetic-prod'}))
      .toContain('PREVIEW_BRANCH_IS_PRODUCTION')
    expect(blocked({}, {...branch,branchId:'br-foreign'}))
      .toContain('NEON_PROJECT_OR_BRANCH_MISMATCH')
    expect(blocked({}, {...branch,projectId:'different-project'}))
      .toContain('NEON_PROJECT_OR_BRANCH_MISMATCH')
  })
  it('requires QA to be in a DIFFERENT Neon project even for provider-reported empty branches',()=>{
    // Previously a production PROJECT with a different empty branch ID
    // could satisfy all the static preflight checks.
    expect(blocked({HEALTH_PIQ_PRODUCTION_NEON_PROJECT_ID:undefined}))
      .toContain('NEON_PRODUCTION_PROJECT_UNVERIFIED')
    expect(blocked({HEALTH_PIQ_PRODUCTION_NEON_PROJECT_ID:'project-synthetic'}))
      .toContain('NEON_PROJECT_IS_PRODUCTION')
    expect(blocked({HEALTH_PIQ_EXPECTED_NEON_PROJECT_ID:'production-project-synthetic'},
      {...branch,projectId:'production-project-synthetic'}))
      .toContain('NEON_PROJECT_IS_PRODUCTION')
    expect(blocked({HEALTH_PIQ_EXPECTED_NEON_PROJECT_ID:'project-synthetic'},
      {...branch,projectId:'production-project-synthetic'}))
      .toContain('NEON_PROJECT_IS_PRODUCTION')
    expect(reviewPiqPreviewSafety({env,neonBranch:branch}).status)
      .toBe('configuration_eligible_for_manual_attestation')
  })
  it('requires a PIQ Git ref even if both expected binding refs agree with an unapproved ref',()=>{
    for (const ref of ['main', 'feature/synthetic-other', '', 'piq/']) {
      expect(blocked({
        VERCEL_GIT_COMMIT_REF: ref,
        HEALTH_DB_PREVIEW_GIT_REF: ref,
        HEALTH_AUTH_PREVIEW_GIT_REF: ref,
      })).toContain('PIQ_PREVIEW_REF_NOT_ALLOWED')
    }
    expect(reviewPiqPreviewSafety({env,neonBranch:branch}).status)
      .toBe('configuration_eligible_for_manual_attestation')
  })
  it('rejects supposedly empty branches with ANY parent, not only a production parent',()=>{
    const fakeChild={...branch,parentId:'br-synthetic-unrelated-parent'}
    expect(blocked({},fakeChild)).toContain('NEON_PREVIEW_NOT_INDEPENDENT_ROOT')
    expect(blocked({}, {...branch,parentId:'br-synthetic-prod'}))
      .toContain('NEON_PREVIEW_NOT_INDEPENDENT_ROOT')
    expect(blocked({}, {...branch,parentId:null})).not.toContain('NEON_PREVIEW_NOT_INDEPENDENT_ROOT')
  })
  it('never lets matching endpoints bypass missing runtime enforcement',()=>{
    expect(blocked({HEALTH_AUTH_BINDING_ENFORCE:'false'}))
      .toContain('RUNTIME_GUARDS_NOT_ENFORCED')
    expect(blocked({HEALTH_DB_BINDING_ENFORCE:undefined}))
      .toContain('RUNTIME_GUARDS_NOT_ENFORCED')
    expect(blocked({DATABASE_URL:sql(prodHost)}))
      .toContain('DATABASE_BINDING_NOT_VERIFIED')
    expect(blocked({NEON_AUTH_BASE_URL:prodAuth}))
      .toContain('AUTH_BINDING_NOT_VERIFIED')
  })
  it('refuses empty, placeholder and suspicious QA database credentials even when the endpoint matches',()=> {
    const url = (user:string, password:string)=>
      'postgresql://'+user+':'+password+'@'+previewHost+'/neondb?sslmode=require'
    const invalid = [
      url('', 'long-enough-password-for-synthetic-test'),
      url('piq_qa_not_configured','long-enough-password-for-synthetic-test'),
      url('owner', ''),
      url('owner', 'short'),
      url('owner', 'x'.repeat(64)),
      url('owner', 'PIQ_QA_DATABASE_CREDENTIALS_NOT_CONFIGURED'),
      url('owner', 'my_example_password_not_ready'),
      url('owner', 'change%5Fme%5Fbefore%5Flaunch%5Fxxxxxxxx'),
      url('owner', 'has%20spaces%20in%20this%20password'),
      'postgresql://owner:%ZZ@'+previewHost+'/neondb?sslmode=require',
    ]
    for (const candidate of invalid) {
      expect(blocked({DATABASE_URL:candidate})).toContain('PREVIEW_DATABASE_CREDENTIALS_NOT_READY')
    }
    expect(reviewPiqPreviewSafety({env,neonBranch:branch}).status)
      .toBe('configuration_eligible_for_manual_attestation')
  })
  it('refuses missing, weak or placeholder QA cookie secrets even when all other bindings match',()=>{
    for (const bad of [
      undefined, '', 'too-short', 'x'.repeat(64),
      'PIQ_QA_COOKIE_NOT_CONFIGURED'.padEnd(64, 'z'),
      'replace_with_placeholder_generated_later'.padEnd(64, 'x'),
      'b6b9cf66269ab1eb60a2 test secret 12345678901234567890123456',
    ]) {
      expect(blocked({NEON_AUTH_COOKIE_SECRET:bad})).toContain('PREVIEW_COOKIE_SECRET_NOT_READY')
    }
    expect(reviewPiqPreviewSafety({env,neonBranch:branch}).status)
      .toBe('configuration_eligible_for_manual_attestation')
  })
  it('pins complete deployed SHA and forbids prod or unexpected refs',()=>{
    expect(blocked({HEALTH_PIQ_EXPECTED_PREVIEW_SHA:'b'.repeat(40)}))
      .toContain('DEPLOYED_COMMIT_MISMATCH')
    expect(blocked({VERCEL_GIT_COMMIT_SHA:undefined}))
      .toContain('COMMIT_PIN_MISSING_OR_INVALID')
    expect(blocked({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main'}))
      .toContain('NOT_PREVIEW')
    expect(blocked({VERCEL_GIT_COMMIT_REF:'main'}))
      .toContain('DATABASE_BINDING_NOT_VERIFIED')
  })
  it('blocks a preview that uses the production owner account or has no disposable owner',()=>{
    expect(blocked({HEALTH_OWNER_USER_ID:'prod-owner-not-qa'}))
      .toContain('OWNER_IDS_MISSING_OR_NOT_ISOLATED')
    expect(blocked({HEALTH_PIQ_PRODUCTION_OWNER_USER_ID:undefined}))
      .toContain('OWNER_IDS_MISSING_OR_NOT_ISOLATED')
    expect(blocked({HEALTH_PIQ_PREVIEW_TEST_OWNER_USER_ID:'different'}))
      .toContain('OWNER_IDS_MISSING_OR_NOT_ISOLATED')
  })
  it('outputs only enum blockers and never health, account, password, endpoint or secret',()=>{
    const result=reviewPiqPreviewSafety({
      env:{...env,DATABASE_URL:sql(prodHost),HEALTH_OWNER_USER_ID:'prod-owner-not-qa'},
      neonBranch:{...branch,initSource:'parent-data'},
    })
    const serialized=JSON.stringify(result)
    for (const sensitive of [secret,cookieSecret,prodHost,previewHost,prodAuth,previewAuth,'prod-owner-not-qa','qa-disposable-owner']) {
      expect(serialized).not.toContain(sensitive)
    }
    expect(result.status).toBe('blocked')
  })
})
