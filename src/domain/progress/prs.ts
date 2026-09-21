import { PROGRESS_ANALYTICS_CONFIG } from './config.js'
import {
  asAnalyzableLoadedRepSet,
  asAnalyzableTimedSet,
  compareSetChronology,
  epleyEstimated1RmKg,
  evidenceFromSet,
  sessionStrengthPoint,
  strengthRepsForSet,
} from './exercise-performance.js'
import { isPerSideExercise, supportsLoadedRepStrength, supportsTimedExternal } from './exercise-classification.js'
import {
  expandsFrontier,
  expandsTimedFrontier,
  performanceFrontier,
  timedPerformanceFrontier,
} from './frontier.js'
import { sessionExternalVolumeKg } from './volume.js'
import {
  PR_ACHIEVEMENTS,
  type AnalyzableTimedSet,
  type AnalyzableWorkingSet,
  type CanonicalSetRecord,
  type PerformanceBestEvent,
  type PrAchievement,
  type ProgressExerciseDefinition,
} from './types.js'

function groupSetsBySession(sets: readonly CanonicalSetRecord[]): CanonicalSetRecord[][] {
  const bySession = new Map<string, CanonicalSetRecord[]>()
  const order: string[] = []
  for (const set of [...sets].sort(compareSetChronology)) {
    const existing = bySession.get(set.sessionId)
    if (!existing) {
      bySession.set(set.sessionId, [set])
      order.push(set.sessionId)
    } else {
      existing.push(set)
    }
  }
  return order.map((id) => bySession.get(id)!)
}

type LoadedHistory = {
  bestLoadKg: number
  bestRepsAtLoad: Map<number, number>
  bestE1rmKg: number
  frontier: AnalyzableWorkingSet[]
  bestSessionVolumeKg: number
}

type TimedHistory = {
  bestLoadKg: number
  bestDurationAtLoad: Map<number, number>
  frontier: AnalyzableTimedSet[]
}

function representativeLoadedSet(
  sessionSets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
  analyzable: readonly AnalyzableWorkingSet[],
): CanonicalSetRecord {
  const strength = sessionStrengthPoint(sessionSets, exercise)
  return strength?.sourceSet ?? analyzable[0]!
}

function representativeTimedSet(analyzable: readonly AnalyzableTimedSet[]): AnalyzableTimedSet {
  return [...analyzable].sort((left, right) => {
    if (left.weightKg !== right.weightKg) {
      return right.weightKg - left.weightKg
    }
    if (left.durationSec !== right.durationSec) {
      return right.durationSec - left.durationSec
    }
    return compareSetChronology(left, right)
  })[0]!
}

function loadedAchievementsForSession(
  sessionSets: readonly CanonicalSetRecord[],
  analyzable: readonly AnalyzableWorkingSet[],
  exercise: ProgressExerciseDefinition,
  history: LoadedHistory | null,
): { achievements: PrAchievement[]; contributing: CanonicalSetRecord[] } {
  const contributing: CanonicalSetRecord[] = []
  const achievements = new Set<PrAchievement>()

  if (!history) {
    return { achievements: [], contributing }
  }

  for (const set of analyzable) {
    if (set.weightKg > history.bestLoadKg) {
      achievements.add('load')
      contributing.push(set)
    }
    const previousReps = history.bestRepsAtLoad.get(set.weightKg)
    if (previousReps != null && set.reps > previousReps) {
      achievements.add('rep_at_load')
      contributing.push(set)
    }
    if (expandsFrontier(set, history.frontier)) {
      achievements.add('frontier')
      contributing.push(set)
    }
    const estimate = epleyEstimated1RmKg(set.weightKg, set.reps)
    if (estimate > history.bestE1rmKg && set.reps <= PROGRESS_ANALYTICS_CONFIG.e1rm.highConfidenceMaxReps) {
      achievements.add('estimated_strength')
      contributing.push(set)
    }
  }

  const sessionVolume = sessionExternalVolumeKg(sessionSets, exercise)
  if (sessionVolume != null && sessionVolume > history.bestSessionVolumeKg) {
    achievements.add('session_volume')
    contributing.push(...analyzable)
  }

  return { achievements: [...achievements], contributing }
}

function timedAchievementsForSession(
  analyzable: readonly AnalyzableTimedSet[],
  history: TimedHistory | null,
): { achievements: PrAchievement[]; contributing: CanonicalSetRecord[] } {
  const contributing: CanonicalSetRecord[] = []
  const achievements = new Set<PrAchievement>()

  if (!history) {
    return { achievements: [], contributing }
  }

  for (const set of analyzable) {
    if (set.weightKg > history.bestLoadKg) {
      achievements.add('load')
      contributing.push(set)
    }
    const previousDuration = history.bestDurationAtLoad.get(set.weightKg)
    if (previousDuration != null && set.durationSec > previousDuration) {
      achievements.add('duration_at_load')
      contributing.push(set)
    }
    if (expandsTimedFrontier(set, history.frontier)) {
      achievements.add('frontier')
      contributing.push(set)
    }
  }

  return { achievements: [...achievements], contributing }
}

