import { describe, expect, it } from 'vitest'
import { matchHealthApiRoute } from '../server/dispatch.ts'

describe('I4 owner API routing', () => {
  it('routes Change Ledger and Data Quality endpoints through the single Health API', () => {
    expect(matchHealthApiRoute('/api/intelligence/changes')).toBe('change-ledger')
    expect(matchHealthApiRoute('/api/intelligence/changes/11111111-1111-4111-8111-111111111111')).toBe('change-ledger')
    expect(matchHealthApiRoute('/api/data-quality')).toBe('data-quality')
    expect(matchHealthApiRoute('/api/data-quality/reviews')).toBe('data-quality')
  })
})
