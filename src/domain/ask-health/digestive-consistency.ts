import type { DailyContextTagKey } from '../context.js'
import type { DigestiveBowelWindowScope } from './digestive-window.js'
import type { HealthIntelligenceSnapshot, IntelligenceObservation } from '../intelligence/shared.js'

/**
 * PIQ-4.1 optimistic source recheck AFTER independent snapshot reads.
 * This is a bounded read-time consistency screen, NOT a transaction,
 * clinical relationship, or guarantee of no edits after the last recheck.
 * The raw audit rows are server-only; never attach them to an AI packet.
 */
export type DigestiveVerifiedFiberAudit = {
  date: string
  source_ids: unknown
  calories: string | number | null
  fiber: string | number | null
  missing_fiber: number
}
export type DigestiveWaterAudit = {
  date: string
  source_ids: unknown
  amount_ml: string | number | null
}
export type DigestiveContextTagAudit = {
  date: string
  tag_key: string
}
export type DigestiveExpectedContext = {
  contextDate: string
  tags: readonly DailyContextTagKey[]
}

function sortedIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || id.length === 0)) return null
  const unique = new Set(ids as string[])
  if (unique.size !== ids.length) return null
  return [...unique].sort()
}
function identicalIds(a: unknown, b: unknown): boolean {
  const actual = sortedIds(a), expected = sortedIds(b)
  return actual != null && expected != null && actual.length === expected.length &&
    actual.every((id, i) => id === expected[i])
}
function close(a: number, b: number | string | null): boolean {
  if (b == null || b === '') return false
  const num = typeof b === 'number' ? b : Number(b)
  return Number.isFinite(a) && Number.isFinite(num) && Math.abs(a - num) <= 0.00001
}
function knownSignals(
  snapshot: HealthIntelligenceSnapshot,
  scope: DigestiveBowelWindowScope,
  key: 'nutrition.fiber_g' | 'hydration.ml',
  today: string,
): Map<string, IntelligenceObservation> | null {
  if (scope.start < snapshot.period.start || scope.end > snapshot.period.end ||
      scope.end > snapshot.asOf || scope.end > today || scope.calendarDays > 90 ||
      scope.start > scope.end) return null
  const expected = new Map<string, IntelligenceObservation>()
  for (const day of snapshot.frame) {
    if (day.date < scope.start || day.date > scope.end || day.date >= today) continue
    const o = day.signals[key]
    if (!o) continue
    if (key === 'nutrition.fiber_g' &&
        (o.dayCompleteness !== 'verified_complete' || o.quality !== 'high_confidence')) continue
    if (!Number.isFinite(o.value) || o.value < 0 || !sortedIds(o.sourceIds)?.length ||
        expected.has(day.date)) return null
    expected.set(day.date,o)
  }
  return expected
}

/** True only if all independently re-read eligible day values and IDs agree.
 * Missing or added rows are meaningful changes, not zeros.
 */
export function digestivePairingSourcesAgree(input: {
  snapshot: HealthIntelligenceSnapshot
  scope: DigestiveBowelWindowScope
  today: string
  expectedContexts: readonly DigestiveExpectedContext[]
  verifiedFiberRows: readonly DigestiveVerifiedFiberAudit[]
  waterRows: readonly DigestiveWaterAudit[]
  contextTagRows: readonly DigestiveContextTagAudit[]
}): boolean {
  const { snapshot, scope, today } = input
  const fiber = knownSignals(snapshot,scope,'nutrition.fiber_g',today)
  const water = knownSignals(snapshot,scope,'hydration.ml',today)
  if (!fiber || !water) return false
  const fiberSeen = new Set<string>()
  for (const row of input.verifiedFiberRows) {
    if (row.date < scope.start || row.date > scope.end || row.date >= today ||
        fiberSeen.has(row.date)) return false
    const current = fiber.get(row.date)
    if (!current || row.missing_fiber !== 0 ||
        !identicalIds(current.sourceIds,row.source_ids) ||
        !close(current.value,row.fiber)) return false
    const calories = snapshot.frame.find(day => day.date === row.date)?.signals['nutrition.calories']
    if (!calories || !close(calories.value,row.calories) ||
        !identicalIds(calories.sourceIds,row.source_ids)) return false
    fiberSeen.add(row.date)
  }
  if (fiberSeen.size !== fiber.size) return false

  const waterSeen = new Set<string>()
  for (const row of input.waterRows) {
    if (row.date < scope.start || row.date > scope.end || row.date >= today ||
        waterSeen.has(row.date)) return false
    const current = water.get(row.date)
    if (!current || current.provenance !== 'owner' ||
        !identicalIds(current.sourceIds,row.source_ids) ||
        !close(current.value,row.amount_ml)) return false
    waterSeen.add(row.date)
  }
  if (waterSeen.size !== water.size) return false

  const tags = (rows: readonly DigestiveContextTagAudit[]): string[] | null => {
    const pairs = new Set<string>()
    for (const row of rows) {
      if (row.date < scope.start || row.date > scope.end || row.date >= today ||
          typeof row.tag_key !== 'string' || !row.tag_key) return null
      const value = row.date + ':' + row.tag_key
      if (pairs.has(value)) return null
      pairs.add(value)
    }
    return [...pairs].sort()
  }
  const expected = tags(input.expectedContexts
    .filter(day => day.contextDate >= scope.start && day.contextDate <= scope.end && day.contextDate < today)
    .flatMap(day => day.tags.map(tag => ({date:day.contextDate,tag_key:tag}))))
  const reread = tags(input.contextTagRows)
  return expected != null && reread != null &&
    expected.length === reread.length && expected.every((row,i)=>row===reread[i])
}