function uniqueEvidenceSets(sets: readonly CanonicalSetRecord[]): CanonicalSetRecord[] {
  const seen = new Set<string>()
  const unique: CanonicalSetRecord[] = []
  for (const set of [...sets].sort(compareSetChronology)) {
    if (seen.has(set.setId)) {
      continue
    }
    seen.add(set.setId)
    unique.push(set)
  }
  return unique
}

function eventFromSession(
  representative: CanonicalSetRecord,
  achievements: PrAchievement[],
  contributing: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
): PerformanceBestEvent {
  const evidenceSets = uniqueEvidenceSets(contributing.length > 0 ? contributing : [representative])
  const orderedAchievements = PR_ACHIEVEMENTS.filter((item) => achievements.includes(item))
  return {
    kind: 'performance_best',
    domain: 'training',
    exerciseId: representative.exerciseId,
    date: representative.sessionDate,
    sourceSessionId: representative.sessionId,
    sourceSetId: representative.setId,
    sourceSessionExerciseId: representative.sessionExerciseId,
    achievements: orderedAchievements,
    performed: {
      loadKg: representative.weightKg ?? 0,
      reps: isPerSideExercise(exercise) ? strengthRepsForSet(representative, exercise) : representative.reps,
      durationSec: representative.durationSec,
      leftReps: representative.leftReps,
      rightReps: representative.rightReps,
    },
    evidence: evidenceSets.map((set) =>
      evidenceFromSet(set, {
        reps: isPerSideExercise(exercise) ? null : set.reps,
        strengthReps: strengthRepsForSet(set, exercise),
      }),
    ),
  }
}

function applyLoadedSession(history: LoadedHistory | null, analyzable: readonly AnalyzableWorkingSet[]): LoadedHistory {
  const frontier = performanceFrontier([...(history?.frontier ?? []), ...analyzable])
  const bestLoadKg = Math.max(history?.bestLoadKg ?? 0, ...analyzable.map((set) => set.weightKg))
  const bestRepsAtLoad = new Map(history?.bestRepsAtLoad ?? [])
  let bestE1rmKg = history?.bestE1rmKg ?? 0
  for (const set of analyzable) {
    const key = set.weightKg
    const previous = bestRepsAtLoad.get(key)
    if (previous == null || set.reps > previous) {
      bestRepsAtLoad.set(key, set.reps)
    }
    if (set.reps <= PROGRESS_ANALYTICS_CONFIG.e1rm.highConfidenceMaxReps) {
      bestE1rmKg = Math.max(bestE1rmKg, epleyEstimated1RmKg(set.weightKg, set.reps))
    }
  }
  return { bestLoadKg, bestRepsAtLoad, bestE1rmKg, frontier, bestSessionVolumeKg: history?.bestSessionVolumeKg ?? 0 }
}

function applyTimedSession(history: TimedHistory | null, analyzable: readonly AnalyzableTimedSet[]): TimedHistory {
  const frontier = timedPerformanceFrontier([...(history?.frontier ?? []), ...analyzable])
  const bestLoadKg = Math.max(history?.bestLoadKg ?? 0, ...analyzable.map((set) => set.weightKg))
  const bestDurationAtLoad = new Map(history?.bestDurationAtLoad ?? [])
  for (const set of analyzable) {
    const key = set.weightKg
    const previous = bestDurationAtLoad.get(key)
    if (previous == null || set.durationSec > previous) {
      bestDurationAtLoad.set(key, set.durationSec)
    }
  }
  return { bestLoadKg, bestDurationAtLoad, frontier }
}

export function performanceBestsForExercise(
  sets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
): PerformanceBestEvent[] {
  const events: PerformanceBestEvent[] = []
  if (supportsLoadedRepStrength(exercise)) {
    let history: LoadedHistory | null = null
    for (const sessionSets of groupSetsBySession(sets)) {
      const analyzable = sessionSets
        .map((set) => asAnalyzableLoadedRepSet(set, exercise))
        .filter((set): set is AnalyzableWorkingSet => set != null)
      if (analyzable.length === 0) {
        continue
      }
      const { achievements, contributing } = loadedAchievementsForSession(
        sessionSets,
        analyzable,
        exercise,
        history,
      )
      if (history && achievements.length > 0) {
        events.push(
          eventFromSession(
            representativeLoadedSet(sessionSets, exercise, analyzable),
            achievements,
            contributing,
            exercise,
          ),
        )
      }
      const next = applyLoadedSession(history, analyzable)
      const sessionVolume = sessionExternalVolumeKg(sessionSets, exercise)
      history = {
        ...next,
        bestSessionVolumeKg: Math.max(next.bestSessionVolumeKg, sessionVolume ?? 0),
      }
    }
    return events
  }

  if (supportsTimedExternal(exercise)) {
    let history: TimedHistory | null = null
    for (const sessionSets of groupSetsBySession(sets)) {
      const analyzable = sessionSets
        .map((set) => asAnalyzableTimedSet(set, exercise))
        .filter((set): set is AnalyzableTimedSet => set != null)
      if (analyzable.length === 0) {
        continue
      }
      const { achievements, contributing } = timedAchievementsForSession(analyzable, history)
      if (history && achievements.length > 0) {
        events.push(eventFromSession(representativeTimedSet(analyzable), achievements, contributing, exercise))
      }
      history = applyTimedSession(history, analyzable)
    }
  }

  return events
}
