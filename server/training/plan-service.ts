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
import { buildTrainingWeekQualification, buildTrainingRoutineCredits, type PerformedExerciseEvidence } from '../../src/domain/training-qualification.js'
import { creditedSessions, deriveRoutineRotation, rotationSequenceUnchanged, type RoutineBlockClosure } from '../../src/domain/training-blocks.js'
import { compactRoutineSequence } from '../../src/domain/training-plan.js'
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

type RotationAnchorRow = { anchor_date: string | Date; current_routine_code: string; completed_at_anchor: number | string }
type RotationEndRow = { ended_on: string | Date; routine_code: string; generation: number | string; reason: string | null }

/** 0051 is a forward migration: older installations must still load their
 * existing Training Plan while the owner completes the migration. */
export function isMissingRotationSchema(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { code?: unknown; message?: unknown }
  return value.code === '42P01' &&
    typeof value.message === 'string' &&
    (value.message.includes('training_plan_rotation_anchors') ||
      value.message.includes('training_plan_block_ends'))
}

async function loadRotationAnchor(planId: string): Promise<RotationAnchorRow | null> {
  const sql = await getSql()
  try {
    const rows = await sql.query(
      `SELECT anchor_date::text AS anchor_date, current_routine_code, completed_at_anchor
         FROM training_plan_rotation_anchors
        WHERE plan_version_id = $1::uuid`,
      [planId],
    ) as RotationAnchorRow[]
    return rows[0] ?? null
  } catch (error) {
    if (isMissingRotationSchema(error)) return null
    throw error
  }
}

