import { PRIMARY_BODY_METRIC_KEYS, displayValueForMetric } from '@/domain/body-metrics'
import {
  bodyHistoryResponseSchema,
  bodyMeasurementSessionSchema,
  fitProfileCommitResponseSchema,
  fitProfilePreviewResponseSchema,
  type BodyMeasurementSession,
  type FitProfilePreviewCandidate,
  type FitProfilePreviewResponse,
} from '@/domain/body'
import { z } from 'zod'

import { healthFetch, readApiError } from '@/lib'

const cadenceItemSchema = z.object({
  metricKey: z.string(),
  label: z.string(),
  status: z.enum(['current', 'due', 'stale', 'initial_due']),
  intervalDays: z.number(),
  enabledFrom: z.string(),
  lastMeasuredDate: z.string().nullable(),
  daysSinceLast: z.number().nullable(),
  dueDate: z.string(),
  daysOverdue: z.number(),
})

const cadenceListSchema = z.object({
  asOf: z.string(),
  items: z.array(cadenceItemSchema),
})

export type BodyCadenceItem = z.infer<typeof cadenceItemSchema>

export async function fetchBodyMeasurements(): Promise<BodyMeasurementSession[]> {
  const response = await healthFetch('/api/body/measurements')
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return bodyHistoryResponseSchema.parse(await response.json()).sessions
}

export async function previewFitProfile(
  file: File,
  timezone: string,
): Promise<FitProfilePreviewResponse> {
  const form = new FormData()
  form.set('file', file)
  form.set('timezone', timezone)
  const response = await healthFetch('/api/body/import/fit-profile/preview', {
    method: 'POST',
    body: form,
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return fitProfilePreviewResponseSchema.parse(await response.json())
}

export async function commitFitProfile(
  file: File,
  timezone: string,
  fingerprints: string[],
) {
  const form = new FormData()
  form.set('file', file)
  form.set('timezone', timezone)
  form.set('fingerprints', JSON.stringify(fingerprints))
  const response = await healthFetch('/api/body/import/fit-profile/commit', {
    method: 'POST',
    body: form,
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return fitProfileCommitResponseSchema.parse(await response.json())
}

export async function createManualMeasurement(body: unknown): Promise<BodyMeasurementSession> {
  const response = await healthFetch('/api/body/measurements', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return bodyMeasurementSessionSchema.parse(await response.json())
}

export async function updateManualMeasurement(id: string, body: unknown): Promise<BodyMeasurementSession> {
  const response = await healthFetch(`/api/body/measurements/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return bodyMeasurementSessionSchema.parse(await response.json())
}

export async function deleteManualMeasurement(id: string): Promise<void> {
  const response = await healthFetch(`/api/body/measurements/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
}

export async function fetchBodyCadences(): Promise<BodyCadenceItem[]> {
  const response = await healthFetch('/api/body/cadences')
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return cadenceListSchema.parse(await response.json()).items
}

export async function saveBodyCadence(metricKey: string, intervalDays: number, enabledFrom?: string): Promise<void> {
  const response = await healthFetch(`/api/body/cadences/${metricKey}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ intervalDays, ...(enabledFrom ? { enabledFrom } : {}) }),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
}

export async function deleteBodyCadence(metricKey: string): Promise<void> {
  const response = await healthFetch(`/api/body/cadences/${metricKey}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
}

export { PRIMARY_BODY_METRIC_KEYS, displayValueForMetric }
export type { FitProfilePreviewCandidate }
