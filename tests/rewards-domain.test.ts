import { describe, expect, it } from 'vitest'
import {
  COACH_XP_RULE_VERSION,
  DAILY_PARTICIPATION_MAX_XP,
  DAILY_PARTICIPATION_RULE_VERSION,
  DAILY_PARTICIPATION_XP,
  XP_RULE_VERSION,
  dailyParticipationIdempotencyKey,
  deriveWalletBalances,
  participationDateEligible,
  rewardItemInputSchema,
  xpForRewardBand,
} from '../src/domain/rewards.ts'

describe('reward wallet domain', () => {
  it('keeps Coach calibration frozen while I3 expands the wallet rule', () => {
    expect(XP_RULE_VERSION).toBe('xp-rule-v2')
    expect(COACH_XP_RULE_VERSION).toBe('xp-rule-v1')
    expect(DAILY_PARTICIPATION_RULE_VERSION).toBe('xp-participation-v1')
    expect(xpForRewardBand('routine')).toBe(10)
    expect(xpForRewardBand('standard')).toBe(25)
    expect(xpForRewardBand('weekly')).toBe(75)
    expect(xpForRewardBand('stretch')).toBe(100)
  })

  it('caps participation by one fixed award per domain and Health date', () => {
    expect(DAILY_PARTICIPATION_XP).toEqual({
      hydration: 10,
      bowel: 10,
      wellness: 20,
      supplements: 25,
    })
    expect(DAILY_PARTICIPATION_MAX_XP).toBe(65)
    expect(dailyParticipationIdempotencyKey('hydration', '2026-10-06')).toBe('award:daily:hydration:2026-10-06')
    expect(dailyParticipationIdempotencyKey('hydration', '2026-10-06')).not.toBe(
      dailyParticipationIdempotencyKey('wellness', '2026-10-06'),
    )
  })

  it('allows today and yesterday but not older backlog to mint participation XP', () => {
    expect(participationDateEligible('2026-10-06', '2026-10-06')).toBe(true)
    expect(participationDateEligible('2026-10-05', '2026-10-06')).toBe(true)
    expect(participationDateEligible('2026-10-04', '2026-10-06')).toBe(false)
    expect(participationDateEligible('2026-10-07', '2026-10-06')).toBe(false)
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
