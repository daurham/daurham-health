import { createHash, randomUUID } from 'node:crypto'
import {
  detectMeanShift,
  type ChangeCandidateKind,
  type ChangeCandidateStatus,
  type ChangeLedgerEntry,
  type ChangeLedgerResponse,
  type NumericObservation,
} from '../../src/domain/change-ledger.js'
import { addCalendarDays } from '../../src/domain/training-plan.js'
import { calendarDateFromInstant } from '../../src/domain/progress/dates.js'
import { getSql, type Sql } from '../db.js'
import { currentHealthDate, healthCalendarTimeZone } from '../health-time.js'
import { HttpError } from '../http.js'

type CandidateRow = {
  id: string
  fingerprint: string
  candidate_kind: ChangeCandidateKind
  detected_on: string
  window_start: string
  window_end: string
  direction: 'increase' | 'decrease'
  magnitude: string | number
  unit: string
  summary: string
  status: ChangeCandidateStatus
  metadata: Record<string, unknown> | null
}

function dateFromInstant(value: string | Date | null, timezone: string): string | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return calendarDateFromInstant(date, timezone)
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function fingerprint(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex')
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function targetDetail(row: { calories_target: unknown; protein_target: unknown; fiber_target: unknown; sodium_target: unknown }): string {
  const parts = [
    String(Math.round(Number(row.calories_target))) + ' kcal',
    String(Math.round(Number(row.protein_target))) + ' g protein',
  ]
  const fiber = numberOrNull(row.fiber_target)
  const sodium = numberOrNull(row.sodium_target)
  if (fiber != null) parts.push(String(Math.round(fiber)) + ' g fiber')
  if (sodium != null) parts.push(String(Math.round(sodium)) + ' mg sodium')
  return parts.join(' · ')
}

function goalTargetDetail(row: { target_mode: string; target_min: unknown; target_max: unknown; target_unit: string }): string {
  const min = numberOrNull(row.target_min)
  const max = numberOrNull(row.target_max)
  if (row.target_mode === 'range') return String(min ?? '—') + '–' + String(max ?? '—') + ' ' + row.target_unit
  if (row.target_mode === 'at_most') return '≤ ' + String(max ?? '—') + ' ' + row.target_unit
  return '≥ ' + String(min ?? '—') + ' ' + row.target_unit
}

function candidateEntry(row: CandidateRow): ChangeLedgerEntry {
  return {
    id: 'candidate:' + row.id,
    date: row.detected_on,
    kind: 'behavior_change',
    title: row.summary,
    detail: (row.direction === 'increase' ? 'Increase' : 'Decrease') + ' detected over ' + row.window_start + '–' + row.window_end + '.',
    sourceKind: 'change_candidate',
    sourceId: row.id,
    status: row.status,
    metadata: {
      candidateKind: row.candidate_kind,
      direction: row.direction,
      magnitude: Number(row.magnitude),
      unit: row.unit,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      ...jsonRecord(row.metadata),
    },
  }
}

async function explicitEntries(sql: Sql, timezone: string): Promise<ChangeLedgerEntry[]> {
  const entries: ChangeLedgerEntry[] = []

  const targets = (await sql.query(
    "SELECT id::text AS id, effective_from::text AS effective_from, calories_target, protein_target, fiber_target, sodium_target FROM nutrition_targets ORDER BY effective_from, created_at, id",
  )) as Array<{ id: string; effective_from: string; calories_target: unknown; protein_target: unknown; fiber_target: unknown; sodium_target: unknown }>
  targets.forEach((row, index) => {
    entries.push({
      id: 'nutrition-target:' + row.id,
      date: row.effective_from,
      kind: 'nutrition_target',
      title: index === 0 ? 'Nutrition targets established' : 'Nutrition targets changed',
      detail: targetDetail(row),
      sourceKind: 'nutrition_target',
      sourceId: row.id,
      metadata: {},
    })
  })

  const plans = (await sql.query(
    "SELECT id::text AS id, version, effective_from::text AS effective_from, weekly_frequency_target, default_non_training_intent, note FROM training_plan_versions ORDER BY effective_from, version",
  )) as Array<{ id: string; version: number | string; effective_from: string; weekly_frequency_target: number | string; default_non_training_intent: string; note: string | null }>
  plans.forEach((row) => {
    entries.push({
      id: 'training-plan:' + row.id,
      date: row.effective_from,
      kind: 'training_plan',
      title: Number(row.version) === 1 ? 'Training plan established' : 'Training plan changed',
      detail: String(Number(row.weekly_frequency_target)) + ' sessions/week · ' + row.default_non_training_intent.replaceAll('_', ' ') + (row.note ? ' · ' + row.note : ''),
      sourceKind: 'training_plan_version',
      sourceId: row.id,
      metadata: { version: Number(row.version) },
    })
  })

  const goals = (await sql.query(
    "SELECT id::text AS id, goal_kind, status, started_on::text AS started_on, paused_at, completed_at FROM goals ORDER BY started_on, created_at, id",
  )) as Array<{ id: string; goal_kind: string; status: string; started_on: string; paused_at: string | Date | null; completed_at: string | Date | null }>
  for (const row of goals) {
    entries.push({
      id: 'goal-start:' + row.id,
      date: row.started_on,
      kind: 'goal_started',
      title: 'Goal started · ' + row.goal_kind.replaceAll('_', ' '),
      detail: null,
      sourceKind: 'goal',
      sourceId: row.id,
      metadata: { goalKind: row.goal_kind },
    })
    const lifecycleAt = row.status === 'paused' ? row.paused_at : row.status === 'completed' ? row.completed_at : null
    const lifecycleDate = dateFromInstant(lifecycleAt, timezone)
    if (lifecycleDate) {
      entries.push({
        id: 'goal-' + row.status + ':' + row.id,
        date: lifecycleDate,
        kind: 'goal_lifecycle',
        title: 'Goal ' + row.status,
        detail: row.goal_kind.replaceAll('_', ' '),
        sourceKind: 'goal',
        sourceId: row.id,
        metadata: { goalKind: row.goal_kind, status: row.status },
      })
    }
  }

  const goalVersions = (await sql.query(
    "SELECT versions.id::text AS id, versions.goal_id::text AS goal_id, versions.version, versions.target_mode, versions.target_min, versions.target_max, versions.target_unit, versions.created_at, goals.goal_kind FROM goal_versions versions JOIN goals ON goals.id = versions.goal_id ORDER BY versions.created_at, versions.goal_id, versions.version",
  )) as Array<{ id: string; goal_id: string; version: number | string; target_mode: string; target_min: unknown; target_max: unknown; target_unit: string; created_at: string | Date; goal_kind: string }>
  for (const row of goalVersions) {
    if (Number(row.version) <= 1) continue
    const date = dateFromInstant(row.created_at, timezone)
    if (!date) continue
    entries.push({
      id: 'goal-target:' + row.id,
      date,
      kind: 'goal_target',
      title: 'Goal target changed · ' + row.goal_kind.replaceAll('_', ' '),
      detail: goalTargetDetail(row),
      sourceKind: 'goal_version',
      sourceId: row.id,
      metadata: { goalId: row.goal_id, version: Number(row.version) },
    })
  }

  const supplementEvents = (await sql.query(
    "SELECT events.id::text AS id, events.effective_date::text AS effective_date, events.status, supplements.id::text AS supplement_id, supplements.name FROM supplement_status_events events JOIN supplements ON supplements.id = events.supplement_id ORDER BY events.effective_date, events.created_at, events.id",
  )) as Array<{ id: string; effective_date: string; status: string; supplement_id: string; name: string }>
  for (const row of supplementEvents) {
    entries.push({
      id: 'supplement-status:' + row.id,
      date: row.effective_date,
      kind: 'supplement_status',
      title: row.name + ' · ' + row.status,
      detail: null,
      sourceKind: 'supplement_status_event',
      sourceId: row.id,
      metadata: { supplementId: row.supplement_id, status: row.status },
    })
  }

  const experiments = (await sql.query(
    "SELECT id::text AS id, title, status, window_start::text AS window_start, window_end::text AS window_end FROM experiments WHERE window_start IS NOT NULL AND window_end IS NOT NULL ORDER BY window_start, id",
  )) as Array<{ id: string; title: string; status: string; window_start: string; window_end: string }>
  for (const row of experiments) {
    entries.push({
      id: 'experiment-window:' + row.id,
      date: row.window_start,
      kind: 'experiment_window',
      title: 'Experiment window · ' + row.title,
      detail: row.window_start + '–' + row.window_end + ' · ' + row.status,
      sourceKind: 'experiment',
      sourceId: row.id,
      metadata: { windowStart: row.window_start, windowEnd: row.window_end, status: row.status },
    })
  }

  const contextRows = (await sql.query(
    "SELECT context.id::text AS id, context.context_date::text AS context_date, context.note, array_agg(tags.tag_key ORDER BY tags.tag_key) AS tags FROM daily_context context JOIN daily_context_tags tags ON tags.context_id = context.id WHERE tags.tag_key IN ('sick','travel','rest_day','new_supplement','medication_change','unusual_physical_labor') GROUP BY context.id, context.context_date, context.note ORDER BY context.context_date, context.id",
  )) as Array<{ id: string; context_date: string; note: string | null; tags: string[] }>
  for (const row of contextRows) {
    entries.push({
      id: 'context-change:' + row.id,
      date: row.context_date,
      kind: 'context_event',
      title: row.tags.map((tag) => tag.replaceAll('_', ' ')).join(' · '),
      detail: row.note,
      sourceKind: 'daily_context',
      sourceId: row.id,
      metadata: { tags: row.tags },
    })
  }

  return entries
}

function splitWindows<T extends NumericObservation>(rows: readonly T[], recentStart: string): { recent: T[]; baseline: T[] } {
  return {
    recent: rows.filter((row) => row.date >= recentStart),
    baseline: rows.filter((row) => row.date < recentStart),
  }
}

async function recentCandidateExists(sql: Sql, kind: ChangeCandidateKind, direction: 'increase' | 'decrease', cooldownStart: string): Promise<boolean> {
  const rows = await sql.query(
    "SELECT id FROM change_candidates WHERE candidate_kind = $1 AND direction = $2 AND detected_on >= $3::date LIMIT 1",
    [kind, direction, cooldownStart],
  )
  return rows.length > 0
}

async function insertCandidate(sql: Sql, input: {
  kind: ChangeCandidateKind
  detectedOn: string
  windowStart: string
  windowEnd: string
  direction: 'increase' | 'decrease'
  magnitude: number
  unit: string
  summary: string
  metadata: Record<string, unknown>
}): Promise<void> {
  if (await recentCandidateExists(sql, input.kind, input.direction, addCalendarDays(input.detectedOn, -13))) return
  const key = fingerprint([input.kind, input.windowStart, input.windowEnd, input.direction, input.magnitude.toFixed(3)])
  await sql.query(
    "INSERT INTO change_candidates (id, fingerprint, candidate_kind, detected_on, window_start, window_end, direction, magnitude, unit, summary, metadata) VALUES ($1::uuid, $2, $3, $4::date, $5::date, $6::date, $7, $8::numeric, $9, $10, $11::jsonb) ON CONFLICT (fingerprint) DO NOTHING",
    [randomUUID(), key, input.kind, input.detectedOn, input.windowStart, input.windowEnd, input.direction, input.magnitude, input.unit, input.summary, JSON.stringify(input.metadata)],
  )
}

async function ensureBehaviorCandidates(sql: Sql, today: string, timezone: string): Promise<void> {
  const end = addCalendarDays(today, -1)
  const recentStart = addCalendarDays(end, -6)
  const baselineEnd = addCalendarDays(recentStart, -1)
  const baselineStart = addCalendarDays(baselineEnd, -13)

  const stepRows = (await sql.query(
    "SELECT summary_date::text AS date, steps_count FROM activity_daily_summaries WHERE timezone = $1 AND summary_date BETWEEN $2::date AND $3::date AND steps_count IS NOT NULL ORDER BY summary_date",
    [timezone, baselineStart, end],
  )) as Array<{ date: string; steps_count: string | number }>
  const stepWindows = splitWindows(stepRows.map((row) => ({ date: row.date, value: Number(row.steps_count) })), recentStart)
  const steps = detectMeanShift({ ...stepWindows, minRecent: 5, minBaseline: 8, minRelativePct: 20, minAbsoluteDelta: 1500 })
  if (steps) {
    await insertCandidate(sql, {
      kind: 'steps_shift',
      detectedOn: today,
      windowStart: recentStart,
      windowEnd: end,
      direction: steps.direction,
      magnitude: Math.abs(steps.delta),
      unit: 'steps/day',
      summary: 'Possible lasting ' + steps.direction + ' in daily steps',
      metadata: { recentMean: steps.recentMean, baselineMean: steps.baselineMean, deltaPct: steps.deltaPct, baselineStart, baselineEnd },
    })
  }

  const hydrationRows = (await sql.query(
    "SELECT hydration_date::text AS date, SUM(amount_ml)::numeric AS amount_ml FROM hydration_events WHERE hydration_date BETWEEN $1::date AND $2::date GROUP BY hydration_date ORDER BY hydration_date",
    [baselineStart, end],
  )) as Array<{ date: string; amount_ml: string | number }>
  const hydrationWindows = splitWindows(hydrationRows.map((row) => ({ date: row.date, value: Number(row.amount_ml) })), recentStart)
  const hydration = detectMeanShift({ ...hydrationWindows, minRecent: 5, minBaseline: 8, minRelativePct: 25, minAbsoluteDelta: 350 })
  if (hydration) {
    await insertCandidate(sql, {
      kind: 'hydration_shift',
      detectedOn: today,
      windowStart: recentStart,
      windowEnd: end,
      direction: hydration.direction,
      magnitude: Math.abs(hydration.delta),
      unit: 'ml/tracked day',
      summary: 'Possible lasting ' + hydration.direction + ' in logged water',
      metadata: {
        recentMean: hydration.recentMean,
        baselineMean: hydration.baselineMean,
        deltaPct: hydration.deltaPct,
        trackedRecentDays: hydrationWindows.recent.length,
        trackedBaselineDays: hydrationWindows.baseline.length,
        baselineStart,
        baselineEnd,
      },
    })
  }

  const trainingRows = (await sql.query(
    "SELECT workout_date::text AS date, COUNT(*)::int AS sessions FROM workout_sessions WHERE workout_date BETWEEN $1::date AND $2::date AND session_type IN ('programmed','ad_hoc','experiment') GROUP BY workout_date ORDER BY workout_date",
    [baselineStart, end],
  )) as Array<{ date: string; sessions: number | string }>
  const byDate = new Map(trainingRows.map((row) => [row.date, Number(row.sessions)]))
  const trainingObservations: NumericObservation[] = []
  for (let date = baselineStart; date <= end; date = addCalendarDays(date, 1)) {
    trainingObservations.push({ date, value: byDate.get(date) ?? 0 })
  }
  const trainingWindows = splitWindows(trainingObservations, recentStart)
  const training = detectMeanShift({ ...trainingWindows, minRecent: 7, minBaseline: 14, minRelativePct: 30, minAbsoluteDelta: 1.5 / 7 })
  if (training) {
    const recentPerWeek = training.recentMean * 7
    const baselinePerWeek = training.baselineMean * 7
    if (Math.max(recentPerWeek, baselinePerWeek) >= 2) {
      await insertCandidate(sql, {
        kind: 'training_frequency_shift',
        detectedOn: today,
        windowStart: recentStart,
        windowEnd: end,
        direction: training.direction,
        magnitude: Math.abs(recentPerWeek - baselinePerWeek),
        unit: 'sessions/week',
        summary: 'Possible lasting ' + training.direction + ' in Training frequency',
        metadata: { recentPerWeek, baselinePerWeek, deltaPct: training.deltaPct, baselineStart, baselineEnd },
      })
    }
  }
}

async function candidateRows(sql: Sql): Promise<CandidateRow[]> {
  return (await sql.query(
    "SELECT id::text AS id, fingerprint, candidate_kind, detected_on::text AS detected_on, window_start::text AS window_start, window_end::text AS window_end, direction, magnitude, unit, summary, status, metadata FROM change_candidates ORDER BY detected_on DESC, created_at DESC",
  )) as CandidateRow[]
}

export async function getChangeLedger(options: { ensureCandidates?: boolean } = {}): Promise<ChangeLedgerResponse> {
  const [sql, today, timezone] = await Promise.all([getSql(), currentHealthDate(), healthCalendarTimeZone()])
  if (options.ensureCandidates !== false) {
    await ensureBehaviorCandidates(sql, today, timezone)
  }
  const [explicit, candidates] = await Promise.all([explicitEntries(sql, timezone), candidateRows(sql)])
  const confirmed = candidates.filter((row) => row.status === 'confirmed').map(candidateEntry)
  return {
    asOf: today,
    entries: [...explicit, ...confirmed].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
    openCandidates: candidates.filter((row) => row.status === 'open').map(candidateEntry),
  }
}

export async function resolveChangeCandidate(id: string, status: Exclude<ChangeCandidateStatus, 'open'>): Promise<ChangeLedgerResponse> {
  if (status !== 'confirmed' && status !== 'dismissed') throw new HttpError(400, 'Invalid candidate decision')
  const sql = await getSql()
  const rows = await sql.query(
    "UPDATE change_candidates SET status = $2, resolved_at = now(), updated_at = now() WHERE id = $1::uuid AND status = 'open' RETURNING id",
    [id, status],
  )
  if (!rows[0]) {
    const exists = await sql.query("SELECT id FROM change_candidates WHERE id = $1::uuid", [id])
    if (!exists[0]) throw new HttpError(404, 'Change candidate not found')
  }
  return getChangeLedger()
}
