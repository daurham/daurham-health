import { randomUUID } from 'node:crypto'
import type { ActivityDailyRow } from '../../src/domain/activity/analytics.js'
import {
  formatGoalTarget,
  goalDisplayName,
  goalEvidence,
  latestSessionE1rm,
  nextGoalLifecycle,
  sameGoalSelector,
  sameGoalTarget,
  validateGoalCreate,
  validateGoalRevision,
  type BenchmarkPin,
  type GoalDraft,
  type GoalEvidence,
  type GoalKind,
  type GoalLifecycleAction,
  type GoalSelector,
  type GoalStatus,
  type GoalTarget,
  type GoalValidationContext,
} from '../../src/domain/goals.js'
import { bodyGoalSeries, projectGoal, strengthGoalSeries } from '../../src/domain/goal-projection.js'
import { evaluateGoalStatus, goalAttentionCandidates, selectGoalAttention, type GoalAttentionItem } from '../../src/domain/goal-status.js'
import type { CadenceConfig, CadenceObservation } from '../../src/domain/body-cadence.js'
import type { BenchmarkRetestView } from '../../src/domain/lab-retests.js'
import { calendarDateFromInstant } from '../../src/domain/progress/dates.js'
import { bestTrainingPerformance, trainingPerformanceObservations } from '../../src/domain/progress/training-performance.js'
import type { BodyObservation, CanonicalSetRecord, ProgressExerciseDefinition } from '../../src/domain/progress/types.js'
import type { AdherenceWindow, ScheduleWindow, StatusEventWindow } from '../../src/domain/supplements/types.js'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'
import { currentHealthDate, healthCalendarTimeZone } from '../health-time.js'

const STALE = 'stale_version'

type GoalRow = {
  id: string
  goal_kind: GoalKind
  status: GoalStatus
  started_on: string
  body_metric_key: string | null
  exercise_definition_id: string | null
  benchmark_definition_id: string | null
  benchmark_protocol_version_id: string | null
  benchmark_requirement_id: string | null
  supplement_id: string | null
  training_min_distance_m: string | null
  paused_at: string | null
  completed_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  exercise_name: string | null
  exercise_active: boolean | null
  supplement_name: string | null
  supplement_status: string | null
  benchmark_title: string | null
  benchmark_active: boolean | null
  benchmark_label: string | null
}

