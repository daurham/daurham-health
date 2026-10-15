import type { WeeklyTrainingPlanSnapshot } from './weekly-coach/types.js'

/**
 * Shared Training / Goal Control / Weekly Coach weekly target truth.
 * Qualification counts local calendar days with >=3 distinct performed
 * strength exercises, irrespective of number or type of session rows.
 *
 * Raw programmed-session counts remain distinct evidence about plan usage.
 * Preferred dates are optional suggestions, never obligatory attendance.
 */
export type TrainingProgressSummary = {
  configured: boolean
  status: 'unconfigured' | 'unavailable' | 'met' | 'preferred_today' | 'open_day' | 'flexible_week'
  qualifiedTrainingDays: number | null
  completedProgrammedSessions: number
  weeklyTargetDays: number | null
  remainingQualifiedDays: number | null
  todayQualified: boolean | null
  futurePreferredDays: number
  detail: string
}

export function buildTrainingProgressSummary(plan: WeeklyTrainingPlanSnapshot | null | undefined): TrainingProgressSummary {
  const recordedSessions = plan?.completedProgrammedSessions ?? 0
  const preferredDays = plan?.futureTrainingDates.length ?? 0
  const base = {
    configured: plan?.configured === true,
    completedProgrammedSessions: recordedSessions,
    futurePreferredDays: preferredDays,
    todayQualified: plan?.todayQualified ?? null,
    weeklyTargetDays: plan?.weeklyFrequencyTarget ?? null,
  }
  if (!plan?.configured || plan.weeklyFrequencyTarget == null) {
    return {
      ...base, status: 'unconfigured', qualifiedTrainingDays: null,
      remainingQualifiedDays: null,
      detail: 'No weekly Training target is configured.',
    }
  }
  const qualified = plan.qualifiedTrainingDays
  // No performed-exercise evidence is not proof of zero qualified days.
  if (qualified == null || !Number.isSafeInteger(qualified) || qualified < 0 || qualified > 7) {
    return {
      ...base, status: 'unavailable', qualifiedTrainingDays: null,
      remainingQualifiedDays: null,
      detail: 'Qualified strength-day evidence is unavailable; recorded programmed sessions cannot substitute for it.',
    }
  }
  const remaining = Math.max(0, plan.weeklyFrequencyTarget - qualified)
  const progress = `${qualified}/${plan.weeklyFrequencyTarget} qualified strength days this week; ${remaining} ${remaining === 1 ? 'day' : 'days'} remaining toward the target.`
  const difference = ` ${recordedSessions} programmed session ${recordedSessions === 1 ? 'row' : 'rows'} recorded separately; sessions and days are different counts.`
  if (remaining === 0) {
    return {
      ...base, status: 'met', qualifiedTrainingDays: qualified, remainingQualifiedDays: 0,
      detail: `Weekly Training target met: ${progress}${difference}`,
    }
  }
  if (plan.todayIntent === 'training_preferred' || plan.todayIntent === 'training_moved_here') {
    if (plan.todayQualified) {
      return {
        ...base, status: 'open_day', qualifiedTrainingDays: qualified,
        remainingQualifiedDays: remaining,
        detail: `${progress} Today's training is already qualified; no second session is required.${difference}`,
      }
    }
    return {
      ...base, status: 'preferred_today', qualifiedTrainingDays: qualified,
      remainingQualifiedDays: remaining,
      detail: `${progress} Today is a preferred Training day, not a requirement.${difference}`,
    }
  }
  return {
    ...base,
    status: preferredDays >= remaining ? 'open_day' : 'flexible_week',
    qualifiedTrainingDays: qualified, remainingQualifiedDays: remaining,
    detail: preferredDays >= remaining
      ? `${progress} Today is an open day; ${preferredDays} future preferred day${preferredDays === 1 ? '' : 's'} remain. You may train on other days.${difference}`
      : `${progress} Only ${preferredDays} preferred day${preferredDays === 1 ? '' : 's'} remain, but other days are flexible. Adjust preferences if useful; no workout is marked missed.${difference}`,
  }
}
