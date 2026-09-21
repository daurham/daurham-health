import { PRIMARY_BODY_METRIC_KEYS, displayValueForMetric } from '@/domain/body-metrics'
import {
  bodyHistoryResponseSchema,
  fitProfileCommitResponseSchema,
  fitProfilePreviewResponseSchema,
  type BodyMeasurementSession,
  type FitProfilePreviewCandidate,
  type FitProfilePreviewResponse,
} from '@/domain/body'

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.length > 0) {
      return body.error
    }
  } catch {
    // Fall through to a generic message.
  }
  return 'Request failed'
}

export async function fetchBodyMeasurements(): Promise<BodyMeasurementSession[]> {
  const response = await fetch('/api/body/measurements')
  if (!response.ok) {
    throw new Error(await readError(response))
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
  const response = await fetch('/api/body/import/fit-profile/preview', {
    method: 'POST',
    body: form,
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return fitProfilePreviewResponseSchema.parse(await response.json())
}

export async function commitFitProfile(
  file: File,
  timezone: string,
  fingerprints: string[],
): Promise<{ insertedCount: number; matchedCount: number }> {
  const form = new FormData()
  form.set('file', file)
  form.set('timezone', timezone)
  form.set('fingerprints', JSON.stringify(fingerprints))
  const response = await fetch('/api/body/import/fit-profile/commit', {
    method: 'POST',
    body: form,
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return fitProfileCommitResponseSchema.parse(await response.json())
}

export { PRIMARY_BODY_METRIC_KEYS, displayValueForMetric }
export type { FitProfilePreviewCandidate }
