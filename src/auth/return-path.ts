/** Owner-app path safe to restore after sign-in. Rejects external and auth URLs. */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    return null
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('://')) {
    return null
  }
  const path = value.split('?')[0] ?? value
  if (path === '/sign-in' || path.startsWith('/sign-in/') || path === '/reset-password' || path.startsWith('/reset-password/')) {
    return null
  }
  return value
}
