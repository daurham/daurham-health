import { randomUUID } from 'node:crypto'
import {
  dailySignalDateError,
  millilitersToOunces,
  normalizeBowelWrite,
  normalizeHydrationWrite,
  normalizeWellnessWrite,
  type BowelEvent,
  type DailySignalsDay,
  type DailyWellness,
  type HydrationEvent,
} from '../../src/domain/daily-signals.js'
import { healthCalendarDateFromNow } from '../../src/domain/time.js'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'
import { getInstanceConfig } from '../instance-config.js'
import { tryAwardDailyParticipation } from '../rewards/service.js'

type HydrationRow = {
  id: string
  hydration_date: string
  occurred_at: Date | string | null
  amount_ml: string | number
  note: string | null
  created_at: Date | string
}
type BowelRow = {
  id: string
  bowel_date: string
  occurred_at: Date | string | null
  bristol_type: string | number
  straining: boolean | null
  urgency: 'none' | 'mild' | 'strong' | null
  incomplete_feeling: boolean | null
  note: string | null
  created_at: Date | string
}
type WellnessRow = {
  wellness_date: string
  energy_rating: string | number | null
  hunger_rating: string | number | null
  soreness_rating: string | number | null
  stress_rating: string | number | null
  created_at: Date | string
  updated_at: Date | string
}

