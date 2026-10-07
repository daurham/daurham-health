import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { matchHealthApiRoute } from '../server/dispatch.ts'

describe('I5 shared intelligence routing', () => {
  it('routes the owner snapshot through the single Health API', () => {
    expect(matchHealthApiRoute('/api/intelligence/snapshot')).toBe('health-intelligence')
    const source = readFileSync('server/handlers/health-intelligence.ts', 'utf8')
    expect(source).toContain('withOwnerAuth')
    expect(source).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(source).not.toContain('BODY_CAPTURE_TOKEN')
  })
})
