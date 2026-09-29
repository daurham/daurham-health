import type { CoachState, CoachTaskView } from '@/domain/coach'

export function selectPrimaryCoachTask(state: CoachState, acknowledgedStretchId: string | null): CoachTaskView | null {
  const stretch = state.stretchQuest
  if (stretch?.status === 'active' || stretch?.status === 'offered') return stretch
  if (stretch?.status === 'completed' && stretch.id !== acknowledgedStretchId) return stretch
  return state.dailyQuest
}

export function formatStretchValue(task: CoachTaskView, value: number | null): string {
  if (value == null) return 'No qualifying attempt yet'
  const formatted = value.toLocaleString('en-US', { maximumFractionDigits: task.targetUnit === 'lb' ? 1 : 0 })
  return `${formatted} ${task.targetUnit === 'lb' ? 'lb e1RM' : task.targetUnit === 'sec' ? 'sec' : 'reps'}`
}

export function coachDateLabel(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T12:00:00Z`))
}
