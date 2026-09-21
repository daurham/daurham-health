import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React, { type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../src/auth/context.ts'
import { ResetPasswordPage } from '../src/auth/ResetPasswordPage.tsx'
import { SignInPage } from '../src/auth/SignInPage.tsx'
import {
  INVALID_RESET_LINK_MESSAGE,
  MIN_PASSWORD_LENGTH,
  PASSWORD_SET_MESSAGE,
  parseResetTokenFromSearch,
  passwordResetRedirectUrl,
  REQUEST_SENT_MESSAGE,
  requestOwnerPasswordReset,
  RESET_PASSWORD_PATH,
  setPasswordPath,
  SIGN_IN_PATH,
  submitOwnerPasswordReset,
  validateNewPasswords,
  type PasswordAuthClient,
} from '../src/auth/password.ts'

const anonymousAuth: AuthContextValue = {
  status: 'anonymous',
  email: null,
  refresh: async () => undefined,
  signOut: async () => undefined,
}

function renderAt(path: string, page: ReactElement) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={anonymousAuth}>{page}</AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('password reset helpers', () => {
  it('builds a Health callback URL and does not enumerate emails', async () => {
    expect(passwordResetRedirectUrl('https://health.daurham.com')).toBe(
      'https://health.daurham.com/reset-password',
    )
    expect(setPasswordPath()).toBe('/sign-in?set-password=1')

    const calls: unknown[] = []
    const client: PasswordAuthClient = {
      requestPasswordReset: async (body) => {
        calls.push(body)
        return { error: { message: 'should not leak' } }
      },
      resetPassword: async () => ({ error: null }),
    }
    await requestOwnerPasswordReset('anyone@example.com', client)
    expect(calls).toEqual([
      { email: 'anyone@example.com', redirectTo: passwordResetRedirectUrl() },
    ])
    expect(REQUEST_SENT_MESSAGE.toLowerCase()).toContain('if that email belongs')
  })

  it('reads a valid reset token and rejects missing or invalid tokens', () => {
    expect(parseResetTokenFromSearch('?token=valid-reset-token')).toEqual({ token: 'valid-reset-token' })
    expect(parseResetTokenFromSearch('')).toEqual({ error: 'missing' })
    expect(parseResetTokenFromSearch('?error=INVALID_TOKEN')).toEqual({ error: 'invalid' })
  })

  it('rejects mismatched or too-short passwords before calling the provider', () => {
    expect(validateNewPasswords('secret12', 'other12')).toBe('Passwords do not match.')
    expect(validateNewPasswords('short', 'short')).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    )
    expect(validateNewPasswords('longenough', 'longenough')).toBeNull()
  })

  it('submits resetPassword through the existing auth client', async () => {
    const resetPassword = vi.fn(async () => ({ error: null }))
    const client: PasswordAuthClient = {
      requestPasswordReset: async () => undefined,
      resetPassword,
    }
    await expect(submitOwnerPasswordReset('longenough', 'valid-reset-token', client)).resolves.toEqual({
      ok: true,
    })
    expect(resetPassword).toHaveBeenCalledWith({ newPassword: 'longenough', token: 'valid-reset-token' })

    const invalid = await submitOwnerPasswordReset('longenough', 'expired', {
      requestPasswordReset: async () => undefined,
      resetPassword: async () => ({ error: { code: 'INVALID_TOKEN' } }),
    })
    expect(invalid).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('password reset UI', () => {
  it('shows the forgot-or-set-password request form from Owner Sign In', () => {
    const signIn = renderAt('/sign-in', <SignInPage />)
    expect(signIn).toContain('Owner Sign In')
    expect(signIn).toContain('Forgot or set password?')
    expect(signIn).not.toContain('Create account')

    const request = renderAt('/sign-in?set-password=1', <SignInPage />)
    expect(request).toContain('Send password link')
    expect(request).toContain('Email')
    expect(readFileSync(join(process.cwd(), 'src/auth/SignInPage.tsx'), 'utf8')).toContain(
      'REQUEST_SENT_MESSAGE',
    )
  })

  it('accepts a valid token on the public reset route', () => {
    const html = renderAt('/reset-password?token=valid-reset-token', <ResetPasswordPage />)
    expect(html).toContain('Set Password')
    expect(html).toContain('New password')
    expect(html).toContain('Confirm password')
    expect(html).not.toContain(INVALID_RESET_LINK_MESSAGE)
  })

  it('handles a missing or expired token without raw provider errors', () => {
    const missing = renderAt('/reset-password', <ResetPasswordPage />)
    expect(missing).toContain(INVALID_RESET_LINK_MESSAGE)
    expect(missing).toContain('Request a new one')
    expect(missing).toContain(setPasswordPath())

    const expired = renderAt('/reset-password?error=INVALID_TOKEN', <ResetPasswordPage />)
    expect(expired).toContain(INVALID_RESET_LINK_MESSAGE)
    expect(expired).not.toContain('stack')
  })

  it('returns to Owner Sign In after a successful reset', () => {
    const source = readFileSync(join(process.cwd(), 'src/auth/ResetPasswordPage.tsx'), 'utf8')
    expect(source).toContain('navigate(SIGN_IN_PATH')
    expect(source).toContain('passwordSet: true')
    expect(source).toContain('submitOwnerPasswordReset')
    expect(SIGN_IN_PATH).toBe('/sign-in')
    expect(RESET_PASSWORD_PATH).toBe('/reset-password')
    expect(PASSWORD_SET_MESSAGE).toBe('Password set successfully.')
  })
})

describe('password reset does not add serverless functions or secrets', () => {
  it('keeps a single Vercel API entrypoint', () => {
    const vercel = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')
    expect(vercel).toContain('"/api/:path*"')
    const apiIndex = readFileSync(join(process.cwd(), 'api/index.ts'), 'utf8')
    expect(apiIndex).toContain('dispatchHealthApi')
  })

  it('does not embed server secrets in password-reset client files', () => {
    for (const file of ['src/auth/password.ts', 'src/auth/ResetPasswordPage.tsx', 'src/auth/SignInPage.tsx']) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      expect(source).not.toContain('HEALTH_OWNER_USER_ID')
      expect(source).not.toContain('HOME_AI_API_KEY')
      expect(source).not.toContain('DATABASE_URL')
      expect(source).not.toContain('NEON_AUTH_COOKIE_SECRET')
      expect(source).not.toContain('NEON_AUTH_BASE_URL')
      expect(source).not.toContain('localStorage')
      expect(source).not.toContain('sessionStorage')
    }
  })
})
