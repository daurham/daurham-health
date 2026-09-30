import { z } from 'zod'
import type { CoachDifficulty } from './coach.js'

export const XP_RULE_VERSION = 'xp-rule-v1' as const

export const XP_BY_REWARD_BAND: Readonly<Record<CoachDifficulty, number>> = {
  routine: 10,
  standard: 25,
  weekly: 75,
  stretch: 100,
}

export function xpForRewardBand(band: CoachDifficulty): number {
  return XP_BY_REWARD_BAND[band]
}

export const XP_LEDGER_ENTRY_KINDS = ['award', 'purchase', 'refund'] as const
export type XpLedgerEntryKind = (typeof XP_LEDGER_ENTRY_KINDS)[number]

export const XP_LEDGER_SOURCE_KINDS = ['coach_task', 'reward_purchase'] as const
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
