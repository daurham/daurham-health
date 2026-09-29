import { randomUUID } from 'node:crypto'
import {
  COACH_RULE_VERSION,
  coachPeriodFingerprint,
  coachSelfReportSchema,
  coachTrainingLogSchema,
  coachWeek,
  evidenceLabel,
  generalDailyCandidates,
  manualRuleByKey,
  rankCoachCandidates,
  type CoachCandidate,
  type CoachEvidenceKind,
  type CoachProgress,
  type CoachState,
  type CoachTaskKind,
  type CoachTaskStatus,
  type CoachTaskView,
  type CoachVerificationMode,
  type RecentCoachRule,
} from '../../src/domain/coach.js'
import { bodyReminderCopy, measureHref, selectTodayBodyReminder } from '../../src/domain/body-cadence.js'
import { healthCalendarDateFromNow } from '../../src/domain/time.js'
import { loadCadenceEvidence } from '../body/cadence-service.js'
import { getDailyContext } from '../context/service.js'
import { getSql, type Sql } from '../db.js'
import { listGoals } from '../goals/service.js'
import { HttpError } from '../http.js'
import { ensureOwnerExercise } from '../training/owner-exercises.js'
import {
  buildSessionInsertQueries,
  parseManualWorkoutRequest,
  prepareManualSession,
} from '../training/service.js'

type CoachTaskRow = {
  id: string
  task_kind: CoachTaskKind
  rule_key: string
  rule_version: number | string
  domain: string
  title: string
  detail: string
  starts_on: string
  expires_on: string
  period_fingerprint: string
  goal_id: string | null
  verification_mode: CoachVerificationMode
  action_kind: 'open' | 'log_training' | 'log_self_report'
  action_href: string | null
  target_value: string | number | null
  target_unit: string | null
  baseline_value: string | number | null
  difficulty: 'routine' | 'standard' | 'weekly'
  reward_band: 'routine' | 'standard' | 'weekly'
  status: CoachTaskStatus
  completed_at: string | Date | null
  closed_at: string | Date | null
  metadata: Record<string, unknown> | null
  created_at: string | Date
  updated_at: string | Date
}

type CompletionEvidence = {
  evidenceKind: Exclude<CoachEvidenceKind, 'none' | 'owner_self_report'>
  sourceType: string
  sourceId: string
  evidence: Record<string, unknown>
}

const TASK_COLUMNS = `
  id::text AS id,
  task_kind,
  rule_key,
  rule_version,
  domain,
  title,
  detail,
  starts_on::text AS starts_on,
  expires_on::text AS expires_on,
  period_fingerprint,
  goal_id::text AS goal_id,
  verification_mode,
  action_kind,
  action_href,
  target_value::text AS target_value,
  target_unit,
  baseline_value::text AS baseline_value,
  difficulty,
  reward_band,
  status,
  completed_at,
  closed_at,
  metadata,
  created_at,
  updated_at
`

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function instantOrNull(value: Date | string | null): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function metadataOf(row: CoachTaskRow): Record<string, unknown> {
  return row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}
}

function completionRule(row: CoachTaskRow): string | null {
  const value = metadataOf(row).completionRule
  return typeof value === 'string' ? value : null
}

function stringMeta(row: CoachTaskRow, key: string): string | null {
  const value = metadataOf(row)[key]
  return typeof value === 'string' && value.trim() ? value : null
}

async function loadTask(sql: Sql, id: string): Promise<CoachTaskRow | null> {
  const rows = (await sql.query(
    `SELECT ${TASK_COLUMNS} FROM coach_tasks WHERE id = $1::uuid LIMIT 1`,
    [id],
  )) as CoachTaskRow[]
  return rows[0] ?? null
}

async function loadTaskForPeriod(sql: Sql, kind: CoachTaskKind, startsOn: string): Promise<CoachTaskRow | null> {
  const rows = (await sql.query(
    `SELECT ${TASK_COLUMNS}
       FROM coach_tasks
      WHERE task_kind = $1 AND starts_on = $2::date
      LIMIT 1`,
    [kind, startsOn],
  )) as CoachTaskRow[]
  return rows[0] ?? null
}

async function recentRules(sql: Sql, today: string): Promise<RecentCoachRule[]> {
  const rows = (await sql.query(
    `SELECT rule_key, starts_on::text AS starts_on
       FROM coach_tasks
      WHERE task_kind = 'daily_quest'
        AND starts_on >= ($1::date - interval '14 days')
        AND starts_on < $1::date
      ORDER BY starts_on DESC, id`,
    [today],
  )) as Array<{ rule_key: string; starts_on: string }>
  return rows.map((row) => ({ ruleKey: row.rule_key, startsOn: row.starts_on }))
}

async function latestEvidenceKind(sql: Sql, taskId: string): Promise<CoachEvidenceKind | null> {
  const rows = (await sql.query(
    `SELECT evidence_kind
       FROM coach_task_events
      WHERE task_id = $1::uuid AND event_kind = 'completed'
      ORDER BY occurred_at DESC, id DESC
      LIMIT 1`,
    [taskId],
  )) as Array<{ evidence_kind: CoachEvidenceKind }>
  return rows[0]?.evidence_kind ?? null
}

