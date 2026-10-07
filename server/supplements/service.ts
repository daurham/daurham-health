import { randomUUID } from 'node:crypto'
import {
  assertFutureScheduleEditable,
  assertRecordableOccurrence,
  buildTodaySupplementSection,
  nextAdherencePersistence,
  parseAdherenceCommand,
  parseCreateSupplement,
  parseDoseDraft,
  parseScheduleStop,
  parseScheduleVersion,
  parseStatusChange,
  parseSupplementPatch,
  planScheduleStop,
  planScheduleVersion,
  resolveOccurrence,
  SupplementInputError,
  type AdherenceCommand,
  type SupplementRecord,
} from '../../src/domain/supplements/index.js'
import { getSql } from '../db.js'
import { HttpError } from '../http.js'
import { currentHealthDate } from '../health-time.js'
import { tryAwardDailyParticipation } from '../rewards/service.js'
import {
  getSupplementRecord,
  listSupplementRecords,
  listTodaySupplementInputs,
  loadScheduleWindow,
  loadStatusEvents,
  manualSourceId,
} from './queries.js'

function asInputError(error: unknown): never {
  if (error instanceof SupplementInputError) {
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

async function requireSupplement(id: string, now = new Date()): Promise<SupplementRecord> {
  const record = await getSupplementRecord(id, now)
  if (!record) {
    throw new HttpError(404, 'Supplement not found')
  }
  return record
}

export async function listSupplements(now = new Date()) {
  return listSupplementRecords(now)
}

export async function createSupplement(body: unknown, now = new Date()): Promise<SupplementRecord> {
  try {
    const today = await currentHealthDate(now)
    const input = parseCreateSupplement(body, today)
    const sql = await getSql()
    const sourceId = await manualSourceId(sql)
    const supplementId = randomUUID()
    const eventId = randomUUID()
    const scheduleId = input.schedule ? randomUUID() : null
    const statements = [
      sql.query(
        `INSERT INTO supplements (
           id, name, form, brand, product_name, notes, sort_order, source_id
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6, $7, $8::uuid
         )`,
        [
          supplementId,
          input.name,
          input.form,
          input.brand,
          input.productName,
          input.notes,
          input.sortOrder,
          sourceId,
        ],
      ),
      sql.query(
        `INSERT INTO supplement_status_events (
           id, supplement_id, effective_date, status, notes, source_id
         ) VALUES (
           $1::uuid, $2::uuid, $3::date, 'active', NULL, $4::uuid
         )`,
        [eventId, supplementId, input.startDate, sourceId],
      ),
    ]
    if (input.schedule && scheduleId) {
      statements.push(
        sql.query(
          `INSERT INTO supplement_schedules (
             id, supplement_id, slot_label, dose_amount, dose_unit, weekday_mask,
             effective_from, effective_through, sort_order, source_id
           ) VALUES (
             $1::uuid, $2::uuid, $3, $4::numeric, $5, $6, $7::date, $8::date, $9, $10::uuid
           )`,
          [
            scheduleId,
            supplementId,
            input.schedule.slotLabel,
            input.schedule.doseAmount,
            input.schedule.doseUnit,
            input.schedule.weekdayMask,
            input.schedule.effectiveFrom,
            input.schedule.effectiveThrough,
            input.schedule.sortOrder,
            sourceId,
          ],
        ),
      )
    }
    await sql.transaction(statements)
    return requireSupplement(supplementId, now)
  } catch (error) {
    asInputError(error)
  }
}

export async function updateSupplement(id: string, body: unknown, now = new Date()): Promise<SupplementRecord> {
  try {
    const patch = parseSupplementPatch(body)
    const current = await requireSupplement(id, now)
    const next = {
      name: patch.name ?? current.name,
      form: patch.form === undefined ? current.form : patch.form,
      brand: patch.brand === undefined ? current.brand : patch.brand,
      productName: patch.productName === undefined ? current.productName : patch.productName,
      notes: patch.notes === undefined ? current.notes : patch.notes,
      sortOrder: patch.sortOrder ?? current.sortOrder,
    }
    const sql = await getSql()
    const rows = (await sql.query(
      `UPDATE supplements
       SET name = $2,
           form = $3,
           brand = $4,
           product_name = $5,
           notes = $6,
           sort_order = $7,
           updated_at = now()
       WHERE id = $1::uuid
       RETURNING id::text AS id`,
      [id, next.name, next.form, next.brand, next.productName, next.notes, next.sortOrder],
    )) as Array<{ id?: string }>
    if (!rows[0]?.id) {
      throw new HttpError(404, 'Supplement not found')
    }
    return requireSupplement(id, now)
  } catch (error) {
    asInputError(error)
  }
}

export async function deleteSupplement(id: string): Promise<{ deleted: true; id: string }> {
  const sql = await getSql()
  const results = (await sql.transaction([
    sql.query(
      `DELETE FROM supplement_adherence
       WHERE schedule_id IN (SELECT id FROM supplement_schedules WHERE supplement_id = $1::uuid)`,
      [id],
    ),
    sql.query(`DELETE FROM supplement_schedules WHERE supplement_id = $1::uuid`, [id]),
    sql.query(`DELETE FROM supplement_status_events WHERE supplement_id = $1::uuid`, [id]),
    sql.query(`DELETE FROM supplements WHERE id = $1::uuid RETURNING id::text AS id`, [id]),
  ])) as Array<Array<{ id?: string }>>
  const deleted = results[3]?.[0]?.id
  if (!deleted) {
    throw new HttpError(404, 'Supplement not found')
  }
  return { deleted: true, id: deleted }
}

export async function addSchedule(supplementId: string, body: unknown, now = new Date()): Promise<SupplementRecord> {
  try {
    await requireSupplement(supplementId, now)
    const draft = parseDoseDraft(body, await currentHealthDate(now))
    const sql = await getSql()
    const sourceId = await manualSourceId(sql)
    await sql.query(
      `INSERT INTO supplement_schedules (
         id, supplement_id, slot_label, dose_amount, dose_unit, weekday_mask,
         effective_from, effective_through, sort_order, source_id
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4::numeric, $5, $6, $7::date, $8::date, $9, $10::uuid
       )`,
      [
        randomUUID(),
        supplementId,
        draft.slotLabel,
        draft.doseAmount,
        draft.doseUnit,
        draft.weekdayMask,
        draft.effectiveFrom,
        draft.effectiveThrough,
        draft.sortOrder,
        sourceId,
      ],
    )
    return requireSupplement(supplementId, now)
  } catch (error) {
    asInputError(error)
  }
}

export async function versionSchedule(
  supplementId: string,
  scheduleId: string,
  body: unknown,
  now = new Date(),
): Promise<SupplementRecord> {
  try {
    const draft = parseScheduleVersion(body)
    const schedule = await requireOwnedSchedule(supplementId, scheduleId)
    const plan = planScheduleVersion({
      schedule,
      effectiveFrom: draft.effectiveFrom,
      adherenceDates: schedule.adherenceDates,
    })
    const sql = await getSql()
    const sourceId = await manualSourceId(sql)
    const nextId = randomUUID()
    const rows = (await sql.query(
      `WITH closed AS (
         UPDATE supplement_schedules
         SET effective_through = $2::date, updated_at = now()
         WHERE id = $1::uuid
           AND supplement_id = $3::uuid
           AND effective_through IS NULL
           AND effective_from < $4::date
           AND NOT EXISTS (
             SELECT 1 FROM supplement_adherence
             WHERE schedule_id = $1::uuid AND scheduled_date >= $4::date
           )
         RETURNING id
       ),
       inserted AS (
         INSERT INTO supplement_schedules (
           id, supplement_id, slot_label, dose_amount, dose_unit, weekday_mask,
           effective_from, effective_through, sort_order, source_id
         )
         SELECT $5::uuid, $3::uuid, $6, $7::numeric, $8, $9, $4::date, $10::date, $11, $12::uuid
         FROM closed
         RETURNING id
       )
       SELECT (SELECT id::text FROM closed) AS closed_id, (SELECT id::text FROM inserted) AS inserted_id`,
      [
        scheduleId,
        plan.closeThrough,
        supplementId,
        draft.effectiveFrom,
        nextId,
        draft.slotLabel,
        draft.doseAmount,
        draft.doseUnit,
        draft.weekdayMask,
        draft.effectiveThrough,
        draft.sortOrder,
        sourceId,
      ],
    )) as Array<{ closed_id?: string | null; inserted_id?: string | null }>
    if (!rows[0]?.closed_id || !rows[0]?.inserted_id) {
      throw new HttpError(409, 'This change would rewrite dates that already have recorded adherence.')
    }
    return requireSupplement(supplementId, now)
  } catch (error) {
    asInputError(error)
  }
}

export async function stopSchedule(
  supplementId: string,
  scheduleId: string,
  body: unknown,
  now = new Date(),
): Promise<SupplementRecord> {
  try {
    const stopOn = parseScheduleStop(body)
    const schedule = await requireOwnedSchedule(supplementId, scheduleId)
    const plan = planScheduleStop({
      schedule,
      stopOn,
      adherenceDates: schedule.adherenceDates,
    })
    const sql = await getSql()
    if (plan.action === 'delete') {
      const rows = (await sql.query(
        `DELETE FROM supplement_schedules
         WHERE id = $1::uuid
           AND supplement_id = $2::uuid
           AND NOT EXISTS (SELECT 1 FROM supplement_adherence WHERE schedule_id = $1::uuid)
         RETURNING id::text AS id`,
        [scheduleId, supplementId],
      )) as Array<{ id?: string }>
      if (!rows[0]?.id) {
        throw new HttpError(409, 'This change would rewrite dates that already have recorded adherence.')
      }
    } else {
      const rows = (await sql.query(
        `UPDATE supplement_schedules
         SET effective_through = $3::date, updated_at = now()
         WHERE id = $1::uuid
           AND supplement_id = $2::uuid
           AND effective_from <= $3::date
           AND NOT EXISTS (
             SELECT 1 FROM supplement_adherence
             WHERE schedule_id = $1::uuid AND scheduled_date > $3::date
           )
         RETURNING id::text AS id`,
        [scheduleId, supplementId, plan.effectiveThrough],
      )) as Array<{ id?: string }>
      if (!rows[0]?.id) {
        throw new HttpError(409, 'This change would rewrite dates that already have recorded adherence.')
      }
    }
    return requireSupplement(supplementId, now)
  } catch (error) {
    asInputError(error)
  }
}

export async function updateFutureSchedule(
  supplementId: string,
  scheduleId: string,
  body: unknown,
  now = new Date(),
): Promise<SupplementRecord> {
  try {
    const today = await currentHealthDate(now)
    const schedule = await requireOwnedSchedule(supplementId, scheduleId)
    assertFutureScheduleEditable({
      schedule,
      asOf: today,
      adherenceDates: schedule.adherenceDates,
    })
    const draft = parseDoseDraft(body, schedule.effectiveFrom)
    if (draft.effectiveFrom <= today) {
      throw new SupplementInputError('This schedule has already taken effect. Change it with a new effective date.')
    }
    const sql = await getSql()
    const rows = (await sql.query(
      `UPDATE supplement_schedules
       SET slot_label = $3,
           dose_amount = $4::numeric,
           dose_unit = $5,
           weekday_mask = $6,
           effective_from = $7::date,
           effective_through = $8::date,
           sort_order = $9,
           updated_at = now()
       WHERE id = $1::uuid
         AND supplement_id = $2::uuid
         AND effective_from > $10::date
         AND NOT EXISTS (SELECT 1 FROM supplement_adherence WHERE schedule_id = $1::uuid)
       RETURNING id::text AS id`,
      [
        scheduleId,
        supplementId,
        draft.slotLabel,
        draft.doseAmount,
        draft.doseUnit,
        draft.weekdayMask,
        draft.effectiveFrom,
        draft.effectiveThrough,
        draft.sortOrder,
        today,
      ],
    )) as Array<{ id?: string }>
    if (!rows[0]?.id) {
      throw new HttpError(409, 'This schedule has already taken effect. Change it with a new effective date.')
    }
    return requireSupplement(supplementId, now)
  } catch (error) {
    asInputError(error)
  }
}

export async function setLifecycleStatus(supplementId: string, body: unknown, now = new Date()): Promise<SupplementRecord> {
  try {
    await requireSupplement(supplementId, now)
    const change = parseStatusChange(body)
    const sql = await getSql()
    const sourceId = await manualSourceId(sql)
    await sql.query(
      `INSERT INTO supplement_status_events (
         id, supplement_id, effective_date, status, notes, source_id
       ) VALUES (
         $1::uuid, $2::uuid, $3::date, $4, $5, $6::uuid
       )
       ON CONFLICT (supplement_id, effective_date) DO UPDATE SET
         status = EXCLUDED.status,
         notes = EXCLUDED.notes`,
      [randomUUID(), supplementId, change.effectiveDate, change.status, change.notes, sourceId],
    )
    return requireSupplement(supplementId, now)
  } catch (error) {
    asInputError(error)
  }
}

export async function recordAdherence(body: unknown, now = new Date()) {
  try {
    const command = parseAdherenceCommand(body, now)
    const today = await currentHealthDate(now)
    const schedule = await loadScheduleWindow(command.scheduleId)
    if (!schedule) {
      throw new HttpError(404, 'Schedule not found')
    }
    const events = await loadStatusEvents(schedule.supplementId)
    assertRecordableOccurrence({
      schedule,
      events,
      scheduledDate: command.scheduledDate,
      today,
      supplementId: command.supplementId,
    })
    const sql = await getSql()
    const sourceId = await manualSourceId(sql)
    if (nextAdherencePersistence(command.action) === 'delete') {
      await sql.query(
        `DELETE FROM supplement_adherence
         WHERE schedule_id = $1::uuid AND scheduled_date = $2::date`,
        [schedule.id, command.scheduledDate],
      )
    } else {
      await upsertAdherence(command, schedule.id, sourceId)
    }
    const observation = command.action === 'clear' ? null : { status: command.action }
    const state = resolveOccurrence({
      events,
      schedule,
      date: command.scheduledDate,
      adherence: observation,
    })
    const day = buildTodaySupplementSection(
      command.scheduledDate,
      await listTodaySupplementInputs(command.scheduledDate),
    )
    if (day && day.scheduledCount > 0 && day.unknownCount === 0) {
      await tryAwardDailyParticipation(sql, {
        kind: 'supplements',
        healthDate: command.scheduledDate,
        today,
        awardedAt: now,
      })
    }
    return {
      scheduleId: schedule.id,
      supplementId: schedule.supplementId,
      scheduledDate: command.scheduledDate,
      state,
      name: (await requireSupplement(schedule.supplementId, now)).name,
      slotLabel: schedule.slotLabel,
      plannedDoseAmount: schedule.doseAmount,
      plannedDoseUnit: schedule.doseUnit,
      actualDoseAmount: command.action === 'clear' ? null : command.actualDoseAmount,
      actualDoseUnit: command.action === 'clear' ? null : command.actualDoseUnit,
    }
  } catch (error) {
    asInputError(error)
  }
}

async function upsertAdherence(command: AdherenceCommand, scheduleId: string, sourceId: string): Promise<void> {
  if (command.action === 'clear') {
    return
  }
  const sql = await getSql()
  await sql.query(
    `INSERT INTO supplement_adherence (
       id, schedule_id, scheduled_date, status, actual_dose_amount, actual_dose_unit,
       taken_at, notes, source_id
     ) VALUES (
       $1::uuid, $2::uuid, $3::date, $4, $5::numeric, $6, $7::timestamptz, $8, $9::uuid
     )
     ON CONFLICT (schedule_id, scheduled_date) DO UPDATE SET
       status = EXCLUDED.status,
       actual_dose_amount = EXCLUDED.actual_dose_amount,
       actual_dose_unit = EXCLUDED.actual_dose_unit,
       taken_at = EXCLUDED.taken_at,
       notes = EXCLUDED.notes,
       source_id = EXCLUDED.source_id,
       updated_at = now()`,
    [
      randomUUID(),
      scheduleId,
      command.scheduledDate,
      command.action,
      command.actualDoseAmount,
      command.actualDoseUnit,
      command.takenAt,
      command.notes,
      sourceId,
    ],
  )
}

async function requireOwnedSchedule(supplementId: string, scheduleId: string) {
  const schedule = await loadScheduleWindow(scheduleId)
  if (!schedule || schedule.supplementId !== supplementId) {
    throw new HttpError(404, 'Schedule not found')
  }
  return schedule
}
