import { createHash, randomUUID } from 'node:crypto'
import {
  bodyValueClassification,
  incompleteNutritionDay,
  independentSideMissing,
  nutritionEntryClassification,
  type DataQualityIssue,
  type DataQualityResponse,
  type DataQualityReviewStatus,
} from '../../src/domain/data-quality.js'
import { addCalendarDays } from '../../src/domain/training-plan.js'
import { calendarDateFromInstant } from '../../src/domain/progress/dates.js'
import { getSql, type Sql } from '../db.js'
import { currentHealthDate, healthCalendarTimeZone } from '../health-time.js'
import { HttpError } from '../http.js'

type ReviewRow = {
  fingerprint: string
  review_status: DataQualityReviewStatus
}

function fp(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex')
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function healthDate(value: string | Date, timezone: string): string {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : calendarDateFromInstant(date, timezone)
}

function isoInstant(value: string | Date | null): string | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function reviewMap(rows: readonly ReviewRow[]): Map<string, DataQualityReviewStatus> {
  return new Map(rows.map((row) => [row.fingerprint, row.review_status]))
}

function withReview(issue: Omit<DataQualityIssue, 'reviewStatus'>, reviews: Map<string, DataQualityReviewStatus>): DataQualityIssue {
  return { ...issue, reviewStatus: reviews.get(issue.fingerprint) ?? null }
}

async function loadReviews(sql: Sql): Promise<Map<string, DataQualityReviewStatus>> {
  const rows = (await sql.query(
    "SELECT fingerprint, review_status FROM data_quality_reviews",
  )) as ReviewRow[]
  return reviewMap(rows)
}

async function detectIssues(sql: Sql, today: string, timezone: string): Promise<Array<Omit<DataQualityIssue, 'reviewStatus'>>> {
  const issues: Array<Omit<DataQualityIssue, 'reviewStatus'>> = []
  const start = addCalendarDays(today, -59)
  const futureCutoff = new Date(Date.now() + 120_000)

  const bodyRows = (await sql.query(
    "SELECT metrics.id::text AS metric_id, metrics.measurement_session_id::text AS session_id, metrics.metric_key, metrics.value, metrics.unit, sessions.measured_at, sources.key AS source_key FROM body_metrics metrics JOIN body_measurement_sessions sessions ON sessions.id = metrics.measurement_session_id JOIN data_sources sources ON sources.id = sessions.source_id WHERE sessions.measured_at >= ($1::date - interval '1 day') ORDER BY sessions.measured_at, metrics.id",
    [start],
  )) as Array<{
    metric_id: string
    session_id: string
    metric_key: string
    value: string | number
    unit: string
    measured_at: string | Date
    source_key: string
  }>

  for (const row of bodyRows) {
    const value = Number(row.value)
    const classification = bodyValueClassification({ metricKey: row.metric_key, value, unit: row.unit })
    if (classification) {
      const fingerprint = fp(['body-value', row.metric_id, classification])
      issues.push({
        fingerprint,
        issueKind: 'body_value_unusual',
        classification,
        entityKind: 'body_metric',
        entityId: row.metric_id,
        date: healthDate(row.measured_at, timezone),
        title: 'Body measurement needs review',
        detail: row.metric_key.replaceAll('_', ' ') + ' = ' + String(Math.round(value * 100) / 100) + ' ' + row.unit + '. The value is kept exactly as recorded.',
        href: '/body',
        metadata: { metricKey: row.metric_key, value, unit: row.unit, sessionId: row.session_id, sourceKey: row.source_key },
      })
    }
    const measured = row.measured_at instanceof Date ? row.measured_at : new Date(row.measured_at)
    if (!Number.isNaN(measured.getTime()) && measured > futureCutoff) {
      issues.push({
        fingerprint: fp(['future-body', row.session_id]),
        issueKind: 'future_event_time',
        classification: 'needs_confirmation',
        entityKind: 'body_measurement_session',
        entityId: row.session_id,
        date: healthDate(row.measured_at, timezone),
        title: 'Body measurement is in the future',
        detail: 'The observation time is later than the current clock. The record has not been changed.',
        href: '/body',
        metadata: { measuredAt: measured.toISOString(), sourceKey: row.source_key },
      })
    }
  }

  const latestWeight = bodyRows
    .filter((row) => row.metric_key === 'weight')
    .sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime())
  if (latestWeight.length >= 4) {
    const latest = latestWeight[0]!
    const prior = latestWeight.slice(1, 4)
    if (prior.every((row) => row.source_key === prior[0]?.source_key) && latest.source_key !== prior[0]?.source_key) {
      issues.push({
        fingerprint: fp(['body-source-shift', latest.session_id, latest.source_key, prior[0]!.source_key]),
        issueKind: 'body_source_discontinuity',
        classification: 'source_discontinuity',
        entityKind: 'body_measurement_session',
        entityId: latest.session_id,
        date: healthDate(latest.measured_at, timezone),
        title: 'Body measurement source changed',
        detail: 'Recent weight history switched from ' + prior[0]!.source_key + ' to ' + latest.source_key + '. This may be intentional, but cross-source comparisons can shift.',
        href: '/body',
        metadata: { previousSource: prior[0]!.source_key, currentSource: latest.source_key },
      })
    }
  }

  const nutritionRows = (await sql.query(
    "SELECT id::text AS id, log_date::text AS log_date, consumed_at, meal, food_name, serving_quantity, calories, created_at, evidence_quality FROM nutrition_entries WHERE log_date BETWEEN $1::date AND $2::date ORDER BY log_date, created_at, id",
    [start, today],
  )) as Array<{
    id: string
    log_date: string
    consumed_at: string | Date | null
    meal: string | null
    food_name: string
    serving_quantity: string | number
    calories: string | number
    created_at: string | Date
    evidence_quality: string
  }>

  for (const row of nutritionRows) {
    const calories = Number(row.calories)
    const servingQuantity = Number(row.serving_quantity)
    const classification = nutritionEntryClassification({ calories, servingQuantity })
    if (classification) {
      issues.push({
        fingerprint: fp(['nutrition-entry', row.id, classification]),
        issueKind: 'nutrition_entry_unusual',
        classification,
        entityKind: 'nutrition_entry',
        entityId: row.id,
        date: row.log_date,
        title: 'Nutrition entry looks unusual',
        detail: row.food_name + ' · ' + String(Math.round(calories)) + ' kcal · ' + String(servingQuantity) + ' servings. Nothing was corrected automatically.',
        href: '/nutrition?date=' + row.log_date,
        metadata: { calories, servingQuantity, evidenceQuality: row.evidence_quality },
      })
    }
    const consumedAt = isoInstant(row.consumed_at)
    if (consumedAt && new Date(consumedAt) > futureCutoff) {
      issues.push({
        fingerprint: fp(['future-nutrition', row.id]),
        issueKind: 'future_event_time',
        classification: 'needs_confirmation',
        entityKind: 'nutrition_entry',
        entityId: row.id,
        date: row.log_date,
        title: 'Nutrition entry has a future consumption time',
        detail: row.food_name + ' is timestamped later than the current clock.',
        href: '/nutrition?date=' + row.log_date,
        metadata: { consumedAt },
      })
    }
  }

  for (let i = 0; i < nutritionRows.length; i += 1) {
    const left = nutritionRows[i]!
    for (let j = i + 1; j < nutritionRows.length; j += 1) {
      const right = nutritionRows[j]!
      if (right.log_date !== left.log_date) break
      if (left.food_name.trim().toLowerCase() !== right.food_name.trim().toLowerCase()) continue
      if (left.meal !== right.meal) continue
      if (Math.abs(Number(left.calories) - Number(right.calories)) > 0.5) continue
      if (Math.abs(Number(left.serving_quantity) - Number(right.serving_quantity)) > 0.001) continue
      const leftTime = left.consumed_at ? new Date(left.consumed_at).getTime() : new Date(left.created_at).getTime()
      const rightTime = right.consumed_at ? new Date(right.consumed_at).getTime() : new Date(right.created_at).getTime()
      if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime) || Math.abs(rightTime - leftTime) > 120_000) continue
      const ids = [left.id, right.id].sort()
      issues.push({
        fingerprint: fp(['nutrition-duplicate', ...ids]),
        issueKind: 'possible_duplicate_nutrition',
        classification: 'possible_duplicate',
        entityKind: 'nutrition_entry_pair',
        entityId: ids.join(':'),
        date: left.log_date,
        title: 'Possible duplicate Nutrition entries',
        detail: left.food_name + ' was logged twice with the same serving and calories within two minutes.',
        href: '/nutrition?date=' + left.log_date,
        metadata: { entryIds: ids, foodName: left.food_name },
      })
    }
  }

  const nutritionDays = (await sql.query(
    "SELECT days.log_date::text AS date, days.calories, days.entry_count, targets.calories_target FROM (SELECT log_date, SUM(calories)::numeric AS calories, COUNT(*)::int AS entry_count FROM nutrition_entries WHERE log_date BETWEEN $1::date AND $2::date GROUP BY log_date) days LEFT JOIN LATERAL (SELECT calories_target FROM nutrition_targets WHERE effective_from <= days.log_date ORDER BY effective_from DESC, created_at DESC LIMIT 1) targets ON true WHERE days.log_date < $2::date ORDER BY days.log_date",
    [start, today],
  )) as Array<{ date: string; calories: string | number; entry_count: number | string; calories_target: string | number | null }>
  for (const row of nutritionDays) {
    const calories = Number(row.calories)
    const targetCalories = numberOrNull(row.calories_target)
    const entryCount = Number(row.entry_count)
    if (targetCalories != null && incompleteNutritionDay({ calories, targetCalories, entryCount })) {
      issues.push({
        fingerprint: fp(['nutrition-partial-day', row.date, String(Math.round(calories)), String(Math.round(targetCalories))]),
        issueKind: 'possible_incomplete_nutrition_day',
        classification: 'plausible_but_unusual',
        entityKind: 'nutrition_day',
        entityId: row.date,
        date: row.date,
        title: 'Nutrition day may be incomplete',
        detail: 'Logged calories are under half of the active target. This may be intentional; the watchdog does not assume missing food.',
        href: '/nutrition?date=' + row.date,
        metadata: { calories, targetCalories, entryCount },
      })
    }
  }

  const setRows = (await sql.query(
    "SELECT sets.id::text AS id, sessions.id::text AS session_id, sessions.workout_date::text AS workout_date, definitions.name, definitions.measurement_kind, definitions.side_tracking_mode, sets.left_reps, sets.right_reps, sets.left_duration_sec, sets.right_duration_sec FROM workout_sets sets JOIN workout_session_exercises exercise_rows ON exercise_rows.id = sets.workout_session_exercise_id JOIN workout_sessions sessions ON sessions.id = exercise_rows.workout_session_id JOIN exercise_definitions definitions ON definitions.id = exercise_rows.exercise_definition_id WHERE sessions.workout_date BETWEEN $1::date AND $2::date AND definitions.side_tracking_mode = 'independent' ORDER BY sessions.workout_date, sets.id",
    [start, today],
  )) as Array<{
    id: string
    session_id: string
    workout_date: string
    name: string
    measurement_kind: string
    side_tracking_mode: string
    left_reps: string | number | null
    right_reps: string | number | null
    left_duration_sec: string | number | null
    right_duration_sec: string | number | null
  }>
  for (const row of setRows) {
    const isDuration = row.measurement_kind === 'duration' || row.measurement_kind === 'duration_per_side'
    const left = numberOrNull(isDuration ? row.left_duration_sec : row.left_reps)
    const right = numberOrNull(isDuration ? row.right_duration_sec : row.right_reps)
    if (!independentSideMissing({ left, right })) continue
    issues.push({
      fingerprint: fp(['independent-side-missing', row.id]),
      issueKind: 'independent_side_incomplete',
      classification: 'needs_confirmation',
      entityKind: 'workout_set',
      entityId: row.id,
      date: row.workout_date,
      title: 'Independent-side Training set is incomplete',
      detail: row.name + ' has a value for only one side. Historical shared-rep sets are not flagged.',
      href: '/training/' + row.session_id,
      metadata: { sessionId: row.session_id, exerciseName: row.name, left, right },
    })
  }

  return [...new Map(issues.map((issue) => [issue.fingerprint, issue])).values()]
}

