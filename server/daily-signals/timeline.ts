import type { TimelineDailySignalsDay } from '../../src/domain/progress/timeline.js'
import { getSql } from '../db.js'

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function day(map: Map<string, TimelineDailySignalsDay>, date: string): TimelineDailySignalsDay {
  const existing = map.get(date)
  if (existing) return existing
  const created: TimelineDailySignalsDay = {
    date,
    waterMl: null,
    bowelCount: null,
    explicitNoBowelMovement: false,
    energy: null,
    hunger: null,
    soreness: null,
    stress: null,
  }
  map.set(date, created)
  return created
}

export async function listTimelineDailySignals(start: string, end: string): Promise<TimelineDailySignalsDay[]> {
  const sql = await getSql()
  const [hydrationRows, bowelRows, noBowelRows, wellnessRows] = await Promise.all([
    sql.query(
      "SELECT hydration_date::text AS date, SUM(amount_ml)::numeric AS amount_ml FROM hydration_events WHERE hydration_date BETWEEN $1::date AND $2::date GROUP BY hydration_date ORDER BY hydration_date",
      [start, end],
    ),
    sql.query(
      "SELECT bowel_date::text AS date, COUNT(*)::int AS event_count FROM bowel_events WHERE bowel_date BETWEEN $1::date AND $2::date GROUP BY bowel_date ORDER BY bowel_date",
      [start, end],
    ),
    sql.query(
      "SELECT bowel_date::text AS date FROM bowel_day_states WHERE bowel_date BETWEEN $1::date AND $2::date AND state = 'no_bowel_movement' ORDER BY bowel_date",
      [start, end],
    ),
    sql.query(
      "SELECT wellness_date::text AS date, energy_rating, hunger_rating, soreness_rating, stress_rating FROM daily_wellness WHERE wellness_date BETWEEN $1::date AND $2::date ORDER BY wellness_date",
      [start, end],
    ),
  ])
  const map = new Map<string, TimelineDailySignalsDay>()
  for (const row of hydrationRows as Array<Record<string, unknown>>) {
    day(map, String(row.date)).waterMl = numberOrNull(row.amount_ml)
  }
  for (const row of bowelRows as Array<Record<string, unknown>>) {
    day(map, String(row.date)).bowelCount = numberOrNull(row.event_count)
  }
  for (const row of noBowelRows as Array<Record<string, unknown>>) {
    const item = day(map, String(row.date))
    if (item.bowelCount == null) {
      item.bowelCount = 0
      item.explicitNoBowelMovement = true
    }
  }
  for (const row of wellnessRows as Array<Record<string, unknown>>) {
    const item = day(map, String(row.date))
    item.energy = numberOrNull(row.energy_rating)
    item.hunger = numberOrNull(row.hunger_rating)
    item.soreness = numberOrNull(row.soreness_rating)
    item.stress = numberOrNull(row.stress_rating)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}
