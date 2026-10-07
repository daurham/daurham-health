import { isCalendarDate } from './training.js'

export const OUNCES_PER_MILLILITER = 0.0338140227
export const DAILY_SIGNAL_RATING_MIN = 1
export const DAILY_SIGNAL_RATING_MAX = 5
export const DAILY_SIGNAL_NOTE_MAX = 300

export type HydrationEvent = {
  id: string
  date: string
  occurredAt: string | null
  amountMl: number
  amountOz: number
  note: string | null
  createdAt: string
}

export type BowelUrgency = 'none' | 'mild' | 'strong'

export type BowelEvent = {
  id: string
  date: string
  occurredAt: string | null
  bristolType: number
  straining: boolean | null
  urgency: BowelUrgency | null
  incompleteFeeling: boolean | null
  note: string | null
  createdAt: string
}

export type DailyWellness = {
  date: string
  energy: number | null
  hunger: number | null
  soreness: number | null
  stress: number | null
  createdAt: string
  updatedAt: string
}

export type DailySignalsDay = {
  date: string
  hydrationEvents: HydrationEvent[]
  bowelEvents: BowelEvent[]
  noBowelMovement: boolean
  wellness: DailyWellness | null
}

export type TodayDailySignalsSnapshot = {
  hydration: {
    tracked: boolean
    totalOz: number | null
    eventCount: number
  }
  bowel: {
    tracked: boolean
    eventCount: number | null
    noMovement: boolean
    latestBristolType: number | null
  }
  wellness: {
    recorded: boolean
    energy: number | null
    hunger: number | null
    soreness: number | null
    stress: number | null
  }
}

export function ouncesToMilliliters(ounces: number): number {
  return ounces / OUNCES_PER_MILLILITER
}

export function millilitersToOunces(milliliters: number): number {
  return milliliters * OUNCES_PER_MILLILITER
}

export function dailySignalDateError(date: string, today: string): string | null {
  if (!isCalendarDate(date) || !isCalendarDate(today)) return 'Use a calendar date as YYYY-MM-DD.'
  if (date > today) return 'Daily signals can only be recorded for today or an earlier Health date.'
  return null
}

function optionalNote(value: unknown): string | null | { error: string } {
  if (value == null) return null
  if (typeof value !== 'string') return { error: 'Note must be text.' }
  const note = value.trim()
  if (!note) return null
  if (Array.from(note).length > DAILY_SIGNAL_NOTE_MAX) return { error: 'Note must be 300 characters or fewer.' }
  return note
}

function optionalInstant(value: unknown): string | null | { error: string } {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return { error: 'occurredAt must be an ISO timestamp.' }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return { error: 'occurredAt must be an ISO timestamp.' }
  return date.toISOString()
}

function optionalUuid(value: unknown): string | null | { error: string } {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return { error: 'requestId must be a UUID.' }
  }
  return value
}

export function normalizeHydrationWrite(body: unknown):
  | { date: string; amountMl: number; occurredAt: string | null; note: string | null; requestId: string | null }
  | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Water entry is required.' }
  const input = body as Record<string, unknown>
  if (typeof input.date !== 'string' || !isCalendarDate(input.date)) return { error: 'Water date must be YYYY-MM-DD.' }
  if (typeof input.amountOz !== 'number' || !Number.isFinite(input.amountOz) || input.amountOz <= 0 || input.amountOz > 338) {
    return { error: 'Water amount must be greater than 0 and no more than 338 oz.' }
  }
  const occurredAt = optionalInstant(input.occurredAt)
  if (occurredAt != null && typeof occurredAt === 'object') return occurredAt
  const note = optionalNote(input.note)
  if (note != null && typeof note === 'object') return note
  const requestId = optionalUuid(input.requestId)
  if (requestId != null && typeof requestId === 'object') return requestId
  return {
    date: input.date,
    amountMl: Math.round(ouncesToMilliliters(input.amountOz) * 100) / 100,
    occurredAt,
    note,
    requestId,
  }
}