type VersionRow = {
  id: string
  goal_id: string
  version: number
  is_current: boolean
  target_mode: GoalTarget['targetMode']
  target_min: string | null
  target_max: string | null
  target_unit: string
  target_date: string | null
  evaluation_window_days: number | null
  notes: string | null
  created_at: string
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function selectorFrom(row: GoalRow): GoalSelector {
  return {
    goalKind: row.goal_kind,
    bodyMetricKey: row.body_metric_key,
    exerciseDefinitionId: row.exercise_definition_id,
    benchmarkDefinitionId: row.benchmark_definition_id,
    benchmarkProtocolVersionId: row.benchmark_protocol_version_id,
    benchmarkRequirementId: row.benchmark_requirement_id,
    supplementId: row.supplement_id,
    trainingMinDistanceM: numberOrNull(row.training_min_distance_m),
  }
}

function targetFrom(row: VersionRow): GoalTarget {
  return {
    targetMode: row.target_mode,
    targetMin: numberOrNull(row.target_min),
    targetMax: numberOrNull(row.target_max),
    targetUnit: row.target_unit,
    targetDate: row.target_date,
    evaluationWindowDays: row.evaluation_window_days == null ? null : Number(row.evaluation_window_days),
    notes: row.notes,
  }
}

function versionView(row: VersionRow) {
  return {
    id: row.id,
    version: Number(row.version),
    isCurrent: row.is_current === true,
    ...targetFrom(row),
    createdAt: row.created_at,
  }
}

const GOAL_SELECT = `
  SELECT goals.id::text AS id,
         goals.goal_kind,
         goals.status,
         goals.started_on::text AS started_on,
         goals.body_metric_key,
         goals.exercise_definition_id::text AS exercise_definition_id,
         goals.benchmark_definition_id::text AS benchmark_definition_id,
         goals.benchmark_protocol_version_id::text AS benchmark_protocol_version_id,
         goals.benchmark_requirement_id::text AS benchmark_requirement_id,
         goals.supplement_id::text AS supplement_id,
         goals.training_min_distance_m::text AS training_min_distance_m,
         goals.paused_at::text AS paused_at,
         goals.completed_at::text AS completed_at,
         goals.archived_at::text AS archived_at,
         goals.created_at::text AS created_at,
         goals.updated_at::text AS updated_at,
         exercises.name AS exercise_name,
         exercises.is_active AS exercise_active,
         supplements.name AS supplement_name,
         (
           SELECT events.status FROM supplement_status_events events
           WHERE events.supplement_id = supplements.id
           ORDER BY events.effective_date DESC, events.created_at DESC
           LIMIT 1
         ) AS supplement_status,
         protocols.title AS benchmark_title,
         benchmarks.is_active AS benchmark_active,
         requirements.label AS benchmark_label
  FROM goals
  LEFT JOIN exercise_definitions exercises ON exercises.id = goals.exercise_definition_id
  LEFT JOIN supplements ON supplements.id = goals.supplement_id
  LEFT JOIN benchmark_definitions benchmarks ON benchmarks.id = goals.benchmark_definition_id
  LEFT JOIN lab_protocols protocols ON protocols.id = benchmarks.protocol_id
  LEFT JOIN lab_protocol_requirements requirements ON requirements.id = goals.benchmark_requirement_id
`

async function manualSourceId(sql: Sql): Promise<string> {
  const rows = (await sql.query(`SELECT id::text AS id FROM data_sources WHERE key = 'manual' LIMIT 1`, [])) as Array<{ id?: string }>
  const id = rows[0]?.id
  if (!id) {
    throw new HttpError(500, 'Manual source is missing')
  }
  return id
}

async function loadContext(sql: Sql, draft: Record<string, unknown>, today: string): Promise<GoalValidationContext> {
  const exerciseId = typeof draft.exerciseDefinitionId === 'string' ? draft.exerciseDefinitionId : null
  const supplementId = typeof draft.supplementId === 'string' ? draft.supplementId : null
  const definitionId = typeof draft.benchmarkDefinitionId === 'string' ? draft.benchmarkDefinitionId : null
  const versionId = typeof draft.benchmarkProtocolVersionId === 'string' ? draft.benchmarkProtocolVersionId : null
  const requirementId = typeof draft.benchmarkRequirementId === 'string' ? draft.benchmarkRequirementId : null
  const exerciseRows = exerciseId
    ? ((await sql.query(
        `SELECT id::text AS id, name, is_active, measurement_kind, load_type,
                performance_type, analytics_load_type
         FROM exercise_definitions WHERE id = $1::uuid`,
        [exerciseId],
      )) as Array<{
        id: string
        name: string
        is_active: boolean
        measurement_kind: string
        load_type: string
        performance_type: string
        analytics_load_type: string
      }>)
    : []
  const supplementRows = supplementId
    ? ((await sql.query(
        `SELECT supplements.id::text AS id, supplements.name,
                (
                  SELECT events.status FROM supplement_status_events events
                  WHERE events.supplement_id = supplements.id
                  ORDER BY events.effective_date DESC, events.created_at DESC
                  LIMIT 1
                ) AS status
         FROM supplements WHERE supplements.id = $1::uuid`,
        [supplementId],
      )) as Array<{ id: string; name: string; status: string | null }>)
    : []
  const benchmarkRows = definitionId
    ? ((await sql.query(
        `SELECT benchmarks.id::text AS definition_id,
                benchmarks.protocol_id::text AS protocol_id,
                benchmarks.is_active,
                protocols.title,
                versions.id::text AS version_id,
                versions.protocol_id::text AS version_protocol_id,
                requirements.id::text AS requirement_id,
                requirements.protocol_version_id::text AS requirement_protocol_version_id,
                requirements.role,
                requirements.requirement_kind,
                requirements.selector,
                requirements.label
         FROM benchmark_definitions benchmarks
         JOIN lab_protocols protocols ON protocols.id = benchmarks.protocol_id
         LEFT JOIN lab_protocol_versions versions ON versions.id = $2::uuid
         LEFT JOIN lab_protocol_requirements requirements ON requirements.id = $3::uuid
         WHERE benchmarks.id = $1::uuid`,
        [definitionId, versionId, requirementId],
      )) as Array<Record<string, unknown>>)
    : []
  const exercise = exerciseRows[0]
  const supplement = supplementRows[0]
  const benchmarkRow = benchmarkRows[0]
  let benchmark: BenchmarkPin | null = null
  if (benchmarkRow) {
    const selectorRaw = benchmarkRow.selector
    const selector =
      selectorRaw && typeof selectorRaw === 'object' && !Array.isArray(selectorRaw)
        ? Object.fromEntries(Object.entries(selectorRaw as Record<string, unknown>).map(([key, value]) => [key, String(value)]))
        : typeof selectorRaw === 'string'
          ? (JSON.parse(selectorRaw) as Record<string, string>)
          : {}
    benchmark = {
      definitionId: String(benchmarkRow.definition_id),
      protocolVersionId: benchmarkRow.version_id ? String(benchmarkRow.version_id) : '',
      versionProtocolId: benchmarkRow.version_protocol_id ? String(benchmarkRow.version_protocol_id) : '',
      requirementId: benchmarkRow.requirement_id ? String(benchmarkRow.requirement_id) : '',
      protocolId: String(benchmarkRow.protocol_id),
      requirementProtocolVersionId: benchmarkRow.requirement_protocol_version_id ? String(benchmarkRow.requirement_protocol_version_id) : '',
      role: benchmarkRow.role ? String(benchmarkRow.role) : '',
      requirementKind: benchmarkRow.requirement_kind ? String(benchmarkRow.requirement_kind) : '',
      selector,
      label: benchmarkRow.label ? String(benchmarkRow.label) : '',
      title: benchmarkRow.title ? String(benchmarkRow.title) : '',
      active: benchmarkRow.is_active !== false,
    }
  }
  return {
    today,
    exercise: exercise ? {
      id: exercise.id,
      name: exercise.name,
      active: exercise.is_active !== false,
      measurementKind: exercise.measurement_kind,
      loadType: exercise.load_type,
      performanceType: exercise.performance_type,
      analyticsLoadType: exercise.analytics_load_type,
    } : null,
    supplement: supplement ? { id: supplement.id, name: supplement.name, active: supplement.status !== 'discontinued' } : null,
    benchmark,
  }
}

async function insertGoal(sql: Sql, draft: GoalDraft, sourceId: string, now: string): Promise<string> {
  const goalId = randomUUID()
  const versionId = randomUUID()
  await sql.transaction([
    sql.query(
      `INSERT INTO goals (
         id, goal_kind, status, started_on, body_metric_key, exercise_definition_id,
         benchmark_definition_id, benchmark_protocol_version_id, benchmark_requirement_id,
         supplement_id, training_min_distance_m, source_id, paused_at, completed_at, created_at, updated_at
       ) VALUES (
         $1::uuid, $2, 'active', $3::date, $4, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid,
         $10::numeric, $11::uuid, NULL, NULL, $12::timestamptz, $12::timestamptz
       )`,
      [
        goalId,
        draft.goalKind,
        draft.startedOn,
        draft.bodyMetricKey,
        draft.exerciseDefinitionId,
        draft.benchmarkDefinitionId,
        draft.benchmarkProtocolVersionId,
        draft.benchmarkRequirementId,
        draft.supplementId,
        draft.trainingMinDistanceM ?? null,
        sourceId,
        now,
      ],
    ),
    sql.query(
      `INSERT INTO goal_versions (
         id, goal_id, version, is_current, target_mode, target_min, target_max, target_unit,
         target_date, evaluation_window_days, notes, source_id, created_at
       ) VALUES (
         $1::uuid, $2::uuid, 1, true, $3, $4::numeric, $5::numeric, $6, $7::date, $8::integer, $9, $10::uuid, $11::timestamptz
       )`,
      [
        versionId,
        goalId,
        draft.targetMode,
        draft.targetMin,
        draft.targetMax,
        draft.targetUnit,
        draft.targetDate,
        draft.evaluationWindowDays,
        draft.notes,
        sourceId,
        now,
      ],
    ),
  ])
  return goalId
}

async function readGoalRows(sql: Sql, id?: string): Promise<GoalRow[]> {
  if (id) {
    return (await sql.query(`${GOAL_SELECT} WHERE goals.id = $1::uuid`, [id])) as GoalRow[]
  }
  return (await sql.query(`${GOAL_SELECT} WHERE goals.archived_at IS NULL ORDER BY goals.created_at DESC, goals.id`, [])) as GoalRow[]
}

async function readVersions(sql: Sql, goalId: string): Promise<VersionRow[]> {
  return (await sql.query(
    `SELECT id::text AS id, goal_id::text AS goal_id, version, is_current, target_mode,
            target_min::text AS target_min, target_max::text AS target_max, target_unit,
            target_date::text AS target_date, evaluation_window_days, notes, created_at::text AS created_at
     FROM goal_versions WHERE goal_id = $1::uuid ORDER BY version DESC`,
    [goalId],
  )) as VersionRow[]
}

function selectorContext(row: GoalRow): { archived: boolean; message: string | null } {
  if (
    (
      row.goal_kind === 'strength_e1rm' ||
      row.goal_kind === 'training_reps' ||
      row.goal_kind === 'training_duration' ||
      row.goal_kind === 'training_distance' ||
      row.goal_kind === 'training_pace' ||
      row.goal_kind === 'training_skill'
    ) &&
    row.exercise_active === false
  ) {
    return { archived: true, message: 'Underlying exercise is archived.' }
  }
  if (row.goal_kind === 'supplement_adherence' && row.supplement_status === 'discontinued') {
    return { archived: true, message: 'Underlying supplement is discontinued.' }
  }
  if (row.goal_kind === 'benchmark_result' && row.benchmark_active === false) {
    return { archived: true, message: 'Underlying benchmark is archived.' }
  }
  return { archived: false, message: null }
}

async function loadEvidence(
  sql: Sql,
  row: GoalRow,
  target: GoalTarget,
  asOf: string,
  timezone: string,
): Promise<GoalEvidence> {
  const empty: Omit<Parameters<typeof goalEvidence>[0], 'goalKind' | 'target' | 'asOf'> = {
    body: null,
    strength: null,
    benchmark: null,
    training: null,
    sessionDates: [] as string[],
    activityRows: [] as ActivityDailyRow[],
    proteinDays: [] as { date: string; protein: number | null; logged: boolean }[],
    sleepNights: [] as { date: string; minutes: number | null; analysisEligible: boolean; partial: boolean }[],
    adherence: null,
  }
  if (row.goal_kind === 'body_metric' && row.body_metric_key) {
    const metrics = (await sql.query(
      `SELECT metrics.value::text AS value, metrics.unit, sessions.measured_at::text AS measured_at,
              sessions.timezone
       FROM body_metrics metrics
       JOIN body_measurement_sessions sessions ON sessions.id = metrics.measurement_session_id
       WHERE metrics.metric_key = $1
       ORDER BY sessions.measured_at DESC
       LIMIT 1`,
      [row.body_metric_key],
    )) as Array<{ value: string; unit: string; measured_at: string; timezone: string | null }>
    const metric = metrics[0]
    if (metric) {
      empty.body = {
        value: Number(metric.value),
        unit: metric.unit,
        observedOn: calendarDateFromInstant(
          new Date(metric.measured_at),
          metric.timezone?.trim() || timezone,
        ),
      }
    }
  }
  if (row.goal_kind === 'strength_e1rm' && row.exercise_definition_id) {
    const exercises = (await sql.query(
      `SELECT id::text AS id, name, external_id, performance_type, analytics_load_type, analytics_rep_mode, measurement_kind, unilateral
       FROM exercise_definitions WHERE id = $1::uuid`,
      [row.exercise_definition_id],
    )) as Array<Record<string, unknown>>
    const exerciseRow = exercises[0]
    const sets = (await sql.query(
      `SELECT sets.id::text AS set_id, sessions.id::text AS session_id, session_exercises.id::text AS session_exercise_id,
              session_exercises.exercise_definition_id::text AS exercise_id, sessions.workout_date::text AS session_date,
              sessions.created_at::text AS session_created_at, session_exercises.position AS session_exercise_position,
              sets.set_number, sets.set_type, sets.load_state, sets.weight_kg::text AS weight_kg, sets.reps,
              sets.duration_sec, sets.left_reps, sets.right_reps, sets.left_duration_sec, sets.right_duration_sec
       FROM workout_sets sets
       JOIN workout_session_exercises session_exercises ON session_exercises.id = sets.workout_session_exercise_id
       JOIN workout_sessions sessions ON sessions.id = session_exercises.workout_session_id
       WHERE session_exercises.exercise_definition_id = $1::uuid
         AND sessions.session_type IN ('programmed', 'ad_hoc', 'experiment')
       ORDER BY sessions.workout_date, sessions.created_at, session_exercises.position, sets.set_number`,
      [row.exercise_definition_id],
    )) as Array<Record<string, unknown>>
    if (exerciseRow) {
      const exercise: ProgressExerciseDefinition = {
        id: String(exerciseRow.id),
        name: String(exerciseRow.name),
        externalId: exerciseRow.external_id == null ? null : String(exerciseRow.external_id),
        performanceType: exerciseRow.performance_type as ProgressExerciseDefinition['performanceType'],
        analyticsLoadType: exerciseRow.analytics_load_type as ProgressExerciseDefinition['analyticsLoadType'],
        analyticsRepMode: exerciseRow.analytics_rep_mode as ProgressExerciseDefinition['analyticsRepMode'],
        measurementKind: String(exerciseRow.measurement_kind),
        unilateral: exerciseRow.unilateral === true,
      }
      const grouped = new Map<string, CanonicalSetRecord[]>()
      for (const set of sets) {
        const record: CanonicalSetRecord = {
          setId: String(set.set_id),
          sessionId: String(set.session_id),
          sessionExerciseId: String(set.session_exercise_id),
          exerciseId: String(set.exercise_id),
          sessionDate: String(set.session_date),
          sessionCreatedAt: String(set.session_created_at),
          sessionExercisePosition: Number(set.session_exercise_position),
          setNumber: Number(set.set_number),
          setType: String(set.set_type),
          loadState: String(set.load_state),
          weightKg: numberOrNull(set.weight_kg),
          reps: numberOrNull(set.reps),
          durationSec: numberOrNull(set.duration_sec),
          leftReps: numberOrNull(set.left_reps),
          rightReps: numberOrNull(set.right_reps),
          leftDurationSec: numberOrNull(set.left_duration_sec),
          rightDurationSec: numberOrNull(set.right_duration_sec),
        }
        const bucket = grouped.get(record.sessionId) ?? []
        bucket.push(record)
        grouped.set(record.sessionId, bucket)
      }
      empty.strength = latestSessionE1rm([...grouped.values()], exercise)
    }
  }
  if (
    (
      row.goal_kind === 'training_reps' ||
      row.goal_kind === 'training_duration' ||
      row.goal_kind === 'training_distance' ||
      row.goal_kind === 'training_pace' ||
      row.goal_kind === 'training_skill'
    ) &&
    row.exercise_definition_id
  ) {
    const exerciseRows = (await sql.query(
      `SELECT id::text AS id, name, external_id, performance_type, analytics_load_type,
              analytics_rep_mode, measurement_kind, load_type, unilateral
       FROM exercise_definitions
       WHERE id = $1::uuid`,
      [row.exercise_definition_id],
    )) as Array<Record<string, unknown>>
    const exerciseRow = exerciseRows[0]
    if (exerciseRow) {
      const setRows = (await sql.query(
        `SELECT sets.id::text AS set_id, sessions.id::text AS session_id,
                session_exercises.id::text AS session_exercise_id,
                session_exercises.exercise_definition_id::text AS exercise_id,
                sessions.workout_date::text AS session_date,
                sessions.created_at::text AS session_created_at,
                session_exercises.position AS session_exercise_position,
                sets.set_number, sets.set_type, sets.load_state, sets.weight_kg::text AS weight_kg,
                sets.reps, sets.duration_sec, sets.left_reps, sets.right_reps,
                sets.left_duration_sec, sets.right_duration_sec,
                sets.distance_m::text AS distance_m, sets.completed
         FROM workout_sets sets
         JOIN workout_session_exercises session_exercises ON session_exercises.id = sets.workout_session_exercise_id
         JOIN workout_sessions sessions ON sessions.id = session_exercises.workout_session_id
         WHERE session_exercises.exercise_definition_id = $1::uuid
           AND sessions.session_type IN ('programmed', 'ad_hoc', 'experiment')
           AND sessions.workout_date <= $2::date
         ORDER BY sessions.workout_date, sessions.created_at, session_exercises.position, sets.set_number, sets.id`,
        [row.exercise_definition_id, asOf],
      )) as Array<Record<string, unknown>>
      const exercise = {
        id: String(exerciseRow.id),
        name: String(exerciseRow.name),
        externalId: exerciseRow.external_id == null ? null : String(exerciseRow.external_id),
        performanceType: exerciseRow.performance_type as ProgressExerciseDefinition['performanceType'],
        analyticsLoadType: exerciseRow.analytics_load_type as ProgressExerciseDefinition['analyticsLoadType'],
        analyticsRepMode: exerciseRow.analytics_rep_mode as ProgressExerciseDefinition['analyticsRepMode'],
        measurementKind: String(exerciseRow.measurement_kind),
        loadType: String(exerciseRow.load_type),
        unilateral: exerciseRow.unilateral === true,
      }
      const sets: CanonicalSetRecord[] = setRows.map((set) => ({
        setId: String(set.set_id),
        sessionId: String(set.session_id),
        sessionExerciseId: String(set.session_exercise_id),
        exerciseId: String(set.exercise_id),
        sessionDate: String(set.session_date),
        sessionCreatedAt: String(set.session_created_at),
        sessionExercisePosition: Number(set.session_exercise_position),
        setNumber: Number(set.set_number),
        setType: String(set.set_type),
        loadState: String(set.load_state),
        weightKg: numberOrNull(set.weight_kg),
        reps: numberOrNull(set.reps),
        durationSec: numberOrNull(set.duration_sec),
        leftReps: numberOrNull(set.left_reps),
        rightReps: numberOrNull(set.right_reps),
        leftDurationSec: numberOrNull(set.left_duration_sec),
        rightDurationSec: numberOrNull(set.right_duration_sec),
        distanceM: numberOrNull(set.distance_m),
        completed: set.completed == null ? null : set.completed === true,
      }))
      const observations = trainingPerformanceObservations(sets, [exercise])
      const kind = row.goal_kind === 'training_reps'
        ? 'reps'
        : row.goal_kind === 'training_duration'
          ? 'duration'
          : row.goal_kind === 'training_distance'
            ? 'distance'
            : row.goal_kind === 'training_pace'
              ? 'pace'
              : 'skill'
      const best = bestTrainingPerformance(observations, {
        exerciseId: row.exercise_definition_id,
        kind,
        minDistanceM: row.goal_kind === 'training_pace' ? numberOrNull(row.training_min_distance_m) : null,
      })
      if (best) {
        empty.training = {
          value: best.value,
          unit: best.unit,
          observedOn: best.date,
          sessionId: best.sourceSet.sessionId,
          setId: best.sourceSet.setId,
          exerciseId: best.exerciseId,
          reps: best.sourceSet.reps,
          durationSec: best.sourceSet.durationSec,
          distanceM: best.sourceSet.distanceM ?? null,
          completed: best.sourceSet.completed ?? null,
        }
      }
    }
  }
  if (row.goal_kind === 'benchmark_result' && row.benchmark_definition_id && row.benchmark_requirement_id && row.benchmark_protocol_version_id) {
    const values = (await sql.query(
      `SELECT result_values.value::text AS value, result_values.unit, results.result_date::text AS result_date
       FROM benchmark_result_values result_values
       JOIN benchmark_results results ON results.id = result_values.benchmark_result_id
       WHERE results.benchmark_definition_id = $1::uuid
         AND results.protocol_version_id = $2::uuid
         AND results.status = 'valid'
         AND result_values.requirement_id = $3::uuid
       ORDER BY results.result_date DESC, results.created_at DESC
       LIMIT 1`,
      [row.benchmark_definition_id, row.benchmark_protocol_version_id, row.benchmark_requirement_id],
    )) as Array<{ value: string; unit: string; result_date: string }>
    const value = values[0]
    if (value) {
      empty.benchmark = { value: Number(value.value), unit: value.unit, observedOn: value.result_date }
    }
  }
  if (row.goal_kind === 'training_frequency') {
    const sessions = (await sql.query(
      `SELECT workout_date::text AS workout_date FROM workout_sessions
       WHERE session_type IN ('programmed', 'ad_hoc', 'experiment')`,
      [],
    )) as Array<{ workout_date: string }>
    empty.sessionDates = sessions.map((session) => session.workout_date)
  }
  if (row.goal_kind === 'activity_steps') {
    const rows = (await sql.query(
      `SELECT summary_date::text AS date, steps_count::text AS steps_count
       FROM activity_daily_summaries
       WHERE timezone = $1`,
      [timezone],
    )) as Array<{ date: string; steps_count: string | null }>
    empty.activityRows = rows.map((item) => ({
      date: item.date,
      timezone,
      stepsCount: numberOrNull(item.steps_count),
      activeEnergyKcal: null,
      exerciseMinutes: null,
      walkingRunningDistanceM: null,
      restingHeartRateBpm: null,
    }))
  }
  if (row.goal_kind === 'nutrition_protein') {
    const rows = (await sql.query(
      `SELECT log_date::text AS date,
              bool_or(protein IS NULL) AS protein_unknown,
              SUM(protein)::text AS protein
       FROM nutrition_entries
       GROUP BY log_date`,
      [],
    )) as Array<{ date: string; protein_unknown: boolean; protein: string | null }>
    empty.proteinDays = rows.map((item) => ({
      date: item.date,
      logged: true,
      protein: item.protein_unknown ? null : numberOrNull(item.protein),
    }))
  }
  if (row.goal_kind === 'sleep_duration') {
    const rows = (await sql.query(
      `SELECT sleep_date::text AS date, total_sleep_minutes::text AS minutes, analysis_eligible, observation_status
       FROM sleep_nightly_summaries
       WHERE timezone = $1`,
      [timezone],
    )) as Array<{ date: string; minutes: string | null; analysis_eligible: boolean; observation_status: string }>
    empty.sleepNights = rows.map((item) => ({
      date: item.date,
      minutes: numberOrNull(item.minutes),
      analysisEligible: item.analysis_eligible === true,
      partial: item.observation_status === 'partial_observation',
    }))
  }
  if (row.goal_kind === 'supplement_adherence' && row.supplement_id) {
    const schedules = (await sql.query(
      `SELECT id::text AS id, supplement_id::text AS supplement_id, slot_label, dose_amount::text AS dose_amount,
              dose_unit, weekday_mask, effective_from::text AS effective_from, effective_through::text AS effective_through, sort_order
       FROM supplement_schedules WHERE supplement_id = $1::uuid`,
      [row.supplement_id],
    )) as Array<Record<string, unknown>>
    const events = (await sql.query(
      `SELECT effective_date::text AS effective_date, status FROM supplement_status_events WHERE supplement_id = $1::uuid`,
      [row.supplement_id],
    )) as StatusEventWindow[]
    const adherence = (await sql.query(
      `SELECT adherence.schedule_id::text AS schedule_id, adherence.scheduled_date::text AS scheduled_date, adherence.status,
              adherence.actual_dose_amount::text AS actual_dose_amount, adherence.actual_dose_unit
       FROM supplement_adherence adherence
       JOIN supplement_schedules schedules ON schedules.id = adherence.schedule_id
       WHERE schedules.supplement_id = $1::uuid`,
      [row.supplement_id],
    )) as Array<Record<string, unknown>>
    empty.adherence = {
      schedules: schedules.map((item) => ({
        id: String(item.id),
        supplementId: String(item.supplement_id),
        slotLabel: item.slot_label == null ? null : String(item.slot_label),
        doseAmount: Number(item.dose_amount),
        doseUnit: String(item.dose_unit),
        weekdayMask: Number(item.weekday_mask),
        effectiveFrom: String(item.effective_from),
        effectiveThrough: item.effective_through == null ? null : String(item.effective_through),
        sortOrder: Number(item.sort_order),
      })) satisfies ScheduleWindow[],
      events,
      rows: adherence.map((item) => ({
        scheduleId: String(item.schedule_id),
        scheduledDate: String(item.scheduled_date),
        status: item.status === 'skipped' ? 'skipped' : 'taken',
        actualDoseAmount: numberOrNull(item.actual_dose_amount),
        actualDoseUnit: item.actual_dose_unit == null ? null : String(item.actual_dose_unit),
      })) satisfies AdherenceWindow[],
    }
  }
  return goalEvidence({
    goalKind: row.goal_kind,
    target,
    asOf,
    ...empty,
  })
}

function presentGoal(
  row: GoalRow,
  versions: VersionRow[],
  evidence: GoalEvidence,
  overlapWarning: string | null,
  derived: { goalStatus: ReturnType<typeof evaluateGoalStatus>; projection: ReturnType<typeof projectGoal> | null },
) {
  const current = versions.find((version) => version.is_current) ?? versions[0]
  if (!current) {
    throw new HttpError(500, 'Goal is missing a current version')
  }
  const name = goalDisplayName({
    goalKind: row.goal_kind,
    bodyMetricKey: row.body_metric_key,
    exerciseName: row.exercise_name,
    benchmarkLabel: row.benchmark_label ?? row.benchmark_title,
    supplementName: row.supplement_name,
  })
  return {
    id: row.id,
    goalKind: row.goal_kind,
    status: row.status,
    startedOn: row.started_on,
    pausedAt: row.paused_at,
    completedAt: row.completed_at,
    displayName: name,
    selector: selectorFrom(row),
    selectorContext: selectorContext(row),
    currentVersion: versionView(current),
    versions: versions.map(versionView),
    evidence: {
      ...evidence,
      label: evidence.current == null && row.goal_kind !== 'training_frequency' ? 'No observation yet' : null,
    },
    overlapWarning,
    goalStatus: derived.goalStatus,
    projection: derived.projection,
  }
}

async function overlapWarning(sql: Sql, selector: GoalSelector, exceptId?: string): Promise<string | null> {
  const rows = await readGoalRows(sql)
  const match = rows.some(
    (row) =>
      row.status === 'active' &&
      row.id !== exceptId &&
      sameGoalSelector(selectorFrom(row), selector),
  )
  return match ? 'Another active goal already uses this metric.' : null
}

async function goalById(sql: Sql, id: string, asOf: string, timezone: string) {
  const rows = await readGoalRows(sql, id)
  const row = rows[0]
  if (!row) {
    return null
  }
  const versions = await readVersions(sql, id)
  const current = versions.find((version) => version.is_current)
  if (!current) {
    throw new HttpError(500, 'Goal is missing a current version')
  }
  const target = targetFrom(current)
  const evidence = await loadEvidence(sql, row, target, asOf, timezone)
  const warning = row.status === 'active' ? await overlapWarning(sql, selectorFrom(row), row.id) : null
  const derived = await deriveGoalStatus(sql, row, current, evidence, asOf)
  return presentGoal(row, versions, evidence, warning, derived)
}

export async function listGoals() {
  const [sql, timezone, asOf] = await Promise.all([
    getSql(),
    healthCalendarTimeZone(),
    currentHealthDate(),
  ])
  const rows = await readGoalRows(sql)
  const goals = []
  for (const row of rows) {
    const versions = await readVersions(sql, row.id)
    const current = versions.find((version) => version.is_current)
    if (!current) {
      continue
    }
    const evidence = await loadEvidence(sql, row, targetFrom(current), asOf, timezone)
    const derived = await deriveGoalStatus(sql, row, current, evidence, asOf)
    goals.push(presentGoal(row, versions, evidence, null, { goalStatus: derived.goalStatus, projection: null }))
  }
  return { goals, asOf, catalog: await loadCatalog(sql) }
}

export async function listGoalAskSnapshots(asOf: string) {
  const [sql, timezone] = await Promise.all([getSql(), healthCalendarTimeZone()])
  const rows = await readGoalRows(sql)
  const goals = []
  for (const row of rows) {
    if (row.started_on > asOf) {
      continue
    }
    const versions = await readVersions(sql, row.id)
    const current = versions.find((version) => version.is_current)
    if (!current) {
      continue
    }
    const target = targetFrom(current)
    const evidence = await loadEvidence(sql, row, target, asOf, timezone)
    const derived = await deriveGoalStatus(sql, row, current, evidence, asOf)
    goals.push({
      id: row.id,
      kind: row.goal_kind,
      lifecycle: row.status,
      label: goalDisplayName({
        goalKind: row.goal_kind,
        bodyMetricKey: row.body_metric_key,
        exerciseName: row.exercise_name,
        benchmarkLabel: row.benchmark_label ?? row.benchmark_title,
        supplementName: row.supplement_name,
      }),
      targetText: formatGoalTarget(target),
      targetState: derived.goalStatus.targetState,
      deadlineState: derived.goalStatus.deadlineState,
      projectionState: derived.projection?.state ?? null,
      projectionReason: derived.projection?.reason ?? null,
    })
  }
  return goals
}

async function loadCatalog(sql: Sql) {
  const metrics = (await import('../../src/domain/body-manual.js')).MANUAL_BODY_METRICS.map((item) => ({
    key: item.key,
    label: item.key === 'weight' ? 'Bodyweight' : item.family === 'circumference' ? `${item.label} circumference` : item.label,
    unit: item.family === 'mass' ? 'lb' : item.family === 'circumference' ? 'in' : '%',
  }))
  const exercises = (await sql.query(
    `SELECT id::text AS id, name, is_active, measurement_kind, load_type,
            performance_type, analytics_load_type
     FROM exercise_definitions WHERE is_active ORDER BY name`,
    [],
  )) as Array<{
    id: string
    name: string
    is_active: boolean
    measurement_kind: string
    load_type: string
    performance_type: string
    analytics_load_type: string
  }>
  const supplements = (await sql.query(
    `SELECT id::text AS id, name FROM supplements ORDER BY sort_order, name`,
    [],
  )) as Array<{ id: string; name: string }>
  const outcomes = (await sql.query(
    `SELECT benchmarks.id::text AS definition_id, benchmarks.is_active, protocols.title,
            versions.id::text AS version_id, versions.version,
            requirements.id::text AS requirement_id, requirements.label, requirements.role, requirements.requirement_kind, requirements.selector
     FROM benchmark_definitions benchmarks
     JOIN lab_protocols protocols ON protocols.id = benchmarks.protocol_id
     JOIN lab_protocol_versions versions ON versions.protocol_id = protocols.id
     JOIN lab_protocol_requirements requirements ON requirements.protocol_version_id = versions.id
     WHERE requirements.role IN ('primary_outcome', 'secondary_outcome')
     ORDER BY protocols.title, versions.version, requirements.position`,
    [],
  )) as Array<Record<string, unknown>>
  return { bodyMetrics: metrics, exercises, supplements, benchmarkOutcomes: outcomes }
}

export async function getGoal(id: string) {
  const [sql, timezone, today] = await Promise.all([
    getSql(),
    healthCalendarTimeZone(),
    currentHealthDate(),
  ])
  const goal = await goalById(sql, id, today, timezone)
  if (!goal) {
    throw new HttpError(404, 'Goal not found')
  }
  return goal
}

export async function createGoal(body: unknown) {
  const [today, timezone] = await Promise.all([currentHealthDate(), healthCalendarTimeZone()])
  const record = body != null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const sql = await getSql()
  const context = await loadContext(sql, record, today)
  const draft = validateGoalCreate(body, context)
  if ('error' in draft) {
    throw new HttpError(400, draft.error)
  }
  const sourceId = await manualSourceId(sql)
  const id = await insertGoal(sql, draft, sourceId, new Date().toISOString())
  const goal = await goalById(sql, id, today, timezone)
  if (!goal) {
    throw new HttpError(500, 'Goal could not be read after save')
  }
  const warning = await overlapWarning(sql, draft, id)
  return { ...goal, overlapWarning: warning }
}

export async function reviseGoal(id: string, body: unknown) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Revised target details are required.')
  }
  const sourceVersionId = (body as { sourceVersionId?: unknown }).sourceVersionId
  if (typeof sourceVersionId !== 'string') {
    throw new HttpError(400, 'The current goal version is required.')
  }
  const [sql, today, timezone] = await Promise.all([
    getSql(),
    currentHealthDate(),
    healthCalendarTimeZone(),
  ])
  const existing = await goalById(sql, id, today, timezone)
  if (!existing) {
    throw new HttpError(404, 'Goal not found')
  }
  if (existing.currentVersion.id !== sourceVersionId) {
    throw new HttpError(409, 'Goal changed since editing began.', undefined, STALE)
  }
  const revised = validateGoalRevision(
    { ...existing.currentVersion, startedOn: existing.startedOn },
    body,
    { today, goalKind: existing.goalKind, unit: existing.currentVersion.targetUnit },
  )
  if ('error' in revised) {
    throw new HttpError(400, revised.error)
  }
  if (sameGoalTarget(existing.currentVersion, revised)) {
    return existing
  }
  const versionId = randomUUID()
  const now = new Date().toISOString()
  const sourceId = await manualSourceId(sql)
  try {
    const results = (await sql.transaction([
      sql.query(
        `SELECT goals.id::text AS id
         FROM goals
         JOIN goal_versions ON goal_versions.goal_id = goals.id AND goal_versions.is_current
         WHERE goals.id = $1::uuid
         FOR UPDATE OF goals, goal_versions`,
        [id],
      ),
      sql.query(
        `UPDATE goal_versions SET is_current = false
         WHERE goal_id = $1::uuid AND id = $2::uuid AND is_current
         RETURNING version`,
        [id, sourceVersionId],
      ),
      sql.query(
        `INSERT INTO goal_versions (
           id, goal_id, version, is_current, target_mode, target_min, target_max, target_unit,
           target_date, evaluation_window_days, notes, source_id, created_at
         )
         SELECT $2::uuid, $1::uuid, version + 1, true, $4, $5::numeric, $6::numeric, $7, $8::date, $9::integer, $10, $11::uuid, $12::timestamptz
         FROM goal_versions
         WHERE id = $3::uuid AND goal_id = $1::uuid AND is_current = false
           AND NOT EXISTS (SELECT 1 FROM goal_versions WHERE goal_id = $1::uuid AND is_current)
         RETURNING id::text AS id, version`,
        [
          id,
          versionId,
          sourceVersionId,
          revised.targetMode,
          revised.targetMin,
          revised.targetMax,
          revised.targetUnit,
          revised.targetDate,
          revised.evaluationWindowDays,
          revised.notes,
          sourceId,
          now,
        ],
      ),
      sql.query(
        `UPDATE goals SET updated_at = $2::timestamptz
         WHERE id = $1::uuid AND EXISTS (SELECT 1 FROM goal_versions WHERE id = $3::uuid)
         RETURNING id::text AS id`,
        [id, now, versionId],
      ),
      sql.query(
        `SELECT CASE
           WHEN NOT EXISTS (SELECT 1 FROM goal_versions WHERE id = $1::uuid) THEN 1 / 0
           ELSE 1
         END AS version_guard`,
        [versionId],
      ),
    ])) as [unknown, Array<{ version?: number }>, Array<{ id?: string }>, Array<{ id?: string }>, unknown]
    if (!results[2]?.[0]?.id) {
      throw new HttpError(409, 'Goal changed since editing began.', undefined, STALE)
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }
    const message = error instanceof Error ? error.message : ''
    if (message.includes('division by zero') || message.includes('22012')) {
      throw new HttpError(409, 'Goal changed since editing began.', undefined, STALE)
    }
    throw error
  }
  return getGoal(id)
}

