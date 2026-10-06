import { buildActivityProgressView } from '../../src/domain/activity/index.js'
import type { AskBenchmarkInput, AskContextInput, AskExperimentInput, AskHealthPacketInput } from '../../src/domain/ask-health/index.js'
import { findingCopy } from '../../src/domain/intelligence/copy.js'
import { analyzeCrossDomain } from '../../src/domain/intelligence/analyze.js'
import { buildProgressOverview } from '../../src/domain/progress/index.js'
import type { ProgressRange } from '../../src/domain/progress/types.js'
import { buildSleepProgressView } from '../../src/domain/sleep/index.js'
import { dailyContextTagLabel } from '../../src/domain/context.js'
import { listActivityDailySummaries } from '../activity/queries.js'
import { listGoalAskSnapshots } from '../goals/service.js'
import { listDailyContexts } from '../context/service.js'
import { listTimelineBenchmarkResults } from '../lab/results.js'
import { getSql } from '../db.js'
import { loadProgressCanonicalRows } from '../progress/queries.js'
import { listSleepNightlySummaries } from '../sleep/queries.js'
import { listSupplementRangeInputs } from '../supplements/queries.js'
import { healthTimeContext } from '../health-time.js'

export async function loadAskHealthPacketInput(input: {
  lens: AskHealthPacketInput['lens']
  range: ProgressRange
  asOf: string
  question: string
  generatedAt: string
}): Promise<AskHealthPacketInput> {
  const { date: today, timezone } = await healthTimeContext()
  const rows = await loadProgressCanonicalRows()
  const overview = buildProgressOverview({
    asOf: input.asOf,
    range: input.range,
    exercises: rows.exercises,
    workouts: rows.workouts,
    sets: rows.sets,
    bodyObservations: rows.bodyObservations,
    nutritionEntries: rows.nutritionEntries,
    nutritionTargets: rows.nutritionTargets,
  })
  const period = { start: overview.period.start, end: overview.period.end }
  const [activityRows, sleepNights, goals, supplements, experiments, benchmarks, contexts] = await Promise.all([
    listActivityDailySummaries(timezone),
    listSleepNightlySummaries(timezone),
    listGoalAskSnapshots(input.asOf),
    listSupplementRangeInputs(period.start, period.end),
    loadExperiments(input.asOf),
    loadBenchmarks(period.start, period.end, input.asOf),
    listDailyContexts(period.start, period.end),
  ])
  const activity = buildActivityProgressView(
    activityRows.filter((row) => row.date <= input.asOf),
    { range: input.range, asOf: input.asOf, today, timezone },
  )
  const sleep = buildSleepProgressView(
    sleepNights.filter((night) => night.sleepDate <= input.asOf),
    { range: input.range, asOf: input.asOf, timezone },
  )
  const patterns = analyzeCrossDomain({
    range: input.range,
    asOf: input.asOf,
    today: input.asOf === today ? today : null,
    timezone,
    activityDays: activityRows.filter((row) => row.date <= input.asOf),
    sleepNights: sleepNights.filter((night) => night.sleepDate <= input.asOf),
    nutritionDays: overview.nutrition.observations,
    trainingSessions: overview.training.sessions.map((session) => ({
      sessionId: session.sessionId,
      sessionDate: session.sessionDate,
      effort: session.effort ?? null,
      painLevel: null,
    })),
    bodyWeights: overview.body.weight.observations.filter((item) => item.key === 'weight' && item.calendarDate <= input.asOf),
  }).findings.flatMap((finding) => {
    if (!finding.surfaced) {
      return []
    }
    const text = findingCopy(finding)
    return text ? [{ id: finding.id, text }] : []
  })
  return {
    lens: input.lens,
    range: input.range,
    asOf: input.asOf,
    period: { start: period.start, end: period.end },
    generatedAt: input.generatedAt,
    question: input.question,
    overview,
    activity,
    sleep,
    goals,
    experiments,
    benchmarks,
    supplements,
    context: contextSnapshot(contexts),
    patterns,
  }
}

async function loadExperiments(asOf: string): Promise<AskExperimentInput[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT e.id::text AS id, e.title, e.question, e.hypothesis, e.status,
            r.classification,
            v.version,
            (SELECT count(*)::int FROM experiment_result_requirements q WHERE q.experiment_result_id = r.id AND q.criterion_status = 'pass') AS pass_count,
            (SELECT count(*)::int FROM experiment_result_requirements q WHERE q.experiment_result_id = r.id AND q.criterion_status = 'fail') AS fail_count,
            (SELECT count(*)::int FROM experiment_result_requirements q WHERE q.experiment_result_id = r.id AND q.evaluation_status = 'missing') AS missing_count
     FROM experiments e
     LEFT JOIN experiment_results r
       ON r.experiment_id = e.id AND r.status = 'valid' AND r.effective_end_date <= $1::date
     LEFT JOIN lab_protocol_versions v ON v.id = COALESCE(r.protocol_version_id, e.protocol_version_id)
     WHERE e.window_start IS NULL OR e.window_start <= $1::date
     ORDER BY e.created_at DESC
     LIMIT 8`,
    [asOf],
  )) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    question: String(row.question),
    hypothesis: row.hypothesis == null ? null : String(row.hypothesis),
    status: String(row.status),
    classification: row.classification == null ? null : String(row.classification),
    protocolVersion: row.version == null ? null : Number(row.version),
    requirementPass: row.pass_count == null ? null : Number(row.pass_count),
    requirementFail: row.fail_count == null ? null : Number(row.fail_count),
    requirementMissing: row.missing_count == null ? null : Number(row.missing_count),
  }))
}

async function loadBenchmarks(start: string, end: string, asOf: string): Promise<AskBenchmarkInput[]> {
  const rows = await listTimelineBenchmarkResults(start, end, false)
  const latest = new Map<string, AskBenchmarkInput>()
  for (const row of rows) {
    if (row.resultDate > asOf || row.primary.length === 0) {
      continue
    }
    const primary = row.primary[0]!
    latest.set(row.title, {
      id: row.id,
      title: row.title,
      protocolVersion: row.protocolVersion,
      resultDate: row.resultDate,
      label: primary.label,
      value: primary.value,
      unit: primary.unit,
    })
  }
  return [...latest.values()].slice(0, 6)
}

function contextSnapshot(records: Awaited<ReturnType<typeof listDailyContexts>>): AskContextInput {
  const tagCounts: Record<string, number> = {}
  const notes: Array<{ date: string; text: string }> = []
  for (const record of records) {
    for (const tag of record.tags) {
      const label = dailyContextTagLabel(tag)
      tagCounts[label] = (tagCounts[label] ?? 0) + 1
    }
    if (record.note && record.note.trim()) {
      notes.push({ date: record.contextDate, text: record.note.trim() })
    }
  }
  return {
    tagCounts,
    notedDays: notes.length,
    notes: notes.slice(-3),
  }
}
