import { describe, expect, it } from 'vitest'
import {
  reviewPiqQaAuthCensus,
  type PiqQaAuthCensus,
} from '../server/piq-qa-auth-census.js'

const census: PiqQaAuthCensus = {
  source: 'neon_sql',
  projectId: 'synthetic-qa-only',
  branchId: 'br-synthetic-root',
  userCount: 1,
  accountCount: 1,
  sessionCount: 0,
  documentedFictionalUserCount: 1,
  verifiedUserCount: 0,
  passwordAccountCount: 0,
  userPredatingRootCount: 0,
}
const args = {
  expectedProjectId: 'synthetic-qa-only',
  expectedBranchId: 'br-synthetic-root',
  census,
}
const review = (change: Partial<typeof args> = {}) =>
  reviewPiqQaAuthCensus({ ...args, ...change })

describe('PIQ-7 isolated QA Neon Auth aggregate-only census', () => {
  it('explains the documented non-login fixture without treating it as working owner Auth', () => {
    const result = review()
    expect(result.classification).toBe('documented_fixture_only')
    expect(result.ownerQaAuthorized).toBe(false)
    expect(result.blockers).toContain('QA_LOGIN_NOT_VERIFIED')
    expect(result.blockers).toContain('RUNTIME_AUTH_BINDING_NOT_ATTESTED')
  })

  it('distinguishes a genuinely empty Auth directory from the existing fixture', () => {
    const result = review({ census: {
      ...census, userCount: 0, accountCount: 0, documentedFictionalUserCount: 0,
    } })
    expect(result.classification).toBe('empty_directory')
    expect(result.ownerQaAuthorized).toBe(false)
  })

  it('rejects missing, untrusted or wrong QA targets', () => {
    expect(review({ census: null }).blockers).toContain('EVIDENCE_MISSING_OR_WRONG_TARGET')
    expect(review({ expectedProjectId: 'production' }).classification).toBe('unverified')
    expect(review({ census: { ...census, branchId: 'br-prod' } }).classification).toBe('unverified')
    expect(review({ census: { ...census, source: 'browser' as 'neon_sql' } }).classification)
      .toBe('unverified')
  })

  it('refuses nonsensical and internally conflicting count evidence', () => {
    for (const invalid of [
      { userCount: -1 },
      { userCount: 0, documentedFictionalUserCount: 1 },
      { passwordAccountCount: 2 },
      { verifiedUserCount: 2 },
      { userPredatingRootCount: 2 },
      { sessionCount: Number.NaN },
      { accountCount: 0.5 },
    ]) {
      const result = review({ census: { ...census, ...invalid } })
      expect(result.classification).toBe('unverified')
      expect(result.blockers).toContain('INVALID_AGGREGATES')
    }
  })

  it('flags unknown users, old identities and live sessions without assuming safe isolation', () => {
    expect(review({ census: { ...census, userPredatingRootCount: 1 } }).blockers)
      .toContain('PREEXISTING_OR_UNEXPECTED_IDENTITY')
    expect(review({ census: { ...census, sessionCount: 1 } }).classification)
      .toBe('unverified')
    const extra = review({ census: { ...census, userCount: 2 } })
    expect(extra.classification).toBe('operator_review_required')
    expect(extra.ownerQaAuthorized).toBe(false)
  })

  it('does not confuse an apparently usable login credential with a proven runtime owner', () => {
    const possible = review({ census: {
      ...census, documentedFictionalUserCount: 0, passwordAccountCount: 1,
      verifiedUserCount: 1,
    } })
    expect(possible.classification).toBe('operator_review_required')
    expect(possible.ownerQaAuthorized).toBe(false)
  })

  it('outputs only fixed safe status enums, never caller identities', () => {
    const secret = 'private-user-identifier-never-return'
    const output = review({ census: { ...census, projectId: secret } })
    const serialized = JSON.stringify(output)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('synthetic-qa-only')
    expect(serialized).not.toContain('br-synthetic-root')
    expect(serialized).not.toContain('@')
  })
})
