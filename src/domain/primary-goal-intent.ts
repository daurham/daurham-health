export type PrimaryGoalIntent = {
  version: number
  primaryGoalId: string | null
  effectiveFrom: string | null
  recordedAt: string | null
  source: 'owner' | 'unset'
}

export const UNSET_PRIMARY_GOAL_INTENT: PrimaryGoalIntent = {
  version: 0,
  primaryGoalId: null,
  effectiveFrom: null,
  recordedAt: null,
  source: 'unset',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function validatePrimaryGoalSelection(body: unknown): {
  expectedVersion: number; primaryGoalId: string | null
} | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'A primary goal selection is required.' }
  }
  const item = body as Record<string, unknown>
  if (!Number.isSafeInteger(item.expectedVersion) || (item.expectedVersion as number) < 0) {
    return { error: 'Refresh Goals before saving the primary goal.' }
  }
  if (item.primaryGoalId !== null && (typeof item.primaryGoalId !== 'string' || !UUID.test(item.primaryGoalId))) {
    return { error: 'Choose an existing goal or explicitly clear the priority.' }
  }
  return { expectedVersion: item.expectedVersion as number, primaryGoalId: item.primaryGoalId as string | null }
}

/** An explicit owner record, never a heuristic inferred from goal weights.
 * A historical view may only use declarations effective by that calendar date.
 */
export function resolvePrimaryGoalIntent<T extends {
  version: number; primaryGoalId: string | null; effectiveFrom: string; recordedAt: string
}>(records: readonly T[], asOf: string): PrimaryGoalIntent {
  const eligible = records.filter((item) => item.effectiveFrom <= asOf)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version)
  const selected = eligible[0]
  return selected ? {
    version: selected.version,
    primaryGoalId: selected.primaryGoalId,
    effectiveFrom: selected.effectiveFrom,
    recordedAt: selected.recordedAt,
    source: 'owner',
  } : UNSET_PRIMARY_GOAL_INTENT
}