async function appendEvent(
  sql: Sql,
  input: {
    taskId: string
    eventKind: 'offered' | 'completed' | 'passed' | 'expired'
    evidenceKind: CoachEvidenceKind
    sourceType?: string | null
    sourceId?: string | null
    evidence?: Record<string, unknown>
    idempotencyKey: string
  },
) {
  await sql.query(
    `INSERT INTO coach_task_events (
       id, task_id, event_kind, evidence_kind, source_type, source_id, evidence, idempotency_key
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8
     )
     ON CONFLICT (task_id, idempotency_key) DO NOTHING`,
    [
      randomUUID(),
      input.taskId,
      input.eventKind,
      input.evidenceKind,
      input.sourceType ?? null,
      input.sourceId ?? null,
      JSON.stringify(input.evidence ?? {}),
      input.idempotencyKey,
    ],
  )
}

function goalTarget(goal: {
  currentVersion: { targetMin: number | null; targetMax: number | null; targetMode: string }
}): number | null {
  if (goal.currentVersion.targetMode === 'at_least' || goal.currentVersion.targetMode === 'range') {
    return goal.currentVersion.targetMin
  }
  return goal.currentVersion.targetMax
}

async function candidateInputs(date: string) {
  const [goalResult, cadence, context] = await Promise.all([
    listGoals(),
    loadCadenceEvidence(),
    getDailyContext(date),
  ])
  return { goals: goalResult.goals, cadence, context }
}

async function weeklyCandidates(date: string): Promise<CoachCandidate[]> {
  const { start, end } = coachWeek(date)
  const { goals, cadence } = await candidateInputs(date)
  const due = selectTodayBodyReminder(cadence.configs, cadence.observations, date)
  const candidates: CoachCandidate[] = []

  for (const goal of goals) {
    if (goal.status !== 'active') continue
    const target = goalTarget(goal)
    if (target == null || target <= 0) continue

    if (goal.goalKind === 'training_frequency') {
      candidates.push({
        taskKind: 'weekly_focus',
        ruleKey: `goal:training-frequency:${goal.id}`,
        ruleVersion: COACH_RULE_VERSION,
        domain: 'training',
        title: `Complete ${Math.round(target)} training sessions this week`,
        detail: 'Programmed, ad-hoc, and experiment sessions all count.',
        startsOn: start,
        expiresOn: end,
        goalId: goal.id,
        verificationMode: 'canonical',
        actionKind: 'open',
        actionHref: '/training',
        targetValue: target,
        targetUnit: 'sessions',
        baselineValue: null,
        difficulty: 'weekly',
        rewardBand: 'weekly',
        metadata: { completionRule: 'training_week_count' },
        score: 140,
        urgent: goal.goalStatus.deadlineState === 'due_today' || goal.goalStatus.deadlineState === 'passed_unmet',
      })
    }

    if (goal.goalKind === 'activity_steps') {
      candidates.push({
        taskKind: 'weekly_focus',
        ruleKey: `goal:activity-steps:${goal.id}`,
        ruleVersion: COACH_RULE_VERSION,
        domain: 'activity',
        title: `Keep your step average at ${Math.round(target).toLocaleString('en-US')} this week`,
        detail: 'Health uses completed Activity days and finalizes this focus after the week closes.',
        startsOn: start,
        expiresOn: end,
        goalId: goal.id,
        verificationMode: 'canonical',
        actionKind: 'open',
        actionHref: '/progress/activity',
        targetValue: target,
        targetUnit: 'steps/day',
        baselineValue: null,
        difficulty: 'weekly',
        rewardBand: 'weekly',
        metadata: { completionRule: 'activity_week_average' },
        score: 125,
        urgent: false,
      })
    }

    if (goal.goalKind === 'nutrition_protein') {
      candidates.push({
        taskKind: 'weekly_focus',
        ruleKey: `goal:nutrition-protein:${goal.id}`,
        ruleVersion: COACH_RULE_VERSION,
        domain: 'nutrition',
        title: `Keep protein at ${Math.round(target)} g/day this week`,
        detail: 'Health uses logged days with known protein and finalizes this focus after the week closes.',
        startsOn: start,
        expiresOn: end,
        goalId: goal.id,
        verificationMode: 'canonical',
        actionKind: 'open',
        actionHref: '/nutrition',
        targetValue: target,
        targetUnit: 'g/day',
        baselineValue: null,
        difficulty: 'weekly',
        rewardBand: 'weekly',
        metadata: { completionRule: 'protein_week_average' },
        score: 120,
        urgent: false,
      })
    }
  }

  if (due) {
    const copy = bodyReminderCopy(due)
    candidates.push({
      taskKind: 'weekly_focus',
      ruleKey: `body-cadence:${due.metricKey}`,
      ruleVersion: COACH_RULE_VERSION,
      domain: 'body',
      title: copy.title,
      detail: copy.detail,
      startsOn: start,
      expiresOn: end,
      goalId: goals.find((goal) => goal.status === 'active' && goal.goalKind === 'body_metric' && goal.selector?.bodyMetricKey === due.metricKey)?.id ?? null,
      verificationMode: 'canonical',
      actionKind: 'open',
      actionHref: measureHref(due.metricKey),
      targetValue: 1,
      targetUnit: 'measurement',
      baselineValue: null,
      difficulty: 'weekly',
      rewardBand: 'weekly',
      metadata: {
        completionRule: 'body_metric',
        metricKey: due.metricKey,
        baselineMeasuredDate: due.lastMeasuredDate,
      },
      score: due.status === 'stale' ? 135 : 115,
      urgent: due.status === 'stale',
    })
  }

  return candidates
}

