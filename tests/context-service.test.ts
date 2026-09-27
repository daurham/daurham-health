import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '../server/http.ts'

const SOURCE = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-09-26T18:00:00.000Z')

type StoredContext = {
  id: string
  context_date: string
  note: string | null
  source_id: string
  created_at: string
  updated_at: string
}

type StoredTag = { context_id: string; tag_key: string }

const harness = vi.hoisted(() => {
  const state: { contexts: StoredContext[]; tags: StoredTag[]; clock: number } = {
    contexts: [],
    tags: [],
    clock: 0,
  }
  const calls: Array<{ text: string; params: unknown[] }> = []

  function stamp(): string {
    state.clock += 1
    return `2026-09-26T15:00:0${state.clock}.000Z`
  }

  function execute(text: string, params: unknown[]): unknown[] {
    calls.push({ text, params })
    if (text.includes("key = 'manual'")) {
      return [{ id: SOURCE }]
    }
    if (text.startsWith('INSERT INTO daily_context ')) {
      const [id, contextDate, note, sourceId] = params as [string, string, string | null, string]
      if (state.contexts.some((item) => item.context_date === contextDate)) {
        throw new Error('duplicate key value violates unique constraint')
      }
      const at = stamp()
      state.contexts.push({
        id,
        context_date: contextDate,
        note,
        source_id: sourceId,
        created_at: at,
        updated_at: at,
      })
      return []
    }
    if (text.startsWith('UPDATE daily_context')) {
      const [id, note] = params as [string, string | null]
      const row = state.contexts.find((item) => item.id === id)
      if (row) {
        row.note = note
        row.updated_at = stamp()
      }
      return []
    }
    if (text.startsWith('DELETE FROM daily_context_tags')) {
      const [id] = params as [string]
      state.tags = state.tags.filter((item) => item.context_id !== id)
      return []
    }
    if (text.startsWith('INSERT INTO daily_context_tags')) {
      const [contextId, tagKey] = params as [string, string]
      state.tags.push({ context_id: contextId, tag_key: tagKey })
      return []
    }
    if (text.startsWith('DELETE FROM daily_context')) {
      const [id] = params as [string]
      state.contexts = state.contexts.filter((item) => item.id !== id)
      state.tags = state.tags.filter((item) => item.context_id !== id)
      return []
    }
    if (text.includes('JOIN daily_context_tags')) {
      const [tag, start, end] = params as [string, string, string]
      const ids = new Set(state.tags.filter((item) => item.tag_key === tag).map((item) => item.context_id))
      return state.contexts
        .filter((item) => ids.has(item.id) && item.context_date >= start && item.context_date <= end)
        .sort((left, right) => (left.context_date < right.context_date ? -1 : 1))
    }
    if (text.includes('FROM daily_context_tags')) {
      const ids = new Set((params[0] as string[]) ?? [])
      return state.tags.filter((item) => ids.has(item.context_id))
    }
    if (text.includes('context_date >= $1::date')) {
      const [start, end] = params as [string, string]
      return state.contexts
        .filter((item) => item.context_date >= start && item.context_date <= end)
        .sort((left, right) => (left.context_date < right.context_date ? -1 : 1))
    }
    if (text.includes('ORDER BY context_date')) {
      return [...state.contexts].sort((left, right) => (left.context_date < right.context_date ? -1 : 1))
    }
    if (text.includes('WHERE context_date = $1::date')) {
      const date = String(params[0])
      const row = state.contexts.find((item) => item.context_date === date)
      return row ? [row] : []
    }
    throw new Error(`unexpected sql: ${text}`)
  }

  function query(text: string, params: unknown[] = []) {
    return {
      then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve()
          .then(() => execute(text, params))
          .then(onFulfilled, onRejected)
      },
    }
  }

  const sql = Object.assign(query, {
    query,
    transaction: async (queries: Array<{ then: (onFulfilled?: (value: unknown) => unknown) => Promise<unknown> }>) => {
      const results = []
      for (const item of queries) {
        results.push(await item)
      }
      return results
    },
  })

  return { state, calls, sql }
})

vi.mock('../server/db.ts', () => ({
  getSql: async () => harness.sql,
  formatDatabaseError: (error: unknown) => (error instanceof Error ? error.message : 'error'),
}))

import {
  CONTEXT_BY_TAG_SQL,
  contextWriteStatements,
  deleteDailyContext,
  getDailyContext,
  listDailyContextsByTag,
  putDailyContext,
} from '../server/context/service.ts'

