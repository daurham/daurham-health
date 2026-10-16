import { describe, expect, it } from 'vitest'
import { assessDatabaseBinding, assertDatabaseBindingIfEnabled } from '../server/database-binding.js'

const production = 'ep-synthetic-main.c-12.us-east-1.aws.neon.tech'
const preview = 'ep-synthetic-preview.c-12.us-east-1.aws.neon.tech'
const secret = 'never-print-synthetic-database-password'
const url = (host: string) =>
  'postgresql://qa-user:' + secret + '@' + host + '/neondb?sslmode=require&channel_binding=require'
const vars = (mode: 'production' | 'preview') => ({
  VERCEL_ENV: mode,
  VERCEL_GIT_COMMIT_REF: mode === 'production' ? 'main' : 'piq/00-baseline-20261014',
  DATABASE_URL: url(mode === 'production' ? production : preview),
  HEALTH_DB_PRODUCTION_ENDPOINT_HOST: production,
  HEALTH_DB_PREVIEW_ENDPOINT_HOST: preview,
  HEALTH_DB_PREVIEW_GIT_REF: 'piq/00-baseline-20261014',
})

describe('PIQ release database endpoint isolation guard (offline, synthetic only)', () => {
  it('verifies exact expected Neon endpoints for both production and preview', () => {
    for (const mode of ['production', 'preview'] as const) {
      expect(assessDatabaseBinding(vars(mode))).toEqual({
        status: 'verified', reason: 'VERIFIED_EXPECTED_ENDPOINT',
      })
    }
  })

  it('accepts pooled URLs only when they normalize to the same registered endpoint', () => {
    const pooledUrl = url(preview.replace('.c-12.', '-pooler.c-12.'))
    expect(assessDatabaseBinding({ ...vars('preview'), DATABASE_URL: pooledUrl })).toMatchObject({
      status: 'verified',
    })
  })

  it('fails closed when a preview resolves to the production endpoint or a different preview', () => {
    for (const host of [production, 'ep-other-branch.c-12.us-east-1.aws.neon.tech']) {
      expect(assessDatabaseBinding({ ...vars('preview'), DATABASE_URL: url(host) }))
        .toMatchObject({ status: 'blocked', reason: 'WRONG_DATABASE_ENDPOINT' })
    }
  })

  it('fails closed when production resolves to the preview endpoint', () => {
    expect(assessDatabaseBinding({ ...vars('production'), DATABASE_URL: url(preview) }))
      .toMatchObject({ status: 'blocked', reason: 'WRONG_DATABASE_ENDPOINT' })
  })

  it('never assumes environment or git ref from a missing/mismatched variable', () => {
    const baseline = vars('preview')
    expect(assessDatabaseBinding({ ...baseline, VERCEL_ENV: undefined }))
      .toMatchObject({ reason: 'UNSUPPORTED_ENVIRONMENT' })
    expect(assessDatabaseBinding({ ...baseline, HEALTH_DB_PREVIEW_GIT_REF: undefined }))
      .toMatchObject({ reason: 'MISSING_PREVIEW_REF' })
    expect(assessDatabaseBinding({ ...baseline, VERCEL_GIT_COMMIT_REF: 'main' }))
      .toMatchObject({ reason: 'UNEXPECTED_GIT_REF' })
    expect(assessDatabaseBinding({ ...vars('production'), VERCEL_GIT_COMMIT_REF: 'feature' }))
      .toMatchObject({ reason: 'UNEXPECTED_GIT_REF' })
    expect(assessDatabaseBinding({ ...baseline, DATABASE_URL: undefined }))
      .toMatchObject({ reason: 'MISSING_DATABASE_URL' })
  })

  it('does not accept missing, invalid, identical or secretly overridden endpoints', () => {
    const baseline = vars('preview')
    const cases = [
      { values: { HEALTH_DB_PRODUCTION_ENDPOINT_HOST: undefined }, reason: 'MISSING_EXPECTED_ENDPOINT' },
      { values: { HEALTH_DB_PREVIEW_ENDPOINT_HOST: 'https://' + preview }, reason: 'INVALID_EXPECTED_ENDPOINT' },
      { values: { HEALTH_DB_PREVIEW_ENDPOINT_HOST: production }, reason: 'ENDPOINTS_NOT_DISTINCT' },
      { values: { DATABASE_URL: 'not a URL' }, reason: 'INVALID_DATABASE_URL' },
      { values: { DATABASE_URL: url(preview).replace('postgresql:', 'https:') }, reason: 'INVALID_DATABASE_URL' },
      { values: { DATABASE_URL: url(preview) + '&host=ep-another.neon.tech' }, reason: 'UNSAFE_CONNECTION_OVERRIDE' },
      { values: { DATABASE_URL: url(preview) + '&options=endpoint%3Dep-another' }, reason: 'UNSAFE_CONNECTION_OVERRIDE' },
      { values: { DATABASE_URL: url(preview).replace('5432', '5444').replace('/neondb', ':5444/neondb') }, reason: 'INVALID_DATABASE_URL' },
    ]
    for (const c of cases) {
      expect(assessDatabaseBinding({ ...baseline, ...c.values })).toMatchObject({
        status: 'blocked', reason: c.reason,
      })
    }
  })

  it('never returns or throws the credential, hostname or complete database URL', () => {
    const secretUrl = url(production)
    const result = assessDatabaseBinding({ ...vars('preview'), DATABASE_URL: secretUrl })
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(JSON.stringify(result)).not.toContain(production)
    expect(JSON.stringify(result)).not.toContain(secretUrl)
    expect(() => assertDatabaseBindingIfEnabled({
      ...vars('preview'), HEALTH_DB_BINDING_ENFORCE: 'true', DATABASE_URL: secretUrl,
    })).toThrow('Database binding blocked (WRONG_DATABASE_ENDPOINT)')
    try {
      assertDatabaseBindingIfEnabled({ ...vars('preview'),
        HEALTH_DB_BINDING_ENFORCE: 'true', DATABASE_URL: secretUrl })
    } catch (error) {
      expect(String(error)).not.toContain(secret)
      expect(String(error)).not.toContain(production)
    }
  })

  it('does not change existing runtime behavior until explicitly enabled', () => {
    expect(() => assertDatabaseBindingIfEnabled({ DATABASE_URL: 'synthetic' })).not.toThrow()
    expect(() => assertDatabaseBindingIfEnabled({
      HEALTH_DB_BINDING_ENFORCE: 'false', DATABASE_URL: url(production),
    })).not.toThrow()
    expect(() => assertDatabaseBindingIfEnabled({
      HEALTH_DB_BINDING_ENFORCE: 'typo', DATABASE_URL: url(production),
    })).toThrow('Database binding blocked (INVALID_GUARD_FLAG)')
    expect(() => assertDatabaseBindingIfEnabled({
      ...vars('production'), HEALTH_DB_BINDING_ENFORCE: 'true',
    })).not.toThrow()
  })
})
