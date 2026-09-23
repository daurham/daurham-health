import {
  createSessionResponseSchema,
  exerciseListResponseSchema,
  sessionDetailResponseSchema,
  sessionListResponseSchema,
  templateListResponseSchema,
  type ExerciseDefinition,
  type ManualWorkoutRequest,
  type WorkoutSession,
  type WorkoutSessionSummary,
  type WorkoutTemplate,
} from '@/domain/training'
import {
  createTranscriptionJobResponseSchema,
  transcriptionJobListResponseSchema,
  transcriptionJobResponseSchema,
  type PendingTranscriptionJob,
  type TranscriptionJobResponse,
} from '@/domain/training-transcription'

import { healthFetch, readApiError } from '@/lib'

export async function fetchExercises(): Promise<ExerciseDefinition[]> {
  const response = await healthFetch('/api/training/exercises')
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return exerciseListResponseSchema.parse(await response.json()).exercises
}

export async function fetchTemplates(): Promise<WorkoutTemplate[]> {
  const response = await healthFetch('/api/training/templates')
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return templateListResponseSchema.parse(await response.json()).templates
}

export async function fetchSessions(): Promise<WorkoutSessionSummary[]> {
  const response = await healthFetch('/api/training/sessions')
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return sessionListResponseSchema.parse(await response.json()).sessions
}

export async function fetchSession(id: string): Promise<WorkoutSession> {
  const response = await healthFetch(`/api/training/sessions/${id}`)
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return sessionDetailResponseSchema.parse(await response.json()).session
}

export async function updateSession(id: string, request: ManualWorkoutRequest): Promise<WorkoutSession> {
  const response = await healthFetch(`/api/training/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return createSessionResponseSchema.parse(await response.json()).session
}

export async function deleteSession(id: string): Promise<void> {
  const response = await healthFetch(`/api/training/sessions/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
}

export async function createSession(request: ManualWorkoutRequest): Promise<WorkoutSession> {
  const response = await healthFetch('/api/training/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return createSessionResponseSchema.parse(await response.json()).session
}

export async function createTranscriptionJob(file: File): Promise<{ id: string; status: 'queued' }> {
  const form = new FormData()
  form.set('image', file)
  const response = await healthFetch('/api/training/transcription/jobs', {
    method: 'POST',
    body: form,
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return createTranscriptionJobResponseSchema.parse(await response.json()).job
}

export async function fetchTranscriptionJobs(): Promise<PendingTranscriptionJob[]> {
  const response = await healthFetch('/api/training/transcription/jobs')
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return transcriptionJobListResponseSchema.parse(await response.json()).jobs
}

export async function fetchTranscriptionJob(jobId: string): Promise<TranscriptionJobResponse> {
  const response = await healthFetch(`/api/training/transcription/jobs/${jobId}`)
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return transcriptionJobResponseSchema.parse(await response.json())
}

export async function commitImportedSession(
  jobId: string,
  request: ManualWorkoutRequest,
): Promise<WorkoutSession> {
  const response = await healthFetch('/api/training/transcription/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, ...request }),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return createSessionResponseSchema.parse(await response.json()).session
}
