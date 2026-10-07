import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { matchHealthApiRoute } from '../server/dispatch.ts'

describe('I6 Goal Control routing and authority boundaries', () => {
  it('routes the owner-only Goal Control endpoint through the single Health API', () => {
    expect(matchHealthApiRoute('/api/intelligence/goal-control')).toBe('goal-control')
    const handler = readFileSync('server/handlers/goal-control.ts', 'utf8')
    expect(handler).toContain('withOwnerAuth')
    expect(handler).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(handler).not.toContain('BODY_CAPTURE_TOKEN')
  })

  it('keeps Goal Control derived-only and delegates Health evidence to I5', () => {
    const service = readFileSync('server/intelligence/goal-control.ts', 'utf8')
    const domain = readFileSync('src/domain/goal-control.ts', 'utf8')
    expect(service).toContain('loadHealthIntelligenceSnapshot')
    expect(service).toContain('buildWeeklyCoachBrief')
    expect(service).not.toMatch(/\b(INSERT INTO|UPDATE |DELETE FROM)\b/)
    expect(domain).not.toMatch(/\b(fetch|healthFetch|Gemini|Home-AI)\b/i)
  })

  it('uses Goal Control semantics for new Coach goal missions', () => {
    const source = readFileSync('server/coach/service.ts', 'utf8')
    expect(source).toContain('goalNeedsWeeklyAttention')
    expect(source).toContain('dailyTrainingQuestAllowed')
    expect(source).toContain('getTrainingPlan(date)')
    expect(source).toContain('expireInapplicableDailyTrainingTask')
    expect(source).toContain("existing.rule_key.startsWith('goal:training-session:')")
    expect(source).not.toContain("goal.goalKind === 'training_frequency' && !trainingPlan")
    const rewards = readFileSync('server/rewards/service.ts', 'utf8')
    expect(rewards).toContain("WHERE task.status = 'completed'")
    expect(rewards).not.toContain("task.status = 'expired'")
  })
})