export function normalizeBowelWrite(body: unknown):
  | {
      date: string
      bristolType: number
      occurredAt: string | null
      straining: boolean | null
      urgency: BowelUrgency | null
      incompleteFeeling: boolean | null
      note: string | null
      requestId: string | null
    }
  | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Bowel entry is required.' }
  const input = body as Record<string, unknown>
  if (typeof input.date !== 'string' || !isCalendarDate(input.date)) return { error: 'Bowel date must be YYYY-MM-DD.' }
  if (typeof input.bristolType !== 'number' || !Number.isInteger(input.bristolType) || input.bristolType < 1 || input.bristolType > 7) {
    return { error: 'Bristol stool type must be from 1 to 7.' }
  }
  const occurredAt = optionalInstant(input.occurredAt)
  if (occurredAt != null && typeof occurredAt === 'object') return occurredAt
  const note = optionalNote(input.note)
  if (note != null && typeof note === 'object') return note
  const requestId = optionalUuid(input.requestId)
  if (requestId != null && typeof requestId === 'object') return requestId
  const urgency = input.urgency == null || input.urgency === '' ? null : input.urgency
  if (urgency !== null && urgency !== 'none' && urgency !== 'mild' && urgency !== 'strong') {
    return { error: 'Urgency must be none, mild, or strong.' }
  }
  const straining = input.straining == null ? null : input.straining
  const incompleteFeeling = input.incompleteFeeling == null ? null : input.incompleteFeeling
  if (straining !== null && typeof straining !== 'boolean') return { error: 'Straining must be yes or no.' }
  if (incompleteFeeling !== null && typeof incompleteFeeling !== 'boolean') return { error: 'Incomplete feeling must be yes or no.' }
  return {
    date: input.date,
    bristolType: Number(input.bristolType),
    occurredAt,
    straining,
    urgency,
    incompleteFeeling,
    note,
    requestId,
  }
}

function rating(value: unknown, label: string): number | null | { error: string } {
  if (value == null || value === '') return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < DAILY_SIGNAL_RATING_MIN || value > DAILY_SIGNAL_RATING_MAX) {
    return { error: `${label} must be a whole number from 1 to 5.` }
  }
  return Number(value)
}

export function normalizeWellnessWrite(body: unknown):
  | { energy: number | null; hunger: number | null; soreness: number | null; stress: number | null }
  | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Check-in ratings are required.' }
  const input = body as Record<string, unknown>
  const energy = rating(input.energy, 'Energy')
  if (energy != null && typeof energy === 'object') return energy
  const hunger = rating(input.hunger, 'Hunger')
  if (hunger != null && typeof hunger === 'object') return hunger
  const soreness = rating(input.soreness, 'Soreness')
  if (soreness != null && typeof soreness === 'object') return soreness
  const stress = rating(input.stress, 'Stress')
  if (stress != null && typeof stress === 'object') return stress
  if (energy == null && hunger == null && soreness == null && stress == null) {
    return { error: 'Choose at least one check-in rating.' }
  }
  return { energy, hunger, soreness, stress }
}

export function todayDailySignalsFromDay(day: DailySignalsDay | null | undefined): TodayDailySignalsSnapshot {
  if (!day) {
    return {
      hydration: { tracked: false, totalOz: null, eventCount: 0 },
      bowel: { tracked: false, eventCount: null, noMovement: false, latestBristolType: null },
      wellness: { recorded: false, energy: null, hunger: null, soreness: null, stress: null },
    }
  }
  const hydrationTotalMl = day.hydrationEvents.reduce((sum, event) => sum + event.amountMl, 0)
  const latestBowel = [...day.bowelEvents].sort((a, b) => (a.occurredAt ?? a.createdAt).localeCompare(b.occurredAt ?? b.createdAt)).at(-1) ?? null
  return {
    hydration: {
      tracked: day.hydrationEvents.length > 0,
      totalOz: day.hydrationEvents.length > 0 ? millilitersToOunces(hydrationTotalMl) : null,
      eventCount: day.hydrationEvents.length,
    },
    bowel: {
      tracked: day.bowelEvents.length > 0 || day.noBowelMovement,
      eventCount: day.bowelEvents.length > 0 ? day.bowelEvents.length : day.noBowelMovement ? 0 : null,
      noMovement: day.noBowelMovement,
      latestBristolType: latestBowel?.bristolType ?? null,
    },
    wellness: {
      recorded: day.wellness != null,
      energy: day.wellness?.energy ?? null,
      hunger: day.wellness?.hunger ?? null,
      soreness: day.wellness?.soreness ?? null,
      stress: day.wellness?.stress ?? null,
    },
  }
}
