import { addCalendarDays } from '../progress/dates.js'
import { isCalendarDate } from '../training.js'
import { normalizeDoseUnit } from './dose.js'
import { SupplementInputError } from './errors.js'
import { resolveOccurrence } from './resolve.js'
import type { AdherenceAction, LifecycleStatus, ScheduleWindow, StatusEventWindow } from './types.js'
import { isWeekdayMask } from './weekday.js'

const NAME_LIMIT = 200
const TEXT_LIMIT = 200
const NOTES_LIMIT = 4000
const SLOT_LIMIT = 80

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SupplementInputError('Request body must be an object')
  }
  return value as Record<string, unknown>
}

export function requireCalendarDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isCalendarDate(value)) {
    throw new SupplementInputError(`${label} must be YYYY-MM-DD`)
  }
  return value
}

export function optionalCalendarDate(value: unknown, label: string): string | null {
  if (value == null || value === '') {
    return null
  }
  return requireCalendarDate(value, label)
}

function requireBoundedText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') {
    throw new SupplementInputError(`${label} is required`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new SupplementInputError(`${label} is required`)
  }
  if (trimmed.length > max) {
    throw new SupplementInputError(`${label} is too long`)
  }
  return trimmed
}

function optionalBoundedText(value: unknown, label: string, max: number): string | null {
  if (value == null || value === '') {
    return null
  }
  if (typeof value !== 'string') {
    throw new SupplementInputError(`${label} is invalid`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (trimmed.length > max) {
    throw new SupplementInputError(`${label} is too long`)
  }
  return trimmed
}

export function parsePositiveAmount(value: unknown, label: string): number {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN
  if (!Number.isFinite(number) || number <= 0) {
    throw new SupplementInputError(`${label} must be greater than zero`)
  }
  return number
}

export function parseWeekdayMask(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!isWeekdayMask(number)) {
    throw new SupplementInputError('Choose at least one weekday')
  }
  return number
}

export function parseSortOrder(value: unknown, fallback = 0): number {
  if (value == null || value === '') {
    return fallback
  }
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(number) || number < -10000 || number > 10000) {
    throw new SupplementInputError('Sort order is invalid')
  }
  return number
}

export function assertEffectiveInterval(effectiveFrom: string, effectiveThrough: string | null): void {
  if (effectiveThrough != null && effectiveThrough < effectiveFrom) {
    throw new SupplementInputError('End date must be on or after the start date')
  }
}

export type DoseDraft = {
  slotLabel: string | null
  doseAmount: number
  doseUnit: string
  weekdayMask: number
  effectiveFrom: string
  effectiveThrough: string | null
  sortOrder: number
}

export function parseDoseDraft(value: unknown, fallbackDate: string): DoseDraft {
  const body = asRecord(value)
  const effectiveFrom =
    body.effectiveFrom == null || body.effectiveFrom === ''
      ? fallbackDate
      : requireCalendarDate(body.effectiveFrom, 'Start date')
  const effectiveThrough = optionalCalendarDate(body.effectiveThrough, 'End date')
  assertEffectiveInterval(effectiveFrom, effectiveThrough)
  return {
    slotLabel: optionalBoundedText(body.slotLabel, 'Slot', SLOT_LIMIT),
    doseAmount: parsePositiveAmount(body.doseAmount, 'Dose'),
    doseUnit: normalizeDoseUnit(typeof body.doseUnit === 'string' ? body.doseUnit : ''),
    weekdayMask: parseWeekdayMask(body.weekdayMask),
    effectiveFrom,
    effectiveThrough,
    sortOrder: parseSortOrder(body.sortOrder),
  }
}

export type CreateSupplementInput = {
  name: string
  form: string | null
  brand: string | null
  productName: string | null
  notes: string | null
  sortOrder: number
  startDate: string
  schedule: DoseDraft | null
}