function instant(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function optionalInstant(value: Date | string | null): string | null {
  return value == null ? null : instant(value)
}

function mapHydration(row: HydrationRow): HydrationEvent {
  const amountMl = Number(row.amount_ml)
  return {
    id: row.id,
    date: row.hydration_date,
    occurredAt: optionalInstant(row.occurred_at),
    amountMl,
    amountOz: millilitersToOunces(amountMl),
    note: row.note,
    createdAt: instant(row.created_at),
  }
}

function mapBowel(row: BowelRow): BowelEvent {
  return {
    id: row.id,
    date: row.bowel_date,
    occurredAt: optionalInstant(row.occurred_at),
    bristolType: Number(row.bristol_type),
    straining: row.straining,
    urgency: row.urgency,
    incompleteFeeling: row.incomplete_feeling,
    note: row.note,
    createdAt: instant(row.created_at),
  }
}

function mapWellness(row: WellnessRow): DailyWellness {
  return {
    date: row.wellness_date,
    energy: row.energy_rating == null ? null : Number(row.energy_rating),
    hunger: row.hunger_rating == null ? null : Number(row.hunger_rating),
    soreness: row.soreness_rating == null ? null : Number(row.soreness_rating),
    stress: row.stress_rating == null ? null : Number(row.stress_rating),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
  }
}

async function manualSourceId(sql: Sql): Promise<string> {
  const rows = (await sql.query("SELECT id::text AS id FROM data_sources WHERE key = 'manual'", [])) as Array<{ id?: string }>
  const id = rows[0]?.id
  if (!id) throw new HttpError(503, 'Manual data source is not configured')
  return id
}

async function validatedDate(date: string, now: Date): Promise<{ today: string; timezone: string }> {
  const timezone = (await getInstanceConfig()).calendarTimeZone
  const today = healthCalendarDateFromNow(now, timezone)
  const error = dailySignalDateError(date, today)
  if (error) throw new HttpError(400, error)
  return { today, timezone }
}

async function validateOccurredAt(date: string, occurredAt: string | null, timezone: string): Promise<void> {
  if (!occurredAt) return
  const occurredDate = healthCalendarDateFromNow(new Date(occurredAt), timezone)
  if (occurredDate !== date) throw new HttpError(400, 'occurredAt must fall on the selected Health date.')
}

export async function getDailySignalsDay(date: string, now = new Date()): Promise<DailySignalsDay> {
  await validatedDate(date, now)
  const sql = await getSql()
  const [hydrationRows, bowelRows, bowelStateRows, wellnessRows] = await Promise.all([
    sql.query(
      `SELECT id::text AS id, hydration_date::text AS hydration_date, occurred_at, amount_ml, note, created_at
       FROM hydration_events WHERE hydration_date = $1::date
       ORDER BY COALESCE(occurred_at, created_at), created_at, id`,
      [date],
    ),
    sql.query(
      `SELECT id::text AS id, bowel_date::text AS bowel_date, occurred_at, bristol_type, straining, urgency,
              incomplete_feeling, note, created_at
       FROM bowel_events WHERE bowel_date = $1::date
       ORDER BY COALESCE(occurred_at, created_at), created_at, id`,
      [date],
    ),
    sql.query(`SELECT state FROM bowel_day_states WHERE bowel_date = $1::date`, [date]),
    sql.query(
      `SELECT wellness_date::text AS wellness_date, energy_rating, hunger_rating, soreness_rating, stress_rating,
              created_at, updated_at
       FROM daily_wellness WHERE wellness_date = $1::date`,
      [date],
    ),
  ])
  return {
    date,
    hydrationEvents: (hydrationRows as HydrationRow[]).map(mapHydration),
    bowelEvents: (bowelRows as BowelRow[]).map(mapBowel),
    noBowelMovement: (bowelStateRows as Array<{ state: string }>)[0]?.state === 'no_bowel_movement',
    wellness: (wellnessRows as WellnessRow[])[0] ? mapWellness((wellnessRows as WellnessRow[])[0]!) : null,
  }
}

export async function addHydrationEvent(body: unknown, now = new Date()): Promise<HydrationEvent> {
  const parsed = normalizeHydrationWrite(body)
  if ('error' in parsed) throw new HttpError(400, parsed.error)
  const { today, timezone } = await validatedDate(parsed.date, now)
  await validateOccurredAt(parsed.date, parsed.occurredAt, timezone)
  const occurredAt = parsed.occurredAt ?? (parsed.date === today ? now.toISOString() : null)
  const sql = await getSql()
  const sourceId = await manualSourceId(sql)
  const id = randomUUID()
  const rows = (await sql.query(
    `INSERT INTO hydration_events (id, hydration_date, occurred_at, amount_ml, source_id, note, request_id)
     VALUES ($1::uuid, $2::date, $3::timestamptz, $4, $5::uuid, $6, $7::uuid)
     ON CONFLICT (request_id)
     DO UPDATE SET request_id = EXCLUDED.request_id
     RETURNING id::text AS id, hydration_date::text AS hydration_date, occurred_at, amount_ml, note, created_at`,
    [id, parsed.date, occurredAt, parsed.amountMl, sourceId, parsed.note, parsed.requestId],
  )) as HydrationRow[]
  await tryAwardDailyParticipation(sql, { kind: 'hydration', healthDate: parsed.date, today, awardedAt: now })
  return mapHydration(rows[0]!)
}

export async function deleteHydrationEvent(id: string): Promise<boolean> {
  const sql = await getSql()
  const rows = (await sql.query(`DELETE FROM hydration_events WHERE id = $1::uuid RETURNING id`, [id])) as unknown[]
  return rows.length > 0
}

export async function addBowelEvent(body: unknown, now = new Date()): Promise<BowelEvent> {
  const parsed = normalizeBowelWrite(body)
  if ('error' in parsed) throw new HttpError(400, parsed.error)
  const { today, timezone } = await validatedDate(parsed.date, now)
  await validateOccurredAt(parsed.date, parsed.occurredAt, timezone)
  const occurredAt = parsed.occurredAt ?? (parsed.date === today ? now.toISOString() : null)
  const sql = await getSql()
  const sourceId = await manualSourceId(sql)
  const id = randomUUID()
  const statements = [
    sql.query(`DELETE FROM bowel_day_states WHERE bowel_date = $1::date`, [parsed.date]),
    sql.query(
      `INSERT INTO bowel_events (
         id, bowel_date, occurred_at, bristol_type, straining, urgency, incomplete_feeling, source_id, note, request_id
       ) VALUES ($1::uuid,$2::date,$3::timestamptz,$4,$5,$6,$7,$8::uuid,$9,$10::uuid)
       ON CONFLICT (request_id)
       DO UPDATE SET request_id = EXCLUDED.request_id
       RETURNING id::text AS id, bowel_date::text AS bowel_date, occurred_at, bristol_type, straining, urgency,
                 incomplete_feeling, note, created_at`,
      [id, parsed.date, occurredAt, parsed.bristolType, parsed.straining, parsed.urgency, parsed.incompleteFeeling, sourceId, parsed.note, parsed.requestId],
    ),
  ]
  const result = await sql.transaction(statements)
  const rows = result[1] as BowelRow[]
  await tryAwardDailyParticipation(sql, { kind: 'bowel', healthDate: parsed.date, today, awardedAt: now })
  return mapBowel(rows[0]!)
}

export async function deleteBowelEvent(id: string): Promise<boolean> {
  const sql = await getSql()
  const rows = (await sql.query(`DELETE FROM bowel_events WHERE id = $1::uuid RETURNING id`, [id])) as unknown[]
  return rows.length > 0
}

export async function setNoBowelMovement(date: string, now = new Date()): Promise<void> {
  const { today } = await validatedDate(date, now)
  const sql = await getSql()
  const existing = (await sql.query(`SELECT count(*)::int AS count FROM bowel_events WHERE bowel_date = $1::date`, [date])) as Array<{ count: number }>
  if ((existing[0]?.count ?? 0) > 0) throw new HttpError(409, 'A bowel movement is already logged for this day.')
  const sourceId = await manualSourceId(sql)
  await sql.query(
    `INSERT INTO bowel_day_states (bowel_date, state, source_id)
     VALUES ($1::date, 'no_bowel_movement', $2::uuid)
     ON CONFLICT (bowel_date) DO UPDATE SET state = 'no_bowel_movement', source_id = EXCLUDED.source_id, updated_at = now()`,
    [date, sourceId],
  )
  await tryAwardDailyParticipation(sql, { kind: 'bowel', healthDate: date, today, awardedAt: now })
}

export async function clearNoBowelMovement(date: string, now = new Date()): Promise<boolean> {
  await validatedDate(date, now)
  const sql = await getSql()
  const rows = (await sql.query(`DELETE FROM bowel_day_states WHERE bowel_date = $1::date RETURNING bowel_date`, [date])) as unknown[]
  return rows.length > 0
}

export async function putDailyWellness(date: string, body: unknown, now = new Date()): Promise<DailyWellness> {
  const { today } = await validatedDate(date, now)
  const parsed = normalizeWellnessWrite(body)
  if ('error' in parsed) throw new HttpError(400, parsed.error)
  const sql = await getSql()
  const sourceId = await manualSourceId(sql)
  const rows = (await sql.query(
    `INSERT INTO daily_wellness (
       wellness_date, energy_rating, hunger_rating, soreness_rating, stress_rating, source_id
     ) VALUES ($1::date,$2,$3,$4,$5,$6::uuid)
     ON CONFLICT (wellness_date) DO UPDATE SET
       energy_rating = EXCLUDED.energy_rating,
       hunger_rating = EXCLUDED.hunger_rating,
       soreness_rating = EXCLUDED.soreness_rating,
       stress_rating = EXCLUDED.stress_rating,
       source_id = EXCLUDED.source_id,
       updated_at = now()
     RETURNING wellness_date::text AS wellness_date, energy_rating, hunger_rating, soreness_rating, stress_rating,
               created_at, updated_at`,
    [date, parsed.energy, parsed.hunger, parsed.soreness, parsed.stress, sourceId],
  )) as WellnessRow[]
  await tryAwardDailyParticipation(sql, { kind: 'wellness', healthDate: date, today, awardedAt: now })
  return mapWellness(rows[0]!)
}

export async function deleteDailyWellness(date: string, now = new Date()): Promise<boolean> {
  await validatedDate(date, now)
  const sql = await getSql()
  const rows = (await sql.query(`DELETE FROM daily_wellness WHERE wellness_date = $1::date RETURNING wellness_date`, [date])) as unknown[]
  return rows.length > 0
}
