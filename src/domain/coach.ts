import { z } from 'zod'
import { addCalendarDays } from './progress/dates.js'
import type { DailyContextTagKey } from './context.js'
import type { CoachAttentionReason, CoachLabItem } from './coach-lab.js'

export const COACH_RULE_VERSION = 1 as const

export const COACH_TASK_KINDS = ['weekly_focus', 'daily_quest', 'stretch_quest'] as const
export type CoachTaskKind = (typeof COACH_TASK_KINDS)[number]

export const COACH_TASK_STATUSES = ['offered', 'active', 'completed', 'passed', 'failed', 'expired'] as const
export type CoachTaskStatus = (typeof COACH_TASK_STATUSES)[number]

export const COACH_VERIFICATION_MODES = ['canonical', 'training_log', 'owner_self_report'] as const
export type CoachVerificationMode = (typeof COACH_VERIFICATION_MODES)[number]

export const COACH_ACTION_KINDS = ['open', 'log_training', 'log_self_report'] as const
export type CoachActionKind = (typeof COACH_ACTION_KINDS)[number]

export const COACH_EVIDENCE_KINDS = [
  'none',
  'deterministic_canonical',
  'training_session',
  'owner_self_report',
] as const
export type CoachEvidenceKind = (typeof COACH_EVIDENCE_KINDS)[number]

export const COACH_DIFFICULTIES = ['routine', 'standard', 'weekly', 'stretch'] as const
export type CoachDifficulty = (typeof COACH_DIFFICULTIES)[number]

export type CoachProgress = {
  current: number | null
  target: number | null
  unit: string | null
  label: string | null
}

export type CoachTaskView = {
  id: string
  taskKind: CoachTaskKind
  ruleKey: string
  ruleVersion: number
  domain: string
  title: string
  detail: string
  startsOn: string
  expiresOn: string
  goalId: string | null
  verificationMode: CoachVerificationMode
  actionKind: CoachActionKind
  actionHref: string | null
  targetValue: number | null
  targetUnit: string | null
  baselineValue: number | null
  difficulty: CoachDifficulty
  rewardBand: CoachDifficulty
  status: CoachTaskStatus
  attentionReason?: CoachAttentionReason
  acceptedAt?: string | null
  completedAt: string | null
  closedAt: string | null
  metadata: Record<string, unknown>
  progress: CoachProgress | null
  evidenceLabel: 'Verified by Health' | 'Verified by Training' | 'Logged in Training' | 'Reported by you' | null
}

export type CoachState = {
  date: string
  weekStart: string
  weekEnd: string
  weeklyFocus: CoachTaskView | null
  dailyQuest: CoachTaskView | null
  stretchQuest?: CoachTaskView | null
  labItems?: CoachLabItem[]
  labOverflowCount?: number
  activeCount: number
}

export type CoachCandidate = {
  taskKind: CoachTaskKind
  ruleKey: string
  ruleVersion: number
  domain: string
  title: string
  detail: string
  startsOn: string
  expiresOn: string
  goalId: string | null
  verificationMode: CoachVerificationMode
  actionKind: CoachActionKind
  actionHref: string | null
  targetValue: number | null
  targetUnit: string | null
  baselineValue: number | null
  difficulty: CoachDifficulty
  rewardBand: CoachDifficulty
  metadata: Record<string, unknown>
  score: number
  urgent: boolean
}

export type RecentCoachRule = {
  ruleKey: string
  startsOn: string
}

export type CoachTrainingPreset = {
  exerciseName: string
  measurementKind: 'reps' | 'duration'
  loadType: 'bodyweight' | 'none'
  sessionName: string
  valueKind: 'reps' | 'duration_min'
  targetValue: number
  allowDistance: boolean
}

export type GeneralCoachRule = {
  ruleKey: string
  title: string
  detail: string
  domain: 'training' | 'nutrition' | 'mind'
  verificationMode: 'training_log' | 'owner_self_report'
  actionKind: 'log_training' | 'log_self_report'
  targetValue: number | null
  targetUnit: string | null
  difficulty: 'routine' | 'standard'
  rewardBand: 'routine' | 'standard'
  intensity: 'none' | 'low' | 'moderate'
  training: CoachTrainingPreset | null
  selfReportKind: 'meal_prep' | 'health_journal' | null
}

