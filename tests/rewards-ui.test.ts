import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Rewards owner UI contract', () => {
  const page = readFileSync('src/features/rewards/RewardsPage.tsx', 'utf8')
  const routes = readFileSync('src/routes/index.tsx', 'utf8')
  const layout = readFileSync('src/components/Layout.tsx', 'utf8')
  const coach = readFileSync('src/features/coach/CoachCard.tsx', 'utf8')

  it('shows spendable and lifetime XP without making Rewards a primary navigation tab', () => {
    expect(page).toContain('Spendable')
    expect(page).toContain('Lifetime progression')
    expect(page).toContain('Level {progression.level}')
    expect(page).toContain('Open Theme Studio')
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

  it('surfaces deterministic XP in Coach and makes the owner wallet globally discoverable', () => {
    expect(coach).toContain('xpForRewardBand')
    expect(coach).toContain('XpAmount')
    expect(layout).toContain('to="/rewards"')
    expect(layout).toContain('spendable XP')
    expect(routes).not.toContain("path: 'demo/rewards'")
  })

  it('keeps reward celebration bounded without count-up animation or polling', () => {
    expect(page).not.toMatch(/requestAnimationFrame|setInterval/)
    expect(page).toContain('setTimeout')
    expect(page).not.toMatch(/animate-bounce|animate-ping/)
    expect(page).not.toMatch(/CountUp|countUp|setInterval/)
  })
})
