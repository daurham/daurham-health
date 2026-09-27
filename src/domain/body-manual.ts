import { isCalendarDate } from './training.js'
import type { CanonicalUnit } from './body-metrics.js'
import { centimetersToInches, inchesToCentimeters, kilogramsToPounds, poundsToKilograms } from './units.js'

export class BodyInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BodyInputError'
  }
}

export type BodyMetricFamily = 'mass' | 'composition' | 'circumference'

export type BodyMetricDefinition = {
  key: string
  label: string
  family: BodyMetricFamily
  canonicalUnit: 'kg' | 'percent' | 'cm'
  manualInputUnits: readonly string[]
  ownerDisplayUnit: string
  cadenceEligible: boolean
  pair: string | null
  side: 'left' | 'right' | null
}

const CIRCUMFERENCE_INPUT = ['in', 'cm'] as const

function circumference(
  key: string,
  label: string,
  pair: string | null,
  side: 'left' | 'right' | null,
): BodyMetricDefinition {
  return {
    key,
    label,
    family: 'circumference',
    canonicalUnit: 'cm',
    manualInputUnits: CIRCUMFERENCE_INPUT,
    ownerDisplayUnit: 'in',
    cadenceEligible: true,
    pair,
    side,
  }
}

export const MANUAL_BODY_METRICS: readonly BodyMetricDefinition[] = [
  {
    key: 'weight',
    label: 'Weight',
    family: 'mass',
    canonicalUnit: 'kg',
    manualInputUnits: ['lb', 'kg'],
    ownerDisplayUnit: 'lb',
    cadenceEligible: true,
    pair: null,
    side: null,
  },
  {
    key: 'body_fat_percentage',
    label: 'Body fat',
    family: 'composition',
    canonicalUnit: 'percent',
    manualInputUnits: ['percent'],
    ownerDisplayUnit: '%',
    cadenceEligible: true,
    pair: null,
    side: null,
  },
  circumference('waist_circumference', 'Waist', null, null),
  circumference('hip_circumference', 'Hips', null, null),
  circumference('chest_circumference', 'Chest', null, null),
  circumference('neck_circumference', 'Neck', null, null),
  circumference('left_upper_arm_circumference', 'Left upper arm', 'Upper arm', 'left'),
  circumference('right_upper_arm_circumference', 'Right upper arm', 'Upper arm', 'right'),
  circumference('left_forearm_circumference', 'Left forearm', 'Forearm', 'left'),
  circumference('right_forearm_circumference', 'Right forearm', 'Forearm', 'right'),
  circumference('left_thigh_circumference', 'Left thigh', 'Thigh', 'left'),
  circumference('right_thigh_circumference', 'Right thigh', 'Thigh', 'right'),
  circumference('left_calf_circumference', 'Left calf', 'Calf', 'left'),
  circumference('right_calf_circumference', 'Right calf', 'Calf', 'right'),
]

export const ARM_CADENCE_KEYS = [
  'left_upper_arm_circumference',
  'right_upper_arm_circumference',
  'left_forearm_circumference',
  'right_forearm_circumference',
] as const

export const FULL_CIRCUMFERENCE_KEYS = [
  'waist_circumference',
  'hip_circumference',
  'chest_circumference',
  'neck_circumference',
  'left_upper_arm_circumference',
  'right_upper_arm_circumference',
  'left_forearm_circumference',
  'right_forearm_circumference',
  'left_thigh_circumference',
  'right_thigh_circumference',
  'left_calf_circumference',
  'right_calf_circumference',
] as const

const BY_KEY = new Map(MANUAL_BODY_METRICS.map((item) => [item.key, item]))

