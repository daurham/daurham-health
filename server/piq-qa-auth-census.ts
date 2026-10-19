/**
 * Offline, aggregate-only check of the isolated QA Neon Auth directory.
 *
 * Inputs must be counts returned by a trusted read-only SQL query scoped to
 * the independently verified QA project/branch. Do not pass user rows, email
 * addresses, user IDs, password hashes, sessions or connection credentials.
 *
 * This is an explanation of directory state, NEVER authorization for a PIQ
 * Preview login, API unlock, production merge or owner-data access.
 */
export type PiqQaAuthCensus = {
  source: 'neon_sql'
  projectId: string
  branchId: string
  userCount: number
  accountCount: number
  sessionCount: number
  documentedFictionalUserCount: number
  verifiedUserCount: number
  passwordAccountCount: number
  userPredatingRootCount: number
}

export type PiqQaAuthCensusReview = {
  classification: 'unverified' | 'empty_directory' | 'documented_fixture_only' | 'operator_review_required'
  blockers: Array<
    'EVIDENCE_MISSING_OR_WRONG_TARGET' |
    'INVALID_AGGREGATES' |
    'PREEXISTING_OR_UNEXPECTED_IDENTITY' |
    'QA_LOGIN_NOT_VERIFIED' |
    'RUNTIME_AUTH_BINDING_NOT_ATTESTED'
  >
  ownerQaAuthorized: false
}

/**
 * A matching fictional test email and absent password credential explain
 * the known QA fixture; neither establish that any owner can sign in.
 * Every state keeps the manual runtime/identity gate closed.
 */
export function reviewPiqQaAuthCensus(input: {
  expectedProjectId: string
  expectedBranchId: string
  census: PiqQaAuthCensus | null | undefined
}): PiqQaAuthCensusReview {
  const { census, expectedProjectId, expectedBranchId } = input
  const blockers: PiqQaAuthCensusReview['blockers'] = [
    'QA_LOGIN_NOT_VERIFIED',
    'RUNTIME_AUTH_BINDING_NOT_ATTESTED',
  ]
  const result = (classification: PiqQaAuthCensusReview['classification']) => ({
    classification, blockers: [...new Set(blockers)], ownerQaAuthorized: false as const,
  })
  if (!census || census.source !== 'neon_sql' || !expectedProjectId || !expectedBranchId ||
      census.projectId !== expectedProjectId || census.branchId !== expectedBranchId) {
    blockers.push('EVIDENCE_MISSING_OR_WRONG_TARGET')
    return result('unverified')
  }
  const values = [
    census.userCount, census.accountCount, census.sessionCount,
    census.documentedFictionalUserCount, census.verifiedUserCount,
    census.passwordAccountCount, census.userPredatingRootCount,
  ]
  if (!values.every(value => Number.isSafeInteger(value) && value >= 0) ||
      census.documentedFictionalUserCount > census.userCount ||
      census.verifiedUserCount > census.userCount ||
      census.passwordAccountCount > census.accountCount ||
      census.userPredatingRootCount > census.userCount) {
    blockers.push('INVALID_AGGREGATES')
    return result('unverified')
  }
  if (census.userPredatingRootCount > 0 || census.sessionCount > 0) {
    blockers.push('PREEXISTING_OR_UNEXPECTED_IDENTITY')
    return result('unverified')
  }
  if (census.userCount === 0 && census.accountCount === 0 &&
      census.documentedFictionalUserCount === 0 &&
      census.verifiedUserCount === 0 && census.passwordAccountCount === 0) {
    return result('empty_directory')
  }
  if (census.userCount === 1 && census.documentedFictionalUserCount === 1 &&
      census.accountCount <= 1 && census.verifiedUserCount === 0 &&
      census.passwordAccountCount === 0) {
    return result('documented_fixture_only')
  }
  // A plausible new QA credential is not proof of the actual Auth tenant,
  // session subject, preview owner binding or successful protected login.
  return result('operator_review_required')
}