export const GENERAL_DAILY_COACH_RULES: readonly GeneralCoachRule[] = [
  {
    ruleKey: 'manual:jumping-jacks:100',
    title: '100 jumping jacks',
    detail: 'Log the reps when you finish so the work is preserved in Training.',
    domain: 'training',
    verificationMode: 'training_log',
    actionKind: 'log_training',
    targetValue: 100,
    targetUnit: 'reps',
    difficulty: 'standard',
    rewardBand: 'standard',
    intensity: 'moderate',
    training: {
      exerciseName: 'Jumping Jacks',
      measurementKind: 'reps',
      loadType: 'bodyweight',
      sessionName: 'Coach · Jumping Jacks',
      valueKind: 'reps',
      targetValue: 100,
      allowDistance: false,
    },
    selfReportKind: null,
  },
  {
    ruleKey: 'manual:yoga:10m',
    title: '10 minutes of yoga',
    detail: 'Log the time when you finish so it becomes part of Training history.',
    domain: 'training',
    verificationMode: 'training_log',
    actionKind: 'log_training',
    targetValue: 10,
    targetUnit: 'min',
    difficulty: 'routine',
    rewardBand: 'routine',
    intensity: 'low',
    training: {
      exerciseName: 'Yoga',
      measurementKind: 'duration',
      loadType: 'none',
      sessionName: 'Coach · Yoga',
      valueKind: 'duration_min',
      targetValue: 10,
      allowDistance: false,
    },
    selfReportKind: null,
  },
  {
    ruleKey: 'manual:shadow-boxing:10m',
    title: '10 minutes of shadow boxing',
    detail: 'Log the time when you finish so the cardio work appears in Training.',
    domain: 'training',
    verificationMode: 'training_log',
    actionKind: 'log_training',
    targetValue: 10,
    targetUnit: 'min',
    difficulty: 'standard',
    rewardBand: 'standard',
    intensity: 'moderate',
    training: {
      exerciseName: 'Shadow Boxing',
      measurementKind: 'duration',
      loadType: 'none',
      sessionName: 'Coach · Shadow Boxing',
      valueKind: 'duration_min',
      targetValue: 10,
      allowDistance: false,
    },
    selfReportKind: null,
  },
  {
    ruleKey: 'manual:cardio:15m',
    title: '15 minutes of cardio',
    detail: 'Choose any reasonable cardio session and log the time when you finish.',
    domain: 'training',
    verificationMode: 'training_log',
    actionKind: 'log_training',
    targetValue: 15,
    targetUnit: 'min',
    difficulty: 'standard',
    rewardBand: 'standard',
    intensity: 'moderate',
    training: {
      exerciseName: 'Cardio Session',
      measurementKind: 'duration',
      loadType: 'none',
      sessionName: 'Coach · Cardio',
      valueKind: 'duration_min',
      targetValue: 15,
      allowDistance: false,
    },
    selfReportKind: null,
  },
  {
    ruleKey: 'manual:run:15m',
    title: 'Run for 15 minutes',
    detail: 'Log duration in Training. You may also record distance as Coach evidence.',
    domain: 'training',
    verificationMode: 'training_log',
    actionKind: 'log_training',
    targetValue: 15,
    targetUnit: 'min',
    difficulty: 'standard',
    rewardBand: 'standard',
    intensity: 'moderate',
    training: {
      exerciseName: 'Running',
      measurementKind: 'duration',
      loadType: 'none',
      sessionName: 'Coach · Run',
      valueKind: 'duration_min',
      targetValue: 15,
      allowDistance: true,
    },
    selfReportKind: null,
  },
  {
    ruleKey: 'manual:hike:20m',
    title: 'Hike for 20 minutes',
    detail: 'Log duration in Training. You may also record distance as Coach evidence.',
    domain: 'training',
    verificationMode: 'training_log',
    actionKind: 'log_training',
    targetValue: 20,
    targetUnit: 'min',
    difficulty: 'routine',
    rewardBand: 'routine',
    intensity: 'low',
    training: {
      exerciseName: 'Hiking',
      measurementKind: 'duration',
      loadType: 'none',
      sessionName: 'Coach · Hike',
      valueKind: 'duration_min',
      targetValue: 20,
      allowDistance: true,
    },
    selfReportKind: null,
  },
  {
    ruleKey: 'manual:meal-prep:protein',
    title: 'Meal prep one protein-forward dish',
    detail: 'Prepare it for a future meal. Logging this does not mark the food as eaten.',
    domain: 'nutrition',
    verificationMode: 'owner_self_report',
    actionKind: 'log_self_report',
    targetValue: null,
    targetUnit: null,
    difficulty: 'routine',
    rewardBand: 'routine',
    intensity: 'none',
    training: null,
    selfReportKind: 'meal_prep',
  },
  {
    ruleKey: 'manual:health-journal:10m',
    title: 'Journal about your health for 10 minutes',
    detail: 'Reflect on what is working, what feels off, or what you want to test next.',
    domain: 'mind',
    verificationMode: 'owner_self_report',
    actionKind: 'log_self_report',
    targetValue: 10,
    targetUnit: 'min',
    difficulty: 'routine',
    rewardBand: 'routine',
    intensity: 'none',
    training: null,
    selfReportKind: 'health_journal',
  },
] as const

