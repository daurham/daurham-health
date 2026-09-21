import { PRIMARY_BODY_METRIC_KEYS, displayValueForMetric } from '@/domain/body-metrics'
import {
  bodyHistoryResponseSchema,
  fitProfileCommitResponseSchema,
  fitProfilePreviewResponseSchema,
  type BodyMeasurementSession,
  type FitProfilePreviewCandidate,
  type FitProfilePreviewResponse,
} from '@/domain/body'

import { healthFetch, readApiError } from '@/lib'

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

export { PRIMARY_BODY_METRIC_KEYS, displayValueForMetric }
export type { FitProfilePreviewCandidate }
