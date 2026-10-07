import { z } from 'zod'
import { addCalendarDays } from './progress/dates.js'
import type { CoachDifficulty } from './coach.js'

export const XP_RULE_VERSION = 'xp-rule-v2' as const
export const COACH_XP_RULE_VERSION = 'xp-rule-v1' as const
export const DAILY_PARTICIPATION_RULE_VERSION = 'xp-participation-v1' as const

export const XP_BY_REWARD_BAND: Readonly<Record<CoachDifficulty, number>> = {
  routine: 10,
  standard: 25,
  weekly: 75,
  stretch: 100,
}

export function xpForRewardBand(band: CoachDifficulty): number {
  return XP_BY_REWARD_BAND[band]
}

export const DAILY_PARTICIPATION_KINDS = ['hydration', 'bowel', 'wellness', 'supplements'] as const
export type DailyParticipationKind = (typeof DAILY_PARTICIPATION_KINDS)[number]

export const DAILY_PARTICIPATION_XP: Readonly<Record<DailyParticipationKind, number>> = {
  hydration: 10,
  bowel: 10,
  wellness: 20,
  supplements: 25,
}

export const DAILY_PARTICIPATION_MAX_XP = Object.values(DAILY_PARTICIPATION_XP)
  .reduce((sum, value) => sum + value, 0)

export const PARTICIPATION_BACKLOG_MAX_AGE_DAYS = 1

export function dailyParticipationXp(kind: DailyParticipationKind): number {
  return DAILY_PARTICIPATION_XP[kind]
}

export function dailyParticipationLabel(kind: DailyParticipationKind): string {
  if (kind === 'hydration') return 'Water logged'
  if (kind === 'bowel') return 'Bowel tracking'
  if (kind === 'wellness') return 'Daily ratings'
  return 'Supplements recorded'
}

export function dailyParticipationIdempotencyKey(kind: DailyParticipationKind, healthDate: string): string {
  return `award:daily:${kind}:${healthDate}`
}

export function participationDateEligible(healthDate: string, today: string): boolean {
  return healthDate === today || healthDate === addCalendarDays(today, -PARTICIPATION_BACKLOG_MAX_AGE_DAYS)
}

export const XP_LEDGER_ENTRY_KINDS = ['award', 'purchase', 'refund'] as const
export type XpLedgerEntryKind = (typeof XP_LEDGER_ENTRY_KINDS)[number]

export const XP_LEDGER_SOURCE_KINDS = ['coach_task', 'daily_participation', 'reward_purchase'] as const
export type XpLedgerSourceKind = (typeof XP_LEDGER_SOURCE_KINDS)[number]

export type WalletLedgerEntry = {
  id: string
  entryKind: XpLedgerEntryKind
  amountXp: number
  sourceKind: XpLedgerSourceKind
  sourceId: string
  idempotencyKey: string
  ruleVersion: string | null
  occurredAt: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type WalletBalances = {
  lifetimeXp: number
  spendableXp: number
}

export type RewardSummary = WalletBalances

export function deriveWalletBalances(
  entries: readonly Pick<WalletLedgerEntry, 'entryKind' | 'amountXp'>[],
): WalletBalances {
  let lifetimeXp = 0
  let spendableXp = 0
  for (const entry of entries) {
    if (entry.entryKind === 'award') {
      lifetimeXp += entry.amountXp
      spendableXp += entry.amountXp
    } else if (entry.entryKind === 'purchase') {
      spendableXp -= entry.amountXp
    } else {
      spendableXp += entry.amountXp
    }
  }
  return { lifetimeXp, spendableXp }
}

export const rewardItemInputSchema = z.object({
  name: z.string().trim().min(1, 'Reward name is required').max(120, 'Reward name is too long'),
  costXp: z.number().int('XP cost must be a whole number').positive('XP cost must be positive').max(1_000_000),
  note: z.string().trim().max(500, 'Reward note is too long').nullable().optional(),
})

export type RewardItemInput = z.infer<typeof rewardItemInputSchema>

export const rewardPurchaseRequestSchema = z.object({
  rewardItemId: z.string().uuid(),
  submissionId: z.string().uuid(),
})

export type RewardPurchaseRequest = z.infer<typeof rewardPurchaseRequestSchema>

export type RewardItem = {
  id: string
  name: string
  costXp: number
  note: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type RewardPurchase = {
  id: string
  rewardItemId: string | null
  rewardName: string
  costXp: number
  submissionId: string
  purchasedAt: string
  refunded: boolean
  refundedAt: string | null
}

export type RewardActivity = {
  id: string
  entryKind: XpLedgerEntryKind
  amountXp: number
  signedAmountXp: number
  label: string
  occurredAt: string
}

export type RewardsState = {
  ruleVersion: typeof XP_RULE_VERSION
  balances: WalletBalances
  items: RewardItem[]
  purchases: RewardPurchase[]
  activity: RewardActivity[]
}
