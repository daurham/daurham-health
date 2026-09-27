import { ACTIVITY_WORKOUT_ENTITY } from './config.js'
import { HealthAutoExportError, HAE_SOURCE, HAE_SOURCE_VERSION } from './hae.js'
import { convertDistanceToMeters, convertDurationToMinutes, convertEnergyToKcal } from './units.js'

/**
 * Health Auto Export JSON v2 workout objects.
 *
 * These are Activity workouts. They are not Training sessions.
 * The observing source is not invented from the Health Auto Export transport
 * or from nested sample sources. Route geometry and workout telemetry stay out.
 *
 * A later payload that omits a workout does not delete it. This parser has no
 * correction or deletion lifecycle.
 */

export const HAE_WORKOUT_CALCULATION_VERSION = 'hae-workout-v1'
export const HAE_WORKOUT_STRATEGY = 'health_auto_export_workouts'

const ACCEPTED_FIELDS = new Set([
  'id',
  'name',
  'start',
  'end',
  'duration',
  'activeEnergyBurned',
  'distance',
  'location',
  'isIndoor',
])

const OFFSET_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/
const UTC_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z$/
const MAX_TEXT = 200

export type HaeWorkoutQuantity = {
  qty: number
  units: string
}

export type HaeWorkoutEvidence = {
  id: string
  name: string
  start: string
  end: string
  duration: number
  activeEnergyBurned?: HaeWorkoutQuantity
  distance?: HaeWorkoutQuantity
  location?: string
  isIndoor?: boolean
}

export type HaeWorkoutMetadata = {
  transport: typeof HAE_SOURCE
  exportVersion: typeof HAE_SOURCE_VERSION
  calculationVersion: typeof HAE_WORKOUT_CALCULATION_VERSION
  providerId: string
  providerName: string
  location: string | null
  isIndoor: boolean | null
}

export type HaeWorkout = {
  providerId: string
  activityType: string
  semanticActivity: string
  startAt: string
  endAt: string
  durationMinutes: number
  energyKcal: number | null
  distanceM: number | null
  fingerprint: string
  sourceName: null
  sourceVersion: null
  deviceName: null
  metadata: HaeWorkoutMetadata
  evidence: HaeWorkoutEvidence
  ignoredFields: string[]
}

export type HaeWorkoutParseResult = {
  workouts: HaeWorkout[]
  ignoredFieldCounts: Record<string, number>
}

export type StoredActivityWorkout = {
  id: string
  activityType: string
  startAt: string
  endAt: string
  haeProviderId: string | null
}

export type HaeWorkoutDisposition =
  | { kind: 'insert'; workout: HaeWorkout }
  | { kind: 'link'; workout: HaeWorkout; entityId: string }
  | { kind: 'already'; workout: HaeWorkout; entityId: string }
  | { kind: 'ambiguous'; workout: HaeWorkout }
  | { kind: 'conflict'; workout: HaeWorkout; entityId: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}

export function semanticActivityIdentity(name: string): string {
  const stripped = name.trim().replace(/^HKWorkoutActivityType/i, '')
  const spaced = stripped.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return spaced
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function haeWorkoutFingerprint(providerId: string): string {
  return `${HAE_SOURCE}|workout|${HAE_SOURCE_VERSION}|${providerId}`
}

export function sameActivityInstant(left: string, right: string): boolean {
  const leftMs = Date.parse(left)
  const rightMs = Date.parse(right)
  return Number.isFinite(leftMs) && leftMs === rightMs
}

export function detectHealthAutoExportChannels(payload: unknown): { metrics: boolean; workouts: boolean } {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new HealthAutoExportError('Health Auto Export payload must contain data.metrics')
  }
  const metrics = payload.data.metrics
  const workouts = payload.data.workouts
  if (metrics != null && !Array.isArray(metrics)) {
    throw new HealthAutoExportError('Health Auto Export payload must contain data.metrics')
  }
  if (workouts != null && !Array.isArray(workouts)) {
    throw new HealthAutoExportError('Health Auto Export workouts must be an array')
  }
  const hasMetrics = Array.isArray(metrics)
  const hasWorkouts = Array.isArray(workouts)
  if (!hasMetrics && !hasWorkouts) {
    throw new HealthAutoExportError('Health Auto Export payload must contain data.metrics')
  }
  return { metrics: hasMetrics, workouts: hasWorkouts }
}