async function loadRotationEnds(planId: string, asOf: string): Promise<RoutineBlockClosure[]> {
  const sql = await getSql()
  const rows = await sql.query(
    `SELECT ended_on::text AS ended_on, routine_code, generation, reason
       FROM training_plan_block_ends
      WHERE plan_version_id = $1::uuid AND ended_on <= $2::date
      ORDER BY ended_on ASC, created_at ASC, id ASC`,
    [planId, asOf],
  ) as RotationEndRow[]
  return rows.map((row) => ({
    date: dateText(row.ended_on), routineCode: row.routine_code,
    generation: Number(row.generation), kind: 'end_early' as const, reason: row.reason,
  }))
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

/**
 * Read performed Training exercises across every session kind and the *whole*
 * calendar week, including workouts saved before the Training Plan existed.
 * Never derive a weekly completion from the number of session rows.
 */
// One authoritative selection for qualified Training evidence. Export the
// statement for PostgreSQL integration tests; UI and replay share its results.
export const PERFORMED_STRENGTH_EXERCISES_SQL = `SELECT DISTINCT sessions.workout_date::text AS date,
            session_exercises.exercise_definition_id::text AS exercise_id,
            sessions.routine_code
       FROM workout_sessions sessions
       JOIN workout_session_exercises session_exercises
         ON session_exercises.workout_session_id = sessions.id
       JOIN exercise_definitions definitions
         ON definitions.id = session_exercises.exercise_definition_id
      WHERE sessions.workout_date BETWEEN $1::date AND $2::date
        AND sessions.session_type IN ('programmed', 'ad_hoc', 'experiment')
        -- Non-strength distance and standalone skill activities cannot be
        -- mistaken for one of the three distinct strength exercises.
        AND definitions.measurement_kind NOT IN ('distance', 'distance_duration')
        AND definitions.performance_type NOT IN ('distance', 'skill')
        AND ($3::timestamptz IS NULL OR sessions.created_at > $3::timestamptz)
        AND EXISTS (
          SELECT 1 FROM workout_sets sets
           WHERE sets.workout_session_exercise_id = session_exercises.id
             AND sets.set_type <> 'warmup'
             AND (
               COALESCE(sets.reps, 0) > 0
               OR COALESCE(sets.duration_sec, 0) > 0
               OR COALESCE(sets.left_reps, 0) > 0
               OR COALESCE(sets.right_reps, 0) > 0
               OR COALESCE(sets.left_duration_sec, 0) > 0
               OR COALESCE(sets.right_duration_sec, 0) > 0
               OR COALESCE(sets.distance_m, 0) > 0
               OR sets.completed = true
             )
        )`

async function performedExerciseEvidence(start: string, asOf: string, createdAfter?: string): Promise<PerformedExerciseEvidence[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    PERFORMED_STRENGTH_EXERCISES_SQL,
    [start, asOf, createdAfter ?? null],
  )) as Array<{ date: string; exercise_id: string; routine_code: string | null }>
  return rows.map((row) => ({
    date: row.date,
    exerciseId: row.exercise_id,
    routineCode: row.routine_code,
  }))
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
      weekTraining: null,
      historyReview: null,
      rotationPreview: null,
      rotation: null,
      weeklyFrequencyTarget: null,
    }
  }

  const [sequenceCodes, preferredWeekdays, templates] = await Promise.all([
    loadSequence(plan.id),
    loadPreferredWeekdays(plan.id),
    activeTemplatesByRoutine(),
  ])
  const rotationAnchor = await loadRotationAnchor(plan.id)
  const start = weekStartMonday(asOf)
  const end = addCalendarDays(start, 6)
  const effectiveFrom = dateText(plan.effective_from)
  const applicableStart = effectiveFrom > start ? effectiveFrom : start
  const [overrides, completedCodes, completed, performedEvidence, routineEvidence] = await Promise.all([
    loadOverrides(applicableStart, end),
    completedRoutineCodes(sequenceCodes, effectiveFrom, asOf, plan.created_at),
    completedProgrammedSessions(sequenceCodes, applicableStart, end),
    performedExerciseEvidence(start, asOf),
    performedExerciseEvidence(effectiveFrom, asOf, plan.created_at),
  ])
  const weekTraining = buildTrainingWeekQualification(performedEvidence, asOf)

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
  // Provisional evidence after this plan version. The official current
  // session keeps its prior pointer until historical reconciliation is stored.
  const specs = compactRoutineSequence(sequenceCodes).map((block) => ({
    routineCode: block.routineCode, target: block.count,
  }))
  // Only propose a starting point; never silently rewrite pre-plan history.
  // The user confirms this in the Training Plan before any official replay.
  const lookbackStart = addCalendarDays(effectiveFrom, -84)
  const priorEvidence = rotationAnchor ? [] : await performedExerciseEvidence(
    lookbackStart, addCalendarDays(effectiveFrom, -1),
  )
  const historicalCredits = buildTrainingRoutineCredits(priorEvidence)
  const eligibleDays = historicalCredits.map((item) => ({
    date: item.date, routineCode: item.routineCode,
  }))
  const historyCounts = specs.map((spec) => ({
    ...spec,
    observed: historicalCredits.filter((item) => item.routineCode === spec.routineCode).length,
  }))
  // Earliest observed unfinished block is an informed starting suggestion.
  // Recorded partial future routines do not force the current pointer ahead.
  const incomplete = historyCounts.find((item) => item.observed > 0 && item.observed < item.target)
  const lastCode = historicalCredits[historicalCredits.length - 1]?.routineCode
  const lastIndex = historyCounts.findIndex((item) => item.routineCode === lastCode)
  const fallback = lastIndex >= 0
    ? historyCounts[(lastIndex + 1) % historyCounts.length]
    : null
  const suggestion = incomplete
    ? {
        routineCode: incomplete.routineCode,
        completedAtAnchor: incomplete.observed,
        reason: 'Based on logged, qualifying work in this routine. Review other routines before confirming.',
      }
    : fallback ? {
        routineCode: fallback.routineCode,
        completedAtAnchor: 0,
        reason: 'Suggested following your most recently logged routine. Verify this against your training history.',
      } : null
  const historyReview = rotationAnchor
    ? null
    : { lookbackStart, eligibleDays: eligibleDays.slice(-24).reverse(), suggestion }
  const startProgress = repeatProgressAtPosition(sequenceCodes, startPosition - 1)
  const rotationPreview = specs.length
    ? {
        source: 'provisional' as const,
        firstTrackedDate: effectiveFrom,
        state: deriveRoutineRotation(
          specs,
          { currentRoutineCode: progressionSequence[0]!,
            alreadyCompletedInCurrent: (startProgress?.session ?? 1) - 1 },
          buildTrainingRoutineCredits(routineEvidence),
          [],
          asOf,
        ),
      }
    : null
  const rotation = rotationAnchor && dateText(rotationAnchor.anchor_date) <= asOf
    ? {
        source: 'confirmed' as const,
        anchorDate: dateText(rotationAnchor.anchor_date),
        currentRoutineAtAnchor: rotationAnchor.current_routine_code,
        completedAtAnchor: Number(rotationAnchor.completed_at_anchor),
        state: deriveRoutineRotation(
          specs,
          { currentRoutineCode: rotationAnchor.current_routine_code,
            alreadyCompletedInCurrent: Number(rotationAnchor.completed_at_anchor) },
          buildTrainingRoutineCredits(
            await performedExerciseEvidence(dateText(rotationAnchor.anchor_date), asOf),
          ),
          await loadRotationEnds(plan.id, asOf),
          asOf,
        ),
      }
    : null
  const currentCode = rotation?.state.currentRoutineCode ?? nextCode
  const currentState = rotation?.state.routines.find((item) => item.routineCode === currentCode)
  const confirmedBlock = currentState?.activeBlock
  const nextRepeatProgress = confirmedBlock && confirmedBlock.status === 'active'
    ? { session: Math.min(confirmedBlock.target, creditedSessions(confirmedBlock) + 1),
        total: confirmedBlock.target }
    : rotation ? null : repeatProgressAtPosition(sequenceCodes, absoluteNextIndex)
  const nextSession = currentCode == null
    ? null
    : sequence.find((item) => item.routineCode === currentCode) ?? unavailableRoutine(currentCode)

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
    weekTraining,
    historyReview,
    rotationPreview,
    rotation,
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
  const previousVersion = await loadPlanVersion(today)
  const previousSequence = previousVersion ? await loadSequence(previousVersion.id) : []
  const previous = await getTrainingPlan(today)
  // Editing the weekly target, preferred weekdays or note should not erase
  // the owner's confirmed historical anchor or early-ended block decisions.
  const preserveRotationDecisions = previousVersion != null &&
    rotationSequenceUnchanged(previousSequence, input.sequenceRoutineCodes)
  // Copy rotation rows only if a confirmed anchor actually exists. This also
  // keeps pre-0051 production plans editable until the additive migration runs.
  const priorRotationAnchor = previousVersion ? await loadRotationAnchor(previousVersion.id) : null
  if (previousVersion && !preserveRotationDecisions) {
    if (priorRotationAnchor && input.confirmRotationReset !== true) {
      throw new HttpError(
        409,
        'Changing the routine order or session targets requires confirmation. Your old rotation remains in history, but the new sequence needs a new starting point.',
      )
    }
  }
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
    ...(preserveRotationDecisions && previousVersion && priorRotationAnchor ? [
      sql.query(
        `INSERT INTO training_plan_rotation_anchors
           (plan_version_id, anchor_date, current_routine_code, completed_at_anchor,
            confirmed_at, note)
         SELECT $1::uuid, anchor_date, current_routine_code, completed_at_anchor,
                confirmed_at, note
           FROM training_plan_rotation_anchors
          WHERE plan_version_id = $2::uuid`,
        [id, previousVersion.id],
      ),
      sql.query(
        `INSERT INTO training_plan_block_ends
           (id, plan_version_id, routine_code, generation, ended_on, reason, created_at)
         SELECT gen_random_uuid(), $1::uuid, routine_code, generation, ended_on,
                reason, created_at
           FROM training_plan_block_ends
          WHERE plan_version_id = $2::uuid`,
        [id, previousVersion.id],
      ),
    ] : []),
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


