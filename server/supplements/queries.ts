import { healthCalendarDateFromNow, HEALTH_CALENDAR_TIME_ZONE } from '../../src/domain/time.js'
import { lifecycleStatusOnDate } from '../../src/domain/supplements/resolve.js'
import type {
  AdherenceWindow,
  LifecycleStatus,
  ScheduleWindow,
  StatusEventWindow,
  StoredAdherenceStatus,
  SupplementAdherence,
  SupplementList,
  SupplementRecord,
  SupplementSchedule,
  SupplementStatusEvent,
  TodaySupplementInput,
} from '../../src/domain/supplements/types.js'
import { getSql, type Sql } from '../db.js'

function asNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error('Invalid numeric value')
  }
  return parsed
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  return asNumber(value)
}

function asText(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function asNullableText(value: unknown): string | null {
  return value == null ? null : asText(value)
}

function scheduleFrom(row: Record<string, unknown>): SupplementSchedule {
  return {
    id: String(row.id),
    supplementId: String(row.supplement_id),
    slotLabel: asNullableText(row.slot_label),
    doseAmount: asNumber(row.dose_amount),
    doseUnit: String(row.dose_unit),
    weekdayMask: asNumber(row.weekday_mask),
    effectiveFrom: String(row.effective_from),
    effectiveThrough: row.effective_through == null ? null : String(row.effective_through),
    sortOrder: asNumber(row.sort_order),
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at),
  }
}

function eventFrom(row: Record<string, unknown>): SupplementStatusEvent {
  return {
    id: String(row.id),
    supplementId: String(row.supplement_id),
    effectiveDate: String(row.effective_date),
    status: String(row.status) as LifecycleStatus,
    notes: asNullableText(row.notes),
    createdAt: asText(row.created_at),
  }
}

function adherenceFrom(row: Record<string, unknown>): SupplementAdherence {
  return {
    id: String(row.id),
    scheduleId: String(row.schedule_id),
    scheduledDate: String(row.scheduled_date),
    status: String(row.status) as StoredAdherenceStatus,
    actualDoseAmount: asNullableNumber(row.actual_dose_amount),
    actualDoseUnit: asNullableText(row.actual_dose_unit),
    takenAt: asNullableText(row.taken_at),
    notes: asNullableText(row.notes),
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at),
  }
}

const SCHEDULE_COLUMNS = `id::text AS id,
  supplement_id::text AS supplement_id,
  slot_label,
  dose_amount,
  dose_unit,
  weekday_mask,
  effective_from::text AS effective_from,
  effective_through::text AS effective_through,
  sort_order,
  created_at,
  updated_at`

const EVENT_COLUMNS = `id::text AS id,
  supplement_id::text AS supplement_id,
  effective_date::text AS effective_date,
  status,
  notes,
  created_at`

const ADHERENCE_COLUMNS = `id::text AS id,
  schedule_id::text AS schedule_id,
  scheduled_date::text AS scheduled_date,
  status,
  actual_dose_amount,
  actual_dose_unit,
  taken_at,
  notes,
  created_at,
  updated_at`

export async function manualSourceId(sql?: Sql): Promise<string> {
  const query = sql ?? (await getSql())
  const rows = (await query.query(`SELECT id::text AS id FROM data_sources WHERE key = 'manual'`, [])) as Array<{
    id?: string
  }>
  const id = rows[0]?.id
  if (!id) {
    throw new Error('Manual data source is not configured')
  }
  return id
}