async function dailyCandidates(date: string): Promise<CoachCandidate[]> {
  const { goals, cadence, context } = await candidateInputs(date)
  const due = selectTodayBodyReminder(cadence.configs, cadence.observations, date)
  const candidates: CoachCandidate[] = []

  for (const goal of goals) {
    if (goal.status !== 'active') continue
    const target = goalTarget(goal)
    if (target == null || target <= 0) continue
    const urgent = goal.goalStatus.deadlineState === 'due_today' || goal.goalStatus.deadlineState === 'passed_unmet'

    if (goal.goalKind === 'training_frequency') {
      candidates.push({
        taskKind: 'daily_quest',
        ruleKey: `goal:training-session:${goal.id}`,
        ruleVersion: COACH_RULE_VERSION,
        domain: 'training',
        title: 'Complete a training session today',
        detail: 'A programmed, ad-hoc, or experiment Training session counts.',
        startsOn: date,
        expiresOn: date,
        goalId: goal.id,
        verificationMode: 'canonical',
        actionKind: 'open',
        actionHref: '/training/new?type=ad_hoc',
        targetValue: 1,
        targetUnit: 'session',
        baselineValue: null,
        difficulty: 'standard',
        rewardBand: 'standard',
        metadata: { completionRule: 'training_today_count' },
        score: 150,
        urgent,
      })
    }
    if (goal.goalKind === 'activity_steps') {
      candidates.push({
        taskKind: 'daily_quest',
        ruleKey: `goal:steps-today:${goal.id}`,
        ruleVersion: COACH_RULE_VERSION,
        domain: 'activity',
        title: `Reach ${Math.round(target).toLocaleString('en-US')} steps`,
        detail: 'Health will verify the Activity total automatically.',
        startsOn: date,
        expiresOn: date,
        goalId: goal.id,
        verificationMode: 'canonical',
        actionKind: 'open',
        actionHref: '/progress/activity',
        targetValue: target,
        targetUnit: 'steps',
        baselineValue: null,
        difficulty: 'standard',
        rewardBand: 'standard',
        metadata: { completionRule: 'activity_steps_today' },
        score: 145,
        urgent,
      })
    }
    if (goal.goalKind === 'nutrition_protein') {
      candidates.push({
        taskKind: 'daily_quest',
        ruleKey: `goal:protein-today:${goal.id}`,
        ruleVersion: COACH_RULE_VERSION,
        domain: 'nutrition',
        title: `Reach ${Math.round(target)} g protein today`,
        detail: 'Health will verify today’s known protein total automatically.',
        startsOn: date,
        expiresOn: date,
        goalId: goal.id,
        verificationMode: 'canonical',
        actionKind: 'open',
        actionHref: '/nutrition',
        targetValue: target,
        targetUnit: 'g',
        baselineValue: null,
        difficulty: 'standard',
        rewardBand: 'standard',
        metadata: { completionRule: 'protein_today' },
        score: 140,
        urgent,
      })
    }
  }

  if (due) {
    const copy = bodyReminderCopy(due)
    candidates.push({
      taskKind: 'daily_quest',
      ruleKey: `body-cadence:${due.metricKey}`,
      ruleVersion: COACH_RULE_VERSION,
      domain: 'body',
      title: copy.title,
      detail: copy.detail,
      startsOn: date,
      expiresOn: date,
      goalId: null,
      verificationMode: 'canonical',
      actionKind: 'open',
      actionHref: measureHref(due.metricKey),
      targetValue: 1,
      targetUnit: 'measurement',
      baselineValue: null,
      difficulty: 'routine',
      rewardBand: 'routine',
      metadata: {
        completionRule: 'body_metric',
        metricKey: due.metricKey,
        baselineMeasuredDate: due.lastMeasuredDate,
      },
      score: due.status === 'stale' ? 135 : 110,
      urgent: due.status === 'stale',
    })
  }

  return [...candidates, ...generalDailyCandidates(date, context?.tags ?? [])]
}

