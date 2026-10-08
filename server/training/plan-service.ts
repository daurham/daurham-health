import { randomUUID } from 'node:crypto'
import {
  addCalendarDays,
  baselineIntentForDate,
  dayOverrideInputSchema,
  moveTrainingDayInputSchema,
  nextRoutineCode,
  nextRoutineIndex,
  repeatProgressAtPosition,
  sequenceFromPosition,
  trainingPlanInputSchema,
  weekStartMonday,
  isoWeekday,
  type TrainingDayIntent,
  type TrainingPlanDay,
  type TrainingPlanTemplate,
  type TrainingPlanView,
} from '../../src/domain/training-plan.js'
import { isoDateSchema } from '../../src/domain/training.js'
import { getSql } from '../db.js'
import { currentHealthDate } from '../health-time.js'
import { HttpError } from '../http.js'
import { listTemplates } from './service.js'

type PlanRow = {
  id: string
  version: number | string
  effective_from: string | Date
  weekly_frequency_target: number | string
  sequence_start_routine_code: string
  sequence_start_position: number | string
  created_at: string
  default_non_training_intent: 'rest' | 'active_recovery' | 'flexible'
  note: string | null
}

type OverrideRow = {
  override_date: string | Date
  intent_kind: TrainingDayIntent
  linked_date: string | Date | null
}

function dateText(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)
}

function nullableDateText(value: string | Date | null): string | null {
  return value == null ? null : dateText(value)
}

async function activeTemplatesByRoutine(): Promise<Map<string, TrainingPlanTemplate>> {
  const templates = (await listTemplates()).templates
  const byRoutine = new Map<string, TrainingPlanTemplate>()
  for (const template of templates) {
    byRoutine.set(template.routineCode, {
      routineCode: template.routineCode,
      templateId: template.id,
      name: template.name,
      originKind: template.originKind,
      available: true,
    })
  }
  return byRoutine
}

function unavailableRoutine(routineCode: string): TrainingPlanTemplate {
  return {
    routineCode,
    templateId: null,
    name: routineCode,
    originKind: null,
    available: false,
  }
}

async function loadPlanVersion(asOf: string): Promise<PlanRow | null> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT id::text AS id,
            version,
            effective_from::text AS effective_from,
            weekly_frequency_target,
            sequence_start_routine_code,
            sequence_start_position,
            created_at::text AS created_at,
            default_non_training_intent,
            note
       FROM training_plan_versions
      WHERE effective_from <= $1::date
      ORDER BY effective_from DESC, version DESC
      LIMIT 1`,
    [asOf],
  )) as PlanRow[]
  return rows[0] ?? null
}

async function loadSequence(planId: string): Promise<string[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT routine_code
       FROM training_plan_sequence_items
      WHERE plan_version_id = $1::uuid
      ORDER BY position`,
    [planId],
  )) as Array<{ routine_code: string }>
  return rows.map((row) => row.routine_code)
}

async function loadPreferredWeekdays(planId: string): Promise<number[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT weekday
       FROM training_plan_preferred_weekdays
      WHERE plan_version_id = $1::uuid
      ORDER BY weekday`,
    [planId],
  )) as Array<{ weekday: number | string }>
  return rows.map((row) => Number(row.weekday))
}

async function loadOverrides(start: string, end: string): Promise<Map<string, OverrideRow>> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT override_date::text AS override_date,
            intent_kind,
            linked_date::text AS linked_date
       FROM training_plan_day_overrides
      WHERE override_date BETWEEN $1::date AND $2::date
      ORDER BY override_date`,
    [start, end],
  )) as OverrideRow[]
  return new Map(rows.map((row) => [dateText(row.override_date), row]))
}

async function completedRoutineCodes(
  sequence: readonly string[],
  start: string,
  asOf: string,
  planCreatedAt: string,
): Promise<string[]> {
  if (sequence.length === 0) return []
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT routine_code
       FROM workout_sessions
      WHERE session_type = 'programmed'
        AND workout_date BETWEEN $1::date AND $2::date
        AND routine_code = ANY($3::text[])
        AND created_at > $4::timestamptz
      ORDER BY workout_date ASC, created_at ASC`,
    [start, asOf, sequence, planCreatedAt],
  )) as Array<{ routine_code: string | null }>
  return rows.flatMap((row) => row.routine_code == null ? [] : [row.routine_code])
}

async function completedProgrammedSessions(
  sequence: readonly string[],
  start: string,
  end: string,
): Promise<number> {
  if (sequence.length === 0) return 0
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT COUNT(*)::int AS count
       FROM workout_sessions
      WHERE session_type = 'programmed'
        AND workout_date BETWEEN $1::date AND $2::date
        AND routine_code = ANY($3::text[])`,
    [start, end, sequence],
  )) as Array<{ count: number | string }>
  return Number(rows[0]?.count ?? 0)
}

