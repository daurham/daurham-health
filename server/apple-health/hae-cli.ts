import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ingestHealthAutoExport } from './hae-service.js'

async function main() {
  const filePath = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
  if (!filePath) {
    process.stderr.write('Usage: tsx server/apple-health/hae-cli.ts <health-auto-export.json>\n')
    process.exit(1)
  }
  const resolved = path.resolve(filePath)
  const bytes = await readFile(resolved)
  const payload = JSON.parse(bytes.toString('utf8')) as unknown
  const contentHash = createHash('sha256').update(bytes).digest('hex')
  const result = await ingestHealthAutoExport({
    payload,
    sourceFilename: path.basename(resolved),
    contentHash,
  })
  process.stdout.write(`${JSON.stringify({ ...result, contentHash }, null, 2)}\n`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Health Auto Export import failed'
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
