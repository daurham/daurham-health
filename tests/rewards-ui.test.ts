import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Rewards owner UI contract', () => {
  const page = readFileSync('src/features/rewards/RewardsPage.tsx', 'utf8')
  const routes = readFileSync('src/routes/index.tsx', 'utf8')
  const layout = readFileSync('src/components/Layout.tsx', 'utf8')
  const coach = readFileSync('src/features/coach/CoachCard.tsx', 'utf8')

  it('shows spendable and lifetime XP without making Rewards a primary navigation tab', () => {
    expect(page).toContain('Spendable now')
    expect(page).toContain('All Coach XP earned')
    expect(routes).toContain("path: 'rewards'")
    expect(layout).not.toContain("{ id: 'rewards'")
  })

  it('requires an explicit redeem confirmation and exposes refund history', () => {
    expect(page).toContain('confirmPurchaseId')
    expect(page).toContain('Spend ')
    expect(page).toContain('Recent redemptions')
    expect(page).toContain('Return ')
    expect(page).toContain('Refund')
  })

  it('surfaces deterministic XP in Coach and keeps the owner-only wallet link out of demo prefixing', () => {
    expect(coach).toContain('xpForRewardBand')
    expect(coach).toContain('prefix ===')
    expect(coach).toContain('to="/rewards"')
    expect(routes).not.toContain("path: 'demo/rewards'")
  })

  it('does not add count-up animation or a reward polling loop', () => {
    expect(page).not.toMatch(/requestAnimationFrame|setInterval|setTimeout/)
    expect(page).not.toMatch(/animate-bounce|animate-ping/)
  })
})
