import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { unzipSync } from 'fflate'
import {
  createAppleHealthXmlScanner,
  decodeAppleHealthXmlBytes,
  previewAppleHealth,
  type AppleHealthParseResult,
} from '../../src/domain/apple-health/index.js'
import { ingestNormalizedAppleHealthRecords } from './service.js'

function findExportXml(files: Record<string, Uint8Array>): Uint8Array {
  const names = Object.keys(files)
  const match =
    names.find((name) => name.replace(/\\/g, '/').toLowerCase().endsWith('/export.xml')) ??
    names.find((name) => name.replace(/\\/g, '/').toLowerCase() === 'export.xml')
  if (!match || !files[match]) {
    throw new Error('Apple Health ZIP must contain export.xml')
  }
  return files[match]
}

async function parseXmlFile(filePath: string): Promise<AppleHealthParseResult> {
  const scanner = createAppleHealthXmlScanner()
  const stream = createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 * 1024 })
  for await (const chunk of stream) {
    scanner.push(typeof chunk === 'string' ? chunk : decodeAppleHealthXmlBytes(chunk))
  }
  return scanner.finish()
}

async function parseExport(filePath: string): Promise<AppleHealthParseResult> {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.xml')) {
    return parseXmlFile(filePath)
  }
  if (lower.endsWith('.zip')) {
    const bytes = new Uint8Array(await readFile(filePath))
    const xmlBytes = findExportXml(unzipSync(bytes))
    const scanner = createAppleHealthXmlScanner()
    const text = decodeAppleHealthXmlBytes(xmlBytes)
    const chunkSize = 1024 * 1024
    for (let offset = 0; offset < text.length; offset += chunkSize) {
      scanner.push(text.slice(offset, offset + chunkSize))
    }
    return scanner.finish()
  }
  throw new Error('Provide an Apple Health export.zip or export.xml')
}

function publicPreview(parsed: AppleHealthParseResult) {
  const preview = previewAppleHealth(parsed)
  return {
    exportDate: preview.exportDate,
    dateRange: preview.dateRange,
    sources: preview.sources,
    devices: preview.devices,
    unknownSleepCategories: preview.unknownSleepCategories,
    validationFailures: preview.validationFailures,
    overlappingActivityGroups: preview.overlappingActivityGroups,
    counts: preview.counts,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const commit = args.includes('--commit')
  const filePath = args.find((arg) => !arg.startsWith('--'))
  if (!filePath) {
    process.stderr.write('Usage: tsx server/apple-health/cli.ts <export.zip|export.xml> [--commit]\n')
    process.exit(1)
  }
  const resolved = path.resolve(filePath)
  const info = await stat(resolved)
  process.stderr.write(`Parsing ${resolved} (${(info.size / (1024 * 1024)).toFixed(1)} MB)…\n`)
  const parsed = await parseExport(resolved)
  const preview = previewAppleHealth(parsed)
  const report = publicPreview(parsed)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (!commit) {
    return
  }
  let jobId: string | undefined
  let inserted = 0
  let matched = 0
  const batchSize = 400
  for (let offset = 0; offset < preview.records.length; offset += batchSize) {
    const records = preview.records.slice(offset, offset + batchSize)
    const complete = offset + records.length >= preview.records.length
    const result = await ingestNormalizedAppleHealthRecords({
      records,
      jobId,
      complete,
      summary: complete ? report : undefined,
      sourceFilename: path.basename(resolved),
    })
    jobId = result.jobId
    inserted += result.insertedCount
    matched += result.matchedCount
    process.stderr.write(
      `Committed ${Math.min(offset + records.length, preview.records.length)} / ${preview.records.length}\n`,
    )
  }
  process.stdout.write(`${JSON.stringify({ jobId, insertedCount: inserted, matchedCount: matched }, null, 2)}\n`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Apple Health import failed'
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
