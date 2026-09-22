import { activityRangeSummary, activityShortTermChange } from '../../src/domain/activity/index.js'
import { SLEEP_SESSION_GAP_MINUTES, SLEEP_TIMEZONE, buildSleepDiagnosticReport } from '../../src/domain/sleep/index.js'
import { HEALTH_CALENDAR_TIME_ZONE } from '../../src/domain/time.js'
import { listActivityDailySummaries } from '../activity/queries.js'
import { listSleepIntervals } from './queries.js'

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

async function main(): Promise<void> {
  const [intervals, activity] = await Promise.all([listSleepIntervals(), listActivityDailySummaries()])
  const report = buildSleepDiagnosticReport(intervals)
  const activityAsOf = activity.at(-1)?.date
  const activitySummary = activityAsOf
    ? activityRangeSummary(activity, activity[0]!.date, activityAsOf, HEALTH_CALENDAR_TIME_ZONE)
    : null
  const activityChange = activityAsOf ? activityShortTermChange(activity, activityAsOf) : null

  line('SLEEP NIGHT CANDIDATE DRY-RUN')
  line(`timezone: ${SLEEP_TIMEZONE}`)
  line(`session gap: ${SLEEP_SESSION_GAP_MINUTES} minutes`)
  line(`calculation: ${report.decisions[0]?.selected?.calculationVersion ?? 'sleep-night-candidate-v1'}`)
  line()
  line('RAW')
  line(`- intervals: ${report.raw.intervalCount} (${report.raw.classifiedIntervalCount} classified, ${report.raw.ignoredIntervalCount} ignored)`)
  line(`- span: ${report.raw.minStart ?? '—'} → ${report.raw.maxEnd ?? '—'}`)
  line()
  line('SOURCES')
  line('Logical grouping uses source_name families (Apple Watch / Circular / Sleep Cycle / iPhone).')
  line('data_sources.id is the import origin (apple_health) and is not used as device identity.')
  line('HKDevice / source_version are ignored so software updates do not split a source.')
  for (const source of report.sources) {
    line(`- ${source.sourceName} [${source.sourceId}]: ${source.intervalCount} intervals, ${source.episodeCount} episodes`)
    line(`  raw names: ${source.rawNames.join(', ') || '—'}`)
    line(`  span: ${source.minStart ?? '—'} → ${source.maxEnd ?? '—'}`)
  }
  line()
  line('EPISODES')
  line(`- total: ${report.episodes.count}`)
  for (const item of report.episodes.perSource) {
    line(`- ${item.sourceId}: ${item.count}`)
  }
  line('- consecutive intra-source gaps (count ≤ boundary / count > 120):')
  for (const bucket of report.episodes.gapDistribution) {
    if (bucket.maxMinutes == null) {
      line(`  > 120 min: ${bucket.count}`)
    } else {
      line(`  ≤ ${bucket.maxMinutes} min: ${bucket.count}`)
    }
  }
  line()
  line('NIGHTS')
  line(`- unique sleep_dates: ${report.nights.uniqueSleepDates}`)
  line(`- with actual sleep: ${report.nights.withActualSleep}`)
  line(`- in-bed only: ${report.nights.inBedOnly}`)
  line(`- multi-source dates: ${report.nights.multiSource}`)
  line(`- staged candidates: ${report.nights.staged}`)
  line()
  line('PROVISIONAL ARBITRATION')
  line(`- selected: ${JSON.stringify(report.arbitration.selectedSourceDistribution)}`)
  line(`- fallback (not Apple Watch): ${JSON.stringify(report.arbitration.fallbackSourceDistribution)}`)
  line(`- dates where Apple Watch is absent: ${report.arbitration.topPriorityAbsent}`)
  line(`- suspicious partial-preferred cases: ${report.arbitration.suspiciousPartialPreferred}`)
  line()
  line('STAGES')
  line(`- coverage none / <50 / 50-90 / ≥90: ${report.stages.coverage.none} / ${report.stages.coverage.under50} / ${report.stages.coverage.from50to90} / ${report.stages.coverage.atLeast90}`)
  line(`- candidates with exclusive-stage conflicts: ${report.stages.nightsWithConflicts}`)
  for (const item of report.stages.largestConflicts.slice(0, 5)) {
    line(`  ${item.sleepDate} ${item.sourceName} conflict ${formatMinutes(item.stageConflictMinutes)}`)
  }
  if (activitySummary && activityChange) {
    line()
    line('ACTIVITY (canonical daily summaries, not sleep)')
    line(`- days ${activitySummary.start} → ${activitySummary.end} (${activitySummary.calendarDays} calendar days)`)
    line(`- steps observed ${activitySummary.steps.observedDays} avg ${activitySummary.steps.status === 'available' ? Math.round(activitySummary.steps.value) : '—'}`)
    line(`- active energy observed ${activitySummary.activeEnergy.observedDays}`)
    line(`- exercise observed ${activitySummary.exercise.observedDays}`)
    line(`- RHR observed ${activitySummary.restingHeartRate.observedDays}`)
    line(`- walking/running distance: ${activitySummary.walkingRunningDistance.status}`)
    line(`- 7d vs previous 7d steps: ${activityChange.steps.status}`)
  }
  line()
  line('RECENT 14 SELECTED NIGHTS')
  const recent = [...report.decisions].filter((item) => item.selected).slice(-14).reverse()
  for (const decision of recent) {
    const night = decision.selected!
    line()
    line(night.sleepDate)
    line(`  selected: ${night.sourceName}${decision.suspiciousPartialPreferred ? '  [suspicious partial]' : ''}`)
    line(`  ${formatPhoenix(night.startAt)} → ${formatPhoenix(night.endAt)}`)
    line(`  sleep ${formatMinutes(night.totalSleepMinutes)}  in bed ${formatMinutes(night.timeInBedMinutes)}  awake ${formatMinutes(night.awakeMinutes)}`)
    line(`  core ${formatMinutes(night.coreMinutes)}  deep ${formatMinutes(night.deepMinutes)}  rem ${formatMinutes(night.remMinutes)}  unspecified ${formatMinutes(night.unspecifiedSleepMinutes)}`)
    line(`  stage coverage ${formatPct(night.stageCoveragePct)}  conflict ${formatMinutes(night.stageConflictMinutes)}`)
    if (decision.alternatives.length > 0) {
      line(
        `  alternatives: ${decision.alternatives
          .map((item) => `${item.sourceName} ${formatMinutes(item.totalSleepMinutes)}`)
          .join('; ')}`,
      )
    }
  }
  line()
  line('SUSPICIOUS PARTIAL-PREFERRED CASES')
  const suspicious = report.decisions
    .filter((item) => item.suspiciousPartialPreferred && item.selected)
    .sort((left, right) => (left.chosenRatio ?? 1) - (right.chosenRatio ?? 1))
    .slice(0, 20)
  if (suspicious.length === 0) {
    line('(none)')
  }
  for (const decision of suspicious) {
    const chosen = decision.selected!
    const longest = [...decision.alternatives].sort((left, right) => (right.totalSleepMinutes ?? -1) - (left.totalSleepMinutes ?? -1))[0]
    line()
    line(decision.sleepDate)
    line(`chosen:`)
    line(`  ${chosen.sourceName} — ${formatMinutes(chosen.totalSleepMinutes)}`)
    if (longest) {
      line(`alternative:`)
      line(`  ${longest.sourceName} — ${formatMinutes(longest.totalSleepMinutes)}`)
    }
    line(`ratio:`)
    line(`  ${formatPct((decision.chosenRatio ?? 0) * 100)}`)
  }
  line()
  line('NO DATABASE WRITES. Canonical sleep nights were not materialized.')
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'sleep analyze failed'}\n`)
  process.exit(1)
})
