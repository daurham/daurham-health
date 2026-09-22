import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { APPLE_HEALTH_PARSER_VERSION } from '../../src/domain/apple-health/config.js'
import { compactImportMetadata, createDailyAccumulator } from '../../src/domain/apple-health/compact-plan.js'
import { createAppleHealthXmlScanner } from '../../src/domain/apple-health/parse.js'
import { ACTIVITY_CALCULATION_VERSION, SOURCE_PRIORITY } from '../../src/domain/apple-health/priority.js'

const COMPACT_COMMIT_BLOCK =
  'Compact historical commit is waiting on Apple Health UI validation. The approved entry point is commitCompactAppleHealth in server/apple-health/compact-service.ts, which writes daily summaries, sleep intervals, and workouts directly with getSql. Re-run without --commit.'

function assertCompactCommitBlocked() {
  throw new Error(COMPACT_COMMIT_BLOCK)
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(filePath)
  for await (const chunk of stream) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

function listZipEntries(zipPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
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
}

async function exportXmlEntry(zipPath: string): Promise<string> {
  const names = await listZipEntries(zipPath)
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

function roundDigits(value: number | null, digits: number): number | null {
  if (value == null) {
    return null
  }
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

async function previewExport(filePath: string) {
  const info = await stat(filePath)
  const zip = filePath.toLowerCase().endsWith('.zip')
  const sha256 = await sha256File(filePath)
  const started = Date.now()
  const accumulator = createDailyAccumulator()
  let xmlBytes = 0
  let encountered = 0
  const scanner = createAppleHealthXmlScanner({
    retain: false,
    onItem(item) {
      if ('reason' in item) {
        return
      }
      encountered += 1
      if (encountered % 250_000 === 0) {
        process.stderr.write(`Scanned ${encountered.toLocaleString('en-US')} supported records…\n`)
      }
      if (item.kind === 'quantity') {
        accumulator.addQuantity(item)
      } else if (item.kind === 'sleep') {
        accumulator.addSleep()
      } else {
        accumulator.addWorkout()
      }
    },
    onActivitySummary(summary) {
      accumulator.addSummary(summary)
    },
    onActivitySummarySkip(reason) {
      accumulator.skipSummary(reason)
    },
  })
  const opened = zip
    ? openXmlStream({ kind: 'zip', zipPath: filePath, entry: await exportXmlEntry(filePath) })
    : openXmlStream({ kind: 'xml', xmlPath: filePath })
  try {
    for await (const chunk of opened.stream) {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      xmlBytes += Buffer.byteLength(text)
      scanner.push(text)
    }
    await opened.close()
  } finally {
    opened.stream.destroy()
  }
  const parsed = scanner.finish()
  process.stderr.write('Reconciling daily Activity…\n')
  const plan = accumulator.finish(parsed.exportDate)
  const dateRange =
    plan.days.length === 0
      ? null
      : { start: plan.days[0]!.date, end: plan.days[plan.days.length - 1]!.date }
  const metadata = compactImportMetadata({
    parserVersion: APPLE_HEALTH_PARSER_VERSION,
    sha256,
    zipBytes: zip ? info.size : null,
    xmlBytes,
    exportDate: parsed.exportDate,
    dateRange,
  })
  const validation = [...plan.representatives]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((day) => ({
      role: day.role,
      date: day.date,
      derivedSteps: roundDigits(day.stepsCount, 0),
      derivedDistanceM: roundDigits(day.walkingRunningDistanceM, 0),
      activitySummaryActiveEnergyKcal: roundDigits(day.activeEnergyKcal, 1),
      activitySummaryExerciseMinutes: roundDigits(day.exerciseMinutes, 0),
      stepsBasis: day.stepsCount == null ? 'unavailable' : 'health_reconciled_source_priority',
      distanceBasis: day.walkingRunningDistanceM == null ? 'unavailable' : 'health_reconciled_source_priority',
      activeEnergyBasis: day.activeEnergyBasis,
      exerciseBasis: day.exerciseBasis,
    }))
  return {
    strategy: 'compact_canonical_preview',
    committed: false,
    parserVersion: APPLE_HEALTH_PARSER_VERSION,
    calculationVersion: ACTIVITY_CALCULATION_VERSION,
    sourcePriority: SOURCE_PRIORITY,
    algorithm: {
      stepsAndDistance:
        'Health-reconciled source precedence. Higher-priority samples claim [start, end). Lower-priority samples add value only for uncovered time, prorated by duration. Zero-duration samples, including Circular midnight distance totals, stay in the evidence and do not add value. Same-source overlap uses the same rule. No fuzzy matching and no deletion. This is not claimed to equal Apple’s displayed total.',
      activeEnergyAndExercise:
        'Apple ActivitySummary when that element exists. Explicit 0 stays 0. A missing summary stays null and is not replaced by a sum of raw samples. Goals stay source context.',
      restingHeartRate:
        'Highest-priority source with a valid sample owns the Health day. One observation is used as-is. Multiple observations from that source use the latest end, then latest start, then the lower bpm. They are not averaged.',
      timezone: 'America/Phoenix. Samples that cross midnight are split by duration. ActivitySummary dateComponents is kept as the calendar date.',
    },
    metadata,
    activitySummary: plan.coverage,
    counts: plan.counts,
    storage: plan.storage,
    representatives: plan.representatives,
    validation,
    elapsedMs: Date.now() - started,
    peakRssBytes: process.memoryUsage().rss,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const filePath = args.find((arg) => !arg.startsWith('--'))
  if (!filePath) {
    process.stderr.write('Usage: tsx server/apple-health/compact-cli.ts <export.zip|export.xml>\n')
    process.exit(1)
  }
  if (args.includes('--commit')) {
    assertCompactCommitBlocked()
  }
  const resolved = path.resolve(filePath)
  const info = await stat(resolved)
  process.stderr.write(`Compact preview ${resolved} (${(info.size / (1024 * 1024)).toFixed(1)} MB)…\n`)
  const report = await previewExport(resolved)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Compact Apple Health preview failed'
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
