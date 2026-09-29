import type { CoachState } from '@/domain/coach'
import type { CoachLabItem } from '@/domain/coach-lab'
import { healthFetch, readApiError } from '@/lib'

export class CoachApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'CoachApiError'
    this.status = status
  }
}

async function send<T extends CoachState = CoachState>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const response = await healthFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    throw new CoachApiError(await readApiError(response), response.status)
  }
  return (await response.json()) as T
}

export function fetchCoach(): Promise<CoachState> {
  return send('/api/coach', 'GET')
}

export function ensureCoach(): Promise<CoachState> {
  return send('/api/coach/ensure', 'POST')
}

export function passCoachTask(taskId: string): Promise<CoachState> {
  return send(`/api/coach/tasks/${taskId}/pass`, 'POST', {})
}

export function acceptCoachTask(taskId: string): Promise<CoachState> {
  return send(`/api/coach/tasks/${taskId}/accept`, 'POST', {})
}

export function endCoachTask(taskId: string): Promise<CoachState> {
  return send(`/api/coach/tasks/${taskId}/end`, 'POST', {})
}

export function logCoachTraining(
  taskId: string,
  body: {
    submissionId: string
    actualValue: number
    distance?: number | null
    distanceUnit?: 'mi' | 'km' | null
    note?: string | null
  },
): Promise<CoachState> {
  return send(`/api/coach/tasks/${taskId}/log-training`, 'POST', body)
}

export function logCoachSelfReport(
  taskId: string,
  body: {
    submissionId: string
    durationMin?: number | null
    note?: string | null
    description?: string | null
  },
): Promise<CoachState> {
  return send(`/api/coach/tasks/${taskId}/log-self-report`, 'POST', body)
}

export function snoozeCoachLabItem(item: Pick<CoachLabItem, 'kind' | 'sourceKey' | 'sourceFingerprint'>): Promise<CoachState & { snoozedUntil: string }> {
  return send('/api/coach/lab/snooze', 'POST', {
    kind: item.kind,
    sourceKey: item.sourceKey,
    sourceFingerprint: item.sourceFingerprint,
  })
}