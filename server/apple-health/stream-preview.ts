import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { createAppleHealthXmlScanner } from '../../src/domain/apple-health/parse.js'
import type { NormalizedAppleHealthRecord, SkippedAppleHealthRecord } from '../../src/domain/apple-health/parse.js'
import { HEALTH_CALENDAR_TIME_ZONE, healthCalendarDateFromInstant } from '../../src/domain/time.js'

const APPLE_HEALTH_COMMIT_BATCH = 400

export type AppleHealthStreamReport = {
  zipBytes: number | null
  xmlBytes: number
  parseMs: number
  peakRssBytes: number
  exportDate: string | null
  earliest: string | null
  latest: string | null
  fingerprintSha256: string
  counts: {
    encountered: number
    supported: number
    steps: number
    activeEnergy: number
    exerciseTime: number
    walkingRunningDistance: number
    restingHeartRate: number
    sleep: number
    workouts: number
    bodyOwned: number
    nutritionOwned: number
    unsupported: number
    malformed: number
    duplicateFingerprints: number
    uniqueFingerprints: number
    estimatedCommitRows: number
  }
  sources: string[]
  devices: string[]
  quantityBySource: Record<string, Record<string, number>>
  sleepBySource: Record<string, number>
  sleepByCategory: Record<string, number>
  sleepCategoryBySource: Record<string, Record<string, number>>
  unknownSleepCategories: Record<string, number>
  workoutsByType: Record<string, number>
  workoutsBySource: Record<string, number>
  workoutsWithEnergy: number
  workoutsWithDistance: number
  workoutExamples: Array<{
    activityType: string
    startAt: string
    endAt: string
    durationMin: number | null
    energyKcal: number | null
    distanceM: number | null
    sourceName: string
    deviceName: string | null
  }>
  restingHeartRate: {
    count: number
    earliest: string | null
    latest: string | null
    bySource: Record<string, number>
    distinctDays: number
    recordsPerDay: number | null
  }
  bodySkippedTypes: Array<{ type: string; count: number }>
  nutritionSkippedTypes: Array<{ type: string; count: number }>
  unsupportedTypes: Array<{ type: string; count: number }>
  malformed: Array<{ appleType: string; detail: string; count: number }>
  identicalIntervalOverlaps: Record<
    string,
    {
      groups: number
      sameValueGroups: number
      differentValueGroups: number
      sources: string[]
      examples: Array<{ startAt: string; endAt: string; samples: Array<{ source: string; value: string }> }>
    }
  >
  partialIntervalOverlaps: Record<string, { recordsOverlappingAnotherSource: number }>
  sleepSourceOverlap: {
    identicalIntervalGroups: number
    recordsOverlappingAnotherSource: number
    examples: Array<{ startAt: string; endAt: string; samples: Array<{ source: string; stage: string }> }>
  }
  structuralElements: Record<string, number>
  calendarTimeZone: string
  batching: {
    commitBatch: number
    estimatedRequests: number
    approxPayloadBytes: number
    browserPath: 'unsafe' | 'ok'
  }
}

function bump(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount)
}

function bumpNested(map: Map<string, Map<string, number>>, outer: string, inner: string) {
  const bucket = map.get(outer) ?? new Map<string, number>()
  bucket.set(inner, (bucket.get(inner) ?? 0) + 1)
  map.set(outer, bucket)
}

function sortedEntries(map: Map<string, number>, limit?: number): Array<{ type: string; count: number }> {
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const sliced = limit == null ? rows : rows.slice(0, limit)
  return sliced.map(([type, count]) => ({ type, count }))
}

function recordMap(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

function nestedRecord(map: Map<string, Map<string, number>>): Record<string, Record<string, number>> {
  return Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, inner]) => [key, recordMap(inner)]))
}