export async function listSupplementRecords(now = new Date()): Promise<SupplementList> {
  const date = healthCalendarDateFromNow(now)
  const sql = await getSql()
  const [supplements, schedules, events, adherence] = await Promise.all([
    sql.query(
      `SELECT id::text AS id, name, form, brand, product_name, notes, sort_order, created_at, updated_at
       FROM supplements
       ORDER BY sort_order ASC, name ASC, id ASC`,
    ) as Promise<Array<Record<string, unknown>>>,
    sql.query(
      `SELECT ${SCHEDULE_COLUMNS}
       FROM supplement_schedules
       ORDER BY sort_order ASC, effective_from ASC, id ASC`,
    ) as Promise<Array<Record<string, unknown>>>,
    sql.query(
      `SELECT ${EVENT_COLUMNS}
       FROM supplement_status_events
       ORDER BY effective_date ASC, created_at ASC, id ASC`,
    ) as Promise<Array<Record<string, unknown>>>,
    sql.query(
      `SELECT ${ADHERENCE_COLUMNS}
       FROM supplement_adherence
       ORDER BY scheduled_date DESC, created_at DESC, id ASC`,
    ) as Promise<Array<Record<string, unknown>>>,
  ])
  const scheduleRows = schedules.map(scheduleFrom)
  const eventRows = events.map(eventFrom)
  const adherenceRows = adherence.map(adherenceFrom)
  return {
    date,
    timezone: HEALTH_CALENDAR_TIME_ZONE,
    supplements: supplements.map((row) => {
      const id = String(row.id)
      const statusEvents = eventRows.filter((event) => event.supplementId === id)
      return {
        id,
        name: String(row.name),
        form: asNullableText(row.form),
        brand: asNullableText(row.brand),
        productName: asNullableText(row.product_name),
        notes: asNullableText(row.notes),
        sortOrder: asNumber(row.sort_order),
        status: lifecycleStatusOnDate(statusEvents, date),
        createdAt: asText(row.created_at),
        updatedAt: asText(row.updated_at),
        schedules: scheduleRows.filter((schedule) => schedule.supplementId === id),
        statusEvents,
        adherence: adherenceRows.filter((item) =>
          scheduleRows.some((schedule) => schedule.id === item.scheduleId && schedule.supplementId === id),
        ),
      } satisfies SupplementRecord
    }),
  }
}

export async function getSupplementRecord(id: string, now = new Date()): Promise<SupplementRecord | null> {
  const list = await listSupplementRecords(now)
  return list.supplements.find((item) => item.id === id) ?? null
}

function mapSupplementInputs(
  supplements: Array<Record<string, unknown>>,
  scheduleRows: SupplementSchedule[],
  eventRows: SupplementStatusEvent[],
  adherenceRows: SupplementAdherence[],
): TodaySupplementInput[] {
  return supplements.map((row) => {
    const id = String(row.id)
    const ownSchedules = scheduleRows.filter((schedule) => schedule.supplementId === id)
    const ownScheduleIds = new Set(ownSchedules.map((schedule) => schedule.id))
    return {
      id,
      name: String(row.name),
      sortOrder: asNumber(row.sort_order),
      schedules: ownSchedules,
      events: eventRows
        .filter((event) => event.supplementId === id)
        .map((event) => ({ effectiveDate: event.effectiveDate, status: event.status })),
      adherence: adherenceRows.filter((item) => ownScheduleIds.has(item.scheduleId)),
    }
  })
}

export async function listSupplementRangeInputs(start: string, end: string): Promise<TodaySupplementInput[]> {
  const sql = await getSql()
  const [supplements, schedules, events, adherence] = await Promise.all([
    sql.query(
      `SELECT id::text AS id, name, sort_order
       FROM supplements
       ORDER BY sort_order ASC, name ASC, id ASC`,
    ) as Promise<Array<Record<string, unknown>>>,
    sql.query(
      `SELECT ${SCHEDULE_COLUMNS}
       FROM supplement_schedules
       WHERE effective_from <= $2::date
         AND (effective_through IS NULL OR effective_through >= $1::date)`,
      [start, end],
    ) as Promise<Array<Record<string, unknown>>>,
    sql.query(
      `SELECT ${EVENT_COLUMNS}
       FROM supplement_status_events
       WHERE effective_date <= $1::date`,
      [end],
    ) as Promise<Array<Record<string, unknown>>>,
    sql.query(
      `SELECT ${ADHERENCE_COLUMNS}
       FROM supplement_adherence
       WHERE scheduled_date >= $1::date AND scheduled_date <= $2::date`,
      [start, end],
    ) as Promise<Array<Record<string, unknown>>>,
  ])
  return mapSupplementInputs(supplements, schedules.map(scheduleFrom), events.map(eventFrom), adherence.map(adherenceFrom))
}

