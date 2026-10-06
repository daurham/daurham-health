import { randomUUID } from 'node:crypto'
import {
  contextDateError,
  contextRangeError,
  isDailyContextTagKey,
  normalizeContextWrite,
  orderContextTags,
  type DailyContext,
  type DailyContextTagKey,
} from '../../src/domain/context.js'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'
import { currentHealthDate } from '../health-time.js'

type ContextRow = {
  id: string
  context_date: string
  note: string | null
  created_at: Date | string
  updated_at: Date | string
}

type TagRow = {
  context_id: string
  tag_key: string
}

export const CONTEXT_BY_TAG_SQL = `SELECT c.id::text AS id,
       c.context_date::text AS context_date,
       c.note,
       c.created_at,
       c.updated_at
FROM daily_context c
JOIN daily_context_tags t ON t.context_id = c.id
WHERE t.tag_key = $1
  AND c.context_date >= $2::date
  AND c.context_date <= $3::date
ORDER BY c.context_date`

export function contextWriteStatements(input: {
  existingId: string | null
  newId: string
  contextDate: string
  note: string | null
  sourceId: string
  tags: readonly DailyContextTagKey[]
}): { contextId: string; statements: Array<{ text: string; params: unknown[] }> } {
  const tags = orderContextTags([...input.tags])
  if (input.existingId) {
    return {
      contextId: input.existingId,
      statements: [
        {
          text: `UPDATE daily_context
SET note = $2, updated_at = now()
WHERE id = $1::uuid`,
          params: [input.existingId, input.note],
        },
        {
          text: `DELETE FROM daily_context_tags WHERE context_id = $1::uuid`,
          params: [input.existingId],
        },
        ...tags.map((tag) => ({
          text: `INSERT INTO daily_context_tags (context_id, tag_key) VALUES ($1::uuid, $2)`,
          params: [input.existingId, tag],
        })),
      ],
    }
  }
  return {
    contextId: input.newId,
    statements: [
      {
        text: `INSERT INTO daily_context (id, context_date, note, source_id)
VALUES ($1::uuid, $2::date, $3, $4::uuid)`,
        params: [input.newId, input.contextDate, input.note, input.sourceId],
      },
      ...tags.map((tag) => ({
        text: `INSERT INTO daily_context_tags (context_id, tag_key) VALUES ($1::uuid, $2)`,
        params: [input.newId, tag],
      })),
    ],
  }
}

function instant(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  return new Date(value).toISOString()
}

function mapContext(row: ContextRow, tags: readonly string[]): DailyContext {
  const keys = tags.filter(isDailyContextTagKey)
  return {
    id: row.id,
    contextDate: row.context_date,
    tags: orderContextTags(keys),
    note: row.note,
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
  }
}

async function manualSourceId(sql: Sql): Promise<string> {
  const rows = (await sql.query(`SELECT id::text AS id FROM data_sources WHERE key = 'manual'`, [])) as Array<{
    id?: string
  }>
  const id = rows[0]?.id
  if (!id) {
    throw new HttpError(503, 'Manual data source is not configured')
  }
  return id
}

async function tagRows(sql: Sql, contextIds: readonly string[]): Promise<TagRow[]> {
  if (contextIds.length === 0) {
    return []
  }
  return (await sql.query(
    `SELECT context_id::text AS context_id, tag_key
     FROM daily_context_tags
     WHERE context_id = ANY($1::uuid[])`,
    [contextIds],
  )) as TagRow[]
}

