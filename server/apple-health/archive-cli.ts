import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { APPLE_HEALTH_PARSER_VERSION } from '../../src/domain/apple-health/config.js'
import { compactImportMetadata } from '../../src/domain/apple-health/compact-plan.js'
import { createAppleHealthXmlScanner } from '../../src/domain/apple-health/parse.js'
import type { NormalizedSleepSample, NormalizedWorkoutSample } from '../../src/domain/apple-health/parse.js'
import { commitAppleHealthSleepAndWorkouts } from './compact-service.js'

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

async function main() {
  const filePath = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
  if (!filePath) {
    process.stderr.write('Usage: tsx server/apple-health/archive-cli.ts <export.zip>\n')
    process.exit(1)
  }
  const resolved = path.resolve(filePath)
  const info = await stat(resolved)
  if (!resolved.toLowerCase().endsWith('.zip')) {
    throw new Error('Apple Health archive commit expects export.zip')
  }
  process.stderr.write(`Archive commit ${resolved} (${(info.size / (1024 * 1024)).toFixed(1)} MB)…\n`)
  const sha256 = await sha256File(resolved)
  const sleep: NormalizedSleepSample[] = []
  const workouts: NormalizedWorkoutSample[] = []
  let quantityDiscarded = 0
  const scanner = createAppleHealthXmlScanner({
    retain: false,
    onItem(item) {
      if ('reason' in item) {
        return
      }
      if (item.kind === 'sleep') {
        sleep.push(item)
      } else if (item.kind === 'workout') {
        workouts.push(item)
      } else {
        quantityDiscarded += 1
      }
    },
  })
  const entry = await exportXmlEntry(resolved)
  const child = spawn('unzip', ['-p', resolved, entry], { stdio: ['ignore', 'pipe', 'pipe'] })
  let xmlBytes = 0
  for await (const chunk of child.stdout) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
    xmlBytes += Buffer.byteLength(text)
    scanner.push(text)
  }
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
  if (exitCode !== 0) {
    throw new Error('Could not read export.xml')
  }
  const parsed = scanner.finish()
  const dates = [...sleep.map((row) => row.startAt), ...workouts.map((row) => row.startAt)].sort()
  const metadata = compactImportMetadata({
    parserVersion: APPLE_HEALTH_PARSER_VERSION,
    sha256,
    zipBytes: info.size,
    xmlBytes,
    exportDate: parsed.exportDate,
    dateRange: dates.length === 0 ? null : { start: dates[0]!.slice(0, 10), end: dates[dates.length - 1]!.slice(0, 10) },
  })
  const result = await commitAppleHealthSleepAndWorkouts({
    metadata,
    sleep,
    workouts,
    sourceFilename: path.basename(resolved),
    onProgress(progress) {
      if (progress.completed === progress.total || progress.completed % 500 === 0) {
        process.stderr.write(`${progress.phase} ${progress.completed} / ${progress.total}\n`)
      }
    },
  })
  process.stdout.write(
    `${JSON.stringify({ ...result, quantityDiscarded, sleepKept: sleep.length, workoutsKept: workouts.length }, null, 2)}\n`,
  )
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Apple Health archive commit failed'
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