describe('daily context persistence', () => {
  beforeEach(() => {
    harness.state.contexts = []
    harness.state.tags = []
    harness.state.clock = 0
    harness.calls.length = 0
  })

  it('creates tag-only, note-only, and combined context without an empty row', async () => {
    const tagsOnly = await putDailyContext('2026-09-20', { tags: ['rest_day'], note: '   ' }, NOW)
    const noteOnly = await putDailyContext('2026-09-12', { tags: [], note: 'Café 日本語' }, NOW)
    const both = await putDailyContext(
      '2026-09-26',
      { tags: ['baby_night_interruption', 'poor_sleep_opportunity'], note: 'Baby woke several times.' },
      NOW,
    )
    expect(tagsOnly.tags).toEqual(['rest_day'])
    expect(tagsOnly.note).toBeNull()
    expect(noteOnly.tags).toEqual([])
    expect(noteOnly.note).toBe('Café 日本語')
    expect(both.tags).toEqual(['poor_sleep_opportunity', 'baby_night_interruption'])
    expect(both.note).toBe('Baby woke several times.')
    expect(harness.state.contexts).toHaveLength(3)
    await expect(putDailyContext('2026-09-11', { tags: [], note: '  ' }, NOW)).rejects.toBeInstanceOf(HttpError)
    expect(harness.state.contexts).toHaveLength(3)
    expect(await getDailyContext('2026-09-11', NOW)).toBeNull()
    expect(harness.calls.some((call) => call.text.startsWith('INSERT INTO daily_context ') && call.params[1] === '2026-09-11')).toBe(
      false,
    )
  })

  it('updates the same context id, replaces tags, and keeps created_at', async () => {
    const created = await putDailyContext(
      '2026-09-26',
      { tags: ['sick', 'travel'], note: 'First note' },
      NOW,
    )
    const updated = await putDailyContext('2026-09-26', { tags: ['travel'], note: 'Corrected note' }, NOW)
    expect(updated.id).toBe(created.id)
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.updatedAt).not.toBe(created.updatedAt)
    expect(updated.tags).toEqual(['travel'])
    expect(updated.note).toBe('Corrected note')
    expect(harness.state.contexts).toHaveLength(1)
    expect(harness.state.tags.map((item) => item.tag_key)).toEqual(['travel'])
    const plan = contextWriteStatements({
      existingId: created.id,
      newId: 'unused',
      contextDate: '2026-09-26',
      note: 'Corrected note',
      sourceId: SOURCE,
      tags: ['travel'],
    })
    expect(plan.contextId).toBe(created.id)
    expect(plan.statements[0]?.text).toContain('updated_at = now()')
    expect(plan.statements[0]?.text).not.toContain('created_at')
    expect(harness.calls.some((call) => call.text.includes("key = 'manual'") && call.text.includes('INSERT'))).toBe(false)
  })

  it('deletes a date and cascades tag membership without inventing an empty row', async () => {
    const created = await putDailyContext('2026-09-26', { tags: ['pain'], note: null }, NOW)
    expect(await deleteDailyContext('2026-09-26', NOW)).toBe(true)
    expect(await getDailyContext('2026-09-26', NOW)).toBeNull()
    expect(harness.state.contexts).toEqual([])
    expect(harness.state.tags.filter((item) => item.context_id === created.id)).toEqual([])
    expect(await deleteDailyContext('2026-09-25', NOW)).toBe(false)
    expect(harness.state.contexts).toEqual([])
    await expect(putDailyContext('2026-09-27', { tags: ['travel'] }, NOW)).rejects.toMatchObject({ statusCode: 400 })
    await expect(putDailyContext('2026-02-31', { tags: ['travel'] }, NOW)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('lists a date range and a tag without parsing notes', async () => {
    await putDailyContext('2026-09-12', { tags: [], note: 'Mention travel in prose only' }, NOW)
    await putDailyContext('2026-09-20', { tags: ['late_meal', 'travel'], note: null }, NOW)
    await putDailyContext('2026-01-15', { tags: ['travel'], note: null }, NOW)
    const where = CONTEXT_BY_TAG_SQL.split('WHERE')[1] ?? ''
    expect(where).toContain('tag_key')
    expect(where).not.toContain('note')
    const tagged = await listDailyContextsByTag('travel', '2026-09-01', '2026-09-26')
    expect(tagged.map((item) => item.contextDate)).toEqual(['2026-09-20'])
    expect(tagged[0]?.tags).toEqual(['travel', 'late_meal'])
    expect(tagged[0]?.note).toBeNull()
  })
})