function tagsByContext(rows: readonly TagRow[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>()
  for (const row of rows) {
    const list = grouped.get(row.context_id) ?? []
    list.push(row.tag_key)
    grouped.set(row.context_id, list)
  }
  return grouped
}

async function loadContextRow(sql: Sql, date: string): Promise<ContextRow | null> {
  const rows = (await sql.query(
    `SELECT id::text AS id,
            context_date::text AS context_date,
            note,
            created_at,
            updated_at
     FROM daily_context
     WHERE context_date = $1::date`,
    [date],
  )) as ContextRow[]
  return rows[0] ?? null
}

async function loadContexts(sql: Sql, rows: readonly ContextRow[]): Promise<DailyContext[]> {
  const grouped = tagsByContext(await tagRows(sql, rows.map((row) => row.id)))
  return rows.map((row) => mapContext(row, grouped.get(row.id) ?? []))
}

export async function getDailyContext(date: string, now = new Date()): Promise<DailyContext | null> {
  const today = await currentHealthDate(now)
  const dateError = contextDateError(date, today)
  if (dateError) {
    throw new HttpError(400, dateError)
  }
  const sql = await getSql()
  const row = await loadContextRow(sql, date)
  if (!row) {
    return null
  }
  const [context] = await loadContexts(sql, [row])
  return context ?? null
}

export async function listDailyContexts(start: string, end: string): Promise<DailyContext[]> {
  const rangeError = contextRangeError(start, end)
  if (rangeError) {
    throw new HttpError(400, rangeError)
  }
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT id::text AS id,
            context_date::text AS context_date,
            note,
            created_at,
            updated_at
     FROM daily_context
     WHERE context_date >= $1::date
       AND context_date <= $2::date
     ORDER BY context_date`,
    [start, end],
  )) as ContextRow[]
  return loadContexts(sql, rows)
}

export async function listDailyContextsByTag(tag: string, start: string, end: string): Promise<DailyContext[]> {
  if (!isDailyContextTagKey(tag)) {
    throw new HttpError(400, 'Unknown context tag.')
  }
  const rangeError = contextRangeError(start, end)
  if (rangeError) {
    throw new HttpError(400, rangeError)
  }
  const sql = await getSql()
  const rows = (await sql.query(CONTEXT_BY_TAG_SQL, [tag, start, end])) as ContextRow[]
  return loadContexts(sql, rows)
}

export async function listTimelineContexts(start: string, end: string, rangeAll: boolean): Promise<DailyContext[]> {
  if (rangeAll) {
    return listDailyContextsUnbounded()
  }
  return listDailyContexts(start, end)
}

async function listDailyContextsUnbounded(): Promise<DailyContext[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT id::text AS id,
            context_date::text AS context_date,
            note,
            created_at,
            updated_at
     FROM daily_context
     ORDER BY context_date`,
    [],
  )) as ContextRow[]
  return loadContexts(sql, rows)
}

async function applyWrite(
  sql: Sql,
  existingId: string | null,
  date: string,
  tags: readonly DailyContextTagKey[],
  note: string | null,
  sourceId: string,
): Promise<void> {
  const plan = contextWriteStatements({
    existingId,
    newId: existingId ?? randomUUID(),
    contextDate: date,
    note,
    sourceId,
    tags,
  })
  await sql.transaction(plan.statements.map((statement) => sql.query(statement.text, statement.params)))
}

export async function putDailyContext(date: string, body: unknown, now = new Date()): Promise<DailyContext> {
  const today = await currentHealthDate(now)
  const dateError = contextDateError(date, today)
  if (dateError) {
    throw new HttpError(400, dateError)
  }
  const parsed = normalizeContextWrite(body)
  if ('error' in parsed) {
    throw new HttpError(400, parsed.error)
  }
  const sql = await getSql()
  const sourceId = await manualSourceId(sql)
  const existing = await loadContextRow(sql, date)
  try {
    await applyWrite(sql, existing?.id ?? null, date, parsed.tags, parsed.note, sourceId)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!existing && message.toLowerCase().includes('duplicate')) {
      const raced = await loadContextRow(sql, date)
      if (!raced) {
        throw error
      }
      await applyWrite(sql, raced.id, date, parsed.tags, parsed.note, sourceId)
    } else {
      throw error
    }
  }
  const saved = await getDailyContext(date, now)
  if (!saved) {
    throw new HttpError(500, 'Context save did not persist.')
  }
  return saved
}

export async function deleteDailyContext(date: string, now = new Date()): Promise<boolean> {
  const today = await currentHealthDate(now)
  const dateError = contextDateError(date, today)
  if (dateError) {
    throw new HttpError(400, dateError)
  }
  const sql = await getSql()
  const existing = await loadContextRow(sql, date)
  if (!existing) {
    return false
  }
  await sql.query(`DELETE FROM daily_context WHERE id = $1::uuid`, [existing.id])
  return true
}
