import { previewLegacyNutrition } from './migrate.js'

async function main() {
  const report = await previewLegacyNutrition()
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Legacy nutrition preview failed'
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