export function parseCreateSupplement(value: unknown, today: string): CreateSupplementInput {
  const body = asRecord(value)
  const startDate =
    body.startDate == null || body.startDate === '' ? today : requireCalendarDate(body.startDate, 'Start date')
  return {
    name: requireBoundedText(body.name, 'Name', NAME_LIMIT),
    form: optionalBoundedText(body.form, 'Form', TEXT_LIMIT),
    brand: optionalBoundedText(body.brand, 'Brand', TEXT_LIMIT),
    productName: optionalBoundedText(body.productName, 'Product', TEXT_LIMIT),
    notes: optionalBoundedText(body.notes, 'Notes', NOTES_LIMIT),
    sortOrder: parseSortOrder(body.sortOrder),
    startDate,
    schedule: body.schedule == null ? null : parseDoseDraft(body.schedule, startDate),
  }
}

export type SupplementPatch = {
  name?: string
  form?: string | null
  brand?: string | null
  productName?: string | null
  notes?: string | null
  sortOrder?: number
}

export function parseSupplementPatch(value: unknown): SupplementPatch {
  const body = asRecord(value)
  const patch: SupplementPatch = {}
  if ('name' in body) {
    patch.name = requireBoundedText(body.name, 'Name', NAME_LIMIT)
  }
  if ('form' in body) {
    patch.form = optionalBoundedText(body.form, 'Form', TEXT_LIMIT)
  }
  if ('brand' in body) {
    patch.brand = optionalBoundedText(body.brand, 'Brand', TEXT_LIMIT)
  }
  if ('productName' in body) {
    patch.productName = optionalBoundedText(body.productName, 'Product', TEXT_LIMIT)
  }
  if ('notes' in body) {
    patch.notes = optionalBoundedText(body.notes, 'Notes', NOTES_LIMIT)
  }
  if ('sortOrder' in body) {
    patch.sortOrder = parseSortOrder(body.sortOrder)
  }
  if (Object.keys(patch).length === 0) {
    throw new SupplementInputError('Nothing to update')
  }
  return patch
}

export function parseScheduleVersion(value: unknown): DoseDraft {
  const body = asRecord(value)
  if (body.effectiveFrom == null || body.effectiveFrom === '') {
    throw new SupplementInputError('Effective date must be YYYY-MM-DD')
  }
  return parseDoseDraft(body, '')
}

export function parseScheduleStop(value: unknown): string {
  const body = asRecord(value)
  return requireCalendarDate(body.stopOn, 'Stop date')
}

export function parseStatusChange(value: unknown): {
  status: LifecycleStatus
  effectiveDate: string
  notes: string | null
} {
  const body = asRecord(value)
  if (body.status !== 'active' && body.status !== 'paused' && body.status !== 'discontinued') {
    throw new SupplementInputError('Status must be active, paused, or discontinued')
  }
  return {
    status: body.status,
    effectiveDate: requireCalendarDate(body.effectiveDate, 'Effective date'),
    notes: optionalBoundedText(body.notes, 'Notes', NOTES_LIMIT),
  }
}

export function normalizeActualDose(
  amount: unknown,
  unit: unknown,
): { amount: number | null; unit: string | null } {
  const amountMissing = amount == null || amount === ''
  const unitMissing = unit == null || unit === ''
  if (amountMissing && unitMissing) {
    return { amount: null, unit: null }
  }
  if (amountMissing || unitMissing) {
    throw new SupplementInputError('Actual dose needs both an amount and a unit')
  }
  return {
    amount: parsePositiveAmount(amount, 'Actual dose'),
    unit: normalizeDoseUnit(typeof unit === 'string' ? unit : ''),
  }
}

export function optionalTakenAt(value: unknown, now: Date): string | null {
  if (value == null || value === '') {
    return null
  }
  if (typeof value !== 'string') {
    throw new SupplementInputError('Taken time is invalid')
  }
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) {
    throw new SupplementInputError('Taken time is invalid')
  }
  if (instant.getTime() > now.getTime()) {
    throw new SupplementInputError('Taken time cannot be in the future')
  }
  return instant.toISOString()
}

export function optionalAdherenceNotes(value: unknown): string | null {
  return optionalBoundedText(value, 'Notes', NOTES_LIMIT)
}

export type AdherenceCommand = {
  scheduleId: string
  supplementId: string | null
  scheduledDate: string
  action: AdherenceAction
  actualDoseAmount: number | null
  actualDoseUnit: string | null
  takenAt: string | null
  notes: string | null
}

