import { randomUUID } from 'node:crypto'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'
import { currentHealthDate } from '../health-time.js'
import {
  resolvePrimaryGoalIntent, validatePrimaryGoalSelection,
  type PrimaryGoalIntent,
} from '../../src/domain/primary-goal-intent.js'

type Row = { version: number; primary_goal_id: string | null; effective_from: string; recorded_at: string }

export async function readPrimaryGoalIntent(
  sql: Sql, asOf: string,
): Promise<PrimaryGoalIntent> {
  const rows = await sql.query(
    `SELECT version, primary_goal_id::text AS primary_goal_id,
            effective_from::text AS effective_from, recorded_at::text AS recorded_at
       FROM primary_goal_intent_events
      WHERE effective_from <= $1::date
      ORDER BY effective_from DESC, version DESC
      LIMIT 1`,
    [asOf],
  ) as Row[]
  const row = rows[0]
  return resolvePrimaryGoalIntent(row ? [{
    version: Number(row.version),
    primaryGoalId: row.primary_goal_id,
    effectiveFrom: row.effective_from,
    recordedAt: row.recorded_at,
  }] : [], asOf)
}

export async function savePrimaryGoalIntent(
  sql: Sql, asOf: string, payload: unknown,
): Promise<PrimaryGoalIntent> {
  const data = validatePrimaryGoalSelection(payload)
  if ('error' in data) throw new HttpError(400, data.error)
  const { primaryGoalId, expectedVersion } = data
  // Version uniqueness makes two simultaneous writes from the same saved UI
  // compete in PostgreSQL; neither can silently overwrite the other.
  let rows: Row[]
  try {
    rows = await sql.query(
      `INSERT INTO primary_goal_intent_events
         (id, version, primary_goal_id, effective_from, source)
       SELECT $1::uuid, $2::integer + 1, $3::uuid, $4::date, 'owner'
        WHERE (SELECT COALESCE(MAX(version), 0) FROM primary_goal_intent_events) = $2::integer
          AND ($3::uuid IS NULL OR EXISTS (
            SELECT 1 FROM goals
             WHERE id = $3::uuid AND status = 'active' AND archived_at IS NULL
          ))
       RETURNING version, primary_goal_id::text AS primary_goal_id,
                 effective_from::text AS effective_from, recorded_at::text AS recorded_at`,
      [randomUUID(), expectedVersion, primaryGoalId, asOf],
    ) as Row[]
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error &&
        (error as { code?: unknown }).code === '23505') {
      throw new HttpError(409, 'Goal priority changed in another tab. Refresh Goals and review the saved choice.')
    }
    throw error
  }
  const row = rows[0]
  if (!row) throw new HttpError(409, 'Your goal list or priority changed. Refresh Goals before saving.')
  return {
    version: Number(row.version),
    primaryGoalId: row.primary_goal_id,
    effectiveFrom: row.effective_from,
    recordedAt: row.recorded_at,
    source: 'owner',
  }
}

export async function getOwnerPrimaryGoalIntent(): Promise<PrimaryGoalIntent> {
  const [sql, today] = await Promise.all([getSql(), currentHealthDate()])
  return readPrimaryGoalIntent(sql, today)
}

export async function updateOwnerPrimaryGoalIntent(payload: unknown): Promise<PrimaryGoalIntent> {
  const [sql, today] = await Promise.all([getSql(), currentHealthDate()])
  return savePrimaryGoalIntent(sql, today, payload)
}
