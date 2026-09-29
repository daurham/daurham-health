import { z } from 'zod'
import type { CoachCandidate } from './coach.js'
import type { DailyContextTagKey } from './context.js'
import { addCalendarDays, calendarDaysBetween } from './progress/dates.js'
import { isCalendarDate } from './training.js'
import {
  STRETCH_STRATEGIES,
  stretchBaselines,
  stretchObservationSnapshot,
  type StretchObservationSnapshot,
  type StretchPerformanceObservation,
  type StretchStrategy,
} from './progress/stretch-performance.js'

export const STRETCH_RULE_VERSION = 1 as const
export const STRETCH_CONFIG = {
  cooldownDays: 8,
  offerDays: 3,
  challengeDays: 7,
  repetitionDays: 30,
  baselineDays: 42,
  latestAppearanceDays: 21,
} as const

export type StretchHistoryEntry = {
  startsOn: string
  exerciseId: string
  strategy: StretchStrategy
}

export type StretchGoal = {
  id: string
  kind: string
  status: string
  exerciseDefinitionId: string | null
  trainingMinDistanceM?: number | null
}

export type StretchTaskMetadata = {
  ruleVersion: number
  strategy: StretchStrategy
  exerciseId: string
  exerciseName: string
  measurementKind: string
  perSide: boolean
  offeredOn: string
  offerExpiresOn: string
  baseline: StretchObservationSnapshot
  latestAppearanceOn: string
  qualifyingAppearances: number
  acceptedOn?: string
  challengeExpiresOn?: string
}

const calendarDateSchema = z.string().refine(isCalendarDate)
const evidenceSchema = z.object({
  domain: z.literal('training'),
  sessionId: z.string().min(1),
  sessionExerciseId: z.string().min(1),
  setId: z.string().min(1),
  exerciseId: z.string().min(1),
  strategy: z.enum(STRETCH_STRATEGIES),
  value: z.number().positive(),
  unit: z.enum(['lb', 'reps', 'sec', 'mi', 'sec/mi']),
  date: calendarDateSchema.optional(),
  loadKg: z.number().nullable().optional(),
  reps: z.number().nullable().optional(),
  strengthReps: z.number().nullable().optional(),
  durationSec: z.number().nullable().optional(),
  leftReps: z.number().nullable().optional(),
  rightReps: z.number().nullable().optional(),
  leftDurationSec: z.number().nullable().optional(),
  rightDurationSec: z.number().nullable().optional(),
  estimated1RmKg: z.number().positive().optional(),
  formula: z.literal('epley').optional(),
  confidence: z.literal('high').optional(),
  performanceType: z.string().optional(),
  analyticsLoadType: z.string().optional(),
  analyticsRepMode: z.string().optional(),
  exerciseLoadType: z.string().optional(),
}).passthrough()

const metadataSchema = z.object({
  ruleVersion: z.number().int().positive(),
  strategy: z.enum(STRETCH_STRATEGIES),
  exerciseId: z.string().min(1),
  exerciseName: z.string().min(1),
  measurementKind: z.string().min(1),
  perSide: z.boolean(),
  offeredOn: calendarDateSchema,
  offerExpiresOn: calendarDateSchema,
  baseline: z.object({
    strategy: z.enum(STRETCH_STRATEGIES),
    exerciseId: z.string().min(1),
    exerciseName: z.string().min(1),
    measurementKind: z.string().min(1),
    perSide: z.boolean(),
    date: calendarDateSchema,
    value: z.number().positive(),
    unit: z.enum(['lb', 'reps', 'sec', 'mi', 'sec/mi']),
    sourceCreatedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
    evidence: evidenceSchema,
  }),
  latestAppearanceOn: calendarDateSchema,
  qualifyingAppearances: z.number().int().min(2),
  acceptedOn: calendarDateSchema.optional(),
  challengeExpiresOn: calendarDateSchema.optional(),
}).passthrough().superRefine((value, ctx) => {
  const expectedUnit = value.strategy === 'strength_e1rm' ? 'lb'
    : value.strategy === 'reps' ? 'reps'
      : value.strategy === 'duration' ? 'sec'
        : value.strategy === 'distance' ? 'mi' : 'sec/mi'
  if (value.baseline.exerciseId !== value.exerciseId || value.baseline.strategy !== value.strategy ||
    value.baseline.evidence.exerciseId !== value.exerciseId || value.baseline.evidence.strategy !== value.strategy ||
    value.baseline.unit !== expectedUnit || value.baseline.evidence.unit !== expectedUnit ||
    value.baseline.value !== value.baseline.evidence.value ||
    (value.strategy === 'strength_e1rm' && (value.baseline.evidence.formula !== 'epley' || value.baseline.evidence.confidence !== 'high'))
  ) ctx.addIssue({ code: 'custom', message: 'Inconsistent Stretch baseline.' })
})

