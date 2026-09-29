import type { CoachState } from '@/domain/coach'
import { healthFetch, readApiError } from '@/lib'

async function send(path: string, method: 'GET' | 'POST', body?: unknown): Promise<CoachState> {
  const response = await healthFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as CoachState
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