export async function getTrainingPlan(asOfInput?: string): Promise<TrainingPlanView> {
  const asOf = asOfInput ?? await currentHealthDate()
  if (!isoDateSchema.safeParse(asOf).success) {
    throw new HttpError(400, 'asOf must be YYYY-MM-DD')
  }

  const plan = await loadPlanVersion(asOf)
  if (!plan) {
    return {
      asOf,
      configured: false,
      baseline: null,
      nextSession: null,
      nextRepeatProgress: null,
      today: null,
      week: [],
      completedProgrammedSessions: 0,
      weeklyFrequencyTarget: null,
    }
  }

  const [sequenceCodes, preferredWeekdays, templates] = await Promise.all([
    loadSequence(plan.id),
    loadPreferredWeekdays(plan.id),
    activeTemplatesByRoutine(),
  ])
  const start = weekStartMonday(asOf)
  const end = addCalendarDays(start, 6)
  const effectiveFrom = dateText(plan.effective_from)
  const applicableStart = effectiveFrom > start ? effectiveFrom : start
  const [overrides, completedCodes, completed] = await Promise.all([
    loadOverrides(applicableStart, end),
    completedRoutineCodes(sequenceCodes, effectiveFrom, asOf, plan.created_at),
    completedProgrammedSessions(sequenceCodes, applicableStart, end),
  ])

  const week: TrainingPlanDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDays(start, index)
    const baselineIntent =
      date < effectiveFrom
        ? 'flexible'
        : baselineIntentForDate(
            date,
            preferredWeekdays,
            plan.default_non_training_intent,
          )
    const override = date < effectiveFrom ? null : overrides.get(date) ?? null
    return {
      date,
      weekday: isoWeekday(date),
      baselineIntent,
      effectiveIntent: override?.intent_kind ?? baselineIntent,
      overrideIntent: override?.intent_kind ?? null,
      linkedDate: nullableDateText(override?.linked_date ?? null),
    }
  })

  const sequence = sequenceCodes.map((routineCode) =>
    templates.get(routineCode) ?? unavailableRoutine(routineCode),
  )
  const startPosition = Math.max(1, Math.min(sequenceCodes.length, Number(plan.sequence_start_position) || 1))
  const progressionSequence = sequenceFromPosition(sequenceCodes, startPosition)
  const nextRelativeIndex = nextRoutineIndex(progressionSequence, completedCodes)
  const nextCode = nextRoutineCode(progressionSequence, completedCodes)
  const absoluteNextIndex = nextRelativeIndex < 0 ? -1 : ((startPosition - 1 + nextRelativeIndex) % sequenceCodes.length)
  const nextRepeatProgress = repeatProgressAtPosition(sequenceCodes, absoluteNextIndex)
  const nextSession =
    nextCode == null
      ? null
      : sequence.find((item) => item.routineCode === nextCode) ?? unavailableRoutine(nextCode)

  return {
    asOf,
    configured: true,
    baseline: {
      version: Number(plan.version),
      effectiveFrom: dateText(plan.effective_from),
      weeklyFrequencyTarget: Number(plan.weekly_frequency_target),
      defaultNonTrainingIntent: plan.default_non_training_intent,
      preferredWeekdays,
      sequence,
      note: plan.note,
    },
    nextSession,
    nextRepeatProgress,
    today: week.find((day) => day.date === asOf) ?? null,
    week,
    completedProgrammedSessions: completed,
    weeklyFrequencyTarget: Number(plan.weekly_frequency_target),
  }
}

