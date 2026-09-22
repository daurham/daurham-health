import { listActivityDailySummaries } from '../activity/queries.js'
import { formatDatabaseError, getSql } from '../db.js'
import { listAllEntries, listAllTargets } from '../nutrition/queries.js'
import { listSleepObservationsForProgress } from '../sleep/queries.js'
import { nutritionDailyObservations } from '../../src/domain/progress/nutrition.js'
import { calendarDateFromInstant } from '../../src/domain/progress/dates.js'
import { PROGRESS_RANGES, type ProgressRange } from '../../src/domain/progress/types.js'
import type { BodyObservation } from '../../src/domain/progress/types.js'
import { HEALTH_CALENDAR_TIME_ZONE, healthCalendarDateFromNow } from '../../src/domain/time.js'
import {
  analyzeCrossDomain,
  type CrossDomainFinding,
  type IntelligenceTrainingSession,
} from '../../src/domain/intelligence/index.js'

function line(text = ''): void {
  process.stdout.write(`${text}\n`)
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asInt(value: unknown): number | null {
  const parsed = asNumber(value)
  return parsed == null || !Number.isInteger(parsed) ? null : parsed
}

function asInstant(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value))
}

function statistic(finding: CrossDomainFinding): string {
  if (finding.kind === 'spearman_association' || finding.kind === 'windowed_association') {
    const rho = finding.metrics.rho == null ? '—' : finding.metrics.rho.toFixed(3)
    return `n=${finding.metrics.n} rho=${rho}`
  }
  if (finding.kind === 'group_comparison') {
    const groups = `${finding.metrics.leftLabel} ${finding.metrics.leftDays} / ${finding.metrics.rightLabel} ${finding.metrics.rightDays}`
    const metrics = finding.metrics.metrics
      .map((metric) => {
        const left = metric.leftAverage == null ? '—' : metric.leftAverage.toFixed(1)
        const right = metric.rightAverage == null ? '—' : metric.rightAverage.toFixed(1)
        const delta = metric.delta == null ? '—' : metric.delta.toFixed(1)
        return `${metric.metric} ${left} vs ${right} (delta ${delta})`
      })
      .join('; ')
    return `${groups}; ${metrics}`
  }
  const metrics = finding.metrics
  const slope = metrics.slopePer30Days == null ? '—' : metrics.slopePer30Days.toFixed(3)
  const calories = metrics.averageCalories == null ? '—' : metrics.averageCalories.toFixed(1)
  return `trend ${metrics.trendStatus} ${slope} ${metrics.unit ?? ''} per 30 days; calories ${calories}; logged ${metrics.loggedDays}/${metrics.calendarDays}`
}

async function loadTraining(): Promise<IntelligenceTrainingSession[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT id::text AS id, workout_date::text AS workout_date, effort, pain_level
     FROM workout_sessions
     ORDER BY workout_date ASC, id ASC`,
  )) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    sessionId: String(row.id),
    sessionDate: String(row.workout_date).slice(0, 10),
    effort: asInt(row.effort),
    painLevel: asInt(row.pain_level),
  }))
}

async function loadWeights(): Promise<BodyObservation[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT metrics.id::text AS measurement_id,
            metrics.measurement_session_id::text AS measurement_session_id,
            metrics.value,
            metrics.unit,
            metrics.value_kind,
            sessions.measured_at,
            sessions.timezone
     FROM body_metrics AS metrics
     JOIN body_measurement_sessions AS sessions
       ON sessions.id = metrics.measurement_session_id
     WHERE metrics.metric_key = 'weight'
     ORDER BY sessions.measured_at ASC, metrics.id ASC`,
  )) as Array<Record<string, unknown>>
  const weights: BodyObservation[] = []
  for (const row of rows) {
    const value = asNumber(row.value)
    if (value == null) {
      continue
    }
    const measuredAt = asInstant(row.measured_at)
    const timezone = typeof row.timezone === 'string' ? row.timezone : null
    weights.push({
      measurementId: String(row.measurement_id),
      measurementSessionId: String(row.measurement_session_id),
      key: 'weight',
      value,
      unit: String(row.unit),
      valueKind: String(row.value_kind),
      measuredAt: measuredAt.toISOString(),
      timezone,
      calendarDate: calendarDateFromInstant(measuredAt, timezone),
    })
  }
  return weights
}

async function main(): Promise<void> {
  const today = healthCalendarDateFromNow()
  const [activityDays, sleepNights, entries, targets, trainingSessions, bodyWeights] = await Promise.all([
    listActivityDailySummaries(),
    listSleepObservationsForProgress(),
    listAllEntries(),
    listAllTargets(),
    loadTraining(),
    loadWeights(),
  ])
  const nutritionDays = nutritionDailyObservations({
    entries,
    targets,
    start: '2000-01-01',
    end: today,
  })

  line('CROSS-DOMAIN EVIDENCE')
  line(`timezone: ${HEALTH_CALENDAR_TIME_ZONE}`)
  line(`asOf / today: ${today}`)
  line('Findings are derived on demand and are not written to the database.')
  line()

  for (const range of PROGRESS_RANGES) {
    const state = analyzeCrossDomain({
      range: range as ProgressRange,
      asOf: today,
      today,
      activityDays,
      sleepNights,
      nutritionDays,
      trainingSessions,
      bodyWeights,
    })
    line(`RANGE ${state.period.range}  ${state.period.start} → ${state.period.end}  (${state.period.dayCount} days)`)
    line(`provisional activity date excluded: ${state.provisionalActivityDate ?? 'none'}`)
    line(`surfaced: ${state.findings.length}`)
    for (const finding of state.relationships) {
      const coverage = `${finding.coverage.paired}/${finding.coverage.denominator} ${finding.coverage.label} (${Math.round(finding.coverage.pct)}%)`
      line(`- ${finding.id}`)
      line(`  state: ${finding.state}`)
      line(`  surfacing: ${finding.surfacing}`)
      line(`  sample: ${finding.sampleSize} (gate ${finding.gateSampleSize}, requires ${finding.requiredSampleSize})`)
      line(`  coverage: ${coverage}`)
      line(`  statistic: ${statistic(finding)}`)
    }
    line()
  }

  line('NO DATABASE WRITES.')
}

main().catch((error: unknown) => {
  process.stderr.write(`${formatDatabaseError(error)}\n`)
  process.exit(1)
})
