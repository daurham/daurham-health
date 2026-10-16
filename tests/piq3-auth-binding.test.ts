import { describe, expect, it } from 'vitest'
import { assessAuthBinding, assertAuthBindingIfEnabled } from '../server/auth/binding.js'
import { getNeonAuthProxyConfig } from '../server/auth/config.js'

const prod = 'https://prod-branch.auth.example.test/api/auth'
const preview = 'https://preview-branch.auth.example.test/api/auth'
const secret = 'synthetic-cookie-secret-which-must-never-be-printed-123'
const base = (target: 'production' | 'preview') => ({
  VERCEL_ENV: target,
  VERCEL_GIT_COMMIT_REF: target === 'production' ? 'main' : 'piq/00-baseline-20261014',
  NEON_AUTH_BASE_URL: target === 'production' ? prod : preview,
  NEON_AUTH_COOKIE_SECRET: secret,
  HEALTH_AUTH_PRODUCTION_BASE_URL: prod,
  HEALTH_AUTH_PREVIEW_BASE_URL: preview,
  HEALTH_AUTH_PREVIEW_GIT_REF: 'piq/00-baseline-20261014',
})

describe('PIQ Auth binding configuration boundary (synthetic / offline only)', () => {
  it('matches separate production and preview Auth URLs and benign trailing slashes', () => {
    for (const target of ['production', 'preview'] as const) {
      expect(assessAuthBinding(base(target))).toEqual({
        status: 'verified', reason: 'VERIFIED_EXPECTED_AUTH',
      })
    }
    expect(assessAuthBinding({ ...base('preview'), NEON_AUTH_BASE_URL: preview + '/' }))
      .toMatchObject({ status: 'verified' })
  })

  it('blocks cross-branch, foreign or identical configured Auth endpoints', () => {
    expect(assessAuthBinding({ ...base('preview'), NEON_AUTH_BASE_URL: prod }))
      .toMatchObject({ reason: 'WRONG_AUTH_URL' })
    expect(assessAuthBinding({ ...base('production'), NEON_AUTH_BASE_URL: preview }))
      .toMatchObject({ reason: 'WRONG_AUTH_URL' })
    expect(assessAuthBinding({ ...base('preview'), NEON_AUTH_BASE_URL: 'https://other.auth.example.test/api/auth' }))
      .toMatchObject({ reason: 'WRONG_AUTH_URL' })
    expect(assessAuthBinding({ ...base('preview'), HEALTH_AUTH_PREVIEW_BASE_URL: prod }))
      .toMatchObject({ reason: 'AUTH_URLS_NOT_DISTINCT' })
  })

  it('requires expected config and the exact deployment environment/ref', () => {
    expect(assessAuthBinding({ ...base('preview'), VERCEL_ENV: 'development' }))
      .toMatchObject({ reason: 'UNSUPPORTED_ENVIRONMENT' })
    expect(assessAuthBinding({ ...base('preview'), NEON_AUTH_BASE_URL: undefined }))
      .toMatchObject({ reason: 'MISSING_AUTH_URL' })
    expect(assessAuthBinding({ ...base('preview'), HEALTH_AUTH_PREVIEW_BASE_URL: undefined }))
      .toMatchObject({ reason: 'MISSING_EXPECTED_AUTH_URL' })
    expect(assessAuthBinding({ ...base('preview'), HEALTH_AUTH_PREVIEW_GIT_REF: undefined }))
      .toMatchObject({ reason: 'MISSING_PREVIEW_REF' })
    expect(assessAuthBinding({ ...base('preview'), VERCEL_GIT_COMMIT_REF: 'main' }))
      .toMatchObject({ reason: 'UNEXPECTED_GIT_REF' })
    expect(assessAuthBinding({ ...base('production'), VERCEL_GIT_COMMIT_REF: 'preview' }))
      .toMatchObject({ reason: 'UNEXPECTED_GIT_REF' })
  })

  it('rejects invalid, non-HTTPS, credential-bearing and query-routed URLs', () => {
    const invalid = [
      'http://preview-branch.auth.example.test/api/auth',
      'https://user:password@preview-branch.auth.example.test/api/auth',
      preview + '?redirect=https://prod.example',
      preview + '#frag',
      'not a URL',
    ]
    for (const NEON_AUTH_BASE_URL of invalid) {
      expect(assessAuthBinding({ ...base('preview'), NEON_AUTH_BASE_URL }))
        .toMatchObject({ status: 'blocked', reason: 'INVALID_AUTH_URL' })
    }
    expect(assessAuthBinding({ ...base('preview'), HEALTH_AUTH_PRODUCTION_BASE_URL: 'http://foo.test' }))
      .toMatchObject({ reason: 'INVALID_EXPECTED_AUTH_URL' })
  })

  it('never echoes actual Auth URL or cookie secret in diagnostics/errors', () => {
    const env = { ...base('preview'), NEON_AUTH_BASE_URL: prod, HEALTH_AUTH_BINDING_ENFORCE: 'true' }
    const result = assessAuthBinding(env)
    expect(JSON.stringify(result)).not.toContain(prod)
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(() => assertAuthBindingIfEnabled(env)).toThrow('Auth binding blocked (WRONG_AUTH_URL)')
    try {
      assertAuthBindingIfEnabled(env)
    } catch (error) {
      expect(String(error)).not.toContain(prod)
      expect(String(error)).not.toContain(secret)
    }
  })

  it('leaves existing auth behavior unchanged until enabled, then enforces at proxy config', async () => {
    expect(() => assertAuthBindingIfEnabled({})).not.toThrow()
    expect(() => assertAuthBindingIfEnabled({ HEALTH_AUTH_BINDING_ENFORCE: 'false' })).not.toThrow()
    expect(() => assertAuthBindingIfEnabled({ HEALTH_AUTH_BINDING_ENFORCE: 'typo' }))
      .toThrow('Auth binding blocked (INVALID_GUARD_FLAG)')
    const mismatched = { ...base('preview'), HEALTH_AUTH_BINDING_ENFORCE: 'true',
      NEON_AUTH_BASE_URL: prod }
    await expect(getNeonAuthProxyConfig(mismatched)).rejects.toThrow('Auth binding blocked (WRONG_AUTH_URL)')
    await expect(getNeonAuthProxyConfig({ ...base('preview'), HEALTH_AUTH_BINDING_ENFORCE: 'true' }))
      .resolves.toMatchObject({ authBaseUrl: preview })
  })
})
