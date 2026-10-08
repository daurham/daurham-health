import { z } from 'zod'
import { isoDateSchema } from './training.js'

export const TRAINING_DAY_INTENTS = [
  'training_preferred',
  'rest',
  'active_recovery',
  'flexible',
  'training_moved_here',
  'training_moved_away',
  'paused_or_away',
] as const
export const trainingDayIntentSchema = z.enum(TRAINING_DAY_INTENTS)
export type TrainingDayIntent = z.infer<typeof trainingDayIntentSchema>

export const NON_TRAINING_INTENTS = ['rest', 'active_recovery', 'flexible'] as const
export const nonTrainingIntentSchema = z.enum(NON_TRAINING_INTENTS)
export type NonTrainingIntent = z.infer<typeof nonTrainingIntentSchema>

export const trainingPlanInputSchema = z.object({
  weeklyFrequencyTarget: z.number().int().min(1).max(7),
  defaultNonTrainingIntent: nonTrainingIntentSchema,
  preferredWeekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7)
    .refine((items) => new Set(items).size === items.length, 'Preferred weekdays must be unique'),
  sequenceRoutineCodes: z.array(z.string().trim().min(1).max(200)).min(1).max(84)
    .refine((items) => {
      const blocks = compactRoutineSequence(items)
      return blocks.length <= 14 && blocks.every((block) => block.count <= 12) &&
        new Set(blocks.map((block) => block.routineCode)).size === blocks.length
    }, 'Each routine must occur in one consecutive block of 1–12 sessions'),
  note: z.union([z.string().max(500), z.null(), z.undefined()]).transform((value) => {
    if (value == null) return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }),
})
export type TrainingPlanInput = z.infer<typeof trainingPlanInputSchema>

export type TrainingRoutineBlock = { routineCode: string; count: number }

/** Convert consecutive session slots into a compact, editable block list. */
export function compactRoutineSequence(sequence: readonly string[]): TrainingRoutineBlock[] {
  const result: TrainingRoutineBlock[] = []
  for (const routineCode of sequence) {
    const last = result[result.length - 1]
    if (last?.routineCode === routineCode) last.count += 1
    else result.push({ routineCode, count: 1 })
  }
  return result
}

export function expandRoutineBlocks(blocks: readonly TrainingRoutineBlock[]): string[] {
  return blocks.flatMap((block) => Array.from({ length: block.count }, () => block.routineCode))
}


export const dayOverrideInputSchema = z.object({
  intentKind: z.enum(['training_preferred', 'rest', 'active_recovery', 'flexible', 'paused_or_away']),
  note: z.union([z.string().max(500), z.null(), z.undefined()]).transform((value) => {
    if (value == null) return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }),
})
export type DayOverrideInput = z.infer<typeof dayOverrideInputSchema>

export const moveTrainingDayInputSchema = z.object({
  fromDate: isoDateSchema,
  toDate: isoDateSchema,
}).refine((value) => value.fromDate !== value.toDate, 'Move dates must be different')
export type MoveTrainingDayInput = z.infer<typeof moveTrainingDayInputSchema>

export type TrainingPlanTemplate = {
  routineCode: string
  templateId: string | null
  name: string
  originKind: 'seeded' | 'owner' | null
  available: boolean
}

export type TrainingPlanBaseline = {
  version: number
  effectiveFrom: string
  weeklyFrequencyTarget: number
  defaultNonTrainingIntent: NonTrainingIntent
  preferredWeekdays: number[]
  sequence: TrainingPlanTemplate[]
  note: string | null
}

export type TrainingPlanDay = {
  date: string
  weekday: number
  baselineIntent: TrainingDayIntent
  effectiveIntent: TrainingDayIntent
  overrideIntent: TrainingDayIntent | null
  linkedDate: string | null
}

export type TrainingPlanView = {
  asOf: string
  configured: boolean
  baseline: TrainingPlanBaseline | null
  nextSession: TrainingPlanTemplate | null
  today: TrainingPlanDay | null
  week: TrainingPlanDay[]
  completedProgrammedSessions: number
  weeklyFrequencyTarget: number | null
}

export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year!, (month ?? 1) - 1, (day ?? 1) + days))
  return shifted.toISOString().slice(0, 10)
}

export function isoWeekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year!, (month ?? 1) - 1, day)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

export function weekStartMonday(date: string): string {
  return addCalendarDays(date, 1 - isoWeekday(date))
}

export function baselineIntentForDate(
  date: string,
  preferredWeekdays: readonly number[],
  defaultIntent: NonTrainingIntent,
): TrainingDayIntent {
  return preferredWeekdays.includes(isoWeekday(date)) ? 'training_preferred' : defaultIntent
}

/**
 * Replay canonical programmed sessions against the intended sequence.
 * Only the currently expected routine advances the pointer. An out-of-order
 * programmed session is still a real workout, but it cannot silently skip
 * the session that was next in the plan.
 */
export function sequenceFromStart(
  sequence: readonly string[],
  startRoutineCode: string,
): string[] {
  const index = sequence.indexOf(startRoutineCode)
  if (index < 0) return [...sequence]
  return [...sequence.slice(index), ...sequence.slice(0, index)]
}

export function nextRoutineCode(
  sequence: readonly string[],
  completedRoutineCodes: readonly string[],
): string | null {
  if (sequence.length === 0) return null
  let expected = 0
  for (const routineCode of completedRoutineCodes) {
    if (routineCode === sequence[expected]) {
      expected = (expected + 1) % sequence.length
    }
  }
  return sequence[expected] ?? null
}