async function insertCandidate(sql: Sql, candidate: CoachCandidate): Promise<CoachTaskRow | null> {
  const id = randomUUID()
  const fingerprint = coachPeriodFingerprint(
    candidate.taskKind,
    candidate.startsOn,
    candidate.ruleKey,
    candidate.ruleVersion,
  )
  await sql.query(
    `INSERT INTO coach_tasks (
       id, task_kind, rule_key, rule_version, domain, title, detail,
       starts_on, expires_on, period_fingerprint, goal_id,
       verification_mode, action_kind, action_href,
       target_value, target_unit, baseline_value,
       difficulty, reward_band, metadata
     ) VALUES (
       $1::uuid, $2, $3, $4::int, $5, $6, $7,
       $8::date, $9::date, $10, $11::uuid,
       $12, $13, $14,
       $15::numeric, $16, $17::numeric,
       $18, $19, $20::jsonb
     )
     ON CONFLICT DO NOTHING`,
    [
      id,
      candidate.taskKind,
      candidate.ruleKey,
      candidate.ruleVersion,
      candidate.domain,
      candidate.title,
      candidate.detail,
      candidate.startsOn,
      candidate.expiresOn,
      fingerprint,
      candidate.goalId,
      candidate.verificationMode,
      candidate.actionKind,
      candidate.actionHref,
      candidate.targetValue,
      candidate.targetUnit,
      candidate.baselineValue,
      candidate.difficulty,
      candidate.rewardBand,
      JSON.stringify(candidate.metadata),
    ],
  )
  const task = await loadTaskForPeriod(sql, candidate.taskKind, candidate.startsOn)
  if (task) {
    await appendEvent(sql, {
      taskId: task.id,
      eventKind: 'offered',
      evidenceKind: 'none',
      idempotencyKey: 'offered',
    })
  }
  return task
}

async function ensurePeriodTask(
  sql: Sql,
  kind: CoachTaskKind,
  startsOn: string,
  candidates: readonly CoachCandidate[],
  recent: readonly RecentCoachRule[],
  today: string,
): Promise<CoachTaskRow | null> {
  const existing = await loadTaskForPeriod(sql, kind, startsOn)
  if (existing) return existing
  const ranked = rankCoachCandidates(candidates, recent, today)
  return ranked[0] ? insertCandidate(sql, ranked[0]) : null
}

async function trainingCount(sql: Sql, start: string, end: string): Promise<{ count: number; latestId: string | null }> {
  const rows = (await sql.query(
    `SELECT id::text AS id, workout_date::text AS workout_date
       FROM workout_sessions
      WHERE session_type IN ('programmed', 'ad_hoc', 'experiment')
        AND workout_date BETWEEN $1::date AND $2::date
      ORDER BY workout_date DESC, created_at DESC, id DESC`,
    [start, end],
  )) as Array<{ id: string; workout_date: string }>
  return { count: new Set(rows.map((row) => row.workout_date)).size, latestId: rows[0]?.id ?? null }
}

async function proteinTotal(sql: Sql, date: string): Promise<number | null> {
  const rows = (await sql.query(
    `SELECT bool_or(protein IS NULL) AS unknown, SUM(protein)::text AS total
       FROM nutrition_entries
      WHERE log_date = $1::date`,
    [date],
  )) as Array<{ unknown: boolean | null; total: string | null }>
  const row = rows[0]
  return !row || row.total == null || row.unknown === true ? null : numberOrNull(row.total)
}

async function weekProteinAverage(sql: Sql, start: string, end: string): Promise<{ value: number | null; observedDays: number }> {
  const rows = (await sql.query(
    `SELECT log_date::text AS date, bool_or(protein IS NULL) AS unknown, SUM(protein)::text AS total
       FROM nutrition_entries
      WHERE log_date BETWEEN $1::date AND $2::date
      GROUP BY log_date`,
    [start, end],
  )) as Array<{ date: string; unknown: boolean; total: string | null }>
  const known = rows.flatMap((row) => {
    const value = row.unknown ? null : numberOrNull(row.total)
    return value == null ? [] : [value]
  })
  return {
    value: known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null,
    observedDays: known.length,
  }
}

async function activitySteps(sql: Sql, date: string): Promise<number | null> {
  const rows = (await sql.query(
    `SELECT steps_count::text AS steps
       FROM activity_daily_summaries
      WHERE summary_date = $1::date
      ORDER BY updated_at DESC
      LIMIT 1`,
    [date],
  )) as Array<{ steps: string | null }>
  return numberOrNull(rows[0]?.steps)
}

async function weekStepAverage(sql: Sql, start: string, end: string): Promise<{ value: number | null; observedDays: number }> {
  const rows = (await sql.query(
    `SELECT steps_count::text AS steps
       FROM activity_daily_summaries
      WHERE summary_date BETWEEN $1::date AND $2::date
        AND steps_count IS NOT NULL`,
    [start, end],
  )) as Array<{ steps: string }>
  const values = rows.map((row) => Number(row.steps)).filter(Number.isFinite)
  return {
    value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    observedDays: values.length,
  }
}

