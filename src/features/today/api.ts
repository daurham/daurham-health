import type { TodayViewModel } from '@/domain/today'
import { healthFetch, readApiError } from '@/lib'

export async function fetchToday(signal?: AbortSignal): Promise<TodayViewModel> {
  const response = await healthFetch('/api/today', { signal })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as TodayViewModel
}