export async function listTodaySupplementInputs(date: string): Promise<TodaySupplementInput[]> {
  const sql = await getSql()
  const [supplements, schedules, events, adherence] = await Promise.all([
    sql.query(
      `SELECT id::text AS id, name, sort_order
       FROM supplements
       ORDER BY sort_order ASC, name ASC, id ASC`,
    ) as Promise<Array<Record<string, unknown>>>,
    sql.query(
      `SELECT ${SCHEDULE_COLUMNS}
       FROM supplement_schedules
       WHERE effective_from <= $1::date
         AND (effective_through IS NULL OR effective_through >= $1::date)`,
      [date],
    ) as Promise<Array<Record<string, unknown>>>,
    sql.query(
      `SELECT supplement_id::text AS supplement_id, effective_date::text AS effective_date, status
       FROM supplement_status_events
       WHERE effective_date <= $1::date`,
      [date],
    ) as Promise<Array<Record<string, unknown>>>,
    sql.query(
      `SELECT schedule_id::text AS schedule_id,
              scheduled_date::text AS scheduled_date,
              status,
              actual_dose_amount,
              actual_dose_unit
       FROM supplement_adherence
       WHERE scheduled_date = $1::date`,
      [date],
    ) as Promise<Array<Record<string, unknown>>>,
  ])
  const scheduleRows = schedules.map(scheduleFrom)
  const eventRows = events.map((row) => ({
    supplementId: String(row.supplement_id),
    effectiveDate: String(row.effective_date),
    status: String(row.status) as LifecycleStatus,
  }))
  const adherenceRows: AdherenceWindow[] = adherence.map((row) => ({
    scheduleId: String(row.schedule_id),
    scheduledDate: String(row.scheduled_date),
    status: String(row.status) as StoredAdherenceStatus,
    actualDoseAmount: asNullableNumber(row.actual_dose_amount),
    actualDoseUnit: asNullableText(row.actual_dose_unit),
  }))
  return supplements.map((row) => {
    const id = String(row.id)
    const ownSchedules: ScheduleWindow[] = scheduleRows.filter((schedule) => schedule.supplementId === id)
    const ownScheduleIds = new Set(ownSchedules.map((schedule) => schedule.id))
    return {
      id,
      name: String(row.name),
      sortOrder: asNumber(row.sort_order),
      schedules: ownSchedules,
      events: eventRows
        .filter((event) => event.supplementId === id)
        .map((event) => ({ effectiveDate: event.effectiveDate, status: event.status })),
      adherence: adherenceRows.filter((item) => ownScheduleIds.has(item.scheduleId)),
    }
  })
}

export async function loadScheduleWindow(id: string): Promise<(ScheduleWindow & { adherenceDates: string[] }) | null> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT ${SCHEDULE_COLUMNS}
     FROM supplement_schedules
     WHERE id = $1::uuid`,
    [id],
  )) as Array<Record<string, unknown>>
  const schedule = rows[0] ? scheduleFrom(rows[0]) : null
  if (!schedule) {
    return null
  }
  const adherence = (await sql.query(
    `SELECT scheduled_date::text AS scheduled_date
     FROM supplement_adherence
     WHERE schedule_id = $1::uuid`,
    [id],
  )) as Array<{ scheduled_date?: string }>
  return {
    ...schedule,
    adherenceDates: adherence.map((row) => String(row.scheduled_date)),
  }
}

export async function loadStatusEvents(supplementId: string): Promise<StatusEventWindow[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT effective_date::text AS effective_date, status
     FROM supplement_status_events
     WHERE supplement_id = $1::uuid`,
    [supplementId],
  )) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    effectiveDate: String(row.effective_date),
    status: String(row.status) as LifecycleStatus,
  }))
}
