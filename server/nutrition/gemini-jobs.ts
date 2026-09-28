import { NutritionInterpretError } from '../../src/domain/nutrition/interpret.js'
import { HttpError } from '../http.js'
import { mealFailureMessage } from '../../src/domain/nutrition/meal.js'
import { labelFailureMessage } from '../../src/domain/nutrition/label.js'
import { descriptionFailureMessage } from '../../src/domain/nutrition/interpret.js'
import {
  claimCaptureJob,
  finishCaptureInterpretation,
  getCaptureImage,
  getLabelJobRecord,
  type NutritionCaptureJobRecord,
} from './label-jobs.js'
import { listMealCaptureImages, type StoredMealImage } from './meal-images.js'
import { createGeminiNutritionInterpreter, type GeminiNutritionInterpreter } from '../integrations/gemini/client.js'

const PROCESSING_STALE_MS = 45_000

type CapturePorts = {
  claimCaptureJob: typeof claimCaptureJob
  getCaptureImage: typeof getCaptureImage
  listMealCaptureImages: (jobId: string) => Promise<StoredMealImage[]>
  finishCaptureInterpretation: typeof finishCaptureInterpretation
  getLabelJobRecord: typeof getLabelJobRecord
  createInterpreter: () => Promise<Pick<GeminiNutritionInterpreter, 'interpretMealPhoto' | 'interpretNutritionLabel'>>
}

export function interpretErrorToHttp(error: unknown, kind: 'meal' | 'label' | 'description'): HttpError {
  if (error instanceof HttpError) {
    return error
  }
  if (error instanceof NutritionInterpretError) {
    const message =
      kind === 'label'
        ? labelFailureMessage(error.code)
        : kind === 'description'
          ? descriptionFailureMessage(error.code)
          : mealFailureMessage(error.code)
    const status =
      error.code === 'AI_BUDGET_REACHED' || error.code === 'AI_RATE_LIMITED'
        ? 429
        : error.code === 'GEMINI_NOT_CONFIGURED'
          ? 503
          : error.code === 'CONTEXT_TOO_LONG'
            ? 400
            : 502
    return new HttpError(status, message, undefined, error.code)
  }
  return new HttpError(502, kind === 'label' ? labelFailureMessage('GEMINI_UNAVAILABLE') : mealFailureMessage('GEMINI_UNAVAILABLE'), undefined, 'GEMINI_UNAVAILABLE')
}

export async function advanceGeminiCapture(
  job: NutritionCaptureJobRecord,
  ports?: Partial<CapturePorts>,
): Promise<NutritionCaptureJobRecord> {
  const claim = ports?.claimCaptureJob ?? claimCaptureJob
  const loadImage = ports?.getCaptureImage ?? getCaptureImage
  const loadMealImages =
    ports?.listMealCaptureImages ??
    (ports?.getCaptureImage
      ? async (jobId: string) => {
          const image = await ports.getCaptureImage!(jobId)
          return image ? [{ position: 0, bytes: image.bytes, mimeType: image.mimeType, filename: null, sha256: '' }] : []
        }
      : listMealCaptureImages)
  const finish = ports?.finishCaptureInterpretation ?? finishCaptureInterpretation
  const reload = ports?.getLabelJobRecord ?? getLabelJobRecord
  const createInterpreter = ports?.createInterpreter ?? createGeminiNutritionInterpreter
  if (job.provider !== 'gemini') {
    return job
  }
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'committed') {
    return job
  }
  if (job.status === 'processing' && Date.now() - Date.parse(job.updatedAt) < PROCESSING_STALE_MS) {
    return job
  }
  const claimed = await claim(job.id)
  if (!claimed) {
    return (await reload(job.id)) ?? job
  }
  const labelImage = job.captureKind === 'nutrition_label' ? await loadImage(job.id) : null
  const mealImages = job.captureKind === 'nutrition_label' ? [] : await loadMealImages(job.id)
  if (job.captureKind === 'nutrition_label' ? !labelImage : mealImages.length === 0) {
    await finish({
      jobId: job.id,
      status: 'failed',
      failureMessage: job.captureKind === 'nutrition_label' ? labelFailureMessage('MISSING_IMAGE') : mealFailureMessage('MISSING_IMAGE'),
      metadata: { provider: 'gemini', failureCode: 'MISSING_IMAGE' },
    })
    return (await reload(job.id)) ?? job
  }
  try {
    const interpreter = await createInterpreter()
    if (job.captureKind === 'nutrition_label' && labelImage) {
      const interpreted = await interpreter.interpretNutritionLabel({
        image: labelImage.bytes,
        mimeType: labelImage.mimeType,
        userContext: job.userContext,
      })
      await finish({
        jobId: job.id,
        status: 'completed',
        candidate: interpreted.candidate,
        metadata: { ...interpreted.metadata, attempt: job.interpretation.attempt },
      })
    } else {
      const interpreted = await interpreter.interpretMealPhoto({
        images: mealImages.map((item) => ({ image: item.bytes, mimeType: item.mimeType })),
        userContext: job.userContext,
      })
      await finish({
        jobId: job.id,
        status: 'completed',
        candidate: interpreted.candidate,
        metadata: { ...interpreted.metadata, attempt: job.interpretation.attempt },
      })
    }
  } catch (error) {
    const httpError = interpretErrorToHttp(error, job.captureKind === 'nutrition_label' ? 'label' : 'meal')
    await finish({
      jobId: job.id,
      status: 'failed',
      failureMessage: httpError.message,
      metadata: { provider: 'gemini', failureCode: httpError.code ?? 'GEMINI_UNAVAILABLE' },
    })
  }
  return (await reload(job.id)) ?? job
}
