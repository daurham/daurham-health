export const SIGN_IN_PATH = '/sign-in'
export const RESET_PASSWORD_PATH = '/reset-password'
export const SET_PASSWORD_SEARCH = 'set-password=1'

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128

export const REQUEST_SENT_MESSAGE =
  'If that email belongs to the Health owner account, check your inbox for a password link.'

export const PASSWORD_SET_MESSAGE = 'Password set successfully.'

export const INVALID_RESET_LINK_MESSAGE = 'This password link has expired or is invalid. Request a new one.'

export type PasswordAuthClient = {
  requestPasswordReset: (body: { email: string; redirectTo: string }) => Promise<{ error?: unknown } | void>
  resetPassword: (body: {
    newPassword: string
    token: string
  }) => Promise<{ error?: { code?: string; message?: string } | null } | void>
}

export function passwordResetRedirectUrl(origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  if (origin.length > 0) {
    return `${origin}${RESET_PASSWORD_PATH}`
  }
  return RESET_PASSWORD_PATH
}

export function setPasswordPath(): string {
  return `${SIGN_IN_PATH}?${SET_PASSWORD_SEARCH}`
}

export function parseResetTokenFromSearch(search: string): { token: string } | { error: 'missing' | 'invalid' } {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const error = params.get('error')
  if (error && error.trim().length > 0) {
    return { error: 'invalid' }
  }
  const token = params.get('token')?.trim() ?? ''
  if (token.length === 0) {
    return { error: 'missing' }
  }
  return { token }
}

export function validateNewPasswords(password: string, confirm: string): string | null {
  if (password.length === 0 || confirm.length === 0) {
    return 'Enter and confirm the new password.'
  }
  if (password !== confirm) {
    return 'Passwords do not match.'
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`
  }
  return null
}

function isInvalidResetTokenError(error: { code?: string; message?: string } | null | undefined): boolean {
  const code = error?.code?.toUpperCase() ?? ''
  const message = error?.message?.toUpperCase() ?? ''
  return code.includes('INVALID_TOKEN') || code.includes('EXPIRED') || message.includes('INVALID_TOKEN')
}

export async function requestOwnerPasswordReset(
  email: string,
  client: PasswordAuthClient,
): Promise<void> {
  try {
    await client.requestPasswordReset({
      email,
      redirectTo: passwordResetRedirectUrl(),
    })
  } catch {
    // Same generic outcome whether the account exists or the provider errors.
  }
}

export async function submitOwnerPasswordReset(
  newPassword: string,
  token: string,
  client: PasswordAuthClient,
): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'failed' }> {
  try {
    const result = await client.resetPassword({ newPassword, token })
    if (result && typeof result === 'object' && result.error) {
      return { ok: false, reason: isInvalidResetTokenError(result.error) ? 'invalid' : 'failed' }
    }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
