import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { matchHealthApiRoute } from '../server/dispatch.ts'

describe('I7 maintenance routing and derived-only boundaries', () => {
  it('routes the owner-only maintenance endpoint', () => {
    expect(matchHealthApiRoute('/api/intelligence/maintenance')).toBe('maintenance')
    const handler = readFileSync('server/handlers/maintenance.ts', 'utf8')
    expect(handler).toContain('withOwnerAuth')
    expect(handler).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
  })

  it('keeps the maintenance engine derived-only and target-safe', () => {
    const loader = readFileSync('server/intelligence/maintenance.ts', 'utf8')
    const domain = readFileSync('src/domain/maintenance.ts', 'utf8')
    expect(loader).toContain('loadHealthIntelligenceSnapshot')
    expect(loader).toContain('listDailyContexts')
    expect(loader).not.toMatch(/\b(INSERT INTO|UPDATE |DELETE FROM)\b/)
    expect(domain).not.toMatch(/\b(INSERT INTO|UPDATE |DELETE FROM|healthFetch|Gemini)\b/i)
    expect(domain).toContain('not an automatic target change')
  })

  it('adds carbohydrate to the shared I5 evidence frame for scale-noise context', () => {
    const shared = readFileSync('src/domain/intelligence/shared.ts', 'utf8')
    const loader = readFileSync('server/intelligence/snapshot.ts', 'utf8')
    expect(shared).toContain("'nutrition.carbs_g'")
    expect(loader).toContain('calories, protein, carbs, fiber, sodium')
    expect(loader).toContain("['nutrition.carbs_g', 'carbs', 'g']")
  })

  it('feeds I7 into I6 rather than creating a competing decision surface', () => {
    const goalControl = readFileSync('server/intelligence/goal-control.ts', 'utf8')
    const weekly = readFileSync('src/features/weekly-coach/WeeklyCoachPage.tsx', 'utf8')
    expect(goalControl).toContain('loadMaintenanceState')
    expect(weekly).toContain('decision.maintenance')
    expect(weekly).not.toContain('Maintenance dashboard')
  })
})
