import { isCalendarDate } from './training.js'

export const DAILY_CONTEXT_NOTE_MAX = 500
export const DAILY_CONTEXT_RANGE_MAX_DAYS = 3660

export const DAILY_CONTEXT_TAG_KEYS = [
  'sick',
  'travel',
  'alcohol',
  'late_meal',
  'unusual_stress',
  'poor_sleep_opportunity',
  'baby_night_interruption',
  'pain',
  'rest_day',
  'new_supplement',
  'medication_change',
  'unusual_physical_labor',
] as const

export type DailyContextTagKey = (typeof DAILY_CONTEXT_TAG_KEYS)[number]

export type DailyContextTagDefinition = {
  key: DailyContextTagKey
  label: string
  description: string
}

export const DAILY_CONTEXT_TAG_CATALOG: readonly DailyContextTagDefinition[] = [
  {
    key: 'sick',
    label: 'Sick',
    description: 'The owner marked this day as feeling sick. This is not a diagnosis.',
  },
  {
    key: 'travel',
    label: 'Travel',
    description: 'The owner marked travel as context for this day.',
  },
  {
    key: 'alcohol',
    label: 'Alcohol',
    description: 'The owner marked alcohol as present. No amount is recorded.',
  },
  {
    key: 'late_meal',
    label: 'Late meal',
    description: 'The owner marked a late meal. Health does not infer this from nutrition times.',
  },
  {
    key: 'unusual_stress',
    label: 'Unusual stress',
    description: 'The owner marked unusual stress. This is not a stress score.',
  },
  {
    key: 'poor_sleep_opportunity',
    label: 'Poor sleep opportunity',
    description: 'The owner felt the opportunity to sleep was poor. This is not measured sleep.',
  },
  {
    key: 'baby_night_interruption',
    label: 'Baby / night interruption',
    description: 'The owner marked a baby or night interruption. Health does not infer this from sleep.',
  },
  {
    key: 'pain',
    label: 'Pain',
    description: 'The owner wanted the day annotated for pain. This does not replace a workout pain score.',
  },
  {
    key: 'rest_day',
    label: 'Rest day',
    description: 'The owner marked a rest day. This does not forbid or infer training.',
  },
  {
    key: 'new_supplement',
    label: 'New supplement',
    description: 'The owner marked a new supplement as context. This does not create a supplement record.',
  },
  {
    key: 'medication_change',
    label: 'Medication change',
    description: 'The owner marked a medication change. This does not create a medication record.',
  },
  {
    key: 'unusual_physical_labor',
    label: 'Unusual physical labor',
    description: 'The owner marked physical work outside Training and Apple Activity.',
  },
]

const TAG_INDEX = new Map<DailyContextTagKey, number>(
  DAILY_CONTEXT_TAG_CATALOG.map((item, index) => [item.key, index]),
)

export type DailyContext = {
  id: string
  contextDate: string
  tags: DailyContextTagKey[]
  note: string | null
  createdAt: string
  updatedAt: string
}

export type TodayContextSnapshot = {
  recorded: boolean
  id: string | null
  tags: DailyContextTagKey[]
  note: string | null
}

export function dailyContextTagLabel(key: DailyContextTagKey): string {
  return DAILY_CONTEXT_TAG_CATALOG[TAG_INDEX.get(key) ?? 0]?.label ?? key
}

export function isDailyContextTagKey(value: string): value is DailyContextTagKey {
  return TAG_INDEX.has(value as DailyContextTagKey)
}

export function orderContextTags(tags: readonly DailyContextTagKey[]): DailyContextTagKey[] {
  const present = new Set(tags)
  return DAILY_CONTEXT_TAG_CATALOG.filter((item) => present.has(item.key)).map((item) => item.key)
}

export function characterCount(value: string): number {
  return Array.from(value).length
}

export function todayContextFromRecord(record: DailyContext | null): TodayContextSnapshot {
  if (!record) {
    return { recorded: false, id: null, tags: [], note: null }
  }
  return {
    recorded: true,
    id: record.id,
    tags: orderContextTags(record.tags),
    note: record.note,
  }
}

export function contextDateError(date: string, today: string): string | null {
  if (!isCalendarDate(date)) {
    return 'Use a calendar date as YYYY-MM-DD.'
  }
  if (!isCalendarDate(today)) {
    return 'Use a calendar date as YYYY-MM-DD.'
  }
  if (date > today) {
    return 'Daily context records what already happened. Future dates are not available.'
  }
  return null
}

export function contextRangeError(start: string, end: string): string | null {
  if (!isCalendarDate(start) || !isCalendarDate(end)) {
    return 'Use calendar dates as YYYY-MM-DD.'
  }
  if (start > end) {
    return 'The start date must be on or before the end date.'
  }
  const [startYear, startMonth, startDay] = start.split('-').map(Number)
  const [endYear, endMonth, endDay] = end.split('-').map(Number)
  const span =
    Math.round(
      (Date.UTC(endYear!, endMonth! - 1, endDay!) - Date.UTC(startYear!, startMonth! - 1, startDay!)) / 86_400_000,
    ) + 1
  if (span > DAILY_CONTEXT_RANGE_MAX_DAYS) {
    return 'Choose a shorter date range.'
  }
  return null
}

export function normalizeContextNote(value: unknown): { note: string | null } | { error: string } {
  if (value == null) {
    return { note: null }
  }
  if (typeof value !== 'string') {
    return { error: 'Note must be text.' }
  }
  const note = value.trim()
  if (note.length === 0) {
    return { note: null }
  }
  if (characterCount(note) > DAILY_CONTEXT_NOTE_MAX) {
    return { error: 'Note must be 500 characters or fewer.' }
  }
  return { note }
}

export function normalizeContextWrite(body: unknown): { tags: DailyContextTagKey[]; note: string | null } | { error: string } {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Context needs tags or a note.' }
  }
  const record = body as { tags?: unknown; note?: unknown }
  if (record.tags != null && !Array.isArray(record.tags)) {
    return { error: 'Tags must be a list of context tags.' }
  }
  const submitted = record.tags ?? []
  const tags: DailyContextTagKey[] = []
  for (const item of submitted) {
    if (typeof item !== 'string' || !isDailyContextTagKey(item)) {
      return { error: 'Unknown context tag.' }
    }
    tags.push(item)
  }
  const noteResult = normalizeContextNote(record.note)
  if ('error' in noteResult) {
    return noteResult
  }
  const ordered = orderContextTags(tags)
  if (ordered.length === 0 && noteResult.note == null) {
    return { error: 'Add a tag or a note. An empty day is not stored.' }
  }
  return { tags: ordered, note: noteResult.note }
}

export function contextsInRange(contexts: readonly DailyContext[], start: string, end: string): DailyContext[] {
  return contexts
    .filter((item) => item.contextDate >= start && item.contextDate <= end)
    .slice()
    .sort((left, right) => (left.contextDate < right.contextDate ? -1 : left.contextDate > right.contextDate ? 1 : 0))
}

export function contextsWithTag(contexts: readonly DailyContext[], tag: DailyContextTagKey): DailyContext[] {
  return contexts.filter((item) => item.tags.includes(tag))
}