const IMPACT_SUPPRESSING_TAGS = new Set<DailyContextTagKey>([
  'sick',
  'pain',
  'rest_day',
  'unusual_physical_labor',
])

const MODERATE_SUPPRESSING_TAGS = new Set<DailyContextTagKey>([
  ...IMPACT_SUPPRESSING_TAGS,
  'unusual_stress',
  'poor_sleep_opportunity',
  'baby_night_interruption',
])

export function coachWeek(date: string): { start: string; end: string } {
  const noon = new Date(`${date}T12:00:00Z`)
  if (!Number.isFinite(noon.getTime())) {
    throw new Error('Invalid Coach date')
  }
  const weekday = noon.getUTCDay()
  const daysSinceMonday = (weekday + 6) % 7
  const start = addCalendarDays(date, -daysSinceMonday)
  return { start, end: addCalendarDays(start, 6) }
}

export function coachPeriodFingerprint(
  kind: CoachTaskKind,
  startsOn: string,
  ruleKey: string,
  ruleVersion: number = COACH_RULE_VERSION,
): string {
  return `coach:${kind}:${startsOn}:${ruleKey}:v${ruleVersion}`
}

export function repetitionPenalty(
  candidate: Pick<CoachCandidate, 'ruleKey' | 'urgent'>,
  recent: readonly RecentCoachRule[],
  today: string,
): number {
  if (candidate.urgent) return 0
  const sameYesterday = recent.some(
    (item) => item.ruleKey === candidate.ruleKey && item.startsOn === addCalendarDays(today, -1),
  )
  if (sameYesterday) return 60
  const recentStart = addCalendarDays(today, -6)
  return recent.some(
    (item) => item.ruleKey === candidate.ruleKey && item.startsOn >= recentStart && item.startsOn < today,
  )
    ? 20
    : 0
}

export function rankCoachCandidates(
  candidates: readonly CoachCandidate[],
  recent: readonly RecentCoachRule[],
  today: string,
): CoachCandidate[] {
  return [...candidates].sort((left, right) => {
    const leftScore = left.score - repetitionPenalty(left, recent, today)
    const rightScore = right.score - repetitionPenalty(right, recent, today)
    if (leftScore !== rightScore) return rightScore - leftScore
    return left.ruleKey.localeCompare(right.ruleKey)
  })
}

export function generalDailyCandidates(
  date: string,
  contextTags: readonly DailyContextTagKey[],
): CoachCandidate[] {
  const tags = new Set(contextTags)
  return GENERAL_DAILY_COACH_RULES.flatMap((rule, index) => {
    const suppressed =
      rule.intensity === 'moderate'
        ? [...MODERATE_SUPPRESSING_TAGS].some((tag) => tags.has(tag))
        : rule.intensity === 'low'
          ? [...IMPACT_SUPPRESSING_TAGS].some((tag) => tags.has(tag))
          : false
    if (suppressed) return []
    return [
      {
        taskKind: 'daily_quest' as const,
        ruleKey: rule.ruleKey,
        ruleVersion: COACH_RULE_VERSION,
        domain: rule.domain,
        title: rule.title,
        detail: rule.detail,
        startsOn: date,
        expiresOn: date,
        goalId: null,
        verificationMode: rule.verificationMode,
        actionKind: rule.actionKind,
        actionHref: null,
        targetValue: rule.targetValue,
        targetUnit: rule.targetUnit,
        baselineValue: null,
        difficulty: rule.difficulty,
        rewardBand: rule.rewardBand,
        metadata: {
          general: true,
          intensity: rule.intensity,
          training: rule.training,
          selfReportKind: rule.selfReportKind,
        },
        score: 50 - index,
        urgent: false,
      },
    ]
  })
}

export function manualRuleByKey(ruleKey: string): GeneralCoachRule | null {
  return GENERAL_DAILY_COACH_RULES.find((rule) => rule.ruleKey === ruleKey) ?? null
}

export const coachTrainingLogSchema = z.object({
  submissionId: z.string().uuid(),
  actualValue: z.number().positive().max(100_000),
  distance: z.number().positive().max(10_000).nullable().optional(),
  distanceUnit: z.enum(['mi', 'km']).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.distance != null && value.distanceUnit == null) {
    ctx.addIssue({ code: 'custom', path: ['distanceUnit'], message: 'Choose a distance unit.' })
  }
})

export const coachSelfReportSchema = z.object({
  submissionId: z.string().uuid(),
  durationMin: z.number().positive().max(1440).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  description: z.string().trim().max(160).nullable().optional(),
})

export function evidenceLabel(kind: CoachEvidenceKind | null): CoachTaskView['evidenceLabel'] {
  if (kind === 'deterministic_canonical') return 'Verified by Health'
  if (kind === 'training_session') return 'Logged in Training'
  if (kind === 'owner_self_report') return 'Reported by you'
  return null
}
