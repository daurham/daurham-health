import { HEALTH_DOMAINS, type CanonicalEvidence, type PrAchievement } from './types.js'
import { dateInInclusiveRange, type TrailingPeriod } from './periods.js'
import { buildProgressOverview, type ProgressCanonicalInput } from './overview.js'
import type { ProgressCheckpoint } from './checkpoints.js'

export const TIMELINE_DOMAINS = [...HEALTH_DOMAINS, 'annotation'] as const
export type TimelineDomain = (typeof TIMELINE_DOMAINS)[number]

export const TIMELINE_EVENT_KINDS = ['training_session', 'body_measurement', 'performance_best', 'checkpoint'] as const
export type TimelineEventKind = (typeof TIMELINE_EVENT_KINDS)[number]

export const TIMELINE_FOCUSES = ['all', 'training', 'body', 'bests'] as const
export type TimelineFocus = (typeof TIMELINE_FOCUSES)[number]

export type TimelineTimePrecision = 'date' | 'timestamp'

export type TimelinePerformed = {
  loadKg: number
  reps?: number | null
  durationSec?: number | null
  leftReps?: number | null
  rightReps?: number | null
}

export type TimelineMetricSnapshot = {
  key: string
  value: number
  unit: string
  measurementId: string
}

export type TimelinePerformanceBestData = {
  sessionId: string | null
  sessionTitle: string | null
  exerciseId: string
  exerciseName: string
  performed: TimelinePerformed
  achievements: PrAchievement[]
}

export type TimelineTrainingSessionData = {
  sessionId: string
  templateName: string | null
  routineCode: string | null
  effort: number | null
  durationMinutes: number | null
  exerciseCount: number
  workingSetCount: number
  performanceBestIds: string[]
  createdAt: string
}

export type TimelineBodyMeasurementData = {
  measurementSessionId: string
  timezone: string | null
  metrics: TimelineMetricSnapshot[]
  weightKg: number | null
  partial: boolean
}

export type TimelineCheckpointData = {
  checkpointId: string
  notes: string | null
}

export type TimelineEventBase = {
  id: string
  domain: TimelineDomain
  kind: TimelineEventKind
  date: string
  timePrecision: TimelineTimePrecision
  occurredAt?: string
  title: string
  evidence: CanonicalEvidence[]
}

export type TimelineTrainingSessionEvent = TimelineEventBase & {
  domain: 'training'
  kind: 'training_session'
  timePrecision: 'date'
  data: TimelineTrainingSessionData
}

export type TimelinePerformanceBestEvent = TimelineEventBase & {
  domain: 'training'
  kind: 'performance_best'
  data: TimelinePerformanceBestData
}

export type TimelineBodyMeasurementEvent = TimelineEventBase & {
  domain: 'body'
  kind: 'body_measurement'
  timePrecision: 'timestamp'
  occurredAt: string
  data: TimelineBodyMeasurementData
}

export type TimelineCheckpointEvent = TimelineEventBase & {
  domain: 'annotation'
  kind: 'checkpoint'
  timePrecision: 'date'
  data: TimelineCheckpointData
}

export type TimelineEvent =
  | TimelineTrainingSessionEvent
  | TimelinePerformanceBestEvent
  | TimelineBodyMeasurementEvent
  | TimelineCheckpointEvent

export type ProgressTimeline = {
  period: TrailingPeriod
  series: {
    bodyWeight: Array<{
      date: string
      valueKg: number
      measurementId: string
      measurementSessionId: string
      occurredAt: string
    }>
    workouts: Array<{
      date: string
      sessionId: string
      templateName: string | null
    }>
    performanceBests: Array<{
      date: string
      eventId: string
      sessionId: string | null
      exerciseName: string
    }>
    checkpoints: Array<{
      date: string
      eventId: string
      label: string
    }>
  }
  events: TimelineEvent[]
}

const BODY_CARD_KEYS = ['weight', 'bmi', 'body_fat_percentage'] as const

function sessionTitle(templateName: string | null | undefined, routineCode: string | null | undefined): string {
  if (templateName && templateName.trim().length > 0) {
    return templateName
  }
  if (routineCode && routineCode.trim().length > 0) {
    return `Routine ${routineCode}`
  }
  return 'Workout'
}

