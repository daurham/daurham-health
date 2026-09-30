import { describe, expect, it } from 'vitest'
import {
  XP_RULE_VERSION,
  deriveWalletBalances,
  xpForRewardBand,
  rewardItemInputSchema,
} from '../src/domain/rewards.ts'

describe('reward wallet domain', () => {
  it('uses the frozen H3 XP calibration', () => {
    expect(XP_RULE_VERSION).toBe('xp-rule-v1')
    expect(xpForRewardBand('routine')).toBe(10)
    expect(xpForRewardBand('standard')).toBe(25)
    expect(xpForRewardBand('weekly')).toBe(75)
    expect(xpForRewardBand('stretch')).toBe(100)
  })

  it('separates lifetime XP from spendable XP', () => {
    expect(deriveWalletBalances([
      { entryKind: 'award', amountXp: 25 },
      { entryKind: 'award', amountXp: 100 },
      { entryKind: 'purchase', amountXp: 75 },
      { entryKind: 'refund', amountXp: 75 },
      { entryKind: 'purchase', amountXp: 25 },
    ])).toEqual({
      lifetimeXp: 125,
      spendableXp: 100,
    })
  })

  it('requires a positive whole-number reward price', () => {
    expect(rewardItemInputSchema.safeParse({ name: 'Takeout', costXp: 300, note: null }).success).toBe(true)
    expect(rewardItemInputSchema.safeParse({ name: 'Takeout', costXp: 0, note: null }).success).toBe(false)
    expect(rewardItemInputSchema.safeParse({ name: 'Takeout', costXp: 1.5, note: null }).success).toBe(false)
    expect(rewardItemInputSchema.safeParse({ name: '   ', costXp: 10, note: null }).success).toBe(false)
  })
})