export async function putTrainingPlan(body: unknown): Promise<TrainingPlanView> {
  const parsed = trainingPlanInputSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid Training Plan')
  }
  const input = parsed.data
  const templates = await activeTemplatesByRoutine()
  for (const routineCode of input.sequenceRoutineCodes) {
    if (!templates.has(routineCode)) {
      throw new HttpError(400, `Routine ${routineCode} is not active`)
    }
  }

  const today = await currentHealthDate()
  const previous = await getTrainingPlan(today)
  const previousNextCode = previous.nextSession?.routineCode
  const firstNewIndex = previousNextCode == null ? -1 : input.sequenceRoutineCodes.indexOf(previousNextCode)
  const oldBlockOffset = previous.nextRepeatProgress?.session ?? 1
  const newBlockLength = firstNewIndex < 0 ? 0 : input.sequenceRoutineCodes.slice(firstNewIndex).findIndex((code) => code !== previousNextCode)
  const newBlockCount = newBlockLength < 0 ? input.sequenceRoutineCodes.length - firstNewIndex : newBlockLength
  const sequenceStartPosition = firstNewIndex < 0 ? 1 : firstNewIndex + Math.min(oldBlockOffset, newBlockCount)
  const sequenceStart = input.sequenceRoutineCodes[sequenceStartPosition - 1]!
  const sql = await getSql()
  const versionRows = (await sql.query(
    'SELECT COALESCE(MAX(version), 0)::int AS version FROM training_plan_versions',
  )) as Array<{ version: number | string }>
  const version = Number(versionRows[0]?.version ?? 0) + 1
  const id = randomUUID()
  const statements = [
    sql.query(
      'UPDATE training_plan_versions SET is_current = false WHERE is_current = true',
    ),
    sql.query(
      `INSERT INTO training_plan_versions (
         id, version, effective_from, weekly_frequency_target,
         sequence_start_routine_code, sequence_start_position, default_non_training_intent,
         note, is_current, created_at
       ) VALUES (
         $1::uuid, $2::int, $3::date, $4::int, $5, $6::int, $7, $8, true, now()
       )`,
      [
        id,
        version,
        today,
        input.weeklyFrequencyTarget,
        sequenceStart,
        sequenceStartPosition,
        input.defaultNonTrainingIntent,
        input.note,
      ],
    ),
    ...input.sequenceRoutineCodes.map((routineCode, index) =>
      sql.query(
        `INSERT INTO training_plan_sequence_items (
           plan_version_id, position, routine_code, created_at
         ) VALUES ($1::uuid, $2::int, $3, now())`,
        [id, index + 1, routineCode],
      ),
    ),
    ...input.preferredWeekdays.map((weekday) =>
      sql.query(
        `INSERT INTO training_plan_preferred_weekdays (
           plan_version_id, weekday, created_at
         ) VALUES ($1::uuid, $2::int, now())`,
        [id, weekday],
      ),
    ),
  ]
  await sql.transaction(statements)
  return getTrainingPlan(today)
}

function assertCurrentWeek(date: string, today: string): void {
  const start = weekStartMonday(today)
  const end = addCalendarDays(start, 6)
  if (date < start || date > end) {
    throw new HttpError(400, 'Training Plan overrides are limited to the current week')
  }
}

export async function putTrainingDayOverride(date: string, body: unknown): Promise<TrainingPlanView> {
  if (!isoDateSchema.safeParse(date).success) {
    throw new HttpError(400, 'Override date must be YYYY-MM-DD')
  }
  const parsed = dayOverrideInputSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid Training Plan override')
  }
  const today = await currentHealthDate()
  assertCurrentWeek(date, today)
  const current = await getTrainingPlan(today)
  if (!current.configured) {
    throw new HttpError(409, 'Configure a Training Plan first')
  }
  const existing = current.week.find((day) => day.date === date) ?? null
  const sql = await getSql()
  const statements = []
  if (
    existing?.linkedDate &&
    ['training_moved_here', 'training_moved_away'].includes(existing.effectiveIntent)
  ) {
    statements.push(
      sql.query(
        `DELETE FROM training_plan_day_overrides
          WHERE override_date = $1::date
            AND linked_date = $2::date
            AND intent_kind IN ('training_moved_here', 'training_moved_away')`,
        [existing.linkedDate, date],
      ),
    )
  }
  statements.push(
    sql.query(
      `INSERT INTO training_plan_day_overrides (
         id, override_date, intent_kind, linked_date, note, created_at, updated_at
       ) VALUES (
         $1::uuid, $2::date, $3, NULL, $4, now(), now()
       )
       ON CONFLICT (override_date) DO UPDATE SET
         intent_kind = EXCLUDED.intent_kind,
         linked_date = NULL,
         note = EXCLUDED.note,
         updated_at = now()`,
      [randomUUID(), date, parsed.data.intentKind, parsed.data.note],
    ),
  )
  await sql.transaction(statements)
  return getTrainingPlan(today)
}

