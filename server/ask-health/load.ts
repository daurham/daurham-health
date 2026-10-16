import { buildActivityProgressView } from '../../src/domain/activity/index.js'
import { auditAskHealthSharedCoverage } from '../../src/domain/ask-health/diagnostics.js'
import { askNutritionIntegrityFromSnapshot } from '../../src/domain/ask-health/nutrition-integrity.js'
import { askClinicalProfileForDate } from '../../src/domain/ask-health/clinical-profile.js'
import { askStableProfileForDate } from '../../src/domain/ask-health/stable-profile.js'
import type { AskBenchmarkInput, AskContextInput, AskExperimentInput, AskHealthPacketInput } from '../../src/domain/ask-health/index.js'
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
import { routeHealthIntelligence } from '../../src/domain/intelligence/shared.js'
import { loadHealthIntelligenceSnapshot } from '../intelligence/snapshot.js'
import { getHealthProfile } from '../profile/service.js'
import { focusTrainingWorkingSets } from '../../src/domain/ask-health/focused-training.js'
import { attachBristolTypes, digestiveQuestionTopics, focusDigestiveContext } from '../../src/domain/ask-health/focused-digestive.js'
import { bowelSnapshotEventIds, selectDigestiveBowelWindow, summarizeBowelWindow, type DigestiveBowelWindow } from '../../src/domain/ask-health/digestive-window.js'
import { screenDigestiveLagReadiness } from '../../src/domain/ask-health/digestive-pairing.js'
import type { AskContextMode } from '../../src/domain/ask-health/config.js'