const UNIT_ALIASES: Record<string, string> = {
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  in: 'in',
  inch: 'in',
  inches: 'in',
  '"': 'in',
  cm: 'cm',
  centimeter: 'cm',
  centimeters: 'cm',
  percent: 'percent',
  '%': 'percent',
  pct: 'percent',
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const FUTURE_SKEW_MS = 120_000

export function metricDefinition(key: string): BodyMetricDefinition | undefined {
  return BY_KEY.get(key)
}

export function metricCatalogIndex(key: string): number {
  return MANUAL_BODY_METRICS.findIndex((item) => item.key === key)
}

export function assertCadenceMetric(key: string): BodyMetricDefinition {
  const definition = metricDefinition(key)
  if (!definition?.cadenceEligible) {
    throw new BodyInputError('That measurement cannot have a cadence')
  }
  return definition
}

export type PlannedManualMetric = {
  key: string
  value: number
  unit: CanonicalUnit
  valueKind: 'manual'
}

export type ManualCreatePlan = {
  measuredAt: Date
  notes: string | null
  metrics: PlannedManualMetric[]
}

export type ManualPatchPlan = {
  measuredAt?: Date
  notes?: string | null
  metrics: PlannedManualMetric[]
}

export function manualSessionIsEditable(session: {
  importJobId: string | null
  sourceKey: string
}): boolean {
  return session.importJobId == null && session.sourceKey === 'manual'
}

export function assertManualSessionEditable(session: {
  importJobId: string | null
  sourceKey: string
}): void {
  if (!manualSessionIsEditable(session)) {
    throw new BodyInputError('Imported measurements stay read-only')
  }
}

export function parseManualCreate(body: unknown, now: Date): ManualCreatePlan {
  const record = objectBody(body)
  return {
    measuredAt: parseMeasuredAt(record.measuredAt, now, true),
    notes: parseNotes(record.notes),
    metrics: parseMetricList(record.metrics),
  }
}

export function parseManualPatch(body: unknown, now: Date): ManualPatchPlan {
  const record = objectBody(body)
  const plan: ManualPatchPlan = { metrics: parseMetricList(record.metrics) }
  if ('measuredAt' in record && record.measuredAt != null && record.measuredAt !== '') {
    plan.measuredAt = parseMeasuredAt(record.measuredAt, now, false)
  }
  if ('notes' in record) {
    plan.notes = parseNotes(record.notes)
  }
  return plan
}

export function parseCadenceWrite(
  body: unknown,
  today: string,
): { intervalDays: number; enabledFrom: string } {
  const record = objectBody(body)
  const intervalDays = parseIntervalDays(record.intervalDays)
  if (!('enabledFrom' in record) || record.enabledFrom == null || record.enabledFrom === '') {
    return { intervalDays, enabledFrom: today }
  }
  if (typeof record.enabledFrom !== 'string' || !isCalendarDate(record.enabledFrom)) {
    throw new BodyInputError('Cadence start date is invalid')
  }
  return { intervalDays, enabledFrom: record.enabledFrom }
}

export function ownerInputNumber(canonicalUnit: CanonicalUnit, canonicalValue: number): number {
  if (canonicalUnit === 'kg') {
    return kilogramsToPounds(canonicalValue)
  }
  if (canonicalUnit === 'cm') {
    return centimetersToInches(canonicalValue)
  }
  return canonicalValue
}

function objectBody(body: unknown): Record<string, unknown> {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BodyInputError('Measurement body is invalid')
  }
  return body as Record<string, unknown>
}

function parseMeasuredAt(value: unknown, now: Date, useNowWhenAbsent: boolean): Date {
  if (value == null || value === '') {
    if (useNowWhenAbsent) {
      return now
    }
    throw new BodyInputError('Measurement time is invalid')
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new BodyInputError('Measurement time is invalid')
    }
    assertNotFuture(value, now)
    return value
  }
  if (typeof value !== 'string') {
    throw new BodyInputError('Measurement time is invalid')
  }
  const trimmed = value.trim()
  if (DATE_ONLY.test(trimmed)) {
    throw new BodyInputError('Measurement time must include a real time')
  }
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    throw new BodyInputError('Measurement time is invalid')
  }
  assertNotFuture(parsed, now)
  return parsed
}

