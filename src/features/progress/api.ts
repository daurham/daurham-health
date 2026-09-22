import type { ActivityProgressView } from '@/domain/activity'
import type { ProgressCompare, ProgressCheckpoint, ProgressOverview, ProgressRange, ProgressTimeline } from '@/domain/progress'
import type { SleepProgressView } from '@/domain/sleep'
import { healthFetch, readApiError } from '@/lib'

export async function fetchProgressOverview(range: ProgressRange): Promise<ProgressOverview> {
  const response = await healthFetch(`/api/progress/overview?range=${encodeURIComponent(range)}`)
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as ProgressOverview
}

export async function fetchProgressActivity(range: ProgressRange, signal?: AbortSignal): Promise<ActivityProgressView> {
  const response = await healthFetch(`/api/progress/activity?range=${encodeURIComponent(range)}`, { signal })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as ActivityProgressView
}

export async function fetchProgressSleep(range: ProgressRange, signal?: AbortSignal): Promise<SleepProgressView> {
  const response = await healthFetch(`/api/progress/sleep?range=${encodeURIComponent(range)}`, { signal })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as SleepProgressView
}

export async function fetchProgressTimeline(range: ProgressRange): Promise<ProgressTimeline> {
  const response = await healthFetch(`/api/progress/timeline?range=${encodeURIComponent(range)}`)
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as ProgressTimeline
}

export async function fetchProgressCompare(params: URLSearchParams): Promise<ProgressCompare> {
  const response = await healthFetch(`/api/progress/compare?${params.toString()}`)
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as ProgressCompare
}

export async function fetchProgressCheckpoints(): Promise<ProgressCheckpoint[]> {
  const response = await healthFetch('/api/progress/checkpoints')
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as ProgressCheckpoint[]
}

export async function createProgressCheckpoint(input: {
  checkpointDate: string
  label: string
  notes: string | null
}): Promise<ProgressCheckpoint> {
  const response = await healthFetch('/api/progress/checkpoints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as ProgressCheckpoint
}

export async function updateProgressCheckpoint(
  id: string,
  input: { checkpointDate?: string; label?: string; notes?: string | null },
): Promise<ProgressCheckpoint> {
  const response = await healthFetch(`/api/progress/checkpoints/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as ProgressCheckpoint
}

export async function deleteProgressCheckpoint(id: string): Promise<void> {
  const response = await healthFetch(`/api/progress/checkpoints/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
}
