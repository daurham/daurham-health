import type { CoachState, CoachTaskView } from '@/domain/coach'
import type { CoachLabItem } from '@/domain/coach-lab'
import { healthCalendarDateFromInstant } from '@/domain/time'
import { formatPaceSecondsPerMile } from '@/domain/units'

export type CoachPrimaryItem = { kind: 'task'; task: CoachTaskView } | { kind: 'lab'; item: CoachLabItem }

export function isCurrentResolvedCoachTask(task: CoachTaskView, date: string): boolean {
  if (task.status === 'active' || task.status === 'offered') return false
  if (task.taskKind === 'daily_quest') return task.startsOn === date
  const instant = task.completedAt ?? task.closedAt
  return instant != null && Number.isFinite(new Date(instant).getTime()) && healthCalendarDateFromInstant(new Date(instant)) === date
}

export function pendingStretchAcknowledgement(state: CoachState, acknowledgedStretchId: string | null): string | null {
  const task = state.stretchQuest
  return task?.status === 'completed' && task.id !== acknowledgedStretchId && isCurrentResolvedCoachTask(task, state.date) ? task.id : null
}

export function selectPrimaryCoachItem(state: CoachState, pendingAcknowledgementId: string | null): CoachPrimaryItem | null {
  const stretch = state.stretchQuest
  const lab = state.labItems ?? []
  if (stretch?.status === 'active') return { kind: 'task', task: stretch }
  const due = lab.find(item => item.kind === 'benchmark_retest' && item.urgency === 'due')
  if (due) return { kind: 'lab', item: due }
  if (stretch?.status === 'offered') return { kind: 'task', task: stretch }
  if (state.dailyQuest?.status === 'active') return { kind: 'task', task: state.dailyQuest }
  const available = lab.find(item => item.kind === 'benchmark_retest' && item.urgency === 'available')
  if (available) return { kind: 'lab', item: available }
  const suggestion = lab.find(item => item.kind === 'experiment_suggestion')
  if (suggestion) return { kind: 'lab', item: suggestion }
  if (stretch?.status === 'completed' && stretch.id === pendingAcknowledgementId) return { kind: 'task', task: stretch }
  return null
}

export function selectPrimaryCoachTask(state: CoachState, acknowledgedStretchId: string | null): CoachTaskView | null {
  const primary = selectPrimaryCoachItem(state, pendingStretchAcknowledgement(state, acknowledgedStretchId))
  return primary?.kind === 'task' ? primary.task : null
}

export function formatStretchValue(task: CoachTaskView, value: number | null): string {
  if (value == null) return 'No qualifying attempt yet'
  if (task.targetUnit === 'sec/mi') return formatPaceSecondsPerMile(value)
  if (task.targetUnit === 'mi') return `${value.toFixed(2)} mi`
  const formatted = value.toLocaleString('en-US', { maximumFractionDigits: task.targetUnit === 'lb' ? 1 : 0 })
  return `${formatted} ${task.targetUnit === 'lb' ? 'lb e1RM' : task.targetUnit === 'sec' ? 'sec' : 'reps'}`
}

export function coachDateLabel(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T12:00:00Z`))
}
