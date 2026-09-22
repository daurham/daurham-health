import { z } from 'zod'
import { isCalendarDate } from '../../src/domain/training.js'
import {
  buildProgressOverview,
  buildProgressTimeline,
  isProgressRange,
  utcCalendarDateFromNow,
  type ProgressOverview,
  type ProgressRange,
  type ProgressTimeline,
} from '../../src/domain/progress/index.js'
import {
  buildProgressCompare,
  buildSinceCheckpointCompare,
  comparePeriod,
  type ProgressCompare,
} from '../../src/domain/progress/compare.js'
import {
  checkpointCreateSchema,
  checkpointPatchSchema,
  type ProgressCheckpoint,
} from '../../src/domain/progress/checkpoints.js'
import { HttpError } from '../http.js'
import { getSql } from '../db.js'
import {
  DELETE_CHECKPOINT_SQL,
  INSERT_CHECKPOINT_SQL,
  LIST_CHECKPOINTS_SQL,
  UPDATE_CHECKPOINT_SQL,
  loadProgressCanonicalRows,
  mapCheckpointRow,
} from './queries.js'

const DEFAULT_RANGE: ProgressRange = '30d'
const checkpointIdSchema = z.uuid()

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

function requireCalendarDate(value: string | null, name: string): string {
  const trimmed = value?.trim() ?? ''
  if (!isCalendarDate(trimmed)) {
    throw new HttpError(400, `${name} must be YYYY-MM-DD`)
  }
  return trimmed
}

export function parseCompareQuery(input: {
  startA: string | null
  endA: string | null
  startB: string | null
  endB: string | null
  checkpointId: string | null
  asOf: string | null
  now?: Date
}):
  | { mode: 'range'; periodA: ReturnType<typeof comparePeriod>; periodB: ReturnType<typeof comparePeriod> }
  | { mode: 'since_checkpoint'; checkpointId: string; asOf: string } {
  if (input.checkpointId) {
    const parsed = checkpointIdSchema.safeParse(input.checkpointId)
    if (!parsed.success) {
      throw new HttpError(400, 'checkpointId is invalid')
    }
    const asOf = input.asOf?.trim() || utcCalendarDateFromNow(input.now ?? new Date())
    if (!isCalendarDate(asOf)) {
      throw new HttpError(400, 'asOf must be YYYY-MM-DD')
    }
    return { mode: 'since_checkpoint', checkpointId: parsed.data, asOf }
  }
  let periodA
  let periodB
  try {
    periodA = comparePeriod(requireCalendarDate(input.startA, 'startA'), requireCalendarDate(input.endA, 'endA'))
    periodB = comparePeriod(requireCalendarDate(input.startB, 'startB'), requireCalendarDate(input.endB, 'endB'))
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid compare range')
  }
  return { mode: 'range', periodA, periodB }
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
    nutritionEntries: rows.nutritionEntries,
    nutritionTargets: rows.nutritionTargets,
  })
}

export async function getProgressTimeline(input: {
  range: string | null
  asOf: string | null
  now?: Date
}): Promise<ProgressTimeline> {
  const query = parseProgressQuery(input)
  const rows = await loadProgressCanonicalRows()
  return buildProgressTimeline({
    asOf: query.asOf,
    range: query.range,
    exercises: rows.exercises,
    workouts: rows.workouts,
    sets: rows.sets,
    bodyObservations: rows.bodyObservations,
    checkpoints: rows.checkpoints,
    nutritionEntries: rows.nutritionEntries,
    nutritionTargets: rows.nutritionTargets,
  })
}

export async function getProgressCompare(input: {
  startA: string | null
  endA: string | null
  startB: string | null
  endB: string | null
  checkpointId: string | null
  asOf: string | null
  now?: Date
}): Promise<ProgressCompare> {
  const query = parseCompareQuery(input)
  const rows = await loadProgressCanonicalRows()
  const canonical = {
    asOf: query.mode === 'since_checkpoint' ? query.asOf : query.periodB.end,
    range: 'all' as const,
    exercises: rows.exercises,
    workouts: rows.workouts,
    sets: rows.sets,
    bodyObservations: rows.bodyObservations,
    nutritionEntries: rows.nutritionEntries,
    nutritionTargets: rows.nutritionTargets,
  }
  if (query.mode === 'since_checkpoint') {
    const checkpoint = rows.checkpoints.find((item) => item.id === query.checkpointId)
    if (!checkpoint) {
      throw new HttpError(404, 'Checkpoint not found')
    }
    return buildSinceCheckpointCompare({ canonical, checkpoint, asOf: query.asOf })
  }
  return buildProgressCompare({ canonical, periodA: query.periodA, periodB: query.periodB })
}

export async function createProgressCheckpoint(body: unknown): Promise<ProgressCheckpoint> {
  const parsed = checkpointCreateSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid checkpoint')
  }
  const input = parsed.data
  const sql = await getSql()
  const rows = (await sql.query(INSERT_CHECKPOINT_SQL, [input.checkpointDate, input.label, input.notes])) as Record<
    string,
    unknown
  >[]
  const created = rows[0]
  if (!created) {
    throw new HttpError(500, 'Could not create checkpoint')
  }
  return mapCheckpointRow(created)
}

function parsePatchBody(body: unknown) {
  const parsed = checkpointPatchSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid checkpoint update')
  }
  return parsed.data
}

export async function updateProgressCheckpoint(id: string, body: unknown): Promise<ProgressCheckpoint> {
  const parsedId = checkpointIdSchema.safeParse(id)
  if (!parsedId.success) {
    throw new HttpError(400, 'Checkpoint id is invalid')
  }
  const input = parsePatchBody(body)
  const sql = await getSql()
  const rows = (await sql.query(UPDATE_CHECKPOINT_SQL, [
    parsedId.data,
    input.checkpointDate ?? null,
    input.label ?? null,
    input.notes !== undefined,
    input.notes ?? null,
  ])) as Record<string, unknown>[]
  const updated = rows[0]
  if (!updated) {
    throw new HttpError(404, 'Checkpoint not found')
  }
  return mapCheckpointRow(updated)
}

export async function deleteProgressCheckpoint(id: string): Promise<{ id: string }> {
  const parsedId = checkpointIdSchema.safeParse(id)
  if (!parsedId.success) {
    throw new HttpError(400, 'Checkpoint id is invalid')
  }
  const sql = await getSql()
  const rows = (await sql.query(DELETE_CHECKPOINT_SQL, [parsedId.data])) as Array<{ id: string }>
  if (rows.length === 0) {
    throw new HttpError(404, 'Checkpoint not found')
  }
  return { id: String(rows[0]!.id) }
}

export async function getProgressCheckpointList(): Promise<ProgressCheckpoint[]> {
  const sql = await getSql()
  try {
    const rows = (await sql.query(LIST_CHECKPOINTS_SQL)) as Record<string, unknown>[]
    return rows.map(mapCheckpointRow)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('does not exist')) {
      throw new HttpError(503, 'Progress tables are not available. Apply pending migrations.')
    }
    throw error
  }
}