export function parseAdherenceCommand(value: unknown, now: Date): AdherenceCommand {
  const body = asRecord(value)
  if (body.action !== 'taken' && body.action !== 'skipped' && body.action !== 'clear') {
    throw new SupplementInputError('Action must be taken, skipped, or clear')
  }
  if (typeof body.scheduleId !== 'string' || body.scheduleId.trim() === '') {
    throw new SupplementInputError('Schedule is required')
  }
  const dose = normalizeActualDose(body.actualDoseAmount, body.actualDoseUnit)
  return {
    scheduleId: body.scheduleId.trim(),
    supplementId: typeof body.supplementId === 'string' && body.supplementId.trim() !== '' ? body.supplementId.trim() : null,
    scheduledDate: requireCalendarDate(body.scheduledDate, 'Date'),
    action: body.action,
    actualDoseAmount: dose.amount,
    actualDoseUnit: dose.unit,
    takenAt: optionalTakenAt(body.takenAt, now),
    notes: optionalAdherenceNotes(body.notes),
  }
}

export function assertRecordableOccurrence(input: {
  schedule: ScheduleWindow
  events: readonly StatusEventWindow[]
  scheduledDate: string
  today: string
  supplementId: string | null
}): void {
  if (input.supplementId && input.supplementId !== input.schedule.supplementId) {
    throw new SupplementInputError('Schedule does not belong to this supplement')
  }
  if (input.scheduledDate > input.today) {
    throw new SupplementInputError('Future adherence cannot be recorded')
  }
  const state = resolveOccurrence({
    events: input.events,
    schedule: input.schedule,
    date: input.scheduledDate,
    adherence: null,
  })
  if (state === 'paused') {
    throw new SupplementInputError('This supplement is paused on that date')
  }
  if (state !== 'unknown') {
    throw new SupplementInputError('That dose is not scheduled on that date')
  }
}

export function nextAdherencePersistence(action: AdherenceAction): 'upsert' | 'delete' {
  return action === 'clear' ? 'delete' : 'upsert'
}

export function planScheduleVersion(input: {
  schedule: Pick<ScheduleWindow, 'effectiveFrom' | 'effectiveThrough'>
  effectiveFrom: string
  adherenceDates: readonly string[]
}): { closeThrough: string } {
  if (input.schedule.effectiveThrough != null) {
    throw new SupplementInputError('This schedule is already closed. Add a new schedule instead of rewriting it.')
  }
  if (input.effectiveFrom <= input.schedule.effectiveFrom) {
    throw new SupplementInputError('A dose change must start after the current schedule begins.')
  }
  if (input.adherenceDates.some((date) => date >= input.effectiveFrom)) {
    throw new SupplementInputError('This change would rewrite dates that already have recorded adherence.')
  }
  return { closeThrough: addCalendarDays(input.effectiveFrom, -1) }
}

export function planScheduleStop(input: {
  schedule: Pick<ScheduleWindow, 'effectiveFrom' | 'effectiveThrough'>
  stopOn: string
  adherenceDates: readonly string[]
}): { action: 'delete' } | { action: 'close'; effectiveThrough: string } {
  const effectiveThrough = addCalendarDays(input.stopOn, -1)
  if (input.schedule.effectiveThrough != null && input.stopOn > addCalendarDays(input.schedule.effectiveThrough, 1)) {
    throw new SupplementInputError('This schedule already ended before that date.')
  }
  if (effectiveThrough < input.schedule.effectiveFrom) {
    if (input.adherenceDates.length > 0) {
      throw new SupplementInputError('This change would rewrite dates that already have recorded adherence.')
    }
    return { action: 'delete' }
  }
  if (input.adherenceDates.some((date) => date > effectiveThrough)) {
    throw new SupplementInputError('This change would rewrite dates that already have recorded adherence.')
  }
  return { action: 'close', effectiveThrough }
}

export function assertFutureScheduleEditable(input: {
  schedule: Pick<ScheduleWindow, 'effectiveFrom'>
  asOf: string
  adherenceDates: readonly string[]
}): void {
  if (input.schedule.effectiveFrom <= input.asOf) {
    throw new SupplementInputError('This schedule has already taken effect. Change it with a new effective date.')
  }
  if (input.adherenceDates.length > 0) {
    throw new SupplementInputError('This change would rewrite dates that already have recorded adherence.')
  }
}
