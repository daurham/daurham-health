import type { ActivityDailyRow } from '../activity/analytics.js'
import type { ProactiveInsight } from '../insights/types.js'
import type { BodyObservation } from '../progress/types.js'
import type { NutritionEntry, NutritionTarget } from '../nutrition/types.js'
import type { SleepSummaryNight } from '../sleep/analytics.js'
import type { TodaySupplementInput } from '../supplements/types.js'
import type { WEEKLY_COACH_PACKET_VERSION } from './config.js'

export type WeeklyPeriod = { start: string; end: string }

export type WeeklyCoachSection = 'went_well' | 'worth_watching' | 'focus'

export type WeeklyPerformanceBest = {
  exerciseId: string
  name: string
  date: string
  summary: string
}

export type WeeklyGoalSnapshot = {
  id: string
  label: string
  kind: string
  lifecycle: string
  targetState: string
  deadlineState: string
}

export type WeeklyExperiment = {
  id: string
  title: string
  reviewReady: boolean
  completedInWeek: boolean
}

export type WeeklyRetest = {
  id: string
  title: string
  status: string
}

export type WeeklyBenchmarkResult = {
  id: string
  title: string
  date: string
}

export type WeeklyReviewCapture = {
  id: string
  label: string
  detailPath: string
}

export type WeeklyCadenceDue = {
  key: string
  label: string
  status: string
}

export type WeeklySleepBaseline = {
  sleepDate: string
  sourceName: string
  currentMinutes: number
  medianMinutes: number
  priorNights: number
}

export type WeeklyCoachInput = {
  asOf: string
  activityDays: readonly ActivityDailyRow[]
  sleepNights: readonly (SleepSummaryNight & { sourceName?: string | null })[]
  nutritionEntries: readonly NutritionEntry[]
  nutritionTargets: readonly NutritionTarget[]
  trainingSessions: readonly { performedOn: string; sessionType: string }[]
  performanceBests: readonly WeeklyPerformanceBest[]
  bodyObservations: readonly BodyObservation[]
  supplements: readonly TodaySupplementInput[]
  goals: readonly WeeklyGoalSnapshot[]
  experiments: readonly WeeklyExperiment[]
  retests: readonly WeeklyRetest[]
  benchmarkResults: readonly WeeklyBenchmarkResult[]
  reviewCaptures: readonly WeeklyReviewCapture[]
  cadenceDue: readonly WeeklyCadenceDue[]
  insights: readonly ProactiveInsight[]
  sleepBaseline: WeeklySleepBaseline | null
  activeBodyGoal: boolean
}

export type WeeklyCandidate = {
  id: string
  section: WeeklyCoachSection
  kind: string
  fact: string
  evidenceRefs: string[]
  detailPath: string
  actionText: string | null
  rank: number
}

export type WeeklyCoverage = {
  activity: boolean
  sleep: boolean
  nutrition: boolean
  training: boolean
  supplements: boolean
  body: boolean
  substantiveDomains: string[]
}

export type WeeklyFactLine = {
  id: string
  domain: string
  text: string
  detailPath: string
}

export type WeeklyCoachBrief = {
  packetVersion: typeof WEEKLY_COACH_PACKET_VERSION
  asOf: string
  period: WeeklyPeriod
  previousPeriod: WeeklyPeriod
  state: 'insufficient_evidence' | 'deterministic'
  canGenerate: boolean
  coverage: WeeklyCoverage
  facts: WeeklyFactLine[]
  wentWell: WeeklyCandidate[]
  worthWatching: WeeklyCandidate[]
  focus: WeeklyCandidate | null
  candidates: WeeklyCandidate[]
}

export type WeeklyCoachCommentary = {
  intro: string | null
  comments: Record<string, string>
  wentWellIds: string[]
  worthWatchingIds: string[]
  focusId: string | null
}
