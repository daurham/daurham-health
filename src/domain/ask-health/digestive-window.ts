import type { HealthIntelligenceSnapshot } from '../intelligence/shared.js'
import type { FocusedDigestiveEvidence } from './focused-digestive.js'

/** Bounded, privacy-minimal canonical bowel event totals, never a diagnosis. */
export const MAX_BOWEL_WINDOW_DAYS = 90

export type DigestiveBowelWindowScope = {
  start: string
  end: string
  calendarDays: number
}
export type BowelWindowSelection =
  | { status: 'ready'; scope: DigestiveBowelWindowScope }
  | { status: 'range_too_large'; scope: DigestiveBowelWindowScope }

export type DigestiveBowelWindow =
  | {
    status: 'available'
    scope: DigestiveBowelWindowScope
    observedDays: number
    movementEvents: number
    typedEvents: number
    hardTypedEvents: number
    untypedEvents: number
    explicitNoMovementDays: number
    unobservedDays: number
    provisionalDays: number
    /** Dates with an explicit bowel observation, not a daily diary guarantee. */
    observedDates: string[]
    /** Reconciled, read-only per-day typed counts. Never ship these as raw owner records. */
    typedDays: BowelDateCountRow[]
  }
  | {
    status: 'unavailable'
    reason: 'range_too_large' | 'source_mismatch' | 'source_unavailable'
    scope: DigestiveBowelWindowScope
  }

export type BowelDateCountRow = {
  date: string
  eventCount: number
  typedCount: number
  hardCount: number
}

function safeDaySpan(start: string, end: string): number | null {
  const date = (raw: string): number | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
    const ms = Date.parse(raw + 'T00:00:00.000Z')
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === raw ? ms : null
  }
  const a = date(start)
  const b = date(end)
  return a == null || b == null || a > b ? null : Math.round((b - a) / 86400000) + 1
}

/** Never silently clip a historical date/window or infer an unrequested one. */
export function selectDigestiveBowelWindow(
  focus: FocusedDigestiveEvidence | null,
  today: string,
): BowelWindowSelection | null {
  if (!focus || focus.dateSelectionIssue ||
      (focus.requestedDate && !focus.requestedDate.inSelectedRange) ||
      (focus.requestedWindow && !focus.requestedWindow.inSelectedRange)) return null

  const start = focus.requestedDate?.date ?? focus.requestedWindow?.start ?? focus.start
  const end = focus.requestedDate?.date ?? focus.requestedWindow?.end ?? focus.end
  const calendarDays = safeDaySpan(start, end)
  if (calendarDays == null || end > today || start < focus.start || end > focus.end) return null
  const scope = { start, end, calendarDays }
  return calendarDays > MAX_BOWEL_WINDOW_DAYS
    ? { status: 'range_too_large', scope }
    : { status: 'ready', scope }
}

/**
 * Reconcile a bounded, aggregated read of bowel_events against the already
 * loaded canonical snapshot of bowel counts and explicit zero-day states.
 * Every date/count must match or NO derived owner metric is released.
 * Missing dates mean unknown, not a confirmed zero or a skipped bowel event.
 */
export function summarizeBowelWindow(
  snapshot: HealthIntelligenceSnapshot,
  scope: DigestiveBowelWindowScope,
  rows: readonly BowelDateCountRow[],
  today: string,
): DigestiveBowelWindow {
  const blocked = (): DigestiveBowelWindow => ({
    status: 'unavailable', reason: 'source_mismatch', scope,
  })
  if (safeDaySpan(scope.start, scope.end) !== scope.calendarDays ||
      scope.calendarDays > MAX_BOWEL_WINDOW_DAYS ||
      scope.start < snapshot.period.start || scope.end > snapshot.period.end ||
      scope.end > snapshot.asOf || scope.end > today) return blocked()

  const canonical = new Map<string, { value: number; ids: string[] }>()
  for (const day of snapshot.frame) {
    if (day.date < scope.start || day.date > scope.end) continue
    const item = day.signals['bowel.count']
    if (!item) continue
    const value = item.value
    if (!Number.isSafeInteger(value) || value < 0 || item.provenance !== 'owner' ||
        item.sourceIds.length !== value || new Set(item.sourceIds).size !== value ||
        canonical.has(day.date)) return blocked()
    canonical.set(day.date, { value, ids: item.sourceIds })
  }
  const aggregates = new Map<string, BowelDateCountRow>()
  for (const row of rows) {
    if (row.date < scope.start || row.date > scope.end || aggregates.has(row.date) ||
        !Number.isSafeInteger(row.eventCount) || row.eventCount < 1 ||
        !Number.isSafeInteger(row.typedCount) || row.typedCount < 0 ||
        !Number.isSafeInteger(row.hardCount) || row.hardCount < 0 ||
        row.hardCount > row.typedCount || row.typedCount > row.eventCount) return blocked()
    aggregates.set(row.date, row)
  }
  for (const [date, agg] of aggregates) {
    const item = canonical.get(date)
    if (!item || item.value !== agg.eventCount) return blocked()
  }
  for (const [date, item] of canonical) {
    if (item.value > 0 && aggregates.get(date)?.eventCount !== item.value) return blocked()
    if (item.value === 0 && aggregates.has(date)) return blocked()
  }
  const observedDates = [...canonical.keys()].sort()
  const movementEvents = [...aggregates.values()].reduce((sum, v) => sum + v.eventCount, 0)
  const typedEvents = [...aggregates.values()].reduce((sum, v) => sum + v.typedCount, 0)
  const hardTypedEvents = [...aggregates.values()].reduce((sum, v) => sum + v.hardCount, 0)
  return {
    status: 'available', scope,
    observedDays: observedDates.length,
    movementEvents, typedEvents, hardTypedEvents,
    untypedEvents: movementEvents - typedEvents,
    explicitNoMovementDays: [...canonical.values()].filter(item => item.value === 0).length,
    unobservedDays: scope.calendarDays - observedDates.length,
    provisionalDays: observedDates.includes(today) ? 1 : 0,
    observedDates,
    typedDays: [...aggregates.values()].sort((a,b) => a.date.localeCompare(b.date)).map(row => ({ ...row })),
  }
}
