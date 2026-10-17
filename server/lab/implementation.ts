import { getSql, type Sql } from '../db.js'
import { currentHealthDate } from '../health-time.js'
import { HttpError } from '../http.js'
import { isCalendarDate } from '../../src/domain/training.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Atomic, first-write-only report of an actual behavior change.
 * No implementation can be inferred from schedule or active status alone.
 */
export async function writeOwnerExperimentImplementation(sql: Sql, id: string, body: unknown, today: string): Promise<void> {
  if (!UUID.test(id)) throw new HttpError(400, 'A valid experiment ID is required.')
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Implementation confirmation is required.')
  }
  const value = body as Record<string, unknown>
  if (value.confirmImplemented !== true) {
    throw new HttpError(400, 'Explicit owner confirmation is required.')
  }
  const effectiveDate = value.effectiveDate
  if (typeof effectiveDate !== 'string' || !isCalendarDate(effectiveDate) || effectiveDate > today) {
    throw new HttpError(400, 'An actual effective date no later than today is required.')
  }
  const behaviorChange = typeof value.behaviorChange === 'string' ? value.behaviorChange.trim() : ''
  if (!behaviorChange || behaviorChange.length > 500) {
    throw new HttpError(400, 'Describe the change actually made (1–500 characters).')
  }
  const rows = await sql.query(
    `INSERT INTO experiment_implementations (experiment_id, effective_date, behavior_change)
       SELECT lab.id, $2::date, $3::text
         FROM experiments AS lab
        WHERE lab.id = $1::uuid
          AND lab.status = 'active'
          AND lab.window_start <= $2::date
          AND lab.window_end >= $2::date
          AND $2::date <= $4::date
       ON CONFLICT (experiment_id) DO NOTHING
       RETURNING experiment_id::text AS experiment_id`,
    [id, effectiveDate, behaviorChange, today],
  )
  if (rows.length !== 1) {
    throw new HttpError(409, 'Only a currently active, in-window and not-yet-confirmed experiment can record a new implementation.')
  }
}

export async function confirmOwnerExperimentImplementation(id: string, body: unknown): Promise<void> {
  const today = await currentHealthDate()
  await writeOwnerExperimentImplementation(await getSql(), id, body, today)
}