function parseWorkoutInstant(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HealthAutoExportError('Health Auto Export workout timestamp is invalid')
  }
  const trimmed = value.trim()
  const offset = OFFSET_TIMESTAMP.exec(trimmed)
  const utc = UTC_TIMESTAMP.exec(trimmed)
  if (!offset && !utc) {
    throw new HealthAutoExportError('Health Auto Export workout timestamp is invalid')
  }
  const iso = offset ? `${offset[1]}T${offset[2]}${offset[3]}${offset[4]}:${offset[5]}` : trimmed
  const instant = Date.parse(iso)
  if (!Number.isFinite(instant)) {
    throw new HealthAutoExportError('Health Auto Export workout timestamp is invalid')
  }
  return new Date(instant).toISOString()
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new HealthAutoExportError(`Health Auto Export workout ${label} is required`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_TEXT) {
    throw new HealthAutoExportError(`Health Auto Export workout ${label} is required`)
  }
  return trimmed
}

function finiteNonnegative(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new HealthAutoExportError(`Health Auto Export workout ${label} is invalid`)
  }
  return value
}

function optionalQuantity(value: unknown, kind: 'energy' | 'distance'): { canonical: number; evidence: HaeWorkoutQuantity } | null {
  if (value == null) {
    return null
  }
  if (!isRecord(value)) {
    throw new HealthAutoExportError(`Health Auto Export workout ${kind} is invalid`)
  }
  const qty = finiteNonnegative(value.qty, kind)
  if (typeof value.units !== 'string' || value.units.trim().length === 0) {
    throw new HealthAutoExportError(`Health Auto Export workout ${kind} is invalid`)
  }
  const units = value.units.trim()
  try {
    const canonical = kind === 'energy' ? convertEnergyToKcal(qty, units) : convertDistanceToMeters(qty, units)
    return { canonical, evidence: { qty, units } }
  } catch {
    throw new HealthAutoExportError(`Health Auto Export workout ${kind} is invalid`)
  }
}

function optionalLocation(value: unknown): string | null {
  if (value == null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new HealthAutoExportError('Health Auto Export workout location is invalid')
  }
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_TEXT) {
    throw new HealthAutoExportError('Health Auto Export workout location is invalid')
  }
  return trimmed
}

function optionalIndoor(value: unknown): boolean | null {
  if (value == null) {
    return null
  }
  if (typeof value !== 'boolean') {
    throw new HealthAutoExportError('Health Auto Export workout isIndoor is invalid')
  }
  return value
}

function parseWorkout(value: unknown): HaeWorkout {
  if (!isRecord(value)) {
    throw new HealthAutoExportError('Health Auto Export workout is invalid')
  }
  const providerId = requiredText(value.id, 'id')
  const providerName = requiredText(value.name, 'name')
  const startAt = parseWorkoutInstant(value.start)
  const endAt = parseWorkoutInstant(value.end)
  if (Date.parse(endAt) < Date.parse(startAt)) {
    throw new HealthAutoExportError('Health Auto Export workout end is before start')
  }
  const durationSeconds = finiteNonnegative(value.duration, 'duration')
  const energy = optionalQuantity(value.activeEnergyBurned, 'energy')
  const distance = optionalQuantity(value.distance, 'distance')
  const location = optionalLocation(value.location)
  const isIndoor = optionalIndoor(value.isIndoor)
  const ignoredFields = Object.keys(value)
    .filter((key) => !ACCEPTED_FIELDS.has(key))
    .sort()
  const evidence: HaeWorkoutEvidence = {
    id: providerId,
    name: providerName,
    start: startAt,
    end: endAt,
    duration: durationSeconds,
  }
  if (energy) {
    evidence.activeEnergyBurned = energy.evidence
  }
  if (distance) {
    evidence.distance = distance.evidence
  }
  if (location) {
    evidence.location = location
  }
  if (isIndoor != null) {
    evidence.isIndoor = isIndoor
  }
  return {
    providerId,
    activityType: providerName,
    semanticActivity: semanticActivityIdentity(providerName),
    startAt,
    endAt,
    durationMinutes: convertDurationToMinutes(durationSeconds, 'seconds'),
    energyKcal: energy ? energy.canonical : null,
    distanceM: distance ? distance.canonical : null,
    fingerprint: haeWorkoutFingerprint(providerId),
    sourceName: null,
    sourceVersion: null,
    deviceName: null,
    metadata: {
      transport: HAE_SOURCE,
      exportVersion: HAE_SOURCE_VERSION,
      calculationVersion: HAE_WORKOUT_CALCULATION_VERSION,
      providerId,
      providerName,
      location,
      isIndoor,
    },
    evidence,
    ignoredFields,
  }
}

