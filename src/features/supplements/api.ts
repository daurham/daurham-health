import type {
  AdherenceAction,
  SupplementList,
  SupplementRecord,
} from '@/domain/supplements'
import { healthFetch, readApiError } from '@/lib'

async function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
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

export function fetchSupplements(): Promise<SupplementList> {
  return sendJson('/api/supplements', 'GET')
}

export function createSupplement(body: unknown): Promise<SupplementRecord> {
  return sendJson('/api/supplements', 'POST', body)
}

export function updateSupplement(id: string, body: unknown): Promise<SupplementRecord> {
  return sendJson(`/api/supplements/${id}`, 'PATCH', body)
}

export function deleteSupplement(id: string): Promise<{ deleted: true; id: string }> {
  return sendJson(`/api/supplements/${id}`, 'DELETE')
}

export function addSupplementSchedule(id: string, body: unknown): Promise<SupplementRecord> {
  return sendJson(`/api/supplements/${id}/schedules`, 'POST', body)
}

export function versionSupplementSchedule(id: string, scheduleId: string, body: unknown): Promise<SupplementRecord> {
  return sendJson(`/api/supplements/${id}/schedules/${scheduleId}/version`, 'POST', body)
}

export function stopSupplementSchedule(id: string, scheduleId: string, stopOn: string): Promise<SupplementRecord> {
  return sendJson(`/api/supplements/${id}/schedules/${scheduleId}/stop`, 'POST', { stopOn })
}

export function setSupplementStatus(
  id: string,
  body: { status: 'active' | 'paused' | 'discontinued'; effectiveDate: string; notes?: string | null },
): Promise<SupplementRecord> {
  return sendJson(`/api/supplements/${id}/status`, 'POST', body)
}

export function recordSupplementAdherence(body: {
  scheduleId: string
  supplementId?: string
  scheduledDate: string
  action: AdherenceAction
  actualDoseAmount?: number | null
  actualDoseUnit?: string | null
  takenAt?: string | null
  notes?: string | null
}): Promise<{
  scheduleId: string
  supplementId: string
  scheduledDate: string
  state: string
}> {
  return sendJson('/api/supplements/adherence', 'POST', body)
}
