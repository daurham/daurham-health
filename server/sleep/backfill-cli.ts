import {
  SLEEP_NIGHT_CALCULATION_VERSION,
  SLEEP_TIMEZONE,
  type SleepNightlySummary,
  type SleepSelectionReason,
} from '../../src/domain/sleep/index.js'
import { backfillSleepNightlySummaries, nightlySemanticFingerprint, storedSleepNightlyFingerprint } from './backfill.js'

function formatMinutes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '—'
  }
  const rounded = Math.round(value)
  const hours = Math.trunc(rounded / 60)
  const minutes = Math.abs(rounded % 60)
  if (hours === 0) {
    return `${rounded}m`
  }
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '—'
  }
  return `${Math.round(value)}%`
}

function formatPhoenix(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: SLEEP_TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

function line(text = ''): void {
  process.stdout.write(`${text}\n`)
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1
}

function verifyKnownCase(
  nights: readonly SleepNightlySummary[],
  date: string,
  expectedSource: string,
  expectedReason: SleepSelectionReason,
): void {
  const night = nights.find((item) => item.sleepDate === date)
  const ok =
    night?.sourceName === expectedSource &&
    night.selectionReason === expectedReason &&
    night.analysisEligible
  line(`${ok ? 'PASS' : 'FAIL'} ${date}: expected ${expectedSource} via ${expectedReason}`)
  if (night) {
    line(`     got ${night.sourceName} ${formatMinutes(night.totalSleepMinutes)} ${night.selectionReason} eligible=${night.analysisEligible}`)
  } else {
    line('     missing row')
  }
}

function printReport(nights: readonly SleepNightlySummary[]): void {
  const byStatus: Record<string, number> = {}
  const byReason: Record<string, number> = {}
  const eligibleSources: Record<string, number> = {}
  const overrides: SleepNightlySummary[] = []
  let stageEligible = 0
  for (const night of nights) {
    increment(byStatus, night.observationStatus)
    increment(byReason, night.selectionReason)
    if (night.analysisEligible) {
      increment(eligibleSources, night.sourceName)
    }
    if (night.stageAnalysisEligible) {
      stageEligible += 1
    }
    if (night.selectionReason === 'completeness_override') {
      overrides.push(night)
    }
  }

  line('SLEEP NIGHTLY SUMMARY BACKFILL')
  line(`timezone: ${SLEEP_TIMEZONE}`)
  line(`calculation: ${SLEEP_NIGHT_CALCULATION_VERSION}`)
  line()
  line('TOTAL')
  line(`- nightly summary rows: ${nights.length}`)
  line()
  line('STATUS')
  line(`- analysis eligible: ${byStatus.analysis_eligible ?? 0}`)
  line(`- partial observation: ${byStatus.partial_observation ?? 0}`)
  line(`- In-Bed-only: ${byStatus.in_bed_only ?? 0}`)
  line()
  line('SOURCE (analysis-eligible nights)')
  line(`- ${JSON.stringify(eligibleSources)}`)
  line()
  line('SELECTION REASON')
  line(`- source_priority: ${byReason.source_priority ?? 0}`)
  line(`- completeness_override: ${byReason.completeness_override ?? 0}`)
  line(`- partial_only: ${byReason.partial_only ?? 0}`)
  line(`- in_bed_only: ${byReason.in_bed_only ?? 0}`)
  line()
  line('STAGES')
  line(`- stage-analysis-eligible nights: ${stageEligible}`)
  line()
  line('OVERRIDES')
  if (overrides.length === 0) {
    line('(none)')
  }
  for (const night of overrides) {
    const longest = [...night.evidence.alternatives].sort(
      (left, right) => (right.totalSleepMinutes ?? -1) - (left.totalSleepMinutes ?? -1),
    )[0]
    line()
    line(night.sleepDate)
    line(`  chosen: ${night.sourceName} — ${formatMinutes(night.totalSleepMinutes)}`)
    if (longest) {
      line(`  longest alternative: ${longest.sourceName} — ${formatMinutes(longest.totalSleepMinutes)}`)
    }
  }
  line()
  line('KNOWN CASES')
  verifyKnownCase(nights, '2021-05-02', 'Sleep Cycle', 'source_priority')
  verifyKnownCase(nights, '2021-04-01', 'Sleep Cycle', 'completeness_override')
  verifyKnownCase(nights, '2021-04-07', 'Sleep Cycle', 'completeness_override')
  line()
  line('RECENT 20 ROWS')
  for (const night of [...nights].slice(-20).reverse()) {
    line()
    line(night.sleepDate)
    line(`  ${night.sourceName}  ${night.observationStatus}  eligible=${night.analysisEligible}`)
    line(`  ${formatPhoenix(night.startAt)} → ${formatPhoenix(night.endAt)}`)
    line(`  sleep ${formatMinutes(night.totalSleepMinutes)}  reason ${night.selectionReason}  stage ${formatPct(night.stageCoveragePct)}`)
  }
}

async function main(): Promise<void> {
  const first = await backfillSleepNightlySummaries()
  printReport(first.nights)
  line()
  line(`wrote ${first.written} rows (source_id provenance ${first.sourceId ?? 'null'})`)

  const storedAfterFirst = await storedSleepNightlyFingerprint()
  const second = await backfillSleepNightlySummaries()
  const storedAfterSecond = await storedSleepNightlyFingerprint()
  const derivedUnchanged = nightlySemanticFingerprint(first.nights) === nightlySemanticFingerprint(second.nights)
  const storedUnchanged = storedAfterFirst === storedAfterSecond && first.nights.length === second.nights.length
  line(`second run unchanged: ${derivedUnchanged && storedUnchanged}`)
  if (!derivedUnchanged || !storedUnchanged) {
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'sleep backfill failed'}\n`)
  process.exit(1)
})
