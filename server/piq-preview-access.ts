/** PIQ release hard stop: preflight review is advisory, not runtime access.
 * Before independently attested Neon/Auth/owner isolation and owner sign-off,
 * no PIQ candidate may invoke any Health API owner handler. Deliberately no
 * env-only unlock for parent-data cloned databases.
 */
export function piqPreviewOwnerApiLocked(env: NodeJS.ProcessEnv): boolean {
  const ref = env.VERCEL_GIT_COMMIT_REF?.trim() ?? ''
  return /^piq\//i.test(ref) || (env.VERCEL_ENV === 'preview' && !ref)
}