export function parseHealthAutoExportWorkouts(payload: unknown): HaeWorkoutParseResult {
  const channels = detectHealthAutoExportChannels(payload)
  if (!channels.workouts || !isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.workouts)) {
    throw new HealthAutoExportError('Health Auto Export workouts must be an array')
  }
  const workouts = payload.data.workouts.map(parseWorkout)
  const ignoredFieldCounts: Record<string, number> = {}
  for (const workout of workouts) {
    for (const field of workout.ignoredFields) {
      ignoredFieldCounts[field] = (ignoredFieldCounts[field] ?? 0) + 1
    }
  }
  return { workouts, ignoredFieldCounts }
}

function coreIdentityMatches(workout: HaeWorkout, stored: StoredActivityWorkout): boolean {
  return (
    sameActivityInstant(workout.startAt, stored.startAt) &&
    sameActivityInstant(workout.endAt, stored.endAt) &&
    workout.semanticActivity === semanticActivityIdentity(stored.activityType)
  )
}

function planOne(workout: HaeWorkout, stored: readonly StoredActivityWorkout[]): HaeWorkoutDisposition {
  const linked = stored.filter((row) => row.haeProviderId === workout.providerId)
  if (linked.length > 1) {
    return { kind: 'conflict', workout, entityId: linked[0]?.id ?? workout.providerId }
  }
  const existing = linked[0]
  if (existing) {
    if (coreIdentityMatches(workout, existing)) {
      return { kind: 'already', workout, entityId: existing.id }
    }
    return { kind: 'conflict', workout, entityId: existing.id }
  }
  const matches = stored.filter((row) => coreIdentityMatches(workout, row))
  if (matches.length > 1) {
    return { kind: 'ambiguous', workout }
  }
  const match = matches[0]
  if (match) {
    return { kind: 'link', workout, entityId: match.id }
  }
  return { kind: 'insert', workout }
}

export function planHaeWorkouts(
  incoming: readonly HaeWorkout[],
  stored: readonly StoredActivityWorkout[],
): HaeWorkoutDisposition[] {
  const rows = stored.map((row) => ({ ...row }))
  const dispositions: HaeWorkoutDisposition[] = []
  for (const workout of incoming) {
    const disposition = planOne(workout, rows)
    dispositions.push(disposition)
    if (disposition.kind === 'insert') {
      rows.push({
        id: `pending:${workout.providerId}`,
        activityType: workout.activityType,
        startAt: workout.startAt,
        endAt: workout.endAt,
        haeProviderId: workout.providerId,
      })
    } else if (disposition.kind === 'link') {
      const row = rows.find((item) => item.id === disposition.entityId)
      if (row && row.haeProviderId == null) {
        row.haeProviderId = workout.providerId
      }
    }
  }
  return dispositions
}

export function haeWorkoutEntityType(): string {
  return ACTIVITY_WORKOUT_ENTITY
}
