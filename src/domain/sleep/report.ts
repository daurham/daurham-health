import { SLEEP_SOURCE_PRIORITY } from './config.js'
import { classifySleepIntervals, sessionizeSleepEpisodes, sleepGapDistribution, type SleepIntervalRow } from './episodes.js'
import { arbitrateSleepNights, type SleepArbitrationDecision } from './arbitration.js'
import { sleepNightCandidates, type SleepNightCandidate } from './nights.js'

export type SleepSourceReport = {
  sourceId: string
  sourceName: string
  rawNames: string[]
  intervalCount: number
  episodeCount: number
  minStart: string | null
  maxEnd: string | null
}

export type SleepDiagnosticReport = {
  raw: {
    intervalCount: number
    classifiedIntervalCount: number
    ignoredIntervalCount: number
    minStart: string | null
    maxEnd: string | null
  }
  sources: SleepSourceReport[]
  sourceGrouping: Array<{ sourceId: string; sourceName: string; rawNames: string[] }>
  episodes: {
    count: number
    perSource: Array<{ sourceId: string; count: number }>
    gapDistribution: ReturnType<typeof sleepGapDistribution>
  }
  nights: {
    uniqueSleepDates: number
    withActualSleep: number
    inBedOnly: number
    multiSource: number
    staged: number
  }
  arbitration: {
    selectedSourceDistribution: Record<string, number>
    fallbackSourceDistribution: Record<string, number>
    topPriorityAbsent: number
    suspiciousPartialPreferred: number
  }
  stages: {
    coverage: { none: number; under50: number; from50to90: number; atLeast90: number }
    nightsWithConflicts: number
    largestConflicts: Array<{ sleepDate: string; sourceName: string; stageConflictMinutes: number }>
  }
  candidates: SleepNightCandidate[]
  decisions: SleepArbitrationDecision[]
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1
}

export function buildSleepDiagnosticReport(rows: readonly SleepIntervalRow[]): SleepDiagnosticReport {
  const classified = classifySleepIntervals(rows)
  const episodes = sessionizeSleepEpisodes(classified)
  const candidates = sleepNightCandidates(classified)
  const decisions = arbitrateSleepNights(candidates)

  const rawStarts = rows.map((row) => Date.parse(row.startAt)).filter((value) => Number.isFinite(value))
  const rawEnds = rows.map((row) => Date.parse(row.endAt)).filter((value) => Number.isFinite(value))

  const sourceRaw = new Map<string, Set<string>>()
  const sourceCounts = new Map<string, { name: string; count: number; minStart: number | null; maxEnd: number | null }>()
  for (const interval of classified) {
    const raw = sourceRaw.get(interval.sourceKey) ?? new Set<string>()
    if (interval.rawSourceName) {
      raw.add(interval.rawSourceName)
    }
    sourceRaw.set(interval.sourceKey, raw)
    const current = sourceCounts.get(interval.sourceKey) ?? {
      name: interval.sourceName,
      count: 0,
      minStart: null,
      maxEnd: null,
    }
    current.count += 1
    current.minStart = current.minStart == null ? interval.startMs : Math.min(current.minStart, interval.startMs)
    current.maxEnd = current.maxEnd == null ? interval.endMs : Math.max(current.maxEnd, interval.endMs)
    sourceCounts.set(interval.sourceKey, current)
  }

  const episodeCount = new Map<string, number>()
  for (const episode of episodes) {
    episodeCount.set(episode.sourceKey, (episodeCount.get(episode.sourceKey) ?? 0) + 1)
  }

  const byDate = new Map<string, SleepNightCandidate[]>()
  for (const candidate of candidates) {
    const list = byDate.get(candidate.sleepDate) ?? []
    list.push(candidate)
    byDate.set(candidate.sleepDate, list)
  }

  const selectedSourceDistribution: Record<string, number> = {}
  const fallbackSourceDistribution: Record<string, number> = {}
  for (const decision of decisions) {
    if (!decision.selected) {
      continue
    }
    increment(selectedSourceDistribution, decision.selected.sourceName)
    if (decision.selected.sourceId !== SLEEP_SOURCE_PRIORITY[0]) {
      increment(fallbackSourceDistribution, decision.selected.sourceName)
    }
  }

  const coverage = { none: 0, under50: 0, from50to90: 0, atLeast90: 0 }
  const conflicts: Array<{ sleepDate: string; sourceName: string; stageConflictMinutes: number }> = []
  for (const candidate of candidates) {
    if (candidate.stageCoveragePct == null) {
      coverage.none += 1
    } else if (candidate.stageCoveragePct < 50) {
      coverage.under50 += 1
    } else if (candidate.stageCoveragePct < 90) {
      coverage.from50to90 += 1
    } else {
      coverage.atLeast90 += 1
    }
    if (candidate.stageConflictMinutes > 0) {
      conflicts.push({
        sleepDate: candidate.sleepDate,
        sourceName: candidate.sourceName,
        stageConflictMinutes: candidate.stageConflictMinutes,
      })
    }
  }

  const sources: SleepSourceReport[] = [...sourceCounts.entries()]
    .map(([sourceId, item]) => ({
      sourceId,
      sourceName: item.name,
      rawNames: [...(sourceRaw.get(sourceId) ?? [])].sort(),
      intervalCount: item.count,
      episodeCount: episodeCount.get(sourceId) ?? 0,
      minStart: item.minStart == null ? null : new Date(item.minStart).toISOString(),
      maxEnd: item.maxEnd == null ? null : new Date(item.maxEnd).toISOString(),
    }))
    .sort((left, right) => right.intervalCount - left.intervalCount)

  return {
    raw: {
      intervalCount: rows.length,
      classifiedIntervalCount: classified.length,
      ignoredIntervalCount: rows.length - classified.length,
      minStart: rawStarts.length ? new Date(Math.min(...rawStarts)).toISOString() : null,
      maxEnd: rawEnds.length ? new Date(Math.max(...rawEnds)).toISOString() : null,
    },
    sources,
    sourceGrouping: sources.map((item) => ({ sourceId: item.sourceId, sourceName: item.sourceName, rawNames: item.rawNames })),
    episodes: {
      count: episodes.length,
      perSource: sources.map((item) => ({ sourceId: item.sourceId, count: item.episodeCount })),
      gapDistribution: sleepGapDistribution(classified),
    },
    nights: {
      uniqueSleepDates: byDate.size,
      withActualSleep: [...byDate.values()].filter((items) => items.some((item) => item.hasActualSleep)).length,
      inBedOnly: [...byDate.values()].filter((items) => items.every((item) => !item.hasActualSleep)).length,
      multiSource: [...byDate.values()].filter((items) => items.length > 1).length,
      staged: candidates.filter((item) => item.coreMinutes != null || item.deepMinutes != null || item.remMinutes != null).length,
    },
    arbitration: {
      selectedSourceDistribution,
      fallbackSourceDistribution,
      topPriorityAbsent: decisions.filter((item) => item.topPriorityAbsent).length,
      suspiciousPartialPreferred: decisions.filter((item) => item.suspiciousPartialPreferred).length,
    },
    stages: {
      coverage,
      nightsWithConflicts: conflicts.length,
      largestConflicts: conflicts
        .sort((left, right) => right.stageConflictMinutes - left.stageConflictMinutes)
        .slice(0, 10),
    },
    candidates,
    decisions,
  }
}