/** Keep malformed or historical unknown strategy metadata out of current reconciliation. */
export function stretchMetadata(metadata: Record<string, unknown>): StretchTaskMetadata | null {
  const result = metadataSchema.safeParse(metadata.stretch)
  return result.success ? result.data : null
}

export const parseStretchMetadata = stretchMetadata

export function stretchOfferExpiresOn(offeredOn: string): string {
  return addCalendarDays(offeredOn, STRETCH_CONFIG.offerDays - 1)
}

export function stretchChallengeExpiresOn(acceptedOn: string): string {
  return addCalendarDays(acceptedOn, STRETCH_CONFIG.challengeDays - 1)
}

export function stretchCooldownAllows(date: string, history: readonly Pick<StretchHistoryEntry, 'startsOn'>[]): boolean {
  if (history.length === 0) return true
  const latestOffer = history.map((item) => item.startsOn).sort().slice(-1)[0]!
  return calendarDaysBetween(latestOffer, date) >= STRETCH_CONFIG.cooldownDays
}

/** A rounded minimum that exceeds 110% makes this baseline ineligible, never an oversized challenge. */
export function stretchTarget(strategy: StretchStrategy, baseline: number): number | null {
  if (!Number.isFinite(baseline) || baseline <= 0) return null
  if (strategy === 'strength_e1rm') {
    const target = Math.ceil(baseline * 1.02 * 2) / 2
    return Number.isFinite(target) ? target : null
  }
  if (strategy === 'pace') {
    const target = Math.floor(baseline * 0.98)
    return target > 0 && target < baseline ? target : null
  }
  if (strategy === 'distance') {
    const step = 0.05
    const target = Math.max(Math.ceil((baseline * 1.05 - Number.EPSILON) / step) * step, baseline + step)
    const rounded = Math.round(target * 100) / 100
    return rounded <= baseline * 1.1 + Number.EPSILON * baseline ? rounded : null
  }
  if (!Number.isInteger(baseline)) return null
  const step = strategy === 'duration' ? 5 : 1
  const target = Math.max(Math.ceil(baseline * 1.05 / step) * step, baseline + step)
  return target <= baseline * 1.1 + Number.EPSILON * baseline ? target : null
}

export const STRETCH_SUPPRESSING_TAGS: ReadonlySet<DailyContextTagKey> = new Set([
  'sick', 'pain', 'rest_day', 'unusual_physical_labor', 'unusual_stress',
  'poor_sleep_opportunity', 'baby_night_interruption',
])

export function stretchContextSuppressed(tags: readonly DailyContextTagKey[]): boolean {
  return tags.some((tag) => STRETCH_SUPPRESSING_TAGS.has(tag))
}

function sameStrategy(candidate: CoachCandidate, history: StretchHistoryEntry): boolean {
  const metadata = stretchMetadata(candidate.metadata)
  return metadata != null && metadata.exerciseId === history.exerciseId && metadata.strategy === history.strategy
}

export function stretchRepetitionPenalty(
  candidate: CoachCandidate,
  history: readonly StretchHistoryEntry[],
  date: string,
): number {
  const previous = [...history].sort((left, right) => right.startsOn.localeCompare(left.startsOn))[0]
  const recent = history.some((item) => item.startsOn <= date &&
    calendarDaysBetween(item.startsOn, date) < STRETCH_CONFIG.repetitionDays && sameStrategy(candidate, item))
  return (previous && sameStrategy(candidate, previous) ? 300 : 0) + (recent ? 1500 : 0)
}