/**
 * The anchor represents progress at the START of anchorDate; canonical
 * routine-qualified workouts on that date and later are replayed from evidence.
 */
export async function confirmTrainingRotationAnchor(body: unknown): Promise<TrainingPlanView> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid anchor')
  const input = body as { anchorDate?: unknown; currentRoutineCode?: unknown; completedAtAnchor?: unknown; note?: unknown }
  const today = await currentHealthDate()
  const plan = await loadPlanVersion(today)
  if (!plan) throw new HttpError(409, 'Set up a Training Plan first')
  const sequence = await loadSequence(plan.id)
  const specs = compactRoutineSequence(sequence)
  const selected = specs.find((item) => item.routineCode === input.currentRoutineCode)
  if (!selected) throw new HttpError(400, 'Choose a routine in your current plan')
  if (typeof input.anchorDate !== 'string' || !isoDateSchema.safeParse(input.anchorDate).success ||
      input.anchorDate > today || input.anchorDate > dateText(plan.effective_from)) {
    throw new HttpError(400, 'Start date must be valid and no later than the plan start date')
  }
  if (!Number.isInteger(input.completedAtAnchor) || Number(input.completedAtAnchor) < 0 ||
      Number(input.completedAtAnchor) >= selected.count) {
    throw new HttpError(400, 'Starting progress must be below that routine target')
  }
  const note = input.note == null ? null : String(input.note).trim()
  if (note && note.length > 500) throw new HttpError(400, 'Note must be 500 characters or fewer')
  const sql = await getSql()
  const ends = await sql.query(
    'SELECT id FROM training_plan_block_ends WHERE plan_version_id = $1::uuid LIMIT 1',
    [plan.id],
  )
  if (ends.length) throw new HttpError(409, 'Reopen existing early-ended blocks before changing the anchor')
  await sql.query(
    `INSERT INTO training_plan_rotation_anchors
       (plan_version_id, anchor_date, current_routine_code, completed_at_anchor, note)
     VALUES ($1::uuid, $2::date, $3, $4::int, $5)
     ON CONFLICT (plan_version_id) DO UPDATE SET
       anchor_date = EXCLUDED.anchor_date,
       current_routine_code = EXCLUDED.current_routine_code,
       completed_at_anchor = EXCLUDED.completed_at_anchor,
       note = EXCLUDED.note, confirmed_at = now()`,
    [plan.id, input.anchorDate, selected.routineCode, input.completedAtAnchor, note],
  )
  return getTrainingPlan(today)
}

