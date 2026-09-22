import { SLEEP_CALCULATION_VERSION, SLEEP_EXCLUSIVE_STAGES } from './config.js'
import {
  asTimeInterval,
  episodeHasActualSleep,
  sessionizeSleepEpisodes,
  type ClassifiedSleepInterval,
  type SleepEpisode,
} from './episodes.js'
import { intersectIntervals, minutesOrNull, unionMinutes, type TimeInterval } from './intervals.js'
import { isAsleepCategory } from './stages.js'

export type SleepNightCandidate = {
  sleepDate: string
  sourceId: string
  sourceName: string
  startAt: string
  endAt: string
  totalSleepMinutes: number | null
  timeInBedMinutes: number | null
  awakeMinutes: number | null
  coreMinutes: number | null
  deepMinutes: number | null
  remMinutes: number | null
  unspecifiedSleepMinutes: number | null
  stageCoveragePct: number | null
  intervalCount: number
  hasActualSleep: boolean
  stageConflictMinutes: number
  additionalEpisodeCount: number
  calculationVersion: string
  evidence: {
    rawSourceNames: string[]
    exclusiveStageConflict: boolean
    discardedEpisodeSleepMinutes: number | null
    discardedEpisodeInBedMinutes: number | null
  }
}

function ofCategory(episode: SleepEpisode, category: ClassifiedSleepInterval['category']): TimeInterval[] {
  return episode.intervals.filter((item) => item.category === category).map(asTimeInterval)
}

function asleepIntervals(episode: SleepEpisode): TimeInterval[] {
  return episode.intervals.filter((item) => isAsleepCategory(item.category)).map(asTimeInterval)
}

function exclusiveConflictMinutes(episode: SleepEpisode): number {
  const groups = SLEEP_EXCLUSIVE_STAGES.map((stage) => ofCategory(episode, stage))
  const overlaps: TimeInterval[] = []
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      overlaps.push(...intersectIntervals(groups[i]!, groups[j]!))
    }
  }
  return unionMinutes(overlaps)
}

function candidateFromEpisode(episode: SleepEpisode, extraEpisodes: SleepEpisode[]): SleepNightCandidate {
  const sleep = asleepIntervals(episode)
  const inBed = ofCategory(episode, 'in_bed')
  const awake = ofCategory(episode, 'awake')
  const core = ofCategory(episode, 'core')
  const deep = ofCategory(episode, 'deep')
  const rem = ofCategory(episode, 'rem')
  const unspecified = ofCategory(episode, 'asleep_unspecified')
  const totalSleepMinutes = minutesOrNull(sleep)
  const stagedMinutes = unionMinutes([...core, ...deep, ...rem])
  const stageCoveragePct = totalSleepMinutes != null && totalSleepMinutes > 0 ? (stagedMinutes / totalSleepMinutes) * 100 : null
  const rawNames = [...new Set(episode.intervals.map((item) => item.rawSourceName).filter((item): item is string => Boolean(item)))]
  const discardedSleep = extraEpisodes.flatMap(asleepIntervals)
  const discardedInBed = extraEpisodes.flatMap((item) => ofCategory(item, 'in_bed'))
  const stageConflictMinutes = exclusiveConflictMinutes(episode)
  return {
    sleepDate: episode.sleepDate,
    sourceId: episode.sourceKey,
    sourceName: episode.sourceName,
    startAt: episode.startAt,
    endAt: episode.endAt,
    totalSleepMinutes,
    timeInBedMinutes: minutesOrNull(inBed),
    awakeMinutes: minutesOrNull(awake),
    coreMinutes: minutesOrNull(core),
    deepMinutes: minutesOrNull(deep),
    remMinutes: minutesOrNull(rem),
    unspecifiedSleepMinutes: minutesOrNull(unspecified),
    stageCoveragePct,
    intervalCount: episode.intervals.length,
    hasActualSleep: episodeHasActualSleep(episode),
    stageConflictMinutes,
    additionalEpisodeCount: extraEpisodes.length,
    calculationVersion: SLEEP_CALCULATION_VERSION,
    evidence: {
      rawSourceNames: rawNames,
      exclusiveStageConflict: stageConflictMinutes > 0,
      discardedEpisodeSleepMinutes: minutesOrNull(discardedSleep),
      discardedEpisodeInBedMinutes: minutesOrNull(discardedInBed),
    },
  }
}

function primarySort(left: SleepEpisode, right: SleepEpisode): number {
  const leftSleep = minutesOrNull(asleepIntervals(left))
  const rightSleep = minutesOrNull(asleepIntervals(right))
  if (leftSleep != null && rightSleep != null && leftSleep !== rightSleep) {
    return rightSleep - leftSleep
  }
  if (leftSleep != null && rightSleep == null) {
    return -1
  }
  if (leftSleep == null && rightSleep != null) {
    return 1
  }
  const leftBed = minutesOrNull(ofCategory(left, 'in_bed'))
  const rightBed = minutesOrNull(ofCategory(right, 'in_bed'))
  if (leftBed != null && rightBed != null && leftBed !== rightBed) {
    return rightBed - leftBed
  }
  if (leftBed != null && rightBed == null) {
    return -1
  }
  if (leftBed == null && rightBed != null) {
    return 1
  }
  if (left.startMs !== right.startMs) {
    return left.startMs - right.startMs
  }
  if (left.endMs !== right.endMs) {
    return left.endMs - right.endMs
  }
  return left.sourceKey.localeCompare(right.sourceKey)
}

export function sleepNightCandidates(intervals: readonly ClassifiedSleepInterval[]): SleepNightCandidate[] {
  const episodes = sessionizeSleepEpisodes(intervals)
  const groups = new Map<string, SleepEpisode[]>()
  for (const episode of episodes) {
    const key = `${episode.sourceKey}|${episode.sleepDate}`
    const list = groups.get(key) ?? []
    list.push(episode)
    groups.set(key, list)
  }
  const candidates: SleepNightCandidate[] = []
  for (const group of groups.values()) {
    const ranked = [...group].sort(primarySort)
    const primary = ranked[0]!
    candidates.push(candidateFromEpisode(primary, ranked.slice(1)))
  }
  return candidates.sort((left, right) => left.sleepDate.localeCompare(right.sleepDate) || left.sourceId.localeCompare(right.sourceId))
}
