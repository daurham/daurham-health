import {
  HK_QUANTITY_TYPES,
  HK_SLEEP_TYPE,
  isBodyOwnedType,
  isNutritionOwnedType,
  type ActivityMetricKey,
  type AppleHealthSkipReason,
  type SleepStage,
} from './config.js'
import { appleHealthFingerprint } from './fingerprint.js'
import { mapSleepStage } from './sleep.js'
import { parseActivitySummaryTag, type AppleActivitySummary } from './activity-summary.js'
import {
  convertDistanceToMeters,
  convertDurationToMinutes,
  convertEnergyToKcal,
  convertQuantityUnit,
} from './units.js'

const APPLE_DATE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/

export type NormalizedQuantitySample = {
  kind: 'quantity'
  metric: ActivityMetricKey
  appleType: string
  startAt: string
  endAt: string
  value: number
  sourceValue: string
  canonicalUnit: 'count' | 'kcal' | 'min' | 'm' | 'bpm'
  sourceUnit: string
  sourceName: string
  sourceVersion: string | null
  deviceName: string | null
  fingerprint: string
}

export type NormalizedSleepSample = {
  kind: 'sleep'
  appleType: string
  startAt: string
  endAt: string
  stage: SleepStage
  sourceCategory: string
  sourceName: string
  sourceVersion: string | null
  deviceName: string | null
  fingerprint: string
}

export type NormalizedWorkoutSample = {
  kind: 'workout'
  appleType: string
  activityType: string
  startAt: string
  endAt: string
  durationMin: number | null
  energyKcal: number | null
  distanceM: number | null
  sourceName: string
  sourceVersion: string | null
  deviceName: string | null
  fingerprint: string
}

export type NormalizedAppleHealthRecord =
  | NormalizedQuantitySample
  | NormalizedSleepSample
  | NormalizedWorkoutSample

export type SkippedAppleHealthRecord = {
  reason: AppleHealthSkipReason
  appleType: string
  detail?: string
}

export type AppleHealthParseResult = {
  exportDate: string | null
  locale: string | null
  records: NormalizedAppleHealthRecord[]
  skipped: SkippedAppleHealthRecord[]
  activitySummaries: AppleActivitySummary[]
  activitySummarySkips: { sentinel: number; malformed: number }
  unknownSleepCategories: string[]
  sources: string[]
  devices: string[]
}

type Attrs = Record<string, string>

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseAttrs(tag: string): Attrs {
  const attrs: Attrs = {}
  const attr = /([A-Za-z0-9_]+)="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = attr.exec(tag))) {
    attrs[match[1]!] = decodeXml(match[2] ?? '')
  }
  return attrs
}

function isTagNameBoundary(char: string | undefined): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '/' || char === '>'
}

function nextNamedTag(xml: string, tagName: string, from: number): { start: number; end: number } | null {
  const open = `<${tagName}`
  let cursor = from
  while (cursor < xml.length) {
    const start = xml.indexOf(open, cursor)
    if (start < 0) {
      return null
    }
    if (!isTagNameBoundary(xml[start + open.length])) {
      cursor = start + open.length
      continue
    }
    const end = xml.indexOf('>', start)
    if (end < 0) {
      return null
    }
    return { start, end: end + 1 }
  }
  return null
}

export function parseAppleHealthTimestamp(value: string): string {
  const match = APPLE_DATE.exec(value.trim())
  if (!match) {
    throw new Error(`Unsupported Apple Health timestamp: ${value}`)
  }
  return `${match[1]}T${match[2]}${match[3]}${match[4]}:${match[5]}`
}

function optionalTimestamp(value: string | undefined): string | null {
  if (!value || value.trim() === '') {
    return null
  }
  return parseAppleHealthTimestamp(value)
}

function trimToNull(value: string | undefined, max = 500): string | null {
  const next = value?.trim() ?? ''
  if (next.length === 0) {
    return null
  }
  return next.length > max ? next.slice(0, max) : next
}

