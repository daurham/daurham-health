import { HEALTH_CALENDAR_TIME_ZONE } from '../../src/domain/time.js'
import type { ActivityDailyRow } from '../../src/domain/activity/index.js'
import { getSql } from '../db.js'

function asNumber(value: unknown): number | null {
  if (value == null) {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const LIST_ACTIVITY_DAILY_SUMMARIES_SQL = `SELECT summary_date::text AS summary_date,
           timezone,
           steps_count,
           active_energy_kcal,
           exercise_minutes,
           walking_running_distance_m,
           resting_heart_rate_bpm
         FROM activity_daily_summaries
         WHERE timezone = $1
         ORDER BY summary_date ASC`

export async function listActivityDailySummaries(timezone = HEALTH_CALENDAR_TIME_ZONE): Promise<ActivityDailyRow[]> {
  const sql = await getSql()
  const rows = (await sql.query(LIST_ACTIVITY_DAILY_SUMMARIES_SQL, [timezone])) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    date: String(row.summary_date),
    timezone: String(row.timezone),
    stepsCount: asNumber(row.steps_count),
    activeEnergyKcal: asNumber(row.active_energy_kcal),
    exerciseMinutes: asNumber(row.exercise_minutes),
    walkingRunningDistanceM: asNumber(row.walking_running_distance_m),
    restingHeartRateBpm: asNumber(row.resting_heart_rate_bpm),
  }))
}