function assertNotFuture(value: Date, now: Date): void {
  if (value.getTime() > now.getTime() + FUTURE_SKEW_MS) {
    throw new BodyInputError('Future measurements are not recorded')
  }
}

function parseNotes(value: unknown): string | null {
  if (value == null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new BodyInputError('Notes must be text')
  }
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function parseMetricList(value: unknown): PlannedManualMetric[] {
  if (!Array.isArray(value)) {
    throw new BodyInputError('Enter at least one measurement')
  }
  const planned: PlannedManualMetric[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const metric = parseMetricItem(item)
    if (!metric) {
      continue
    }
    if (seen.has(metric.key)) {
      throw new BodyInputError(`Duplicate measurement ${metricDefinition(metric.key)?.label ?? metric.key}`)
    }
    seen.add(metric.key)
    planned.push(metric)
  }
  if (planned.length === 0) {
    throw new BodyInputError('Enter at least one measurement')
  }
  return planned
}

function parseMetricItem(item: unknown): PlannedManualMetric | null {
  if (item == null || typeof item !== 'object' || Array.isArray(item)) {
    throw new BodyInputError('Measurement entry is invalid')
  }
  const record = item as Record<string, unknown>
  const key = typeof record.key === 'string' ? record.key.trim() : ''
  const definition = metricDefinition(key)
  if (!definition) {
    throw new BodyInputError('Unknown measurement')
  }
  const parsed = parseNumericInput(record.value)
  if (parsed.kind === 'blank') {
    return null
  }
  if (parsed.kind === 'invalid') {
    throw new BodyInputError(`${definition.label} must be a number`)
  }
  const unit = normalizeInputUnit(record.unit, definition)
  assertRange(definition, parsed.value)
  return {
    key: definition.key,
    value: toCanonical(definition, unit, parsed.value),
    unit: definition.canonicalUnit,
    valueKind: 'manual',
  }
}

function parseNumericInput(value: unknown): { kind: 'blank' } | { kind: 'invalid' } | { kind: 'number'; value: number } {
  if (value == null) {
    return { kind: 'blank' }
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'invalid' }
  }
  if (typeof value !== 'string') {
    return { kind: 'invalid' }
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return { kind: 'blank' }
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? { kind: 'number', value: parsed } : { kind: 'invalid' }
}

function normalizeInputUnit(value: unknown, definition: BodyMetricDefinition): string {
  const raw = value == null || value === '' ? definition.manualInputUnits[0] : value
  if (typeof raw !== 'string') {
    throw new BodyInputError(`Choose a unit for ${definition.label}`)
  }
  const normalized = UNIT_ALIASES[raw.trim().toLowerCase()] ?? UNIT_ALIASES[raw.trim()]
  if (!normalized || !definition.manualInputUnits.includes(normalized)) {
    throw new BodyInputError(`Choose a unit for ${definition.label}`)
  }
  return normalized
}

function assertRange(definition: BodyMetricDefinition, value: number): void {
  if (definition.key === 'body_fat_percentage') {
    if (value < 0 || value > 100) {
      throw new BodyInputError('Body fat must be between 0 and 100')
    }
    return
  }
  if (value <= 0) {
    throw new BodyInputError(`${definition.label} must be greater than 0`)
  }
}

function toCanonical(definition: BodyMetricDefinition, unit: string, value: number): number {
  if (definition.canonicalUnit === 'kg') {
    return unit === 'lb' ? poundsToKilograms(value) : value
  }
  if (definition.canonicalUnit === 'cm') {
    return unit === 'in' ? inchesToCentimeters(value) : value
  }
  return value
}

function parseIntervalDays(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3650) {
    throw new BodyInputError('Cadence interval must be a whole number of days from 1 to 3650')
  }
  return parsed
}