async function bodyCompletion(
  sql: Sql,
  row: CoachTaskRow,
): Promise<{ progress: CoachProgress; evidence: CompletionEvidence | null }> {
  const metricKey = stringMeta(row, 'metricKey')
  if (!metricKey) return { progress: { current: null, target: 1, unit: 'measurement', label: null }, evidence: null }
  const baseline = stringMeta(row, 'baselineMeasuredDate')
  const rows = (await sql.query(
    `SELECT sessions.id::text AS session_id,
            (sessions.measured_at AT TIME ZONE 'America/Phoenix')::date::text AS measured_date
       FROM body_metrics metrics
       JOIN body_measurement_sessions sessions ON sessions.id = metrics.measurement_session_id
      WHERE metrics.metric_key = $1
        AND (sessions.measured_at AT TIME ZONE 'America/Phoenix')::date >= $2::date
      ORDER BY sessions.measured_at DESC
      LIMIT 1`,
    [metricKey, row.starts_on],
  )) as Array<{ session_id: string; measured_date: string }>
  const found = rows[0]
  const qualifies = found && (baseline == null || found.measured_date > baseline)
  return {
    progress: {
      current: qualifies ? 1 : 0,
      target: 1,
      unit: 'measurement',
      label: qualifies ? 'Recorded' : 'Due',
    },
    evidence: qualifies
      ? {
          evidenceKind: 'deterministic_canonical',
          sourceType: 'body_measurement_session',
          sourceId: found.session_id,
          evidence: { metricKey, measuredDate: found.measured_date },
        }
      : null,
  }
}

async function manualTrainingProgress(
  sql: Sql,
  row: CoachTaskRow,
): Promise<{ progress: CoachProgress; evidence: CompletionEvidence | null }> {
  const manual = manualRuleByKey(row.rule_key)
  if (!manual?.training) {
    return { progress: { current: null, target: row.target_value == null ? null : Number(row.target_value), unit: row.target_unit, label: null }, evidence: null }
  }
  const valueSql =
    manual.training.valueKind === 'reps'
      ? 'SUM(COALESCE(sets.reps, 0))::numeric'
      : '(SUM(COALESCE(sets.duration_sec, 0))::numeric / 60.0)'
  const rows = (await sql.query(
    `SELECT sessions.id::text AS session_id,
            ${valueSql}::text AS actual
       FROM workout_sessions sessions
       JOIN workout_session_exercises session_exercises ON session_exercises.workout_session_id = sessions.id
       JOIN exercise_definitions exercises ON exercises.id = session_exercises.exercise_definition_id
       JOIN workout_sets sets ON sets.workout_session_exercise_id = session_exercises.id
      WHERE sessions.session_type IN ('programmed', 'ad_hoc', 'experiment')
        AND sessions.workout_date BETWEEN $1::date AND $2::date
        AND lower(exercises.name) = lower($3)
        AND exercises.measurement_kind = $4
      GROUP BY sessions.id, sessions.workout_date, sessions.created_at
      ORDER BY sessions.workout_date DESC, sessions.created_at DESC
      LIMIT 1`,
    [row.starts_on, row.expires_on, manual.training.exerciseName, manual.training.measurementKind],
  )) as Array<{ session_id: string; actual: string | null }>
  const found = rows[0]
  const actual = numberOrNull(found?.actual)
  const target = numberOrNull(row.target_value)
  const qualifies = found != null && actual != null && target != null && actual >= target
  return {
    progress: {
      current: actual,
      target,
      unit: row.target_unit,
      label: actual == null ? null : `${Math.round(actual * 10) / 10} ${row.target_unit ?? ''}`.trim(),
    },
    evidence: qualifies
      ? {
          evidenceKind: 'training_session',
          sourceType: 'workout_session',
          sourceId: found.session_id,
          evidence: { actual, target, unit: row.target_unit, ruleKey: row.rule_key },
        }
      : null,
  }
}