export async function archiveGoal(id: string) {
  const sql = await getSql()
  const references = (await sql.query(
    `SELECT experiment_id::text AS experiment_id
     FROM experiment_goals
     WHERE goal_id = $1::uuid
     LIMIT 1`,
    [id],
  )) as Array<{ experiment_id?: string }>

  if (references.length > 0) {
    const rows = (await sql.query(
      `UPDATE goals
       SET archived_at = COALESCE(archived_at, now()), updated_at = now()
       WHERE id = $1::uuid
       RETURNING id::text AS id`,
      [id],
    )) as Array<{ id?: string }>
    if (!rows[0]?.id) {
      throw new HttpError(404, 'Goal not found')
    }
    return { ok: true as const, disposition: 'archived' as const }
  }

  const deleted = (await sql.transaction([
    sql.query(`DELETE FROM goal_versions WHERE goal_id = $1::uuid`, [id]),
    sql.query(`DELETE FROM goals WHERE id = $1::uuid RETURNING id::text AS id`, [id]),
  ])) as [unknown, Array<{ id?: string }>]
  if (!deleted[1]?.[0]?.id) {
    throw new HttpError(404, 'Goal not found')
  }
  return { ok: true as const, disposition: 'deleted' as const }
}

export async function changeGoalLifecycle(id: string, action: GoalLifecycleAction) {
  const sql = await getSql()
  const rows = await readGoalRows(sql, id)
  const row = rows[0]
  if (!row) {
    throw new HttpError(404, 'Goal not found')
  }
  const next = nextGoalLifecycle(row.status, action, new Date().toISOString())
  if ('error' in next) {
    throw new HttpError(409, next.error)
  }
  const updated = (await sql.query(
    `UPDATE goals
     SET status = $2, paused_at = $3::timestamptz, completed_at = $4::timestamptz, updated_at = $5::timestamptz
     WHERE id = $1::uuid AND status = $6
     RETURNING id::text AS id`,
    [id, next.status, next.pausedAt, next.completedAt, new Date().toISOString(), row.status],
  )) as Array<{ id?: string }>
  if (!updated[0]?.id) {
    throw new HttpError(409, 'Goal changed since editing began.', undefined, STALE)
  }
  return getGoal(id)
}