export async function getDataQuality(): Promise<DataQualityResponse> {
  const [sql, today, timezone] = await Promise.all([getSql(), currentHealthDate(), healthCalendarTimeZone()])
  const [raw, reviews] = await Promise.all([detectIssues(sql, today, timezone), loadReviews(sql)])
  const decorated = raw.map((issue) => withReview(issue, reviews))
  return {
    asOf: today,
    issues: decorated.filter((issue) => issue.reviewStatus == null),
    reviewed: decorated.filter((issue) => issue.reviewStatus != null),
  }
}

export async function reviewDataQualityIssue(
  fingerprint: string,
  status: DataQualityReviewStatus,
  note: string | null,
): Promise<DataQualityResponse> {
  if (status !== 'confirmed_valid' && status !== 'excluded_from_analysis') {
    throw new HttpError(400, 'Invalid data-quality review status')
  }
  if (note != null && note.trim().length > 500) throw new HttpError(400, 'Review note is too long')
  const [sql, today, timezone] = await Promise.all([getSql(), currentHealthDate(), healthCalendarTimeZone()])
  const issues = await detectIssues(sql, today, timezone)
  const issue = issues.find((item) => item.fingerprint === fingerprint)
  if (!issue) throw new HttpError(404, 'Data-quality issue is no longer active')
  await sql.query(
    "INSERT INTO data_quality_reviews (id, fingerprint, issue_kind, entity_kind, entity_id, review_status, issue_snapshot, note, reviewed_at, created_at, updated_at) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8, now(), now(), now()) ON CONFLICT (fingerprint) DO UPDATE SET review_status = EXCLUDED.review_status, issue_snapshot = EXCLUDED.issue_snapshot, note = EXCLUDED.note, reviewed_at = now(), updated_at = now()",
    [randomUUID(), issue.fingerprint, issue.issueKind, issue.entityKind, issue.entityId, status, JSON.stringify(issue), note?.trim() || null],
  )
  return getDataQuality()
}