async function evaluateTask(
  sql: Sql,
  row: CoachTaskRow,
  today: string,
): Promise<{ progress: CoachProgress | null; evidence: CompletionEvidence | null }> {
  const target = numberOrNull(row.target_value)
  const rule = completionRule(row)

  if (rule === 'body_metric') return bodyCompletion(sql, row)

  if (rule === 'training_today_count' || rule === 'training_week_count') {
    const count = await trainingCount(sql, row.starts_on, rule === 'training_today_count' ? row.starts_on : row.expires_on)
    return {
      progress: { current: count.count, target, unit: row.target_unit, label: `${count.count}/${target ?? 0}` },
      evidence:
        target != null && count.count >= target && count.latestId
          ? {
              evidenceKind: 'deterministic_canonical',
              sourceType: 'workout_session',
              sourceId: count.latestId,
              evidence: { count: count.count, target, start: row.starts_on, end: row.expires_on },
            }
          : null,
    }
  }

  if (rule === 'activity_steps_today') {
    const steps = await activitySteps(sql, row.starts_on)
    return {
      progress: { current: steps, target, unit: 'steps', label: steps == null ? null : Math.round(steps).toLocaleString('en-US') },
      evidence:
        steps != null && target != null && steps >= target
          ? {
              evidenceKind: 'deterministic_canonical',
              sourceType: 'activity_day',
              sourceId: row.starts_on,
              evidence: { steps, target },
            }
          : null,
    }
  }

  if (rule === 'protein_today') {
    const protein = await proteinTotal(sql, row.starts_on)
    return {
      progress: { current: protein, target, unit: 'g', label: protein == null ? null : `${Math.round(protein)} g` },
      evidence:
        protein != null && target != null && protein >= target
          ? {
              evidenceKind: 'deterministic_canonical',
              sourceType: 'nutrition_day',
              sourceId: row.starts_on,
              evidence: { protein, target },
            }
          : null,
    }
  }

  if (rule === 'activity_week_average') {
    const summary = await weekStepAverage(sql, row.starts_on, row.expires_on)
    const final = today > row.expires_on
    return {
      progress: { current: summary.value, target, unit: 'steps/day', label: summary.value == null ? null : `${Math.round(summary.value).toLocaleString('en-US')} avg` },
      evidence:
        final && summary.value != null && target != null && summary.value >= target
          ? {
              evidenceKind: 'deterministic_canonical',
              sourceType: 'activity_week',
              sourceId: row.starts_on,
              evidence: { average: summary.value, observedDays: summary.observedDays, target },
            }
          : null,
    }
  }

  if (rule === 'protein_week_average') {
    const summary = await weekProteinAverage(sql, row.starts_on, row.expires_on)
    const final = today > row.expires_on
    return {
      progress: { current: summary.value, target, unit: 'g/day', label: summary.value == null ? null : `${Math.round(summary.value)} g avg` },
      evidence:
        final && summary.value != null && target != null && summary.value >= target
          ? {
              evidenceKind: 'deterministic_canonical',
              sourceType: 'nutrition_week',
              sourceId: row.starts_on,
              evidence: { average: summary.value, observedDays: summary.observedDays, target },
            }
          : null,
    }
  }

  if (row.verification_mode === 'training_log') {
    return manualTrainingProgress(sql, row)
  }

  return { progress: null, evidence: null }
}

async function completeTask(sql: Sql, row: CoachTaskRow, evidence: CompletionEvidence) {
  const changed = (await sql.query(
    `UPDATE coach_tasks
        SET status = 'completed',
            completed_at = COALESCE(completed_at, now()),
            closed_at = COALESCE(closed_at, now()),
            updated_at = now()
      WHERE id = $1::uuid AND status = 'active'
      RETURNING id::text AS id`,
    [row.id],
  )) as Array<{ id: string }>
  if (!changed[0]) return
  await appendEvent(sql, {
    taskId: row.id,
    eventKind: 'completed',
    evidenceKind: evidence.evidenceKind,
    sourceType: evidence.sourceType,
    sourceId: evidence.sourceId,
    evidence: evidence.evidence,
    idempotencyKey: 'completed',
  })
}

async function expireTask(sql: Sql, row: CoachTaskRow) {
  const changed = (await sql.query(
    `UPDATE coach_tasks
        SET status = 'expired', closed_at = COALESCE(closed_at, now()), updated_at = now()
      WHERE id = $1::uuid AND status = 'active'
      RETURNING id::text AS id`,
    [row.id],
  )) as Array<{ id: string }>
  if (!changed[0]) return
  await appendEvent(sql, {
    taskId: row.id,
    eventKind: 'expired',
    evidenceKind: 'none',
    idempotencyKey: 'expired',
  })
}

async function reconcile(sql: Sql, today: string) {
  const rows = (await sql.query(
    `SELECT ${TASK_COLUMNS}
       FROM coach_tasks
      WHERE status = 'active'
        AND starts_on <= $1::date
      ORDER BY starts_on, id`,
    [today],
  )) as CoachTaskRow[]
  for (const row of rows) {
    const evaluated = await evaluateTask(sql, row, today)
    if (evaluated.evidence) {
      await completeTask(sql, row, evaluated.evidence)
      continue
    }
    if (row.expires_on < today) {
      await expireTask(sql, row)
    }
  }
}

async function toView(sql: Sql, row: CoachTaskRow, today: string): Promise<CoachTaskView> {
  const evaluated = row.status === 'active' ? await evaluateTask(sql, row, today) : { progress: null, evidence: null }
  const completedEvidence = row.status === 'completed' ? await latestEvidenceKind(sql, row.id) : null
  return {
    id: row.id,
    taskKind: row.task_kind,
    ruleKey: row.rule_key,
    ruleVersion: Number(row.rule_version),
    domain: row.domain,
    title: row.title,
    detail: row.detail,
    startsOn: row.starts_on,
    expiresOn: row.expires_on,
    goalId: row.goal_id,
    verificationMode: row.verification_mode,
    actionKind: row.action_kind,
    actionHref: row.action_href,
    targetValue: numberOrNull(row.target_value),
    targetUnit: row.target_unit,
    baselineValue: numberOrNull(row.baseline_value),
    difficulty: row.difficulty,
    rewardBand: row.reward_band,
    status: row.status,
    completedAt: instantOrNull(row.completed_at),
    closedAt: instantOrNull(row.closed_at),
    metadata: metadataOf(row),
    progress: evaluated.progress,
    evidenceLabel: evidenceLabel(completedEvidence),
  }
}