export async function loadAskHealthPacketInput(input: {
  lens: AskHealthPacketInput['lens']
  range: ProgressRange
  asOf: string
  question: string
  generatedAt: string
  contextMode?: AskContextMode
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
  const [activityRows, sleepNights, goals, supplements, experiments, benchmarks, contexts, intelligenceSnapshot, profile] = await Promise.all([
    listActivityDailySummaries(timezone),
    listSleepNightlySummaries(timezone),
    listGoalAskSnapshots(input.asOf),
    listSupplementRangeInputs(period.start, period.end),
    loadExperiments(input.asOf),
    loadBenchmarks(period.start, period.end, input.asOf),
    listDailyContexts(period.start, period.end),
    loadHealthIntelligenceSnapshot({ range: input.range, asOf: input.asOf }),
    getHealthProfile(),
  ])
  const activity = buildActivityProgressView(
    activityRows.filter((row) => row.date <= input.asOf),
    { range: input.range, asOf: input.asOf, today, timezone },
  )
  const sleep = buildSleepProgressView(
    sleepNights.filter((night) => night.sleepDate <= input.asOf),
    { range: input.range, asOf: input.asOf, timezone },
  )
  const intelligence = routeHealthIntelligence(intelligenceSnapshot, {
    question: input.question,
    lens: input.lens,
    wide: input.contextMode === 'deep',
  })
  const patterns: AskHealthPacketInput['patterns'] = []
  const digestive = focusDigestiveContext({
    question: input.question, snapshot: intelligenceSnapshot, today,
    includeBroadContext: input.contextMode === 'deep',
  })
  const topics = digestiveQuestionTopics(input.question)
  // At most 60 already-identified canonical event IDs from the three sampled
  // days. No free-form notes or unrelated bowel history are queried.
  const bowelIds = digestive && (input.contextMode === 'deep' || topics.bowel)
    ? digestive.bowel.observations.flatMap((day) => day.sourceIds).slice(0, 60)
    : []
  let focusedDigestive = digestive
  if (bowelIds.length > 0) {
    const sql = await getSql()
    const rows = (await sql.query(
      'SELECT id::text AS id, bowel_date::text AS date, bristol_type AS bristol_type FROM bowel_events WHERE id = ANY($1::uuid[]) AND bowel_date >= $2::date AND bowel_date <= $3::date',
      [bowelIds, period.start, input.asOf],
    )) as Array<Record<string, unknown>>
    focusedDigestive = attachBristolTypes(digestive, rows.map((row) => ({
      id: String(row.id), date: String(row.date), bristolType: Number(row.bristol_type),
    })))
  }
  // PIQ-4.1: aggregate only dated counts, not raw bowel notes, identities,
  // or event timestamps. Do not load for unrelated/personal-data-free prompts.
  // Entire selected/requested scope must fit the cap: no silent partial window.
  const selectedBowelWindow = digestive &&
    (topics.bowel || input.contextMode === 'deep') && input.contextMode !== 'general_only'
    ? selectDigestiveBowelWindow(digestive, today) : null
  if (selectedBowelWindow && focusedDigestive) {
    let bowelWindow: DigestiveBowelWindow
    if (selectedBowelWindow.status === 'range_too_large') {
      bowelWindow = {
        status: 'unavailable', reason: 'range_too_large', scope: selectedBowelWindow.scope,
      }
    } else {
      // Do not accept event totals if the first canonical snapshot contains
      // too many, repeated or unusable event identities. A delete-and-readd
      // with unchanged counts is NOT the same event history.
      const expectedIds = bowelSnapshotEventIds(intelligenceSnapshot, selectedBowelWindow.scope)
      try {
        if (expectedIds == null) throw new Error('bowel identity snapshot unavailable')
        const sql = await getSql()
        const dailyRows = (await sql.query(
          `SELECT events.bowel_date::text AS date,
             count(*)::int AS event_count,
             count(*) FILTER (WHERE bristol_type BETWEEN 1 AND 7)::int AS typed_count,
             count(*) FILTER (WHERE bristol_type IN (1,2))::int AS hard_count,
             count(matched.id)::int AS matched_event_count
           FROM bowel_events events
           LEFT JOIN unnest($3::uuid[], $4::date[]) AS matched(id, bowel_date)
             ON matched.id = events.id AND matched.bowel_date = events.bowel_date
           WHERE events.bowel_date >= $1::date AND events.bowel_date <= $2::date
           GROUP BY events.bowel_date ORDER BY events.bowel_date`,
          [selectedBowelWindow.scope.start, selectedBowelWindow.scope.end,
            expectedIds.map(item => item.id), expectedIds.map(item => item.date)],
        )) as Array<Record<string, unknown>>
        bowelWindow = summarizeBowelWindow(intelligenceSnapshot, selectedBowelWindow.scope,
          dailyRows.map(row => ({
            date: String(row.date),
            eventCount: Number(row.event_count),
            typedCount: Number(row.typed_count),
            hardCount: Number(row.hard_count),
            matchedEventCount: Number(row.matched_event_count),
          })), today)
      } catch {
        // Do not invent a partial trend or expose SQL/error text to Health AI.
        bowelWindow = {
          status: 'unavailable', reason: 'source_unavailable', scope: selectedBowelWindow.scope,
        }
      }
    }
    focusedDigestive = { ...focusedDigestive, bowelWindow,
      digestivePairing: screenDigestiveLagReadiness(intelligenceSnapshot, bowelWindow, today, contexts.map(row => ({
        contextDate: row.contextDate, tags: row.tags,
      }))),
    }
  }
  return {
    lens: input.lens,
    range: input.range,
    asOf: input.asOf,
    healthToday: today,
    period: { start: period.start, end: period.end },
    generatedAt: input.generatedAt,
    question: input.question,
    contextMode: input.contextMode,
    overview,
    activity,
    sleep,
    goals,
    experiments,
    benchmarks,
    supplements,
    focusedDigestive,
    focusedTraining: focusTrainingWorkingSets({
      question: input.question,
      exercises: rows.exercises,
      sets: rows.sets,
      start: period.start,
      end: period.end,
      today,
      asOf: input.asOf,
    }),
    context: contextSnapshot(contexts),
    patterns,
    stableProfile: askStableProfileForDate(profile, input.asOf, today),
    profile: askClinicalProfileForDate(profile, input.asOf, today),
    intelligence,
    nutritionIntegrity: askNutritionIntegrityFromSnapshot({ nutrition: overview.nutrition, intelligence: intelligenceSnapshot, today }),
    sourceCoverageAudit: auditAskHealthSharedCoverage(intelligenceSnapshot, intelligence),
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
