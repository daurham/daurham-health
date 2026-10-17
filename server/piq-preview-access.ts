/** PIQ release hard stop: preflight review is advisory, not runtime access.
 * Before independently attested Neon/Auth/owner isolation and owner sign-off,
 * no PIQ candidate may invoke any Health API owner handler. Deliberately no
 * env-only unlock for parent-data cloned databases.
 *
 * Never trust a single reported git ref to decide whether a deployment is a
 * PIQ candidate: a branch-scoped preview can inherit inconsistent metadata.
 * PIQ-only marker keys still force the lock, even if ref/target are wrong.
 * These markers are intentionally NOT an access grant or an unlock flag.
 */
const piqOnlyMarkers = [
  'HEALTH_PIQ_EXPECTED_NEON_PROJECT_ID',
  'HEALTH_PIQ_EXPECTED_PREVIEW_BRANCH_ID',
  'HEALTH_PIQ_PREVIEW_TEST_OWNER_USER_ID',
  'HEALTH_PIQ_EXPECTED_PREVIEW_SHA',
] as const

export function piqPreviewOwnerApiLocked(env: NodeJS.ProcessEnv): boolean {
  const ref = env.VERCEL_GIT_COMMIT_REF?.trim() ?? ''
  return /^piq\//i.test(ref) ||
    (env.VERCEL_ENV === 'preview' && !ref) ||
    piqOnlyMarkers.some((key) => Object.prototype.hasOwnProperty.call(env, key))
}