async function currentState(sql: Sql, date: string): Promise<CoachState> {
  const week = coachWeek(date)
  const [weeklyRow, dailyRow] = await Promise.all([
    loadTaskForPeriod(sql, 'weekly_focus', week.start),
    loadTaskForPeriod(sql, 'daily_quest', date),
  ])
  const [weeklyFocus, dailyQuest] = await Promise.all([
    weeklyRow ? toView(sql, weeklyRow, date) : Promise.resolve(null),
    dailyRow ? toView(sql, dailyRow, date) : Promise.resolve(null),
  ])
  return {
    date,
    weekStart: week.start,
    weekEnd: week.end,
    weeklyFocus,
    dailyQuest,
    activeCount: [weeklyFocus, dailyQuest].filter((item) => item?.status === 'active').length,
  }
}

export async function readCoach(now = new Date()): Promise<CoachState> {
  const date = healthCalendarDateFromNow(now)
  const sql = await getSql()
  await reconcile(sql, date)
  return currentState(sql, date)
}

export async function ensureCoach(now = new Date()): Promise<CoachState> {
  const date = healthCalendarDateFromNow(now)
  const week = coachWeek(date)
  const sql = await getSql()
  await reconcile(sql, date)
  const recent = await recentRules(sql, date)
  const [weekly, daily] = await Promise.all([weeklyCandidates(date), dailyCandidates(date)])
  await ensurePeriodTask(sql, 'weekly_focus', week.start, weekly, recent, date)
  await ensurePeriodTask(sql, 'daily_quest', date, daily, recent, date)
  await reconcile(sql, date)
  return currentState(sql, date)
}

export async function passCoachTask(id: string, now = new Date()): Promise<CoachState> {
  const date = healthCalendarDateFromNow(now)
  const sql = await getSql()
  const row = await loadTask(sql, id)
  if (!row) throw new HttpError(404, 'Coach task not found')
  if (row.status === 'passed') return currentState(sql, date)
  if (row.status !== 'active') throw new HttpError(409, 'Only an active Coach task can be passed')
  await sql.transaction([
    sql.query(
      `UPDATE coach_tasks
          SET status = 'passed', closed_at = now(), updated_at = now()
        WHERE id = $1::uuid AND status = 'active'`,
      [id],
    ),
    sql.query(
      `INSERT INTO coach_task_events (
         id, task_id, event_kind, evidence_kind, evidence, idempotency_key
       ) VALUES ($1::uuid, $2::uuid, 'passed', 'none', '{}'::jsonb, 'passed')
       ON CONFLICT (task_id, idempotency_key) DO NOTHING`,
      [randomUUID(), id],
    ),
  ])
  return currentState(sql, date)
}