export async function deleteTrainingDayOverride(date: string): Promise<TrainingPlanView> {
  if (!isoDateSchema.safeParse(date).success) {
    throw new HttpError(400, 'Override date must be YYYY-MM-DD')
  }
  const today = await currentHealthDate()
  assertCurrentWeek(date, today)
  const current = await getTrainingPlan(today)
  const existing = current.week.find((day) => day.date === date) ?? null
  const sql = await getSql()
  if (
    existing?.linkedDate &&
    ['training_moved_here', 'training_moved_away'].includes(existing.effectiveIntent)
  ) {
    await sql.transaction([
      sql.query(
        'DELETE FROM training_plan_day_overrides WHERE override_date = $1::date',
        [date],
      ),
      sql.query(
        `DELETE FROM training_plan_day_overrides
          WHERE override_date = $1::date
            AND linked_date = $2::date
            AND intent_kind IN ('training_moved_here', 'training_moved_away')`,
        [existing.linkedDate, date],
      ),
    ])
  } else {
    await sql.query(
      'DELETE FROM training_plan_day_overrides WHERE override_date = $1::date',
      [date],
    )
  }
  return getTrainingPlan(today)
}

export async function moveTrainingDay(body: unknown): Promise<TrainingPlanView> {
  const parsed = moveTrainingDayInputSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid Training Plan move')
  }
  const today = await currentHealthDate()
  const { fromDate, toDate } = parsed.data
  assertCurrentWeek(fromDate, today)
  assertCurrentWeek(toDate, today)

  const current = await getTrainingPlan(today)
  if (!current.configured) {
    throw new HttpError(409, 'Configure a Training Plan first')
  }
  const source = current.week.find((day) => day.date === fromDate)
  const destination = current.week.find((day) => day.date === toDate)
  if (!source || !['training_preferred', 'training_moved_here'].includes(source.effectiveIntent)) {
    throw new HttpError(400, 'The source date is not currently a planned Training day')
  }
  if (!destination) {
    throw new HttpError(400, 'The destination date is outside the current Training week')
  }
  if (['training_preferred', 'training_moved_here'].includes(destination.effectiveIntent)) {
    throw new HttpError(409, 'The destination already has planned Training')
  }

  const originDate =
    source.effectiveIntent === 'training_moved_here' && source.linkedDate
      ? source.linkedDate
      : fromDate

  const sql = await getSql()
  const statements = []
  if (originDate !== fromDate) {
    statements.push(
      sql.query(
        `DELETE FROM training_plan_day_overrides
          WHERE override_date = $1::date
            AND intent_kind = 'training_moved_here'
            AND linked_date = $2::date`,
        [fromDate, originDate],
      ),
    )
  }
  statements.push(
    sql.query(
      `INSERT INTO training_plan_day_overrides (
         id, override_date, intent_kind, linked_date, note, created_at, updated_at
       ) VALUES (
         $1::uuid, $2::date, 'training_moved_away', $3::date, NULL, now(), now()
       )
       ON CONFLICT (override_date) DO UPDATE SET
         intent_kind = 'training_moved_away',
         linked_date = EXCLUDED.linked_date,
         note = NULL,
         updated_at = now()`,
      [randomUUID(), originDate, toDate],
    ),
    sql.query(
      `INSERT INTO training_plan_day_overrides (
         id, override_date, intent_kind, linked_date, note, created_at, updated_at
       ) VALUES (
         $1::uuid, $2::date, 'training_moved_here', $3::date, NULL, now(), now()
       )
       ON CONFLICT (override_date) DO UPDATE SET
         intent_kind = 'training_moved_here',
         linked_date = EXCLUDED.linked_date,
         note = NULL,
         updated_at = now()`,
      [randomUUID(), toDate, originDate],
    ),
  )
  await sql.transaction(statements)
  return getTrainingPlan(today)
}