export async function endTrainingRotationBlock(body: unknown): Promise<TrainingPlanView> {
  const today = await currentHealthDate()
  const plan = await loadPlanVersion(today)
  const view = await getTrainingPlan(today)
  if (!plan || !view.rotation) throw new HttpError(409, 'Confirm your routine history before ending a block')
  const state = view.rotation.state
  const current = state.routines.find((r) => r.routineCode === state.currentRoutineCode)
  if (!current || current.activeBlock.status !== 'active') throw new HttpError(409, 'No current block to end')
  const reasonInput = body != null && typeof body === 'object' && !Array.isArray(body)
    ? (body as { reason?: unknown }).reason : null
  if (reasonInput != null && typeof reasonInput !== 'string') throw new HttpError(400, 'Invalid reason')
  const reason = typeof reasonInput === 'string' ? reasonInput.trim() : null
  if (reason && reason.length > 200) throw new HttpError(400, 'Reason must be 200 characters or fewer')
  const sql = await getSql()
  await sql.query(
    `INSERT INTO training_plan_block_ends (plan_version_id, routine_code, generation, ended_on, reason)
       VALUES ($1::uuid, $2, $3::int, $4::date, $5)
       ON CONFLICT (plan_version_id, routine_code, generation) DO NOTHING`,
    [plan.id, current.routineCode, current.activeBlock.generation, today, reason],
  )
  return getTrainingPlan(today)
}

export async function reopenTrainingRotationBlock(body: unknown): Promise<TrainingPlanView> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid block')
  const input = body as { routineCode?: unknown; generation?: unknown }
  if (typeof input.routineCode !== 'string' || !Number.isInteger(input.generation) ||
      Number(input.generation) < 1) throw new HttpError(400, 'Invalid block')
  const today = await currentHealthDate()
  const plan = await loadPlanVersion(today)
  if (!plan) throw new HttpError(409, 'No Training Plan configured')
  const sql = await getSql()
  await sql.query(
    `DELETE FROM training_plan_block_ends
      WHERE plan_version_id = $1::uuid AND routine_code = $2 AND generation = $3::int`,
    [plan.id, input.routineCode, input.generation],
  )
  return getTrainingPlan(today)
}