function compareEvents(left: TimelineEvent, right: TimelineEvent): number {
  if (left.date !== right.date) {
    return left.date < right.date ? 1 : -1
  }
  const leftStamp = left.occurredAt
  const rightStamp = right.occurredAt
  if (leftStamp && rightStamp && leftStamp !== rightStamp) {
    return leftStamp < rightStamp ? -1 : 1
  }
  if (leftStamp && !rightStamp) {
    return -1
  }
  if (!leftStamp && rightStamp) {
    return 1
  }
  if (left.kind === 'training_session' && right.kind === 'training_session') {
    if (left.data.createdAt !== right.data.createdAt) {
      return left.data.createdAt < right.data.createdAt ? -1 : 1
    }
  }
  const kindRank: Record<TimelineEventKind, number> = {
    checkpoint: 0,
    body_measurement: 1,
    training_session: 2,
    performance_best: 3,
  }
  if (kindRank[left.kind] !== kindRank[right.kind]) {
    return kindRank[left.kind] - kindRank[right.kind]
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

export function isTimelineFocus(value: string): value is TimelineFocus {
  return (TIMELINE_FOCUSES as readonly string[]).includes(value)
}

export function buildProgressTimeline(
  input: ProgressCanonicalInput & { checkpoints?: readonly ProgressCheckpoint[] },
): ProgressTimeline {
  const overview = buildProgressOverview(input)
  const period = overview.period
  const inPeriod = (date: string) => dateInInclusiveRange(date, period.start, period.end)

  const performanceBestEvents: TimelinePerformanceBestEvent[] = []
  for (const exercise of overview.exercises) {
    for (const event of exercise.recentPrs) {
      const session = overview.training.sessions.find((item) => item.sessionId === event.sourceSessionId)
      const id = `performance_best:${event.sourceSetId}`
      performanceBestEvents.push({
        id,
        domain: 'training',
        kind: 'performance_best',
        date: event.date,
        timePrecision: 'date',
        title: exercise.name,
        evidence: event.evidence,
        data: {
          sessionId: event.sourceSessionId,
          sessionTitle: session ? sessionTitle(session.templateName, session.routineCode) : null,
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.name,
          performed: event.performed,
          achievements: event.achievements,
        },
      })
    }
  }

  const bestsBySession = new Map<string, TimelinePerformanceBestEvent[]>()
  for (const event of performanceBestEvents) {
    const sessionId = event.data.sessionId
    if (sessionId && overview.training.sessions.some((item) => item.sessionId === sessionId)) {
      const list = bestsBySession.get(sessionId) ?? []
      list.push(event)
      bestsBySession.set(sessionId, list)
    }
  }

  const trainingEvents: TimelineTrainingSessionEvent[] = overview.training.sessions.map((session) => {
    const sessionSets = input.sets.filter((set) => set.sessionId === session.sessionId)
    const nested = bestsBySession.get(session.sessionId) ?? []
    return {
      id: `training_session:${session.sessionId}`,
      domain: 'training',
      kind: 'training_session',
      date: session.sessionDate,
      timePrecision: 'date',
      title: sessionTitle(session.templateName, session.routineCode),
      evidence: [{ domain: 'training', sessionId: session.sessionId, date: session.sessionDate }],
      data: {
        sessionId: session.sessionId,
        templateName: session.templateName ?? null,
        routineCode: session.routineCode ?? null,
        effort: session.effort ?? null,
        durationMinutes: session.durationMin ?? null,
        exerciseCount: new Set(sessionSets.map((set) => set.sessionExerciseId)).size,
        workingSetCount: sessionSets.filter((set) => set.setType === 'working').length,
        performanceBestIds: nested.map((item) => item.id),
        createdAt: session.createdAt,
      },
    }
  })

  const bodyBySession = new Map<string, typeof input.bodyObservations>()
  for (const observation of input.bodyObservations) {
    if (!inPeriod(observation.calendarDate)) {
      continue
    }
    const list = bodyBySession.get(observation.measurementSessionId) ?? []
    list.push(observation)
    bodyBySession.set(observation.measurementSessionId, list)
  }

  const bodyEvents: TimelineBodyMeasurementEvent[] = [...bodyBySession.entries()].map(([sessionId, metrics]) => {
    const ordered = [...metrics].sort((left, right) => {
      if (left.measuredAt !== right.measuredAt) {
        return left.measuredAt < right.measuredAt ? -1 : 1
      }
      return left.measurementId < right.measurementId ? -1 : 1
    })
    const first = ordered[0]!
    const snapshots: TimelineMetricSnapshot[] = ordered.map((item) => ({
      key: item.key,
      value: item.value,
      unit: item.unit,
      measurementId: item.measurementId,
    }))
    snapshots.sort((left, right) => {
      const leftRank = BODY_CARD_KEYS.indexOf(left.key as (typeof BODY_CARD_KEYS)[number])
      const rightRank = BODY_CARD_KEYS.indexOf(right.key as (typeof BODY_CARD_KEYS)[number])
      const leftOrder = leftRank === -1 ? BODY_CARD_KEYS.length : leftRank
      const rightOrder = rightRank === -1 ? BODY_CARD_KEYS.length : rightRank
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder
      }
      return left.key < right.key ? -1 : left.key > right.key ? 1 : 0
    })
    const weight = snapshots.find((item) => item.key === 'weight')
    const present = new Set(snapshots.map((item) => item.key))
    const partial = BODY_CARD_KEYS.some((key) => !present.has(key))
    return {
      id: `body_measurement:${sessionId}`,
      domain: 'body',
      kind: 'body_measurement',
      date: first.calendarDate,
      timePrecision: 'timestamp' as const,
      occurredAt: first.measuredAt,
      title: 'Body measurement',
      evidence: ordered.map((item) => ({
        domain: 'body' as const,
        measurementId: item.measurementId,
        measurementSessionId: item.measurementSessionId,
        date: item.calendarDate,
      })),
      data: {
        measurementSessionId: sessionId,
        timezone: first.timezone,
        metrics: snapshots,
        weightKg: weight?.value ?? null,
        partial,
      },
    }
  })

  const checkpointEvents: TimelineCheckpointEvent[] = (input.checkpoints ?? [])
    .filter((item) => inPeriod(item.checkpointDate))
    .map((item) => ({
      id: `checkpoint:${item.id}`,
      domain: 'annotation',
      kind: 'checkpoint',
      date: item.checkpointDate,
      timePrecision: 'date',
      title: item.label,
      evidence: [],
      data: {
        checkpointId: item.id,
        notes: item.notes,
      },
    }))

  const events = [...trainingEvents, ...performanceBestEvents, ...bodyEvents, ...checkpointEvents].sort(compareEvents)

  return {
    period,
    series: {
      bodyWeight: overview.body.weight.observations
        .filter((item) => inPeriod(item.calendarDate))
        .map((item) => ({
          date: item.calendarDate,
          valueKg: item.value,
          measurementId: item.measurementId,
          measurementSessionId: item.measurementSessionId,
          occurredAt: item.measuredAt,
        })),
      workouts: trainingEvents.map((event) => ({
        date: event.date,
        sessionId: event.data.sessionId,
        templateName: event.data.templateName,
      })),
      performanceBests: performanceBestEvents.map((event) => ({
        date: event.date,
        eventId: event.id,
        sessionId: event.data.sessionId,
        exerciseName: event.data.exerciseName,
      })),
      checkpoints: checkpointEvents.map((event) => ({
        date: event.date,
        eventId: event.id,
        label: event.title,
      })),
    },
    events,
  }
}

export function timelineEventsForFocus(timeline: ProgressTimeline, focus: TimelineFocus): TimelineEvent[] {
  if (focus === 'training') {
    return timeline.events.filter((event) => event.kind === 'training_session')
  }
  if (focus === 'body') {
    return timeline.events.filter((event) => event.kind === 'body_measurement')
  }
  if (focus === 'bests') {
    return timeline.events.filter((event) => event.kind === 'performance_best')
  }
  return timeline.events.filter((event) => {
    if (event.kind === 'performance_best') {
      return event.data.sessionId == null
    }
    return true
  })
}

export function groupedTimelineDays(events: readonly TimelineEvent[]): Array<{ date: string; events: TimelineEvent[] }> {
  const groups: Array<{ date: string; events: TimelineEvent[] }> = []
  for (const event of events) {
    const current = groups[groups.length - 1]
    if (current && current.date === event.date) {
      current.events.push(event)
    } else {
      groups.push({ date: event.date, events: [event] })
    }
  }
  return groups
}

export function performanceBestsForSession(
  timeline: ProgressTimeline,
  sessionId: string,
): TimelinePerformanceBestEvent[] {
  return timeline.events.filter(
    (event): event is TimelinePerformanceBestEvent =>
      event.kind === 'performance_best' && event.data.sessionId === sessionId,
  )
}

export function timelineSeriesForFocus(
  timeline: ProgressTimeline,
  focus: TimelineFocus,
): ProgressTimeline['series'] {
  return {
    bodyWeight: focus === 'all' || focus === 'body' ? timeline.series.bodyWeight : [],
    workouts: focus === 'all' || focus === 'training' ? timeline.series.workouts : [],
    performanceBests: focus === 'all' || focus === 'bests' ? timeline.series.performanceBests : [],
    checkpoints: focus === 'all' ? timeline.series.checkpoints : [],
  }
}