export async function readGoalProjection(id: string, asOf: string) {
  const sql = await getSql()
  const rows = await readGoalRows(sql, id)
  const row = rows[0]
  if (!row) {
    throw new HttpError(404, 'Goal not found')
  }
  const versions = await readVersions(sql, id)
  const current = versions.find((version) => version.is_current)
  if (!current) {
    throw new HttpError(500, 'Goal is missing a current version')
  }
  const target = targetFrom(current)
  const loaded = await loadProjectionSeries(sql, row, target.targetUnit, asOf)
  return projectGoal({
    goalId: row.id,
    goalVersionId: current.id,
    status: row.status,
    goalKind: row.goal_kind,
    target,
    asOf,
    current: loaded.current,
    series: loaded.series,
  })
}

async function loadProjectionSeries(
  sql: Sql,
  row: GoalRow,
  goalUnit: string,
  asOf: string,
): Promise<{ current: { value: number; observedOn: string } | null; series: Array<{ date: string; value: number }> }> {
  if (row.goal_kind === 'body_metric' && row.body_metric_key) {
    const metrics = (await sql.query(
      `SELECT metrics.id::text AS measurement_id,
              metrics.measurement_session_id::text AS measurement_session_id,
              metrics.metric_key,
              metrics.value::text AS value,
              metrics.unit,
              metrics.value_kind,
              sessions.measured_at::text AS measured_at,
              sessions.timezone
       FROM body_metrics metrics
       JOIN body_measurement_sessions sessions ON sessions.id = metrics.measurement_session_id
       WHERE metrics.metric_key = $1`,
      [row.body_metric_key],
    )) as Array<Record<string, unknown>>
    const observations: BodyObservation[] = metrics.map((metric) => {
      const measuredAt = new Date(String(metric.measured_at))
      const timezone = metric.timezone == null ? null : String(metric.timezone)
      return {
        measurementId: String(metric.measurement_id),
        measurementSessionId: String(metric.measurement_session_id),
        key: String(metric.metric_key),
        value: Number(metric.value),
        unit: String(metric.unit),
        valueKind: String(metric.value_kind),
        measuredAt: measuredAt.toISOString(),
        timezone,
        calendarDate: calendarDateFromInstant(measuredAt, timezone),
      }
    })
    return bodyGoalSeries(observations, row.body_metric_key, goalUnit, asOf)
  }
  if (row.goal_kind === 'strength_e1rm' && row.exercise_definition_id) {
    const exercises = (await sql.query(
      `SELECT id::text AS id, name, external_id, performance_type, analytics_load_type, analytics_rep_mode, measurement_kind, unilateral
       FROM exercise_definitions WHERE id = $1::uuid`,
      [row.exercise_definition_id],
    )) as Array<Record<string, unknown>>
    const exerciseRow = exercises[0]
    if (!exerciseRow) {
      return { current: null, series: [] }
    }
    const sets = (await sql.query(
      `SELECT sets.id::text AS set_id, sessions.id::text AS session_id, session_exercises.id::text AS session_exercise_id,
              session_exercises.exercise_definition_id::text AS exercise_id, sessions.workout_date::text AS session_date,
              sessions.created_at::text AS session_created_at, session_exercises.position AS session_exercise_position,
              sets.set_number, sets.set_type, sets.load_state, sets.weight_kg::text AS weight_kg, sets.reps,
              sets.duration_sec, sets.left_reps, sets.right_reps, sets.left_duration_sec, sets.right_duration_sec
       FROM workout_sets sets
       JOIN workout_session_exercises session_exercises ON session_exercises.id = sets.workout_session_exercise_id
       JOIN workout_sessions sessions ON sessions.id = session_exercises.workout_session_id
       WHERE session_exercises.exercise_definition_id = $1::uuid
         AND sessions.session_type IN ('programmed', 'ad_hoc', 'experiment')
       ORDER BY sessions.workout_date, sessions.created_at, session_exercises.position, sets.set_number`,
      [row.exercise_definition_id],
    )) as Array<Record<string, unknown>>
    const exercise: ProgressExerciseDefinition = {
      id: String(exerciseRow.id),
      name: String(exerciseRow.name),
      externalId: exerciseRow.external_id == null ? null : String(exerciseRow.external_id),
      performanceType: exerciseRow.performance_type as ProgressExerciseDefinition['performanceType'],
      analyticsLoadType: exerciseRow.analytics_load_type as ProgressExerciseDefinition['analyticsLoadType'],
      analyticsRepMode: exerciseRow.analytics_rep_mode as ProgressExerciseDefinition['analyticsRepMode'],
      measurementKind: String(exerciseRow.measurement_kind),
      unilateral: exerciseRow.unilateral === true,
    }
    const records: CanonicalSetRecord[] = sets.map((set) => ({
      setId: String(set.set_id),
      sessionId: String(set.session_id),
      sessionExerciseId: String(set.session_exercise_id),
      exerciseId: String(set.exercise_id),
      sessionDate: String(set.session_date),
      sessionCreatedAt: String(set.session_created_at),
      sessionExercisePosition: Number(set.session_exercise_position),
      setNumber: Number(set.set_number),
      setType: String(set.set_type),
      loadState: String(set.load_state),
      weightKg: numberOrNull(set.weight_kg),
      reps: numberOrNull(set.reps),
      durationSec: numberOrNull(set.duration_sec),
      leftReps: numberOrNull(set.left_reps),
      rightReps: numberOrNull(set.right_reps),
      leftDurationSec: numberOrNull(set.left_duration_sec),
      rightDurationSec: numberOrNull(set.right_duration_sec),
    }))
    return strengthGoalSeries(records, exercise, asOf)
  }
  return { current: null, series: [] }
}

