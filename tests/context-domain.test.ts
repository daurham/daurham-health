import { describe, expect, it } from 'vitest'
import {
  DAILY_CONTEXT_TAG_CATALOG,
  DAILY_CONTEXT_TAG_KEYS,
  contextsInRange,
  contextsWithTag,
  contextDateError,
  contextRangeError,
  normalizeContextWrite,
  orderContextTags,
  todayContextFromRecord,
  type DailyContext,
} from '../src/domain/context.ts'

const TODAY = '2026-09-26'

function context(partial: Partial<DailyContext> & Pick<DailyContext, 'id' | 'contextDate'>): DailyContext {
  return {
    tags: [],
    note: null,
    createdAt: '2026-09-26T15:00:00.000Z',
    updatedAt: '2026-09-26T15:00:00.000Z',
    ...partial,
  }
}

describe('daily context catalog and validation', () => {
  it('accepts the frozen catalog in catalog order and rejects unknown tags', () => {
    expect(DAILY_CONTEXT_TAG_KEYS).toHaveLength(12)
    expect(DAILY_CONTEXT_TAG_CATALOG.map((item) => item.label)).toEqual([
      'Sick',
      'Travel',
      'Alcohol',
      'Late meal',
      'Unusual stress',
      'Poor sleep opportunity',
      'Baby / night interruption',
      'Pain',
      'Rest day',
      'New supplement',
      'Medication change',
      'Unusual physical labor',
    ])
    const written = normalizeContextWrite({ tags: [...DAILY_CONTEXT_TAG_KEYS], note: null })
    expect(written).toEqual({ tags: [...DAILY_CONTEXT_TAG_KEYS], note: null })
    expect(normalizeContextWrite({ tags: ['travel', 'not_a_tag'], note: null })).toEqual({ error: 'Unknown context tag.' })
  })

  it('dedupes tags into catalog order and cleans the note', () => {
    expect(
      normalizeContextWrite({
        tags: ['pain', 'sick', 'pain'],
        note: '  Baby woke several times.  ',
      }),
    ).toEqual({
      tags: ['sick', 'pain'],
      note: 'Baby woke several times.',
    })
    expect(orderContextTags(['unusual_physical_labor', 'alcohol', 'travel'])).toEqual([
      'travel',
      'alcohol',
      'unusual_physical_labor',
    ])
    expect(normalizeContextWrite({ tags: [], note: '   ' })).toEqual({
      error: 'Add a tag or a note. An empty day is not stored.',
    })
    expect(normalizeContextWrite({ tags: [], note: null })).toEqual({
      error: 'Add a tag or a note. An empty day is not stored.',
    })
    expect(normalizeContextWrite({ tags: [], note: 'Café 日本語' })).toEqual({ tags: [], note: 'Café 日本語' })
    expect(normalizeContextWrite({ tags: [], note: 'x'.repeat(501) })).toEqual({
      error: 'Note must be 500 characters or fewer.',
    })
    expect(normalizeContextWrite({ tags: ['rest_day'], note: '   ' })).toEqual({ tags: ['rest_day'], note: null })
  })

  it('allows today and the past, and rejects future or invalid dates', () => {
    expect(contextDateError(TODAY, TODAY)).toBeNull()
    expect(contextDateError('2026-01-15', TODAY)).toBeNull()
    expect(contextDateError('2026-09-27', TODAY)).toMatch(/Future dates/)
    expect(contextDateError('2026-02-31', TODAY)).toMatch(/YYYY-MM-DD/)
    expect(contextDateError('09-26-2026', TODAY)).toMatch(/YYYY-MM-DD/)
    expect(contextRangeError('2026-09-01', '2026-09-26')).toBeNull()
    expect(contextRangeError('2026-09-27', '2026-09-01')).toMatch(/start date/)
    expect(contextRangeError('2026-13-01', '2026-09-26')).toMatch(/YYYY-MM-DD/)
  })

  it('treats a missing record as no context, and queries tags without reading notes', () => {
    expect(todayContextFromRecord(null)).toEqual({ recorded: false, id: null, tags: [], note: null })
    const rows = [
      context({
        id: 'note-only',
        contextDate: '2026-09-12',
        note: 'Drove through travel weather',
      }),
      context({
        id: 'tagged',
        contextDate: '2026-09-20',
        tags: ['late_meal', 'travel'],
        note: null,
      }),
      context({
        id: 'outside',
        contextDate: '2026-01-15',
        tags: ['travel'],
      }),
    ]
    expect(contextsInRange(rows, '2026-09-01', '2026-09-26').map((item) => item.id)).toEqual(['note-only', 'tagged'])
    expect(contextsWithTag(rows, 'travel').map((item) => item.id)).toEqual(['tagged', 'outside'])
    expect(contextsWithTag(rows, 'travel').some((item) => item.id === 'note-only')).toBe(false)
  })
})
