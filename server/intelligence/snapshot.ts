import {
  buildHealthIntelligenceSnapshot,
  type HealthIntelligenceSnapshot,
  type IntelligenceObservation,
  type IntelligenceProvenance,
  type IntelligenceSignalKey,
} from '../../src/domain/intelligence/shared.js'
import { nutritionDayQuality, type NutritionEvidenceQuality } from '../../src/domain/nutrition/quality.js'
import { trailingPeriod } from '../../src/domain/progress/periods.js'
import type { ProgressRange } from '../../src/domain/progress/types.js'
import { calendarDateFromInstant } from '../../src/domain/progress/dates.js'
import { poundsToKilograms } from '../../src/domain/units.js'
import { getSql } from '../db.js'
import { healthTimeContext } from '../health-time.js'
import { getChangeLedger } from './change-ledger.js'

type ExclusionRow = {
  entity_kind: string
  entity_id: string
  issue_snapshot: unknown
}

type Exclusions = {
  bodyMetrics: Set<string>
  bodySessions: Set<string>
  nutritionEntries: Set<string>
  nutritionDays: Set<string>
}

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function exclusionsFrom(rows: readonly ExclusionRow[]): Exclusions {
  const output: Exclusions = {
    bodyMetrics: new Set(),
    bodySessions: new Set(),
    nutritionEntries: new Set(),
    nutritionDays: new Set(),
  }
  for (const row of rows) {
    if (row.entity_kind === 'body_metric') output.bodyMetrics.add(row.entity_id)
    if (row.entity_kind === 'body_measurement_session') output.bodySessions.add(row.entity_id)
    if (row.entity_kind === 'nutrition_entry') output.nutritionEntries.add(row.entity_id)
    if (row.entity_kind === 'nutrition_day') output.nutritionDays.add(row.entity_id)
    if (row.entity_kind === 'nutrition_entry_pair') {
      const metadata = record(record(row.issue_snapshot).metadata)
      const ids = Array.isArray(metadata.entryIds) ? metadata.entryIds : row.entity_id.split(':')
      for (const id of ids) {
        if (typeof id === 'string' && id) output.nutritionEntries.add(id)
      }
    }
  }
  return output
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function provenanceFromNutrition(qualities: readonly NutritionEvidenceQuality[]): IntelligenceProvenance {
  const unique = new Set(qualities)
  if (unique.size !== 1) return 'mixed'
  const only = qualities[0]
  if (only === 'measured_reference') return 'reference'
  if (only === 'owner_entered') return 'owner'
  if (only === 'ai_estimate') return 'ai'
  return 'unknown'
}

function provenanceFromSourceKind(sourceKind: unknown): IntelligenceProvenance {
  if (sourceKind === 'manual') return 'owner'
  if (sourceKind === 'import' || sourceKind === 'shortcut') return 'device'
  return 'device'
}

function push(
  observations: IntelligenceObservation[],
  input: Omit<IntelligenceObservation, 'sourceIds'> & { sourceIds?: string[] },
): void {
  if (!Number.isFinite(input.value)) return
  observations.push({ ...input, sourceIds: input.sourceIds ?? [] })
}

function addExcluded(
  counts: Partial<Record<IntelligenceSignalKey, number>>,
  keys: readonly IntelligenceSignalKey[],
  amount = 1,
): void {
  for (const key of keys) counts[key] = (counts[key] ?? 0) + amount
}

function earliestDate(observations: readonly IntelligenceObservation[], asOf: string): string {
  return observations.reduce((min, item) => item.date < min ? item.date : min, asOf)
}

function bodyWeightKg(value: number, unit: string): number | null {
  const normalized = unit.trim().toLowerCase()
  if (normalized === 'kg' || normalized === 'kilogram' || normalized === 'kilograms') return value
  if (normalized === 'lb' || normalized === 'lbs' || normalized === 'pound' || normalized === 'pounds') return poundsToKilograms(value)
  return null
}

export async function loadHealthIntelligenceSnapshot(input: {
  range: ProgressRange
  asOf: string
}): Promise<HealthIntelligenceSnapshot> {
  const [sql, time] = await Promise.all([getSql(), healthTimeContext()])
  const [
    exclusionRows,
    activityRows,
    sleepRows,
    nutritionRows,
    trainingRows,
    bodyRows,
    hydrationRows,
    bowelRows,
    noBowelRows,
    wellnessRows,
    changeLedger,
  ] = await Promise.all([
    sql.query(
      "SELECT entity_kind, entity_id, issue_snapshot FROM data_quality_reviews WHERE review_status = 'excluded_from_analysis'",
    ),
    sql.query(
      "SELECT summary_date::text AS date, steps_count, active_energy_kcal, exercise_minutes FROM activity_daily_summaries WHERE timezone = $1 AND summary_date <= $2::date ORDER BY summary_date",
      [time.timezone, input.asOf],
    ),
    sql.query(
      "SELECT sleep_date::text AS date, total_sleep_minutes, analysis_eligible, observation_status, id::text AS source_id FROM sleep_nightly_summaries WHERE timezone = $1 AND sleep_date <= $2::date ORDER BY sleep_date",
      [time.timezone, input.asOf],
    ),
    sql.query(
      "SELECT id::text AS id, log_date::text AS date, calories, protein, carbs, fiber, sodium, evidence_quality FROM nutrition_entries WHERE log_date <= $1::date ORDER BY log_date, created_at, id",
      [input.asOf],
    ),
    sql.query(
      "SELECT id::text AS id, workout_date::text AS date, effort FROM workout_sessions WHERE workout_date <= $1::date ORDER BY workout_date, created_at, id",
      [input.asOf],
    ),
    sql.query(
      "SELECT metrics.id::text AS metric_id, sessions.id::text AS session_id, metrics.value, metrics.unit, sessions.measured_at, sessions.timezone, sessions.comparability, sources.source_kind FROM body_metrics metrics JOIN body_measurement_sessions sessions ON sessions.id = metrics.measurement_session_id JOIN data_sources sources ON sources.id = sessions.source_id WHERE metrics.metric_key = 'weight' AND (sessions.measured_at AT TIME ZONE $2)::date <= $1::date ORDER BY sessions.measured_at, metrics.id",
      [input.asOf, time.timezone],
    ),
    sql.query(
      "SELECT hydration_date::text AS date, id::text AS id, amount_ml FROM hydration_events WHERE hydration_date <= $1::date ORDER BY hydration_date, created_at, id",
      [input.asOf],
    ),
    sql.query(
      "SELECT bowel_date::text AS date, id::text AS id FROM bowel_events WHERE bowel_date <= $1::date ORDER BY bowel_date, created_at, id",
      [input.asOf],
    ),
    sql.query(
      "SELECT bowel_date::text AS date FROM bowel_day_states WHERE bowel_date <= $1::date AND state = 'no_bowel_movement' ORDER BY bowel_date",
      [input.asOf],
    ),
    sql.query(
      "SELECT wellness_date::text AS date, energy_rating, hunger_rating, soreness_rating, stress_rating FROM daily_wellness WHERE wellness_date <= $1::date ORDER BY wellness_date",
      [input.asOf],
    ),
    getChangeLedger({ ensureCandidates: false }),
  ])

  const exclusions = exclusionsFrom(exclusionRows as ExclusionRow[])
  const observations: IntelligenceObservation[] = []
  const excludedCounts: Partial<Record<IntelligenceSignalKey, number>> = {}

  for (const row of activityRows as Array<Record<string, unknown>>) {
    const date = String(row.date)
    const metrics: Array<[IntelligenceSignalKey, unknown, string]> = [
      ['activity.steps', row.steps_count, 'steps'],
      ['activity.active_energy_kcal', row.active_energy_kcal, 'kcal'],
      ['activity.exercise_minutes', row.exercise_minutes, 'min'],
    ]
    for (const [key, raw, unit] of metrics) {
      const value = numberOrNull(raw)
      if (value != null) push(observations, { key, date, value, unit, provenance: 'device' })
    }
  }

  for (const row of sleepRows as Array<Record<string, unknown>>) {
    if (row.analysis_eligible !== true || row.observation_status === 'partial_observation' || row.observation_status === 'in_bed_only') continue
    const value = numberOrNull(row.total_sleep_minutes)
    if (value == null) continue
    push(observations, {
      key: 'sleep.total_minutes',
      date: String(row.date),
      value,
      unit: 'min',
      provenance: 'device',
      sourceIds: row.source_id == null ? [] : [String(row.source_id)],
    })
  }

  const nutritionByDate = new Map<string, Array<{
    id: string
    calories: number
    protein: number | null
    carbs: number | null
    fiber: number | null
    sodium: number | null
    evidenceQuality: NutritionEvidenceQuality
  }>>()
  for (const row of nutritionRows as Array<Record<string, unknown>>) {
    const id = String(row.id)
    const date = String(row.date)
    if (exclusions.nutritionDays.has(date) || exclusions.nutritionEntries.has(id)) {
      addExcluded(excludedCounts, ['nutrition.calories', 'nutrition.protein_g', 'nutrition.carbs_g', 'nutrition.fiber_g', 'nutrition.sodium_mg'])
      continue
    }
    const calories = numberOrNull(row.calories)
    if (calories == null) continue
    const evidenceQuality = (
      row.evidence_quality === 'measured_reference' ||
      row.evidence_quality === 'owner_entered' ||
      row.evidence_quality === 'ai_estimate' ||
      row.evidence_quality === 'legacy_unknown'
    ) ? row.evidence_quality as NutritionEvidenceQuality : 'legacy_unknown'
    const current = nutritionByDate.get(date) ?? []
    current.push({
      id,
      calories,
      protein: numberOrNull(row.protein),
      carbs: numberOrNull(row.carbs),
      fiber: numberOrNull(row.fiber),
      sodium: numberOrNull(row.sodium),
      evidenceQuality,
    })
    nutritionByDate.set(date, current)
  }

  for (const [date, entries] of nutritionByDate) {
    const quality = nutritionDayQuality(entries.map((entry) => ({ calories: entry.calories, evidenceQuality: entry.evidenceQuality })))
    const provenance = provenanceFromNutrition(entries.map((entry) => entry.evidenceQuality))
    const sourceIds = entries.map((entry) => entry.id)
    push(observations, {
      key: 'nutrition.calories',
      date,
      value: entries.reduce((sum, entry) => sum + entry.calories, 0),
      unit: 'kcal',
      provenance,
      quality: quality.kind,
      sourceIds,
    })
    const nutrients: Array<[IntelligenceSignalKey, 'protein' | 'carbs' | 'fiber' | 'sodium', string]> = [
      ['nutrition.protein_g', 'protein', 'g'],
      ['nutrition.carbs_g', 'carbs', 'g'],
      ['nutrition.fiber_g', 'fiber', 'g'],
      ['nutrition.sodium_mg', 'sodium', 'mg'],
    ]
    for (const [key, field, unit] of nutrients) {
      if (entries.some((entry) => entry[field] == null)) continue
      push(observations, {
        key,
        date,
        value: entries.reduce((sum, entry) => sum + (entry[field] ?? 0), 0),
        unit,
        provenance,
        quality: quality.kind,
        sourceIds,
      })
    }
  }

  const trainingByDate = new Map<string, Array<{ id: string; effort: number | null }>>()
  for (const row of trainingRows as Array<Record<string, unknown>>) {
    const date = String(row.date)
    const current = trainingByDate.get(date) ?? []
    current.push({ id: String(row.id), effort: numberOrNull(row.effort) })
    trainingByDate.set(date, current)
  }
  for (const [date, sessions] of trainingByDate) {
    push(observations, {
      key: 'training.sessions',
      date,
      value: sessions.length,
      unit: 'sessions',
      provenance: 'owner',
      sourceIds: sessions.map((item) => item.id),
    })
    const efforts = sessions.map((item) => item.effort).filter((value): value is number => value != null)
    if (efforts.length > 0) {
      push(observations, {
        key: 'training.effort',
        date,
        value: efforts.reduce((sum, value) => sum + value, 0) / efforts.length,
        unit: '1–5',
        provenance: 'owner',
        sourceIds: sessions.filter((item) => item.effort != null).map((item) => item.id),
      })
    }
  }

  for (const row of bodyRows as Array<Record<string, unknown>>) {
    const metricId = String(row.metric_id)
    const sessionId = String(row.session_id)
    if (exclusions.bodyMetrics.has(metricId) || exclusions.bodySessions.has(sessionId)) {
      addExcluded(excludedCounts, ['body.weight_kg'])
      continue
    }
    const raw = numberOrNull(row.value)
    if (raw == null) continue
    const weightKg = bodyWeightKg(raw, String(row.unit))
    if (weightKg == null) continue
    const measured = row.measured_at instanceof Date ? row.measured_at : new Date(String(row.measured_at))
    if (Number.isNaN(measured.getTime())) continue
    const timezone = typeof row.timezone === 'string' && row.timezone ? row.timezone : time.timezone
    push(observations, {
      key: 'body.weight_kg',
      date: calendarDateFromInstant(measured, timezone),
      value: weightKg,
      unit: 'kg',
      provenance: provenanceFromSourceKind(row.source_kind),
      quality: typeof row.comparability === 'string' ? row.comparability : 'unknown',
      sourceIds: [metricId],
    })
  }

  const hydrationByDate = new Map<string, { amount: number; ids: string[] }>()
  for (const row of hydrationRows as Array<Record<string, unknown>>) {
    const amount = numberOrNull(row.amount_ml)
    if (amount == null) continue
    const date = String(row.date)
    const current = hydrationByDate.get(date) ?? { amount: 0, ids: [] }
    current.amount += amount
    current.ids.push(String(row.id))
    hydrationByDate.set(date, current)
  }
  for (const [date, total] of hydrationByDate) {
    push(observations, { key: 'hydration.ml', date, value: total.amount, unit: 'ml', provenance: 'owner', sourceIds: total.ids })
  }

  const bowelByDate = new Map<string, string[]>()
  for (const row of bowelRows as Array<Record<string, unknown>>) {
    const date = String(row.date)
    const current = bowelByDate.get(date) ?? []
    current.push(String(row.id))
    bowelByDate.set(date, current)
  }
  const explicitNoBowel = new Set((noBowelRows as Array<Record<string, unknown>>).map((row) => String(row.date)))
  for (const [date, ids] of bowelByDate) {
    push(observations, { key: 'bowel.count', date, value: ids.length, unit: 'count', provenance: 'owner', sourceIds: ids })
  }
  for (const date of explicitNoBowel) {
    if (!bowelByDate.has(date)) {
      push(observations, { key: 'bowel.count', date, value: 0, unit: 'count', provenance: 'owner', sourceIds: [] })
    }
  }

  for (const row of wellnessRows as Array<Record<string, unknown>>) {
    const date = String(row.date)
    const metrics: Array<[IntelligenceSignalKey, unknown]> = [
      ['wellness.energy', row.energy_rating],
      ['wellness.hunger', row.hunger_rating],
      ['wellness.soreness', row.soreness_rating],
      ['wellness.stress', row.stress_rating],
    ]
    for (const [key, raw] of metrics) {
      const value = numberOrNull(raw)
      if (value != null) push(observations, { key, date, value, unit: '1–5', provenance: 'owner' })
    }
  }

  const earliest = earliestDate(observations, input.asOf)
  const period = trailingPeriod(input.range, input.asOf, earliest)
  return buildHealthIntelligenceSnapshot({
    range: input.range,
    asOf: input.asOf,
    start: period.start,
    end: period.end,
    timezone: time.timezone,
    today: input.asOf === time.date ? time.date : null,
    observations,
    excludedObservationCountByKey: excludedCounts,
    changes: changeLedger.entries.filter((entry) => entry.date <= input.asOf),
  })
}
