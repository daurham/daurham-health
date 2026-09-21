import { previewLegacyNutrition, commitLegacyNutrition, parseLegacyImportOptions } from './migrate.js'

function parseCliOptions(argv: string[]) {
  const commit = argv.includes('--commit')
  const excludeArg = argv.find((arg) => arg.startsWith('--exclude-food-log-ids='))
  const excludeRaw = excludeArg?.slice('--exclude-food-log-ids='.length) ?? ''
  const options = parseLegacyImportOptions(
    excludeRaw.length > 0
      ? { excludeFoodLogIds: excludeRaw.split(',').map((part) => part.trim()).filter((part) => part.length > 0) }
      : {},
  )
  return { commit, options }
}

async function main() {
  const { commit, options } = parseCliOptions(process.argv.slice(2))
  const report = commit
    ? await commitLegacyNutrition(undefined, options)
    : await previewLegacyNutrition(undefined, options)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Legacy nutrition preview failed'
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
