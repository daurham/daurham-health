import { isCalendarDate } from '../../src/domain/training.js'
import {
  buildProgressOverview,
  isProgressRange,
  utcCalendarDateFromNow,
  type ProgressOverview,
  type ProgressRange,
} from '../../src/domain/progress/index.js'
import { HttpError } from '../http.js'
import { loadProgressCanonicalRows } from './queries.js'

const DEFAULT_RANGE: ProgressRange = '30d'

export function parseProgressQuery(input: {
  range: string | null
  asOf: string | null
  now?: Date
}): { range: ProgressRange; asOf: string } {
  const range = input.range ? input.range.trim().toLowerCase() : DEFAULT_RANGE
  if (!isProgressRange(range)) {
    throw new HttpError(400, 'range must be 30d, 90d, 6m, 1y, or all')
  }
  const asOf = input.asOf?.trim() || utcCalendarDateFromNow(input.now ?? new Date())
  if (!isCalendarDate(asOf)) {
    throw new HttpError(400, 'asOf must be YYYY-MM-DD')
  }
  return { range, asOf }
}

export async function getProgressOverview(input: {
  range: string | null
  asOf: string | null
  now?: Date
}): Promise<ProgressOverview> {
  const query = parseProgressQuery(input)
  const rows = await loadProgressCanonicalRows()
  return buildProgressOverview({
    asOf: query.asOf,
    range: query.range,
    exercises: rows.exercises,
    workouts: rows.workouts,
    sets: rows.sets,
    bodyObservations: rows.bodyObservations,
  })
}
