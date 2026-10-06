import { randomUUID } from 'node:crypto'
import {
  assertCadenceMetric,
  BodyInputError,
  metricDefinition,
  parseCadenceWrite,
} from '../../src/domain/body-manual.js'
import { resolveCadence, type CadenceObservation, type CadenceResolution } from '../../src/domain/body-cadence.js'
import { calendarDateFromInstant } from '../../src/domain/progress/dates.js'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'
import { healthTimeContext } from '../health-time.js'

export type CadenceListItem = CadenceResolution & {
  label: string
  enabledFrom: string
}

function asInputError(error: unknown): never {
  if (error instanceof BodyInputError) {
    throw new HttpError(400, error.message)
  }
  if (error instanceof Error && error.message === 'Manual data source is not configured') {
    throw new HttpError(500, error.message)
  }
  throw error
}

async function manualSourceId(sql: Sql): Promise<string> {
  const rows = (await sql.query(
    `SELECT id::text AS id FROM data_sources WHERE key = 'manual' LIMIT 1`,
  )) as Array<{ id?: string }>
  const id = rows[0]?.id
  if (!id) {
    throw new Error('Manual data source is not configured')
  }
  return id
}

export async function loadCadenceEvidence(): Promise<{
  configs: Array<{ metricKey: string; intervalDays: number; enabledFrom: string }>
  observations: CadenceObservation[]
}> {
  const sql = await getSql()
  const configs = (await sql.query(
    `SELECT metric_key, interval_days, enabled_from::text AS enabled_from
     FROM body_measurement_cadences
     ORDER BY metric_key`,
  )) as Array<{ metric_key: string; interval_days: number | string; enabled_from: string }>
  const mapped = configs.map((row) => ({
    metricKey: row.metric_key,
    intervalDays: Number(row.interval_days),
    enabledFrom: String(row.enabled_from).slice(0, 10),
  }))
  if (mapped.length === 0) {
    return { configs: [], observations: [] }
  }
  const observations = (await sql.query(
    `SELECT metrics.metric_key,
            sessions.measured_at,
            sessions.timezone
     FROM body_metrics AS metrics
     JOIN body_measurement_sessions AS sessions
       ON sessions.id = metrics.measurement_session_id
     WHERE metrics.metric_key = ANY($1::text[])`,
    [mapped.map((item) => item.metricKey)],
  )) as Array<{ metric_key: string; measured_at: string | Date; timezone: string | null }>
  return {
    configs: mapped,
    observations: observations.map((row) => {
      const measuredAt = row.measured_at instanceof Date ? row.measured_at : new Date(String(row.measured_at))
      return {
        metricKey: row.metric_key,
        measuredAt: measuredAt.toISOString(),
        calendarDate: calendarDateFromInstant(measuredAt, row.timezone),
      }
    }),
  }
}

export async function listCadences(now = new Date()) {
  const { date: asOf, timezone } = await healthTimeContext(now)
  const evidence = await loadCadenceEvidence()
  const items: CadenceListItem[] = evidence.configs.map((config) => {
    const resolution = resolveCadence(config, evidence.observations, asOf)
    return {
      ...resolution,
      label: metricDefinition(config.metricKey)?.label ?? config.metricKey,
      enabledFrom: config.enabledFrom,
    }
  })
  return { asOf, timezone, items }
}

export async function saveCadence(metricKey: string, body: unknown, now = new Date()) {
  try {
    assertCadenceMetric(metricKey)
    const { date: today } = await healthTimeContext(now)
    const input = parseCadenceWrite(body, today)
    const sql = await getSql()
    const sourceId = await manualSourceId(sql)
    await sql.query(
      `INSERT INTO body_measurement_cadences (
         id, metric_key, interval_days, enabled_from, source_id
       ) VALUES (
         $1::uuid, $2, $3, $4::date, $5::uuid
       )
       ON CONFLICT (metric_key) DO UPDATE
       SET interval_days = EXCLUDED.interval_days,
           enabled_from = EXCLUDED.enabled_from,
           updated_at = now()`,
      [randomUUID(), metricKey, input.intervalDays, input.enabledFrom, sourceId],
    )
    const list = await listCadences(now)
    const item = list.items.find((entry) => entry.metricKey === metricKey)
    if (!item) {
      throw new HttpError(500, 'Could not load the saved cadence')
    }
    return item
  } catch (error) {
    asInputError(error)
  }
}

export async function deleteCadence(metricKey: string): Promise<{ deleted: true; metricKey: string }> {
  try {
    assertCadenceMetric(metricKey)
  } catch (error) {
    asInputError(error)
  }
  const sql = await getSql()
  await sql.query(`DELETE FROM body_measurement_cadences WHERE metric_key = $1`, [metricKey])
  return { deleted: true, metricKey }
}