function finiteNumber(value: string | undefined, label: string): number {
  if (value == null || value.trim() === '') {
    throw new Error(`${label} is required`)
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} is not a number`)
  }
  return parsed
}

function optionalFinite(value: string | undefined): number | null {
  if (value == null || value.trim() === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function collectIdentity(attrs: Attrs) {
  return {
    sourceName: attrs.sourceName?.trim() || 'Unknown',
    sourceVersion: trimToNull(attrs.sourceVersion),
    deviceName: trimToNull(attrs.device),
  }
}

function remember(set: Set<string>, value: string | null) {
  if (value && value.trim() !== '') {
    set.add(value.trim())
  }
}

function parseRecordTag(tag: string): NormalizedAppleHealthRecord | SkippedAppleHealthRecord {
  const attrs = parseAttrs(tag)
  const appleType = attrs.type?.trim() ?? ''
  if (appleType.length === 0) {
    return { reason: 'malformed', appleType: '', detail: 'missing type' }
  }
  if (isBodyOwnedType(appleType)) {
    return { reason: 'body_owned', appleType }
  }
  if (isNutritionOwnedType(appleType)) {
    return { reason: 'nutrition_owned', appleType }
  }
  const identity = collectIdentity(attrs)
  try {
    if (appleType === HK_SLEEP_TYPE) {
      const startAt = parseAppleHealthTimestamp(attrs.startDate ?? '')
      const endAt = parseAppleHealthTimestamp(attrs.endDate ?? startAt)
      const sourceCategory = attrs.value?.trim() || 'unknown'
      const mapped = mapSleepStage(sourceCategory)
      return {
        kind: 'sleep',
        appleType,
        startAt,
        endAt,
        stage: mapped.stage,
        sourceCategory,
        sourceName: identity.sourceName,
        sourceVersion: identity.sourceVersion,
        deviceName: identity.deviceName,
        fingerprint: appleHealthFingerprint({
          appleType,
          startAt,
          endAt,
          value: sourceCategory,
          unit: 'sleep',
          sourceName: identity.sourceName,
          sourceVersion: identity.sourceVersion,
          deviceName: identity.deviceName,
        }),
      }
    }
    const metric = HK_QUANTITY_TYPES[appleType]
    if (!metric) {
      return { reason: 'unsupported', appleType }
    }
    const startAt = parseAppleHealthTimestamp(attrs.startDate ?? '')
    const endAt = parseAppleHealthTimestamp(attrs.endDate ?? startAt)
    const converted = convertQuantityUnit(metric, finiteNumber(attrs.value, 'value'), attrs.unit ?? '')
    return {
      kind: 'quantity',
      metric,
      appleType,
      startAt,
      endAt,
      value: converted.value,
      sourceValue: String(attrs.value),
      canonicalUnit: converted.canonicalUnit,
      sourceUnit: converted.sourceUnit,
      sourceName: identity.sourceName,
      sourceVersion: identity.sourceVersion,
      deviceName: identity.deviceName,
      fingerprint: appleHealthFingerprint({
        appleType,
        startAt,
        endAt,
        value: String(attrs.value),
        unit: attrs.unit ?? '',
        sourceName: identity.sourceName,
        sourceVersion: identity.sourceVersion,
        deviceName: identity.deviceName,
      }),
    }
  } catch (error) {
    return {
      reason: 'malformed',
      appleType,
      detail: error instanceof Error ? error.message : 'malformed record',
    }
  }
}

function parseWorkoutTag(tag: string): NormalizedAppleHealthRecord | SkippedAppleHealthRecord {
  const attrs = parseAttrs(tag)
  const activityType = attrs.workoutActivityType?.trim() ?? ''
  if (activityType.length === 0) {
    return { reason: 'malformed', appleType: 'Workout', detail: 'missing workoutActivityType' }
  }
  const identity = collectIdentity(attrs)
  try {
    const startAt = parseAppleHealthTimestamp(attrs.startDate ?? '')
    const endAt = parseAppleHealthTimestamp(attrs.endDate ?? startAt)
    const durationValue = optionalFinite(attrs.duration)
    const durationMin =
      durationValue == null ? null : convertDurationToMinutes(durationValue, attrs.durationUnit ?? 'min')
    const energyValue = optionalFinite(attrs.totalEnergyBurned)
    const energyKcal =
      energyValue == null ? null : convertEnergyToKcal(energyValue, attrs.totalEnergyBurnedUnit ?? 'kcal')
    const distanceValue = optionalFinite(attrs.totalDistance)
    const distanceM =
      distanceValue == null || distanceValue === 0
        ? null
        : convertDistanceToMeters(distanceValue, attrs.totalDistanceUnit ?? 'm')
    return {
      kind: 'workout',
      appleType: 'Workout',
      activityType,
      startAt,
      endAt,
      durationMin,
      energyKcal,
      distanceM,
      sourceName: identity.sourceName,
      sourceVersion: identity.sourceVersion,
      deviceName: identity.deviceName,
      fingerprint: appleHealthFingerprint({
        appleType: activityType,
        startAt,
        endAt,
        value: String(durationMin ?? ''),
        unit: 'workout',
        sourceName: identity.sourceName,
        sourceVersion: identity.sourceVersion,
        deviceName: identity.deviceName,
      }),
    }
  } catch (error) {
    return {
      reason: 'malformed',
      appleType: 'Workout',
      detail: error instanceof Error ? error.message : 'malformed workout',
    }
  }
}

function applyWorkoutStatistic(workout: NormalizedWorkoutSample, tag: string): NormalizedWorkoutSample {
  const attrs = parseAttrs(tag)
  const sum = optionalFinite(attrs.sum)
  if (sum == null) {
    return workout
  }
  const type = attrs.type ?? ''
  try {
    if (type === 'HKQuantityTypeIdentifierActiveEnergyBurned' && workout.energyKcal == null) {
      return { ...workout, energyKcal: convertEnergyToKcal(sum, attrs.unit ?? 'kcal') }
    }
    if (
      (type === 'HKQuantityTypeIdentifierDistanceWalkingRunning' ||
        type === 'HKQuantityTypeIdentifierDistanceCycling') &&
      workout.distanceM == null &&
      sum !== 0
    ) {
      return { ...workout, distanceM: convertDistanceToMeters(sum, attrs.unit ?? 'm') }
    }
  } catch {
    return workout
  }
  return workout
}

function nextCloseWorkout(xml: string, from: number): { start: number; end: number } | null {
  const start = xml.indexOf('</Workout>', from)
  if (start < 0) {
    return null
  }
  return { start, end: start + '</Workout>'.length }
}

export type AppleHealthScanItem = NormalizedAppleHealthRecord | SkippedAppleHealthRecord

export type AppleHealthXmlScannerOptions = {
  /** When false, finish() does not retain every record. Use onItem for large exports. */
  retain?: boolean
  onItem?: (item: AppleHealthScanItem) => void
  onActivitySummary?: (summary: AppleActivitySummary) => void
  onActivitySummarySkip?: (reason: 'sentinel' | 'malformed') => void
}

export type AppleHealthXmlScanner = {
  push(chunk: string): void
  finish(): AppleHealthParseResult
}

function captureExportMetadata(xml: string, state: { exportDate: string | null; locale: string | null }) {
  if (!state.locale) {
    const healthOpen = xml.match(/<HealthData\b[^>]*>/)
    if (healthOpen) {
      state.locale = parseAttrs(healthOpen[0]).locale || null
    }
  }
  if (!state.exportDate) {
    const exportTag = xml.match(/<ExportDate\b[^>]*>/)
    if (exportTag) {
      try {
        state.exportDate = optionalTimestamp(parseAttrs(exportTag[0]).value)
      } catch {
        state.exportDate = parseAttrs(exportTag[0]).value ?? null
      }
    }
  }
}

export function createAppleHealthXmlScanner(options: AppleHealthXmlScannerOptions = {}): AppleHealthXmlScanner {
  const retain = options.retain !== false
  let buffer = ''
  const records: NormalizedAppleHealthRecord[] = []
  const skipped: SkippedAppleHealthRecord[] = []
  const activitySummaries: AppleActivitySummary[] = []
  const activitySummarySkips = { sentinel: 0, malformed: 0 }
  const unknownSleep = new Set<string>()
  const sources = new Set<string>()
  const devices = new Set<string>()
  const meta = { exportDate: null as string | null, locale: null as string | null }
  let openWorkout: NormalizedWorkoutSample | null = null

  function accept(parsed: AppleHealthScanItem) {
    options.onItem?.(parsed)
    if (!retain) {
      if (!('reason' in parsed)) {
        remember(sources, parsed.sourceName)
        remember(devices, parsed.deviceName)
        if (parsed.kind === 'sleep' && parsed.stage === 'unsupported') {
          unknownSleep.add(parsed.sourceCategory)
        }
      }
      return
    }
    if ('reason' in parsed) {
      skipped.push(parsed)
      return
    }
    records.push(parsed)
    remember(sources, parsed.sourceName)
    remember(devices, parsed.deviceName)
    if (parsed.kind === 'sleep' && parsed.stage === 'unsupported') {
      unknownSleep.add(parsed.sourceCategory)
    }
  }

  function closeWorkout() {
    if (!openWorkout) {
      return
    }
    accept(openWorkout)
    openWorkout = null
  }

  function consume() {
    captureExportMetadata(buffer, meta)
    let cursor = 0
    while (cursor < buffer.length) {
      const recordTag = nextNamedTag(buffer, 'Record', cursor)
      const workoutTag = nextNamedTag(buffer, 'Workout', cursor)
      const summaryTag = nextNamedTag(buffer, 'ActivitySummary', cursor)
      const statisticTag = openWorkout ? nextNamedTag(buffer, 'WorkoutStatistics', cursor) : null
      const closeTag = openWorkout ? nextCloseWorkout(buffer, cursor) : null
      const candidates = [
        recordTag ? { kind: 'record' as const, tag: recordTag } : null,
        workoutTag ? { kind: 'workout' as const, tag: workoutTag } : null,
        summaryTag ? { kind: 'summary' as const, tag: summaryTag } : null,
        statisticTag ? { kind: 'statistic' as const, tag: statisticTag } : null,
        closeTag ? { kind: 'close' as const, tag: closeTag } : null,
      ].filter((item) => item != null)
      const next = candidates.sort((left, right) => left.tag.start - right.tag.start)[0]
      if (!next) {
        break
      }
      if (next.kind === 'close') {
        closeWorkout()
        cursor = next.tag.end
        continue
      }
      if (next.kind === 'statistic') {
        if (openWorkout) {
          openWorkout = applyWorkoutStatistic(openWorkout, buffer.slice(next.tag.start, next.tag.end))
        }
        cursor = next.tag.end
        continue
      }
      if (next.kind === 'summary') {
        const parsed = parseActivitySummaryTag(buffer.slice(next.tag.start, next.tag.end))
        if (parsed.kind === 'skip') {
          activitySummarySkips[parsed.reason] += 1
          options.onActivitySummarySkip?.(parsed.reason)
        } else {
          options.onActivitySummary?.(parsed.summary)
          if (retain) {
            activitySummaries.push(parsed.summary)
          }
        }
        cursor = next.tag.end
        continue
      }
      closeWorkout()
      const xmlTag = buffer.slice(next.tag.start, next.tag.end)
      if (next.kind === 'workout') {
        const parsed = parseWorkoutTag(xmlTag)
        if ('reason' in parsed) {
          accept(parsed)
        } else if (parsed.kind === 'workout') {
          openWorkout = parsed
        }
      } else {
        accept(parseRecordTag(xmlTag))
      }
      cursor = next.tag.end
    }
    if (cursor > 0) {
      buffer = buffer.slice(cursor)
    }
    if (buffer.length > 1024 * 1024) {
      const cut = buffer.length - 256 * 1024
      const boundary = buffer.lastIndexOf('<', cut)
      buffer = boundary >= cut - 4096 ? buffer.slice(boundary) : buffer.slice(cut)
    }
  }

  return {
    push(chunk: string) {
      buffer += chunk
      consume()
    },
    finish() {
      consume()
      closeWorkout()
      return {
        exportDate: meta.exportDate,
        locale: meta.locale,
        records,
        skipped,
        activitySummaries,
        activitySummarySkips,
        unknownSleepCategories: [...unknownSleep].sort(),
        sources: [...sources].sort(),
        devices: [...devices].sort(),
      }
    },
  }
}

export function parseAppleHealthXml(xml: string): AppleHealthParseResult {
  const scanner = createAppleHealthXmlScanner()
  scanner.push(xml)
  return scanner.finish()
}

export function decodeAppleHealthXmlBytes(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}