async function deriveGoalStatus(sql: Sql, row: GoalRow, current: VersionRow, evidence: GoalEvidence, asOf: string) {
  const target = targetFrom(current)
  const loaded = await loadProjectionSeries(sql, row, target.targetUnit, asOf)
  const projection = projectGoal({
    goalId: row.id,
    goalVersionId: current.id,
    status: row.status,
    goalKind: row.goal_kind,
    target,
    asOf,
    current: loaded.current,
    series: loaded.series,
  })
  const goalStatus = evaluateGoalStatus({
    goalId: row.id,
    goalVersionId: current.id,
    goalKind: row.goal_kind,
    lifecycle: row.status,
    displayName: goalDisplayName({
      goalKind: row.goal_kind,
      bodyMetricKey: row.body_metric_key,
      exerciseName: row.exercise_name,
      benchmarkLabel: row.benchmark_label ?? row.benchmark_title,
      supplementName: row.supplement_name,
    }),
    target,
    evidence,
    projection,
    asOf,
  })
  return { goalStatus, projection }
}

export async function goalAttentionForToday(
  asOf: string,
  cadence: { configs: readonly CadenceConfig[]; observations: readonly CadenceObservation[] },
  retests: readonly BenchmarkRetestView[],
): Promise<GoalAttentionItem[]> {
  const [sql, timezone] = await Promise.all([getSql(), healthCalendarTimeZone()])
  const rows = await readGoalRows(sql)
  const items: GoalAttentionItem[] = []
  for (const row of rows) {
    if (row.status !== 'active') {
      continue
    }
    const versions = await readVersions(sql, row.id)
    const current = versions.find((version) => version.is_current)
    if (!current) {
      continue
    }
    const evidence = await loadEvidence(sql, row, targetFrom(current), asOf, timezone)
    const derived = await deriveGoalStatus(sql, row, current, evidence, asOf)
    items.push(
      ...goalAttentionCandidates({
        goalId: row.id,
        goalVersionId: current.id,
        goalKind: row.goal_kind,
        lifecycle: row.status,
        displayName: goalDisplayName({
          goalKind: row.goal_kind,
          bodyMetricKey: row.body_metric_key,
          exerciseName: row.exercise_name,
          benchmarkLabel: row.benchmark_label ?? row.benchmark_title,
          supplementName: row.supplement_name,
        }),
        target: targetFrom(current),
        evidence,
        projection: derived.projection,
        asOf,
        bodyMetricKey: row.body_metric_key,
        benchmarkDefinitionId: row.benchmark_definition_id,
        benchmarkProtocolVersionId: row.benchmark_protocol_version_id,
        cadence,
        retests,
      }),
    )
  }
  return selectGoalAttention(items)
}