export function rankStretchCandidates(
  candidates: readonly CoachCandidate[],
  history: readonly StretchHistoryEntry[],
  date: string,
): CoachCandidate[] {
  const unrepeated = candidates.filter((candidate) => !history.some((item) => item.startsOn <= date &&
    calendarDaysBetween(item.startsOn, date) < STRETCH_CONFIG.repetitionDays && sameStrategy(candidate, item)))
  const pool = unrepeated.length > 0 ? unrepeated : candidates
  return [...pool].sort((left, right) => {
    const leftScore = left.score - stretchRepetitionPenalty(left, history, date)
    const rightScore = right.score - stretchRepetitionPenalty(right, history, date)
    return rightScore - leftScore || left.ruleKey.localeCompare(right.ruleKey)
  })
}

export type StretchCandidateInput = {
  date: string
  observations: readonly StretchPerformanceObservation[]
  history: readonly StretchHistoryEntry[]
  goals?: readonly StretchGoal[]
  contextTags?: readonly DailyContextTagKey[]
  hasCurrentStretch?: boolean
}

export function stretchCandidates(input: StretchCandidateInput): CoachCandidate[] {
  const { date, observations, history } = input
  if (input.hasCurrentStretch || stretchContextSuppressed(input.contextTags ?? []) || !stretchCooldownAllows(date, history)) return []
  const candidates: CoachCandidate[] = stretchBaselines(observations, date).flatMap((baseline) => {
    const observation = baseline.observation
    const target = stretchTarget(observation.strategy, observation.value)
    if (target == null) return []
    const goalKind = observation.strategy === 'strength_e1rm' ? 'strength_e1rm'
      : observation.strategy === 'reps' ? 'training_reps'
        : observation.strategy === 'duration' ? 'training_duration'
          : observation.strategy === 'distance' ? 'training_distance'
            : observation.strategy === 'pace' ? 'training_pace' : null
    const goal = goalKind
      ? [...(input.goals ?? [])].filter((item) => item.kind === goalKind && item.status === 'active' &&
        item.exerciseDefinitionId === observation.exerciseId &&
        (observation.strategy !== 'pace' || item.trainingMinDistanceM == null ||
          (observation.sourceSet.distanceM ?? 0) >= item.trainingMinDistanceM))
        .sort((left, right) => left.id.localeCompare(right.id))[0]
      : undefined
    const age = calendarDaysBetween(baseline.latestDate, date)
    const metadata: StretchTaskMetadata = {
      ruleVersion: STRETCH_RULE_VERSION, strategy: observation.strategy,
      exerciseId: observation.exerciseId, exerciseName: observation.exerciseName,
      measurementKind: observation.measurementKind, perSide: observation.perSide,
      offeredOn: date, offerExpiresOn: stretchOfferExpiresOn(date),
      baseline: stretchObservationSnapshot(observation),
      latestAppearanceOn: baseline.latestDate, qualifyingAppearances: baseline.appearances,
    }
    const measurement = observation.strategy === 'strength_e1rm' ? 'estimate'
      : observation.strategy === 'reps' ? 'reps'
        : observation.strategy === 'duration' ? 'hold'
          : observation.strategy === 'distance' ? 'distance' : 'pace'
    return [{
      taskKind: 'stretch_quest', ruleKey: `stretch:${observation.strategy}:${observation.exerciseId}`,
      ruleVersion: STRETCH_RULE_VERSION, domain: 'training',
      title: `Improve your ${observation.exerciseName} ${measurement}`,
      detail: observation.strategy === 'strength_e1rm'
        ? 'e1RM is estimated. The target is not a load to put on the bar. Any valid high-confidence weight × rep combination counts.'
        : observation.strategy === 'pace'
          ? `One continuous Training set counts. Match at least the frozen baseline distance while beating the pace target.`
          : `One qualifying Training working set counts.${observation.perSide ? ' Both sides must be completed; the lower side counts.' : ''}`,
      startsOn: date, expiresOn: metadata.offerExpiresOn, goalId: goal?.id ?? null,
      verificationMode: 'canonical', actionKind: 'open', actionHref: '/training',
      targetValue: target, targetUnit: observation.unit, baselineValue: observation.value,
      difficulty: 'stretch', rewardBand: 'stretch', metadata: { stretch: metadata },
      score: (goal ? 100 : 0) + (STRETCH_CONFIG.latestAppearanceDays - age) + Math.min(baseline.appearances, 10) * 3 - (age <= 2 ? 20 : 0),
      urgent: false,
    }]
  })
  return rankStretchCandidates(candidates, history, date)
}
