import {
  activeProtocolRetests,
  buildBenchmarkRetestView,
  orderAutomaticRetests,
  type BenchmarkRetestView,
  type RetestExperimentLink,
  type RetestResultInput,
} from '../../src/domain/lab-retests.js'
import { healthCalendarDateFromNow } from '../../src/domain/time.js'
import { HttpError } from '../http.js'
import { getSql } from '../db.js'

type ProtocolRow = {
  benchmark_id: string
  title: string
  is_active: boolean
  protocol_version_id: string
  version: number
  is_current: boolean
  minimum_retest_days: number | string | null
  suggested_retest_days: number | string | null
  result_id: string | null
  result_date: string | null
  created_at: string | null
  requirement_id: string | null
  label: string | null
  position: number | null
  value: unknown
  unit: string | null
}

const PROTOCOL_SQL = `
  SELECT b.id::text AS benchmark_id,
         p.title,
         b.is_active,
         v.id::text AS protocol_version_id,
         v.version,
         v.is_current,
         v.minimum_retest_days,
         v.suggested_retest_days,
         r.id::text AS result_id,
         r.result_date::text AS result_date,
         r.created_at::text AS created_at,
         req.id::text AS requirement_id,
         req.label,
         req.position,
         val.value,
         val.unit
  FROM benchmark_definitions b
  JOIN lab_protocols p ON p.id = b.protocol_id
  JOIN lab_protocol_versions v ON v.protocol_id = p.id
  LEFT JOIN benchmark_results r
    ON r.benchmark_definition_id = b.id
   AND r.protocol_version_id = v.id
   AND r.status = 'valid'
  LEFT JOIN benchmark_result_values val ON val.benchmark_result_id = r.id
  LEFT JOIN lab_protocol_requirements req
    ON req.id = val.requirement_id
   AND req.role = 'primary_outcome'
  WHERE ($1::uuid IS NULL OR b.id = $1::uuid)
  ORDER BY b.id, v.version, r.result_date, r.created_at, req.position`

export async function listBenchmarkRetests(asOf = healthCalendarDateFromNow()): Promise<{ asOf: string; retests: BenchmarkRetestView[] }> {
  const built = await loadRetests(null, asOf)
  return {
    asOf,
    retests: orderAutomaticRetests(activeProtocolRetests(built)),
  }
}

export async function listProtocolRetestViews(asOf = healthCalendarDateFromNow()): Promise<BenchmarkRetestView[]> {
  const built = await loadRetests(null, asOf)
  return built.map((item) => item.view)
}

export async function getBenchmarkRetest(
  benchmarkDefinitionId: string,
  asOf = healthCalendarDateFromNow(),
): Promise<{ isActive: boolean; asOf: string; current: BenchmarkRetestView; history: BenchmarkRetestView[] }> {
  const built = await loadRetests(benchmarkDefinitionId, asOf)
  if (built.length === 0) {
    throw new HttpError(404, 'Benchmark was not found.')
  }
  const current = built.find((item) => item.isCurrent)
  if (!current) {
    throw new HttpError(404, 'Benchmark was not found.')
  }
  const history = built
    .filter((item) => !item.isCurrent)
    .sort((left, right) => right.view.protocolVersion - left.view.protocolVersion)
    .map((item) => item.view)
  return {
    isActive: built.some((item) => item.isActive),
    asOf,
    current: current.view,
    history,
  }
}

export async function listRetestExperimentLinks(): Promise<RetestExperimentLink[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT eb.benchmark_definition_id::text AS benchmark_definition_id, e.status
     FROM experiment_benchmarks eb
     JOIN experiments e ON e.id = eb.experiment_id
     WHERE e.status IN ('scheduled', 'active', 'accepted')`,
    [],
  )) as Array<{ benchmark_definition_id: string; status: string }>
  return rows.map((row) => ({
    benchmarkDefinitionId: row.benchmark_definition_id,
    status: row.status,
  }))
}

async function loadRetests(benchmarkDefinitionId: string | null, asOf: string) {
  const sql = await getSql()
  const rows = (await sql.query(PROTOCOL_SQL, [benchmarkDefinitionId])) as ProtocolRow[]
  const versions = new Map<
    string,
    {
      isActive: boolean
      isCurrent: boolean
      protocol: {
        benchmarkDefinitionId: string
        benchmarkTitle: string
        protocolVersionId: string
        protocolVersion: number
        minimumRetestDays: number | null
        suggestedRetestDays: number | null
      }
      results: Map<string, RetestResultInput>
    }
  >()
  for (const row of rows) {
    let version = versions.get(row.protocol_version_id)
    if (!version) {
      version = {
        isActive: row.is_active,
        isCurrent: row.is_current,
        protocol: {
          benchmarkDefinitionId: row.benchmark_id,
          benchmarkTitle: row.title,
          protocolVersionId: row.protocol_version_id,
          protocolVersion: Number(row.version),
          minimumRetestDays: optionalDays(row.minimum_retest_days),
          suggestedRetestDays: optionalDays(row.suggested_retest_days),
        },
        results: new Map(),
      }
      versions.set(row.protocol_version_id, version)
    }
    if (!row.result_id || !row.result_date || !row.created_at) {
      continue
    }
    let result = version.results.get(row.result_id)
    if (!result) {
      result = {
        id: row.result_id,
        benchmarkDefinitionId: row.benchmark_id,
        protocolVersionId: row.protocol_version_id,
        status: 'valid',
        resultDate: row.result_date,
        createdAt: row.created_at,
        primaryValues: [],
      }
      version.results.set(row.result_id, result)
    }
    const value = finiteNumber(row.value)
    if (row.requirement_id && row.label && row.unit && value != null) {
      result.primaryValues.push({
        requirementId: row.requirement_id,
        label: row.label,
        value,
        unit: row.unit,
      })
    }
  }
  return [...versions.values()].map((version) => ({
    isActive: version.isActive,
    isCurrent: version.isCurrent,
    view: buildBenchmarkRetestView(version.protocol, [...version.results.values()], asOf),
  }))
}

function optionalDays(value: number | string | null): number | null {
  if (value == null) {
    return null
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    return null
  }
  return parsed
}

function finiteNumber(value: unknown): number | null {
  if (value == null) {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return parsed
}
