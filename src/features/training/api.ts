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
  transcriptionJobResponseSchema,
  type TranscriptionJobResponse,
} from '@/domain/training-transcription'

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

export async function fetchExercises(): Promise<ExerciseDefinition[]> {
  const response = await fetch('/api/training/exercises')
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return exerciseListResponseSchema.parse(await response.json()).exercises
}

export async function fetchTemplates(): Promise<WorkoutTemplate[]> {
  const response = await fetch('/api/training/templates')
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return templateListResponseSchema.parse(await response.json()).templates
}

export async function fetchSessions(): Promise<WorkoutSessionSummary[]> {
  const response = await fetch('/api/training/sessions')
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return sessionListResponseSchema.parse(await response.json()).sessions
}

export async function fetchSession(id: string): Promise<WorkoutSession> {
  const response = await fetch(`/api/training/sessions/${id}`)
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return sessionDetailResponseSchema.parse(await response.json()).session
}

export async function createSession(request: ManualWorkoutRequest): Promise<WorkoutSession> {
  const response = await fetch('/api/training/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return createSessionResponseSchema.parse(await response.json()).session
}

export async function createTranscriptionJob(file: File): Promise<{ id: string; status: 'queued' }> {
  const form = new FormData()
  form.set('image', file)
  const response = await fetch('/api/training/transcription/jobs', {
    method: 'POST',
    body: form,
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return createTranscriptionJobResponseSchema.parse(await response.json()).job
}

export async function fetchTranscriptionJob(jobId: string): Promise<TranscriptionJobResponse> {
  const response = await fetch(`/api/training/transcription/jobs/${jobId}`)
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return transcriptionJobResponseSchema.parse(await response.json())
}

export async function commitImportedSession(
  jobId: string,
  request: ManualWorkoutRequest,
): Promise<WorkoutSession> {
  const response = await fetch('/api/training/transcription/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, ...request }),
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return createSessionResponseSchema.parse(await response.json()).session
}
