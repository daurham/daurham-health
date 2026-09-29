import { healthFetch, readApiError } from '@/lib'
import type { GoalProjection } from '@/domain/goal-projection'

export type GoalVersionView = {
  id: string
  version: number
  isCurrent: boolean
  targetMode: 'at_least' | 'at_most' | 'range'
  targetMin: number | null
  targetMax: number | null
  targetUnit: string
  targetDate: string | null
  evaluationWindowDays: number | null
  notes: string | null
  createdAt: string
}

export type GoalView = {
  id: string
  goalKind: string
  status: 'active' | 'paused' | 'completed'
  startedOn: string
  pausedAt: string | null
  completedAt: string | null
  displayName: string
  selectorContext: { archived: boolean; message: string | null }
  currentVersion: GoalVersionView
  versions: GoalVersionView[]
  evidence: {
    current: number | null
    unit: string
    observedOn: string | null
    difference: number | null
    relation: 'above_range' | 'below_range' | 'inside_range' | null
    provisional: { value: number; unit: string; label: 'so far' } | null
    strengthSource: { loadLb: number; reps: number; formula: 'epley'; sessionId: string; setId: string } | null
    label: string | null
    coverage: {
      observedDays: number
      windowDays: number
      takenDays: number
      skippedDays: number
      unknownDays: number
      partialNights: number
    } | null
  }
  overlapWarning: string | null
  goalStatus: {
    calculationVersion: string
    targetState: string
    deadlineState: string
    displayStatus: string
    targetLabel: string
    deadlineLabel: string | null
  }
  projection: GoalProjection | null
}

export type GoalCatalog = {
  bodyMetrics: Array<{ key: string; label: string; unit: string }>
  exercises: Array<{ id: string; name: string }>
  supplements: Array<{ id: string; name: string }>
  benchmarkOutcomes: Array<{
    definition_id: string
    title: string
    version_id: string
    version: number
    requirement_id: string
    label: string
    role: string
  }>
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await healthFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as T
}

export function fetchGoals(): Promise<{ goals: GoalView[]; catalog: GoalCatalog; asOf: string }> {
  return send('/api/goals', 'GET')
}

export function fetchGoal(id: string): Promise<GoalView> {
  return send(`/api/goals/${id}`, 'GET')
}

export function createGoal(body: unknown): Promise<GoalView> {
  return send('/api/goals', 'POST', body)
}

export function removeGoal(id: string): Promise<{ ok: true; disposition: 'deleted' | 'archived' }> {
  return send(`/api/goals/${id}`, 'DELETE')
}

export function reviseGoal(id: string, body: unknown): Promise<GoalView> {
  return send(`/api/goals/${id}/versions`, 'POST', body)
}

export function changeGoalStatus(id: string, action: 'pause' | 'resume' | 'complete' | 'reopen'): Promise<GoalView> {
  return send(`/api/goals/${id}/${action}`, 'POST', {})
}

export function fetchGoalProjection(id: string): Promise<GoalProjection> {
  return send(`/api/goals/${id}/projection`, 'GET')
}
