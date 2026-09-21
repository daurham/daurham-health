import type { ProgressOverview, ProgressRange, ProgressTimeline } from '@/domain/progress'
import { healthFetch, readApiError } from '@/lib'

export async function fetchProgressOverview(range: ProgressRange): Promise<ProgressOverview> {
  const response = await healthFetch(`/api/progress/overview?range=${encodeURIComponent(range)}`)
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as ProgressOverview
}

export async function fetchProgressTimeline(range: ProgressRange): Promise<ProgressTimeline> {
  const response = await healthFetch(`/api/progress/timeline?range=${encodeURIComponent(range)}`)
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as ProgressTimeline
}
