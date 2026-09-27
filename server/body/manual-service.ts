import { randomUUID } from 'node:crypto'
import {
  assertManualSessionEditable,
  BodyInputError,
  parseManualCreate,
  parseManualPatch,
  type PlannedManualMetric,
} from '../../src/domain/body-manual.js'
import { HEALTH_CALENDAR_TIME_ZONE } from '../../src/domain/time.js'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'
import { getBodyMeasurement } from './fit-profile-import.js'

const EDITABLE_SESSION = `
  sessions.import_job_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM data_sources AS sources
    WHERE sources.id = sessions.source_id
      AND sources.key = 'manual'
  )
`

function asInputError(error: unknown): never {
  if (error instanceof BodyInputError) {
    throw new HttpError(400, error.message)
  }
  if (error instanceof HttpError) {
    throw error
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

async function loadEditableSession(sql: Sql, id: string) {
  const rows = (await sql.query(
    `SELECT sessions.id::text AS id,
            sessions.import_job_id::text AS import_job_id,
            sources.key AS source_key
     FROM body_measurement_sessions AS sessions
     JOIN data_sources AS sources ON sources.id = sessions.source_id
     WHERE sessions.id = $1::uuid`,
    [id],
  )) as Array<{ id: string; import_job_id: string | null; source_key: string }>
  const row = rows[0]
  if (!row) {
    throw new HttpError(404, 'Measurement not found')
  }
  try {
    assertManualSessionEditable({ importJobId: row.import_job_id, sourceKey: row.source_key })
  } catch (error) {
    if (error instanceof BodyInputError) {
      throw new HttpError(409, error.message)
    }
    throw error
  }
  return row
}

function metricInsert(sql: Sql, sessionId: string, metric: PlannedManualMetric) {
  return sql.query(
    `INSERT INTO body_metrics (
       id, measurement_session_id, metric_key, value, unit, value_kind
     )
     SELECT $1::uuid, sessions.id, $3, $4, $5, 'manual'
     FROM body_measurement_sessions AS sessions
     WHERE sessions.id = $2::uuid
       AND ${EDITABLE_SESSION}`,
    [randomUUID(), sessionId, metric.key, metric.value, metric.unit],
  )
}

export async function createManualMeasurement(body: unknown, now = new Date()) {
  try {
    const plan = parseManualCreate(body, now)
    const sql = await getSql()
    const sourceId = await manualSourceId(sql)
    const sessionId = randomUUID()
    await sql.transaction([
      sql.query(
        `INSERT INTO body_measurement_sessions (
           id, measured_at, timezone, source_id, import_job_id, device_name, notes
         ) VALUES (
           $1::uuid, $2::timestamptz, $3, $4::uuid, NULL, NULL, $5
         )`,
        [sessionId, plan.measuredAt.toISOString(), HEALTH_CALENDAR_TIME_ZONE, sourceId, plan.notes],
      ),
      ...plan.metrics.map((metric) => metricInsert(sql, sessionId, metric)),
    ])
    const session = await getBodyMeasurement(sessionId)
    if (!session) {
      throw new HttpError(500, 'Could not load the saved measurement')
    }
    return session
  } catch (error) {
    asInputError(error)
  }
}

export async function updateManualMeasurement(id: string, body: unknown, now = new Date()) {
  try {
    const plan = parseManualPatch(body, now)
    const sql = await getSql()
    await loadEditableSession(sql, id)
    const results = (await sql.transaction([
      sql.query(
        `UPDATE body_measurement_sessions AS sessions
         SET measured_at = COALESCE($2::timestamptz, measured_at),
             notes = CASE WHEN $3::bool THEN $4 ELSE notes END,
             updated_at = now()
         WHERE sessions.id = $1::uuid
           AND ${EDITABLE_SESSION}
         RETURNING sessions.id::text AS id`,
        [id, plan.measuredAt ? plan.measuredAt.toISOString() : null, plan.notes !== undefined, plan.notes ?? null],
      ),
      sql.query(
        `DELETE FROM body_metrics AS metrics
         WHERE metrics.measurement_session_id = $1::uuid
           AND EXISTS (
             SELECT 1
             FROM body_measurement_sessions AS sessions
             WHERE sessions.id = metrics.measurement_session_id
               AND ${EDITABLE_SESSION}
           )`,
        [id],
      ),
      ...plan.metrics.map((metric) => metricInsert(sql, id, metric)),
    ])) as Array<Array<{ id?: string }>>
    if (!results[0]?.[0]?.id) {
      throw new HttpError(409, 'Imported measurements stay read-only')
    }
    const session = await getBodyMeasurement(id)
    if (!session) {
      throw new HttpError(500, 'Could not load the saved measurement')
    }
    return session
  } catch (error) {
    asInputError(error)
  }
}

export async function deleteManualMeasurement(id: string): Promise<{ deleted: true; id: string }> {
  const sql = await getSql()
  await loadEditableSession(sql, id)
  const rows = (await sql.query(
    `DELETE FROM body_measurement_sessions AS sessions
     WHERE sessions.id = $1::uuid
       AND ${EDITABLE_SESSION}
     RETURNING sessions.id::text AS id`,
    [id],
  )) as Array<{ id?: string }>
  const deleted = rows[0]?.id
  if (!deleted) {
    throw new HttpError(409, 'Imported measurements stay read-only')
  }
  return { deleted: true, id: deleted }
}
