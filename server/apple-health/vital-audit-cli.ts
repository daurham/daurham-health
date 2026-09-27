import { readFileSync } from 'node:fs'
import { auditSleepVitalPayload, formatSleepVitalAudit } from '../../src/domain/apple-health/hae-vitals.js'

const file = process.argv[2]
if (!file) {
  process.stderr.write('Usage: tsx server/apple-health/vital-audit-cli.ts <payload.json>\n')
  process.exit(1)
}

const payload = JSON.parse(readFileSync(file, 'utf8')) as unknown
process.stdout.write(`${formatSleepVitalAudit(auditSleepVitalPayload(payload))}\n`)
