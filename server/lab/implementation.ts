import { randomUUID } from 'node:crypto'
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

/** Append-only correction and retraction. The original implementation row
 * is never updated or deleted. The unique (experiment_id, revision) constraint
 * is the concurrency gate: two stale tabs cannot both write the same revision.
 */
export async function writeOwnerExperimentImplementationRevision(
  sql: Sql, id: string, body: unknown, today: string, action: 'corrected' | 'retracted',
): Promise<void> {
  if (!UUID.test(id)) throw new HttpError(400, 'A valid experiment ID is required.')
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'An explicit owner correction decision is required.')
  }
  const value = body as Record<string, unknown>
  const expectedRevision = value.expectedRevision
  if (!Number.isInteger(expectedRevision) || typeof expectedRevision !== 'number' ||
      expectedRevision < 0 || expectedRevision >= 2147483647) {
    throw new HttpError(400, 'Current implementation revision is required.')
  }
  if (value[action === 'corrected' ? 'confirmCorrection' : 'confirmRetraction'] !== true) {
    throw new HttpError(400, 'Explicit owner correction confirmation is required.')
  }
  const reason = typeof value.reason === 'string' ? value.reason.trim() : ''
  if (reason.length < 3 || reason.length > 500) {
    throw new HttpError(400, 'Provide a 3–500 character correction or retraction reason.')
  }
  let effectiveDate: string | null = null
  let behaviorChange: string | null = null
  if (action === 'corrected') {
    const date = value.effectiveDate
    if (typeof date !== 'string' || !isCalendarDate(date) || date > today) {
      throw new HttpError(400, 'An actual effective date no later than today is required.')
    }
    const description = typeof value.behaviorChange === 'string' ? value.behaviorChange.trim() : ''
    if (!description || description.length > 500) {
      throw new HttpError(400, 'Describe the corrected change (1–500 characters).')
    }
    effectiveDate = date
    behaviorChange = description
  } else if ('effectiveDate' in value || 'behaviorChange' in value) {
    throw new HttpError(400, 'A retraction must not contain replacement implementation details.')
  }
  const inserted = await sql.query(
    `INSERT INTO experiment_implementation_revisions
         (id, experiment_id, revision, action, effective_date, behavior_change, reason)
       SELECT $2::uuid, implementation.experiment_id, $3::int + 1, $4::text,
              $5::date, $6::text, $7::text
         FROM experiment_implementations AS implementation
         JOIN experiments AS lab ON lab.id = implementation.experiment_id
         LEFT JOIN LATERAL (
           SELECT revision, action FROM experiment_implementation_revisions
            WHERE experiment_id = implementation.experiment_id
            ORDER BY revision DESC LIMIT 1
         ) AS latest ON TRUE
        WHERE implementation.experiment_id = $1::uuid
          AND COALESCE(latest.revision, 0) = $3::int
          AND latest.action IS DISTINCT FROM 'retracted'
          AND lab.status IN ('active', 'completed', 'inconclusive', 'abandoned', 'superseded')
          AND ($4::text <> 'corrected' OR (
            $5::date >= lab.window_start AND $5::date <= lab.window_end AND $5::date <= $8::date
          ))
       ON CONFLICT (experiment_id, revision) DO NOTHING
       RETURNING revision`,
    [id, randomUUID(), expectedRevision, action, effectiveDate, behaviorChange, reason, today],
  )
  if (inserted.length !== 1) {
    throw new HttpError(409, 'Implementation record changed or was retracted. Refresh Lab before trying again.')
  }
}

export async function correctOwnerExperimentImplementation(id: string, body: unknown): Promise<void> {
  await writeOwnerExperimentImplementationRevision(await getSql(), id, body, await currentHealthDate(), 'corrected')
}

export async function retractOwnerExperimentImplementation(id: string, body: unknown): Promise<void> {
  await writeOwnerExperimentImplementationRevision(await getSql(), id, body, await currentHealthDate(), 'retracted')
}