function countTag(buffer: string, tag: string, carry: string): { count: number; carry: string } {
  const window = carry + buffer
  const needle = `<${tag} `
  const needle2 = `<${tag}>`
  let count = 0
  let from = 0
  while (from < window.length) {
    const a = window.indexOf(needle, from)
    const b = window.indexOf(needle2, from)
    const next = a < 0 ? b : b < 0 ? a : Math.min(a, b)
    if (next < 0) {
      break
    }
    count += 1
    from = next + needle.length
  }
  return { count, carry: window.slice(-tag.length - 2) }
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} exited ${code}`))
    })
  })
}

async function exportXmlName(zipPath: string): Promise<string> {
  const names = await new Promise<string>((resolve, reject) => {
    const child = spawn('unzip', ['-Z1', zipPath], { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('Could not list Apple Health ZIP entries'))
        return
      }
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
  })
  const match = names
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.replace(/\\/g, '/').toLowerCase().endsWith('/export.xml') || line.toLowerCase() === 'export.xml')
  if (!match) {
    throw new Error('Apple Health ZIP must contain export.xml')
  }
  return match
}

function openXmlStream(input: { kind: 'zip'; zipPath: string; entry: string } | { kind: 'xml'; xmlPath: string }) {
  if (input.kind === 'xml') {
    return { stream: createReadStream(input.xmlPath, { highWaterMark: 1024 * 1024 }), close: async () => {} }
  }
  const child = spawn('unzip', ['-p', input.zipPath, input.entry], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
  })
  const closed = new Promise<void>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `unzip exited ${code}`))
    })
  })
  return { stream: child.stdout, close: () => closed }
}

type IntervalRow = { startAt: string; endAt: string; source: string; value: string }

function emptyIdentical(exampleLimit: number) {
  return {
    exampleLimit,
    groups: 0,
    sameValueGroups: 0,
    differentValueGroups: 0,
    sources: new Set<string>(),
    examples: [] as Array<{ startAt: string; endAt: string; samples: Array<{ source: string; value: string }> }>,
  }
}

function finishIdentical(state: ReturnType<typeof emptyIdentical>) {
  return {
    groups: state.groups,
    sameValueGroups: state.sameValueGroups,
    differentValueGroups: state.differentValueGroups,
    sources: [...state.sources].sort(),
    examples: state.examples,
  }
}

function pushIdenticalGroup(state: ReturnType<typeof emptyIdentical>, group: IntervalRow[]) {
  const groupSources = new Set(group.map((row) => row.source))
  if (groupSources.size < 2) {
    return
  }
  state.groups += 1
  for (const source of groupSources) {
    state.sources.add(source)
  }
  const values = new Set(group.map((row) => row.value))
  if (values.size === 1) {
    state.sameValueGroups += 1
  } else {
    state.differentValueGroups += 1
  }
  if (state.examples.length < state.exampleLimit) {
    const first = group[0]!
    state.examples.push({
      startAt: first.startAt,
      endAt: first.endAt,
      samples: group.slice(0, 6).map((row) => ({ source: row.source, value: row.value })),
    })
  }
}

type ActiveInterval = { endMs: number; source: string; startAt: string; endAt: string }

function overlapsDifferentInterval(active: ActiveInterval[], row: IntervalRow, startMs: number): boolean {
  return active.some(
    (item) =>
      item.source !== row.source &&
      item.endMs > startMs &&
      !(item.startAt === row.startAt && item.endAt === row.endAt),
  )
}

function retainActive(active: ActiveInterval[], startMs: number): ActiveInterval[] {
  let write = 0
  for (const item of active) {
    if (item.endMs <= startMs) {
      continue
    }
    active[write] = item
    write += 1
  }
  active.length = write
  return active
}

async function analyzeIntervalFile(
  filePath: string,
  exampleLimit: number,
): Promise<{
  identical: AppleHealthStreamReport['identicalIntervalOverlaps']
  partial: AppleHealthStreamReport['partialIntervalOverlaps']
}> {
  const sortedPath = `${filePath}.sorted`
  await run('sort', ['-S', '256M', '-t', '\t', '-k1,1', '-k2,2', '-k3,3', '-o', sortedPath, filePath])
  const identical: AppleHealthStreamReport['identicalIntervalOverlaps'] = {}
  const partial: AppleHealthStreamReport['partialIntervalOverlaps'] = {}
  let metric = ''
  let state = emptyIdentical(exampleLimit)
  let partialCount = 0
  let group: IntervalRow[] = []
  let active: ActiveInterval[] = []

  function closeGroup() {
    if (group.length > 0) {
      pushIdenticalGroup(state, group)
      group = []
    }
  }

  function closeMetric() {
    closeGroup()
    if (!metric) {
      return
    }
    identical[metric] = finishIdentical(state)
    partial[metric] = { recordsOverlappingAnotherSource: partialCount }
  }

  const lines = createInterface({ input: createReadStream(sortedPath, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of lines) {
    const [nextMetric, startAt, endAt, source, value] = line.split('\t')
    if (!nextMetric || !startAt || !endAt || !source) {
      continue
    }
    if (nextMetric !== metric) {
      closeMetric()
      metric = nextMetric
      state = emptyIdentical(exampleLimit)
      partialCount = 0
      active = []
    }
    const row = { startAt, endAt, source, value: value ?? '' }
    const sameGroup =
      group.length > 0 && group[0]!.startAt === row.startAt && group[0]!.endAt === row.endAt
    if (!sameGroup) {
      closeGroup()
    }
    group.push(row)
    const startMs = Date.parse(row.startAt)
    const endMs = Date.parse(row.endAt)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      continue
    }
    retainActive(active, startMs)
    if (overlapsDifferentInterval(active, row, startMs)) {
      partialCount += 1
    }
    active.push({ endMs, source: row.source, startAt: row.startAt, endAt: row.endAt })
  }
  closeMetric()
  await rm(sortedPath, { force: true })
  return { identical, partial }
}

async function analyzeSleepFile(filePath: string) {
  const sortedPath = `${filePath}.sorted`
  await run('sort', ['-S', '256M', '-t', '\t', '-k1,1', '-k2,2', '-o', sortedPath, filePath])
  const state = emptyIdentical(5)
  let partialCount = 0
  let group: IntervalRow[] = []
  const active: ActiveInterval[] = []

  function closeGroup() {
    if (group.length > 0) {
      pushIdenticalGroup(state, group)
      group = []
    }
  }

  const lines = createInterface({ input: createReadStream(sortedPath, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of lines) {
    const [startAt, endAt, source, stage] = line.split('\t')
    if (!startAt || !endAt || !source) {
      continue
    }
    const row = { startAt, endAt, source, value: stage ?? '' }
    const sameGroup =
      group.length > 0 && group[0]!.startAt === row.startAt && group[0]!.endAt === row.endAt
    if (!sameGroup) {
      closeGroup()
    }
    group.push(row)
    const startMs = Date.parse(row.startAt)
    const endMs = Date.parse(row.endAt)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      continue
    }
    retainActive(active, startMs)
    if (overlapsDifferentInterval(active, row, startMs)) {
      partialCount += 1
    }
    active.push({ endMs, source, startAt, endAt })
  }
  closeGroup()
  await rm(sortedPath, { force: true })
  const identical = finishIdentical(state)
  return {
    identicalIntervalGroups: identical.groups,
    recordsOverlappingAnotherSource: partialCount,
    examples: identical.examples.map((example) => ({
      startAt: example.startAt,
      endAt: example.endAt,
      samples: example.samples.map((sample) => ({ source: sample.source, stage: sample.value })),
    })),
  }
}

async function fingerprintStats(filePath: string): Promise<{ unique: number; duplicates: number }> {
  const sortedPath = `${filePath}.sorted`
  await run('sort', ['-S', '256M', '-o', sortedPath, filePath])
  let unique = 0
  let duplicates = 0
  let previous = ''
  let runLength = 0
  const lines = createInterface({ input: createReadStream(sortedPath, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of lines) {
    if (line === previous) {
      runLength += 1
      continue
    }
    if (previous) {
      unique += 1
      if (runLength > 1) {
        duplicates += runLength - 1
      }
    }
    previous = line
    runLength = 1
  }
  if (previous) {
    unique += 1
    if (runLength > 1) {
      duplicates += runLength - 1
    }
  }
  await rm(sortedPath, { force: true })
  return { unique, duplicates }
}

export async function streamAppleHealthPreview(input: {
  zipPath?: string
  xmlPath?: string
  zipBytes?: number | null
}): Promise<AppleHealthStreamReport> {
  const started = Date.now()
  let peakRss = process.memoryUsage().rss
  const dir = await mkdtemp(path.join(tmpdir(), 'apple-health-preview-'))
  const fingerprintFile = path.join(dir, 'fingerprints.txt')
  const intervalFile = path.join(dir, 'intervals.tsv')
  const sleepFile = path.join(dir, 'sleep.tsv')
  const fingerprintOut = createWriteStream(fingerprintFile)
  const intervalOut = createWriteStream(intervalFile)
  const sleepOut = createWriteStream(sleepFile)
  const fingerprintHash = createHash('sha256')
  const counts = {
    encountered: 0,
    supported: 0,
    steps: 0,
    activeEnergy: 0,
    exerciseTime: 0,
    walkingRunningDistance: 0,
    restingHeartRate: 0,
    sleep: 0,
    workouts: 0,
    bodyOwned: 0,
    nutritionOwned: 0,
    unsupported: 0,
    malformed: 0,
  }
  const quantityBySource = new Map<string, Map<string, number>>()
  const sleepBySource = new Map<string, number>()
  const sleepByCategory = new Map<string, number>()
  const sleepCategoryBySource = new Map<string, Map<string, number>>()
  const unknownSleep = new Map<string, number>()
  const workoutsByType = new Map<string, number>()
  const workoutsBySource = new Map<string, number>()
  const workoutExamples: AppleHealthStreamReport['workoutExamples'] = []
  const workoutExampleTypes = new Set<string>()
  let workoutsWithEnergy = 0
  let workoutsWithDistance = 0
  const bodyTypes = new Map<string, number>()
  const nutritionTypes = new Map<string, number>()
  const unsupportedTypes = new Map<string, number>()
  const malformed = new Map<string, { appleType: string; detail: string; count: number }>()
  const sources = new Set<string>()
  const devices = new Set<string>()
  const rhrBySource = new Map<string, number>()
  const rhrDays = new Set<string>()
  const bounds = {
    earliestMs: Number.POSITIVE_INFINITY,
    latestMs: Number.NEGATIVE_INFINITY,
    earliest: null as string | null,
    latest: null as string | null,
  }
  const rhrBounds = {
    earliestMs: Number.POSITIVE_INFINITY,
    latestMs: Number.NEGATIVE_INFINITY,
    earliest: null as string | null,
    latest: null as string | null,
  }
  let exportDate: string | null = null
  const structural = { ActivitySummary: 0, Correlation: 0, ClinicalRecord: 0 }
  let structuralCarry = ''
  let xmlBytes = 0

  function noteInstant(text: string, ms: number) {
    if (ms < bounds.earliestMs) {
      bounds.earliestMs = ms
      bounds.earliest = text
    }
    if (ms > bounds.latestMs) {
      bounds.latestMs = ms
      bounds.latest = text
    }
  }

  function onItem(item: NormalizedAppleHealthRecord | SkippedAppleHealthRecord) {
    counts.encountered += 1
    if ('reason' in item) {
      if (item.reason === 'body_owned') {
        counts.bodyOwned += 1
        bump(bodyTypes, item.appleType || '(missing type)')
      } else if (item.reason === 'nutrition_owned') {
        counts.nutritionOwned += 1
        bump(nutritionTypes, item.appleType || '(missing type)')
      } else if (item.reason === 'unsupported') {
        counts.unsupported += 1
        bump(unsupportedTypes, item.appleType || '(missing type)')
      } else {
        counts.malformed += 1
        const detail = item.detail ?? 'malformed'
        const key = `${item.appleType}|${detail}`
        const existing = malformed.get(key)
        if (existing) {
          existing.count += 1
        } else if (malformed.size < 30) {
          malformed.set(key, { appleType: item.appleType, detail, count: 1 })
        }
      }
      return
    }
    counts.supported += 1
    sources.add(item.sourceName)
    if (item.deviceName) {
      devices.add(item.deviceName)
    }
    fingerprintHash.update(item.fingerprint)
    fingerprintHash.update('\n')
    fingerprintOut.write(`${item.fingerprint}\n`)
    const startMs = Date.parse(item.startAt)
    const endMs = Date.parse(item.endAt)
    if (Number.isFinite(startMs)) {
      noteInstant(item.startAt, startMs)
    }
    if (Number.isFinite(endMs)) {
      noteInstant(item.endAt, endMs)
    }
    if (item.kind === 'quantity') {
      const metric =
        item.metric === 'active_energy'
          ? 'activeEnergy'
          : item.metric === 'exercise_time'
            ? 'exerciseTime'
            : item.metric === 'walking_running_distance'
              ? 'walkingRunningDistance'
              : item.metric === 'resting_heart_rate'
                ? 'restingHeartRate'
                : 'steps'
      counts[metric] += 1
      bumpNested(quantityBySource, item.metric, item.sourceName)
      const safeSource = item.sourceName.replaceAll('\t', ' ')
      intervalOut.write(`${item.metric}\t${item.startAt}\t${item.endAt}\t${safeSource}\t${item.value}\n`)
      if (item.metric === 'resting_heart_rate') {
        bump(rhrBySource, item.sourceName)
        if (Number.isFinite(startMs)) {
          rhrDays.add(healthCalendarDateFromInstant(new Date(startMs)))
          if (startMs < rhrBounds.earliestMs) {
            rhrBounds.earliestMs = startMs
            rhrBounds.earliest = item.startAt
          }
          if (startMs > rhrBounds.latestMs) {
            rhrBounds.latestMs = startMs
            rhrBounds.latest = item.startAt
          }
        }
      }
      return
    }
    if (item.kind === 'sleep') {
      counts.sleep += 1
      bump(sleepBySource, item.sourceName)
      bump(sleepByCategory, item.sourceCategory)
      bumpNested(sleepCategoryBySource, item.sourceCategory, item.sourceName)
      if (item.stage === 'unsupported') {
        bump(unknownSleep, item.sourceCategory)
      }
      const safeSource = item.sourceName.replaceAll('\t', ' ')
      sleepOut.write(`${item.startAt}\t${item.endAt}\t${safeSource}\t${item.stage}\n`)
      return
    }
    counts.workouts += 1
    if (item.energyKcal != null) {
      workoutsWithEnergy += 1
    }
    if (item.distanceM != null) {
      workoutsWithDistance += 1
    }
    bump(workoutsByType, item.activityType)
    bump(workoutsBySource, item.sourceName)
    if (!workoutExampleTypes.has(item.activityType) && workoutExamples.length < 12) {
      workoutExampleTypes.add(item.activityType)
      workoutExamples.push({
        activityType: item.activityType,
        startAt: item.startAt,
        endAt: item.endAt,
        durationMin: item.durationMin,
        energyKcal: item.energyKcal,
        distanceM: item.distanceM,
        sourceName: item.sourceName,
        deviceName: item.deviceName,
      })
    }
  }

  const scanner = createAppleHealthXmlScanner({ retain: false, onItem })
  const opened =
    input.zipPath != null
      ? openXmlStream({ kind: 'zip', zipPath: input.zipPath, entry: await exportXmlName(input.zipPath) })
      : openXmlStream({ kind: 'xml', xmlPath: input.xmlPath ?? '' })
  const decoder = new TextDecoder('utf-8')
  let correlationCarry = ''
  let clinicalCarry = ''
  if (!opened.stream) {
    throw new Error('Could not read export.xml')
  }
  for await (const chunk of opened.stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    xmlBytes += bytes.length
    const text = decoder.decode(bytes, { stream: true })
    const activity = countTag(text, 'ActivitySummary', structuralCarry)
    const correlation = countTag(text, 'Correlation', correlationCarry)
    const clinical = countTag(text, 'ClinicalRecord', clinicalCarry)
    structural.ActivitySummary += activity.count
    structural.Correlation += correlation.count
    structural.ClinicalRecord += clinical.count
    structuralCarry = activity.carry
    correlationCarry = correlation.carry
    clinicalCarry = clinical.carry
    scanner.push(text)
    if (counts.encountered > 0 && counts.encountered % 250000 === 0) {
      peakRss = Math.max(peakRss, process.memoryUsage().rss)
      process.stderr.write(
        `parsed ${counts.encountered.toLocaleString('en-US')} records, rss ${(process.memoryUsage().rss / (1024 * 1024)).toFixed(0)} MB\n`,
      )
    }
  }
  const tail = decoder.decode()
  if (tail) {
    scanner.push(tail)
  }
  await opened.close()
  const parsed = scanner.finish()
  exportDate = parsed.exportDate
  await new Promise<void>((resolve, reject) => {
    fingerprintOut.end(() => resolve())
    fingerprintOut.on('error', reject)
  })
  await new Promise<void>((resolve, reject) => {
    intervalOut.end(() => resolve())
    intervalOut.on('error', reject)
  })
  await new Promise<void>((resolve, reject) => {
    sleepOut.end(() => resolve())
    sleepOut.on('error', reject)
  })
  peakRss = Math.max(peakRss, process.memoryUsage().rss)
  const [fp, intervals, sleepOverlap] = await Promise.all([
    fingerprintStats(fingerprintFile),
    analyzeIntervalFile(intervalFile, 3),
    analyzeSleepFile(sleepFile),
  ])
  await rm(dir, { recursive: true, force: true })
  const estimatedCommitRows = fp.unique
  const approxPayloadBytes = estimatedCommitRows * 420
  return {
    zipBytes: input.zipBytes ?? null,
    xmlBytes,
    parseMs: Date.now() - started,
    peakRssBytes: peakRss,
    exportDate,
    earliest: bounds.earliest,
    latest: bounds.latest,
    fingerprintSha256: fingerprintHash.digest('hex'),
    counts: {
      ...counts,
      duplicateFingerprints: fp.duplicates,
      uniqueFingerprints: fp.unique,
      estimatedCommitRows,
    },
    sources: [...sources].sort(),
    devices: [...devices].sort(),
    quantityBySource: nestedRecord(quantityBySource),
    sleepBySource: recordMap(sleepBySource),
    sleepByCategory: recordMap(sleepByCategory),
    sleepCategoryBySource: nestedRecord(sleepCategoryBySource),
    unknownSleepCategories: recordMap(unknownSleep),
    workoutsByType: recordMap(workoutsByType),
    workoutsBySource: recordMap(workoutsBySource),
    workoutsWithEnergy,
    workoutsWithDistance,
    workoutExamples,
    restingHeartRate: {
      count: counts.restingHeartRate,
      earliest: rhrBounds.earliest,
      latest: rhrBounds.latest,
      bySource: recordMap(rhrBySource),
      distinctDays: rhrDays.size,
      recordsPerDay: rhrDays.size > 0 ? Number((counts.restingHeartRate / rhrDays.size).toFixed(2)) : null,
    },
    bodySkippedTypes: sortedEntries(bodyTypes),
    nutritionSkippedTypes: sortedEntries(nutritionTypes),
    unsupportedTypes: sortedEntries(unsupportedTypes, 40),
    malformed: [...malformed.values()].sort((a, b) => b.count - a.count),
    identicalIntervalOverlaps: intervals.identical,
    partialIntervalOverlaps: intervals.partial,
    sleepSourceOverlap: sleepOverlap,
    structuralElements: structural,
    batching: {
      commitBatch: APPLE_HEALTH_COMMIT_BATCH,
      estimatedRequests: Math.ceil(estimatedCommitRows / APPLE_HEALTH_COMMIT_BATCH),
      approxPayloadBytes,
    browserPath: xmlBytes > 40 * 1024 * 1024 ? 'unsafe' : 'ok',
  },
    calendarTimeZone: HEALTH_CALENDAR_TIME_ZONE,
  }
}
