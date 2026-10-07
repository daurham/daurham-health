import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DAILY_PARTICIPATION_MAX_XP } from '../src/domain/rewards.ts'

describe('I3 participation XP source contract', () => {
  const rewards = readFileSync('server/rewards/service.ts', 'utf8')
  const dailySignals = readFileSync('server/daily-signals/service.ts', 'utf8')
  const supplements = readFileSync('server/supplements/service.ts', 'utf8')
  const client = readFileSync('src/lib/health-api.ts', 'utf8')
  const page = readFileSync('src/features/rewards/RewardsPage.tsx', 'utf8')

  it('uses one idempotent daily-participation award boundary', () => {
    expect(rewards).toContain('awardDailyParticipation')
    expect(rewards).toContain('dailyParticipationIdempotencyKey')
    expect(rewards).toContain("source_kind, source_id")
    expect(rewards).toContain("'daily_participation'")
    expect(rewards).toContain('ON CONFLICT DO NOTHING')
    expect(DAILY_PARTICIPATION_MAX_XP).toBe(65)
  })

  it('hooks water, bowel, wellness, and completed supplement days without per-event stacking', () => {
    expect(dailySignals).toContain("kind: 'hydration'")
    expect(dailySignals).toContain("kind: 'bowel'")
    expect(dailySignals).toContain("kind: 'wellness'")
    expect(supplements).toContain("kind: 'supplements'")
    expect(supplements).toContain('day.scheduledCount > 0 && day.unknownCount === 0')
  })

  it('refreshes the global wallet after eligible health mutations', () => {
    expect(client).toContain('notifyRewardStateChanged')
    expect(client).toContain('/api/supplements/adherence')
    expect(client).toContain('hydration|bowel|check-in')
  })

  it('documents the cap, honest skips, and short backlog rule in Rewards', () => {
    expect(page).toContain('How participation XP works')
    expect(page).toContain('honest skips')
    expect(page).toContain('Today and yesterday')
    expect(page).toContain('100 XP = $1')
  })
})
