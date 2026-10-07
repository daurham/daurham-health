import type { BowelEvent, DailySignalsDay, DailyWellness, HydrationEvent } from '@/domain/daily-signals'
import { healthFetch, readApiError } from '@/lib'

function requestId(): string {
  return crypto.randomUUID()
}

export async function fetchDailySignalsDay(date: string, signal?: AbortSignal): Promise<DailySignalsDay> {
  const response = await healthFetch(`/api/check-in/days/${date}`, { signal })
  if (!response.ok) throw new Error(await readApiError(response))
  return ((await response.json()) as { day: DailySignalsDay }).day
}

export async function addHydrationEvent(date: string, amountOz: number): Promise<HydrationEvent> {
  const response = await healthFetch('/api/hydration/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, amountOz, requestId: requestId() }),
  })
  if (!response.ok) throw new Error(await readApiError(response))
  return ((await response.json()) as { event: HydrationEvent }).event
}

export async function deleteHydrationEvent(id: string): Promise<void> {
  const response = await healthFetch(`/api/hydration/events/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await readApiError(response))
}

export async function addBowelEvent(date: string, bristolType: number): Promise<BowelEvent> {
  const response = await healthFetch('/api/bowel/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, bristolType, requestId: requestId() }),
  })
  if (!response.ok) throw new Error(await readApiError(response))
  return ((await response.json()) as { event: BowelEvent }).event
}

export async function deleteBowelEvent(id: string): Promise<void> {
  const response = await healthFetch(`/api/bowel/events/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await readApiError(response))
}

export async function setNoBowelMovement(date: string): Promise<void> {
  const response = await healthFetch(`/api/bowel/days/${date}/no-movement`, { method: 'PUT' })
  if (!response.ok) throw new Error(await readApiError(response))
}

export async function clearNoBowelMovement(date: string): Promise<void> {
  const response = await healthFetch(`/api/bowel/days/${date}/no-movement`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await readApiError(response))
}

export async function saveDailyWellness(
  date: string,
  values: { energy: number | null; hunger: number | null; soreness: number | null; stress: number | null },
): Promise<DailyWellness> {
  const response = await healthFetch(`/api/check-in/days/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  if (!response.ok) throw new Error(await readApiError(response))
  return ((await response.json()) as { wellness: DailyWellness }).wellness
}

export async function clearDailyWellness(date: string): Promise<void> {
  const response = await healthFetch(`/api/check-in/days/${date}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await readApiError(response))
}
