import type { SleepIntervalRow } from '../../src/domain/sleep/index.js'
import { getSql } from '../db.js'

export const LIST_SLEEP_INTERVALS_SQL = `SELECT id::text,
           start_at,
           end_at,
           stage,
           source_category,
           source_name,
           source_version,
           device_name,
           source_id::text
         FROM sleep_intervals
         ORDER BY start_at ASC, end_at ASC, id ASC`

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

export async function listSleepIntervals(): Promise<SleepIntervalRow[]> {
  const sql = await getSql()
  const rows = (await sql.query(LIST_SLEEP_INTERVALS_SQL)) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    id: String(row.id),
    startAt: asIso(row.start_at),
    endAt: asIso(row.end_at),
    stage: String(row.stage),
    sourceCategory: String(row.source_category),
    sourceName: typeof row.source_name === 'string' ? row.source_name : null,
    sourceVersion: typeof row.source_version === 'string' ? row.source_version : null,
    deviceName: typeof row.device_name === 'string' ? row.device_name : null,
    sourceId: typeof row.source_id === 'string' ? row.source_id : null,
  }))
}