export async function logCoachTraining(id: string, body: unknown, now = new Date()): Promise<CoachState> {
  const parsed = coachTrainingLogSchema.safeParse(body)
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid Training log')
  const date = healthCalendarDateFromNow(now)
  const sql = await getSql()
  const row = await loadTask(sql, id)
  if (!row) throw new HttpError(404, 'Coach task not found')
  if (row.status === 'completed') return currentState(sql, date)
  if (row.status !== 'active' || row.verification_mode !== 'training_log') {
    throw new HttpError(409, 'This Coach task is not awaiting a Training log')
  }
  const rule = manualRuleByKey(row.rule_key)
  if (!rule?.training) throw new HttpError(409, 'Training preset is unavailable for this task')

  const existing = (await sql.query(
    `SELECT id::text AS id FROM workout_sessions WHERE id = $1::uuid LIMIT 1`,
    [parsed.data.submissionId],
  )) as Array<{ id: string }>

  const meetsTarget = parsed.data.actualValue >= rule.training.targetValue
  if (!existing[0]) {
    const exercise = await ensureOwnerExercise({
      name: rule.training.exerciseName,
      measurementKind: rule.training.measurementKind,
      loadType: rule.training.loadType,
      unilateral: false,
    })
    const set =
      rule.training.valueKind === 'reps'
        ? { reps: Math.round(parsed.data.actualValue), durationSec: null }
        : { reps: null, durationSec: Math.round(parsed.data.actualValue * 60) }
    const request = parseManualWorkoutRequest({
      workoutDate: row.starts_on,
      workoutTemplateId: null,
      sessionType: 'ad_hoc',
      sessionName: rule.training.sessionName,
      durationMin: rule.training.valueKind === 'duration_min' ? parsed.data.actualValue : null,
      effort: null,
      painLevel: null,
      bodyweightLb: null,
      notes: parsed.data.note ?? null,
      experimentId: null,
      benchmarkProtocolVersionId: null,
      exercises: [
        {
          exerciseDefinitionId: exercise.id,
          slotId: null,
          notes: null,
          sets: [
            {
              setNumber: 1,
              setType: 'working',
              loadState: rule.training.loadType === 'bodyweight' ? 'bodyweight' : 'none',
              weightLb: null,
              reps: set.reps,
              durationSec: set.durationSec,
              leftReps: null,
              rightReps: null,
              leftDurationSec: null,
              rightDurationSec: null,
              notes: null,
            },
          ],
        },
      ],
    })
    const prepared = prepareManualSession({
      request,
      exercisesById: new Map([[exercise.id, exercise]]),
      template: null,
      sessionId: parsed.data.submissionId,
      metadata: {
        coach_task_id: row.id,
        coach_rule_key: row.rule_key,
        coach_submission_id: parsed.data.submissionId,
      },
    })
    const queries = buildSessionInsertQueries(sql, prepared)
    if (meetsTarget) {
      queries.push(
        sql.query(
          `UPDATE coach_tasks
              SET status = 'completed', completed_at = now(), closed_at = now(), updated_at = now()
            WHERE id = $1::uuid AND status = 'active'`,
          [row.id],
        ),
        sql.query(
          `INSERT INTO coach_task_events (
             id, task_id, event_kind, evidence_kind, source_type, source_id, evidence, idempotency_key
           ) VALUES (
             $1::uuid, $2::uuid, 'completed', 'training_session', 'workout_session', $3,
             $4::jsonb, $5
           )
           ON CONFLICT (task_id, idempotency_key) DO NOTHING`,
          [
            randomUUID(),
            row.id,
            prepared.sessionId,
            JSON.stringify({
              actualValue: parsed.data.actualValue,
              targetValue: rule.training.targetValue,
              unit: row.target_unit,
              distance: rule.training.allowDistance ? parsed.data.distance ?? null : null,
              distanceUnit: rule.training.allowDistance ? parsed.data.distanceUnit ?? null : null,
            }),
            `completed:training:${prepared.sessionId}`,
          ],
        ),
      )
    }
    await sql.transaction(queries)
  } else if (meetsTarget) {
    await completeTask(sql, row, {
      evidenceKind: 'training_session',
      sourceType: 'workout_session',
      sourceId: existing[0].id,
      evidence: {
        actualValue: parsed.data.actualValue,
        targetValue: rule.training.targetValue,
        unit: row.target_unit,
        distance: rule.training.allowDistance ? parsed.data.distance ?? null : null,
        distanceUnit: rule.training.allowDistance ? parsed.data.distanceUnit ?? null : null,
      },
    })
  }

  return currentState(sql, date)
}

export async function logCoachSelfReport(id: string, body: unknown, now = new Date()): Promise<CoachState> {
  const parsed = coachSelfReportSchema.safeParse(body)
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid Coach log')
  const date = healthCalendarDateFromNow(now)
  const sql = await getSql()
  const row = await loadTask(sql, id)
  if (!row) throw new HttpError(404, 'Coach task not found')
  if (row.status === 'completed') return currentState(sql, date)
  if (row.status !== 'active' || row.verification_mode !== 'owner_self_report') {
    throw new HttpError(409, 'This Coach task is not awaiting an owner report')
  }
  const rule = manualRuleByKey(row.rule_key)
  if (!rule?.selfReportKind) throw new HttpError(409, 'Self-report preset is unavailable for this task')
  if (row.target_unit === 'min' && row.target_value != null) {
    if (parsed.data.durationMin == null || parsed.data.durationMin < Number(row.target_value)) {
      throw new HttpError(400, `Log at least ${Number(row.target_value)} minutes to complete this quest`)
    }
  }

  await sql.transaction([
    sql.query(
      `UPDATE coach_tasks
          SET status = 'completed', completed_at = now(), closed_at = now(), updated_at = now()
        WHERE id = $1::uuid AND status = 'active'`,
      [row.id],
    ),
    sql.query(
      `INSERT INTO coach_task_events (
         id, task_id, event_kind, evidence_kind, source_type, source_id, evidence, idempotency_key
       ) VALUES (
         $1::uuid, $2::uuid, 'completed', 'owner_self_report', $3, $4, $5::jsonb, $6
       )
       ON CONFLICT (task_id, idempotency_key) DO NOTHING`,
      [
        randomUUID(),
        row.id,
        rule.selfReportKind,
        parsed.data.submissionId,
        JSON.stringify({
          durationMin: parsed.data.durationMin ?? null,
          note: parsed.data.note ?? null,
          description: parsed.data.description ?? null,
        }),
        `completed:self:${parsed.data.submissionId}`,
      ],
    ),
  ])
  return currentState(sql, date)
}
