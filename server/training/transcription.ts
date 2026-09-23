import {
  HOME_AI_JOB_ID_RE,
  WORKOUT_PHOTO_MAX_BYTES,
  adaptHomeAiCandidate,
  createTranscriptionJobResponseSchema,
  homeAiFailureMessage,
  isHomeAiJobId,
  transcriptionJobListResponseSchema,
  transcriptionJobResponseSchema,
  type TranscriptionJobResponse,
} from '../../src/domain/training-transcription.js'
import { HttpError, parseMultipart, type ApiRequest } from '../http.js'
import type { HomeAiClient } from '../integrations/home-ai/client.js'
import { getHomeAiClient } from '../integrations/home-ai/client.js'
import {
  dismissTranscriptionJob,
  recordTranscriptionJobCreated,
  recordTranscriptionJobStatus,
  refreshOutstandingTranscriptionJobs,
} from './job-store.js'
import { listExercises, listTemplates } from './service.js'

const JPEG_MAGIC = Buffer.from([0xff, 0xd8])
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

export type WorkoutPhotoUpload = {
  bytes: Uint8Array
  filename: string
  mimeType: string
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === JPEG_MAGIC[0] && bytes[1] === JPEG_MAGIC[1]
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === PNG_MAGIC[0] &&
    bytes[1] === PNG_MAGIC[1] &&
    bytes[2] === PNG_MAGIC[2] &&
    bytes[3] === PNG_MAGIC[3]
  )
}

export function detectWorkoutPhoto(bytes: Uint8Array, filename: string, mimeType: string): {
  mimeType: 'image/jpeg' | 'image/png'
  filename: string
} {
  if (isJpeg(bytes)) {
    return { mimeType: 'image/jpeg', filename: /\.jpe?g$/i.test(filename) ? filename : 'workout.jpg' }
  }
  if (isPng(bytes)) {
    return { mimeType: 'image/png', filename: /\.png$/i.test(filename) ? filename : 'workout.png' }
  }
  const mime = mimeType.toLowerCase()
  if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png') {
    throw new HttpError(400, homeAiFailureMessage('INVALID_IMAGE'))
  }
  void filename
  throw new HttpError(400, homeAiFailureMessage('UNSUPPORTED_IMAGE'))
}

export async function readWorkoutPhotoForm(req: ApiRequest): Promise<WorkoutPhotoUpload> {
  const { files } = await parseMultipart(req, WORKOUT_PHOTO_MAX_BYTES)
  const file = files.image
  if (!file || file.data.length === 0) {
    throw new HttpError(400, homeAiFailureMessage('MISSING_IMAGE'))
  }
  if (file.data.length > WORKOUT_PHOTO_MAX_BYTES) {
    throw new HttpError(413, homeAiFailureMessage('UPLOAD_TOO_LARGE'))
  }
  const detected = detectWorkoutPhoto(file.data, file.filename, file.mimeType)
  if (!isJpeg(file.data) && !isPng(file.data)) {
    throw new HttpError(400, homeAiFailureMessage('UNSUPPORTED_IMAGE'))
  }
  return {
    bytes: file.data,
    filename: detected.filename,
    mimeType: detected.mimeType,
  }
}

export async function createTranscriptionJob(
  req: ApiRequest,
  client?: HomeAiClient,
): Promise<{ job: { id: string; status: 'queued' } }> {
  const photo = await readWorkoutPhotoForm(req)
  const homeAi = client ?? (await getHomeAiClient())
  const job = await homeAi.createWorkoutTranscriptionJob(photo)
  await recordTranscriptionJobCreated({ jobId: job.id, filename: photo.filename })
  return createTranscriptionJobResponseSchema.parse({
    job: { id: job.id, status: 'queued' },
  })
}

export async function listTranscriptionJobs(client?: HomeAiClient) {
  const jobs = await refreshOutstandingTranscriptionJobs(client)
  return transcriptionJobListResponseSchema.parse({
    jobs: jobs.flatMap((job) => {
      if (job.status === 'committed') {
        return []
      }
      return [
        {
          id: job.id,
          status: job.status,
          filename: job.filename,
          failureMessage: job.failureMessage,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        },
      ]
    }),
  })
}

export async function getTranscriptionJob(
  jobId: string,
  client?: HomeAiClient,
  catalogs?: {
    templates: Awaited<ReturnType<typeof listTemplates>>['templates']
    exercises: Awaited<ReturnType<typeof listExercises>>['exercises']
  },
): Promise<TranscriptionJobResponse> {
  if (!isHomeAiJobId(jobId)) {
    throw new HttpError(400, homeAiFailureMessage('INVALID_JOB_ID'))
  }
  const homeAi = client ?? (await getHomeAiClient())
  const job = await homeAi.getWorkoutTranscriptionJob(jobId)
  await recordTranscriptionJobStatus({
    jobId: job.id,
    status: job.status,
    failureMessage: job.error?.message ?? null,
  }).catch(() => undefined)

  if (job.status === 'failed') {
    return transcriptionJobResponseSchema.parse({
      job: { id: job.id, status: job.status, elapsedMs: job.elapsedMs },
      analysis: null,
      draft: null,
      template: null,
      canAdapt: false,
      failure: {
        code: job.error?.code ?? 'PIPELINE_FAILED',
        message: job.error?.message ?? homeAiFailureMessage('PIPELINE_FAILED'),
      },
    })
  }

  if (job.status !== 'completed') {
    return transcriptionJobResponseSchema.parse({
      job: { id: job.id, status: job.status, elapsedMs: job.elapsedMs },
      analysis: null,
      draft: null,
      template: null,
      canAdapt: false,
      failure: null,
    })
  }

  if (!job.candidate) {
    throw new HttpError(502, 'Home AI returned an invalid response')
  }

  const [templates, exercises] = catalogs
    ? [ { templates: catalogs.templates }, { exercises: catalogs.exercises } ]
    : await Promise.all([listTemplates(), listExercises()])
  const adapted = adaptHomeAiCandidate({
    candidate: job.candidate,
    review: job.review,
    templates: templates.templates,
    exercises: exercises.exercises,
  })
  const template =
    adapted.draft?.workoutTemplateId == null
      ? null
      : templates.templates.find((item) => item.id === adapted.draft?.workoutTemplateId) ?? null

  return transcriptionJobResponseSchema.parse({
    job: { id: job.id, status: job.status, elapsedMs: job.elapsedMs },
    analysis: {
      transcriptionStatus: job.candidate.transcription_status,
      reviewStatus: job.review?.review_status ?? job.review?.status ?? null,
      saveReady: job.review?.save_ready ?? null,
      guidance: adapted.warnings,
    },
    draft: adapted.draft,
    template,
    canAdapt: adapted.canAdapt,
    failure: adapted.canAdapt
      ? null
      : {
          code: 'UNADAPTABLE_CANDIDATE',
          message: 'This photo could not be turned into an editable workout.',
        },
  })
}

export { HOME_AI_JOB_ID_RE, WORKOUT_PHOTO_MAX_BYTES, dismissTranscriptionJob }
