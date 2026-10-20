import { randomUUID } from 'node:crypto'
import {
  NUTRITION_CONFIG,
  NUTRITION_LABEL_CAPTURE_KIND,
  NUTRITION_LABEL_SOURCE_KEY,
  commitNutritionLabelRequestSchema,
  emptyLabelCandidate,
  isHomeAiJobId,
  labelFailureMessage,
  nutritionLabelJobFingerprint,
  nutritionLabelJobListResponseSchema,
  nutritionLabelJobResponseSchema,
  normalizeBarcode,
  resolveEntryLogDate,
  planLabelCommitFood,
  snapshotFromDefinition,
  validateLabelReview,
  type NutritionEntry,
  type NutritionFood,
  type NutritionLabelCandidate,
  type NutritionLabelJobResponse,
} from '../../src/domain/nutrition/index.js'
import { NutritionInterpretError, normalizeUserContext, parseNutritionProvider } from '../../src/domain/nutrition/interpret.js'
import { HttpError, parseMultipart, type ApiRequest } from '../http.js'
import type { HomeAiClient } from '../integrations/home-ai/client.js'
import { getHomeAiClient } from '../integrations/home-ai/client.js'
import { getSql } from '../db.js'
import { ATOMIC_LABEL_INITIAL_COMMIT_SQL, ATOMIC_LABEL_PANTRY_TO_LOG_SQL } from './label-atomic.js'
import { lookupNutritionBarcode } from './service.js'
import {
  getEntry,
  getFood,
  getFoodByBarcodeKeys,
  insertEntryWithId,
  insertFood,
  INSERT_SOURCE_LINK_SQL,
  LEGACY_SOURCE_SQL,
  updateFood,
} from './queries.js'
import { advanceGeminiCapture, interpretErrorToHttp } from './gemini-jobs.js'
import {
  findCommittedLabelFood,
  getCaptureImage,
  getLabelJobRecord,
  listOutstandingLabelJobs,
  recordLabelJobCommitted,
  recordLabelJobCreated,
  recordLabelJobStatus,
  refreshOutstandingLabelJobs,
  requeueCaptureJob,
  saveCaptureImage,
  dismissCaptureJob,
} from './label-jobs.js'

const LABEL_PHOTO_SERVER_MAX_BYTES = 4_500_000

const JPEG_MAGIC = [0xff, 0xd8]
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

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

export async function readLabelPhotoForm(req: ApiRequest): Promise<{
  bytes: Uint8Array
  filename: string
  mimeType: string
  userContext: string | null
  provider: 'gemini' | 'home_ai'
}> {
  const { files, fields } = await parseMultipart(req, LABEL_PHOTO_SERVER_MAX_BYTES)
  const file = files.image
  if (!file || file.data.length === 0) {
    throw new HttpError(400, labelFailureMessage('MISSING_IMAGE'))
  }
  if (file.data.length > LABEL_PHOTO_SERVER_MAX_BYTES) {
    throw new HttpError(413, labelFailureMessage('UPLOAD_TOO_LARGE'))
  }
  let userContext: string | null
  try {
    userContext = normalizeUserContext(fields.userContext)
  } catch (error) {
    if (error instanceof NutritionInterpretError) {
      throw interpretErrorToHttp(error, 'label')
    }
    throw error
  }
  const provider = parseNutritionProvider(fields.provider)
  if (isJpeg(file.data)) {
    return {
      bytes: file.data,
      filename: /\.jpe?g$/i.test(file.filename) ? file.filename : 'nutrition-label.jpg',
      mimeType: 'image/jpeg',
      userContext,
      provider,
    }
  }
  if (isPng(file.data)) {
    return {
      bytes: file.data,
      filename: /\.png$/i.test(file.filename) ? file.filename : 'nutrition-label.png',
      mimeType: 'image/png',
      userContext,
      provider,
    }
  }
  throw new HttpError(400, labelFailureMessage('UNSUPPORTED_IMAGE'))
}

export async function createNutritionLabelJob(req: ApiRequest, client?: HomeAiClient) {
  const photo = await readLabelPhotoForm(req)
  if (photo.provider === 'home_ai') {
    return createHomeAiLabelJob(photo, client)
  }
  const jobId = randomUUID()
  await recordLabelJobCreated({
    jobId,
    filename: photo.filename,
    provider: 'gemini',
    userContext: photo.userContext,
  })
  await saveCaptureImage({ jobId, bytes: photo.bytes, mimeType: photo.mimeType })
  return { job: { id: jobId, status: 'queued' as const } }
}

async function createHomeAiLabelJob(
  photo: { bytes: Uint8Array; filename: string; mimeType: string; userContext: string | null },
  client?: HomeAiClient,
) {
  let homeAi: HomeAiClient
  try {
    homeAi = client ?? (await getHomeAiClient())
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 503) {
      throw new HttpError(502, labelFailureMessage('HOME_AI_UNAVAILABLE'), undefined, 'HOME_AI_UNAVAILABLE')
    }
    throw error
  }
  const job = await homeAi.createNutritionLabelJob(photo)
  await recordLabelJobCreated({
    jobId: job.id,
    filename: photo.filename,
    provider: 'home_ai',
    userContext: photo.userContext,
  })
  return { job: { id: job.id, status: 'queued' as const } }
}

export async function reanalyzeNutritionLabel(
  jobId: string,
  input: { userContext: string | null; provider: 'gemini' | 'home_ai' },
  client?: HomeAiClient,
) {
  const stored = await getLabelJobRecord(jobId)
  if (!stored || stored.captureKind !== 'nutrition_label') {
    throw new HttpError(404, labelFailureMessage('JOB_NOT_FOUND'), undefined, 'JOB_NOT_FOUND')
  }
  if (stored.status === 'committed') {
    throw new HttpError(409, 'That label is already saved.')
  }
  if (input.provider === 'home_ai') {
    const image = await getCaptureImage(jobId)
    if (!image) {
      throw new HttpError(400, labelFailureMessage('MISSING_IMAGE'), undefined, 'MISSING_IMAGE')
    }
    return createHomeAiLabelJob(
      {
        bytes: image.bytes,
        filename: stored.filename ?? 'nutrition-label.jpg',
        mimeType: image.mimeType,
        userContext: input.userContext,
      },
      client,
    )
  }
  const queued = await requeueCaptureJob({ jobId, userContext: input.userContext })
  if (!queued) {
    throw new HttpError(404, labelFailureMessage('JOB_NOT_FOUND'), undefined, 'JOB_NOT_FOUND')
  }
  return { job: { id: jobId, status: 'queued' as const } }
}

export async function dismissNutritionLabelJob(jobId: string): Promise<{ ok: true }> {
  if (!isHomeAiJobId(jobId)) {
    throw new HttpError(400, labelFailureMessage('INVALID_JOB_ID'))
  }
  await dismissCaptureJob(jobId, NUTRITION_LABEL_CAPTURE_KIND)
  return { ok: true }
}

export async function listNutritionLabelJobs(client?: HomeAiClient) {
  const jobs = await refreshOutstandingLabelJobs(client).catch(() => listOutstandingLabelJobs())
  return nutritionLabelJobListResponseSchema.parse({
    jobs: jobs.flatMap((job) => {
      if (job.status === 'committed') {
        return []
      }
      return [
        {
          id: job.id,
          status: job.status,
          captureKind: job.captureKind,
          filename: job.filename,
          failureMessage: job.failureMessage,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        },
      ]
    }),
  })
}

async function comparisonForCandidate(candidate: NutritionLabelCandidate) {
  const barcode = candidate.fields.barcode.value
  if (!barcode || candidate.fields.barcode.status === 'uncertain') {
    return { existingFood: null, provider: null }
  }
  try {
    const result = await lookupNutritionBarcode(barcode)
    if (result.status === 'local') {
      return { existingFood: result.food, provider: null }
    }
    const nutrition = result.candidate.nutrition
    const differs =
      (nutrition.calories != null &&
        candidate.fields.calories.value != null &&
        Math.abs(nutrition.calories - candidate.fields.calories.value) >= 1) ||
      (nutrition.protein != null &&
        candidate.fields.proteinGrams.value != null &&
        Math.abs(nutrition.protein - candidate.fields.proteinGrams.value) >= 0.5)
    if (!differs) {
      return { existingFood: null, provider: null }
    }
    return {
      existingFood: null,
      provider: {
        name: result.candidate.name,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        fiber: nutrition.fiber,
        sodium: nutrition.sodium,
        source: 'Open Food Facts',
      },
    }
  } catch {
    return { existingFood: null, provider: null }
  }
}

export async function getNutritionLabelJob(
  jobId: string,
  client?: HomeAiClient,
): Promise<NutritionLabelJobResponse> {
  if (!isHomeAiJobId(jobId)) {
    throw new HttpError(400, labelFailureMessage('INVALID_JOB_ID'))
  }
  const stored = await getLabelJobRecord(jobId)
  if (stored && stored.captureKind !== NUTRITION_LABEL_CAPTURE_KIND) {
    throw new HttpError(404, labelFailureMessage('JOB_NOT_FOUND'), undefined, 'JOB_NOT_FOUND')
  }
  if (stored?.provider === 'gemini') {
    const ready = await advanceGeminiCapture(stored)
    return await labelResponseFromRecord(ready)
  }
  let homeAi: HomeAiClient | null = client ?? null
  if (!homeAi) {
    try {
      homeAi = await getHomeAiClient()
    } catch {
      homeAi = null
    }
  }

  if (homeAi) {
    try {
      const live = await homeAi.getNutritionLabelJob(jobId)
      await recordLabelJobStatus({
        jobId: live.id,
        status: live.status,
        failureMessage: live.error?.message ?? null,
        candidate: live.candidate,
      }).catch(() => undefined)
      if (live.status === 'failed') {
        return nutritionLabelJobResponseSchema.parse({
          job: { id: live.id, status: live.status, elapsedMs: live.elapsedMs, imageAvailable: live.imageAvailable },
          candidate: null,
          comparison: null,
          userContext: stored?.userContext ?? null,
          failure: {
            code: live.error?.code ?? 'PIPELINE_FAILED',
            message: live.error?.message ?? labelFailureMessage('PIPELINE_FAILED'),
          },
        })
      }
      if (live.status !== 'completed' || !live.candidate) {
        return nutritionLabelJobResponseSchema.parse({
          job: { id: live.id, status: live.status, elapsedMs: live.elapsedMs, imageAvailable: live.imageAvailable },
          candidate: live.candidate,
          comparison: null,
          userContext: stored?.userContext ?? null,
          failure: null,
        })
      }
      const comparison = await comparisonForCandidate(live.candidate)
      return nutritionLabelJobResponseSchema.parse({
        job: { id: live.id, status: live.status, elapsedMs: live.elapsedMs, imageAvailable: live.imageAvailable },
        candidate: live.candidate,
        comparison,
        userContext: stored?.userContext ?? null,
        failure: null,
      })
    } catch (error) {
      if (stored?.candidate && stored.status === 'completed') {
        const comparison = await comparisonForCandidate(stored.candidate as NutritionLabelCandidate)
        return nutritionLabelJobResponseSchema.parse({
          job: { id: stored.id, status: 'completed', elapsedMs: null, imageAvailable: stored.imageStored },
          candidate: stored.candidate,
          comparison,
          userContext: stored.userContext,
          failure: null,
        })
      }
      if (error instanceof HttpError) {
        throw error
      }
    }
  }

  if (stored?.status === 'failed') {
    return nutritionLabelJobResponseSchema.parse({
      job: { id: stored.id, status: 'failed', elapsedMs: null, imageAvailable: stored.imageStored },
      candidate: null,
      comparison: null,
      userContext: stored.userContext,
      failure: {
        code: stored.interpretation.failureCode ?? 'PIPELINE_FAILED',
        message: stored.failureMessage ?? labelFailureMessage(stored.interpretation.failureCode ?? 'PIPELINE_FAILED'),
      },
    })
  }
  if (stored?.candidate) {
    const comparison = await comparisonForCandidate(stored.candidate as NutritionLabelCandidate)
    return nutritionLabelJobResponseSchema.parse({
      job: { id: stored.id, status: stored.status === 'committed' ? 'completed' : stored.status, elapsedMs: null, imageAvailable: stored.imageStored },
      candidate: stored.candidate,
      comparison,
      userContext: stored.userContext,
      failure: null,
    })
  }
  if (stored) {
    return nutritionLabelJobResponseSchema.parse({
      job: {
        id: stored.id,
        status: stored.status === 'committed' ? 'completed' : stored.status,
        elapsedMs: null,
        imageAvailable: stored.imageStored,
      },
      candidate: null,
      comparison: null,
      userContext: stored.userContext,
      failure: null,
    })
  }
  throw new HttpError(404, labelFailureMessage('JOB_NOT_FOUND'))
}

async function labelResponseFromRecord(
  record: NonNullable<Awaited<ReturnType<typeof getLabelJobRecord>>>,
): Promise<NutritionLabelJobResponse> {
  const failureCode = record.interpretation.failureCode ?? 'PIPELINE_FAILED'
  if (record.status === 'failed') {
    return nutritionLabelJobResponseSchema.parse({
      job: {
        id: record.id,
        status: 'failed',
        elapsedMs: record.interpretation.latencyMs ?? null,
        imageAvailable: record.imageStored,
      },
      candidate: null,
      comparison: null,
      userContext: record.userContext,
      failure: {
        code: failureCode,
        message: record.failureMessage ?? labelFailureMessage(failureCode),
      },
    })
  }
  const candidate =
    record.candidate && (record.status === 'completed' || record.status === 'committed')
      ? (record.candidate as NutritionLabelCandidate)
      : null
  const comparison = candidate ? await comparisonForCandidate(candidate) : null
  const status = record.status === 'queued' || record.status === 'processing' ? record.status : 'completed'
  return nutritionLabelJobResponseSchema.parse({
    job: {
      id: record.id,
      status,
      elapsedMs: record.interpretation.latencyMs ?? null,
      imageAvailable: record.imageStored,
    },
    candidate,
    comparison,
    userContext: record.userContext,
    failure: null,
  })
}

export async function getNutritionLabelImage(jobId: string, client?: HomeAiClient) {
  if (!isHomeAiJobId(jobId)) {
    throw new HttpError(400, labelFailureMessage('INVALID_JOB_ID'))
  }
  const stored = await getCaptureImage(jobId)
  if (stored) {
    return stored
  }
  const record = await getLabelJobRecord(jobId)
  if (record?.provider === 'gemini') {
    return null
  }
  const homeAi = client ?? (await getHomeAiClient())
  return homeAi.getNutritionLabelImage(jobId)
}

async function nutritionLabelSourceId(): Promise<string> {
  const sql = await getSql()
  const rows = (await sql.query(`SELECT id FROM data_sources WHERE key = $1 LIMIT 1`, [
    NUTRITION_LABEL_SOURCE_KEY,
  ])) as Array<{ id: string }>
  const id = rows[0]?.id
  if (!id) {
    throw new HttpError(500, 'nutrition_label data source is not configured')
  }
  return id
}

async function findEntryByFingerprint(jobId: string): Promise<NutritionEntry | null> {
  const sql = await getSql()
  const sourceId = await nutritionLabelSourceId()
  const rows = (await sql.query(
    `SELECT entity_id FROM source_record_links
     WHERE source_id = $1 AND entity_type = 'nutrition_entry' AND external_fingerprint = $2
     LIMIT 1`,
    [sourceId, nutritionLabelJobFingerprint(jobId)],
  )) as Array<{ entity_id: string }>
  const entityId = rows[0]?.entity_id
  if (!entityId) {
    return null
  }
  return getEntry(entityId)
}

function uniqueConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('nutrition_foods_name_brand_kind_uidx') ||
    message.includes('nutrition_foods_barcode_uidx') ||
    message.includes('nutrition_foods_barcode_normalized_uidx')
  )
}


/**
 * A scanned label's FIRST save is a single database statement. We resolve
 * user-editable food and serving decisions before it, but only the capture
 * row lock winner can write the food, entry, provenance and completion state.
 * Legacy requests without a capture job keep the old manual-food route.
 */
async function commitInitialLabelCaptureAtomic(options: {
  jobId: string
  shouldLog: boolean
  action: 'create' | 'log_existing' | 'update_and_log'
  existingFoodId: string | null
  request: ReturnType<typeof commitNutritionLabelRequestSchema.parse>
  barcode: string | null
}): Promise<{ food: NutritionFood; entry: NutritionEntry | null }> {
  const { jobId, shouldLog, action, existingFoodId, request, barcode } = options
  const existingFood = existingFoodId ? await getFood(existingFoodId) : null
  if (action !== 'create' && !existingFood) {
    throw new HttpError(404, 'Food not found')
  }
  const foodId = action === 'create' ? randomUUID() : existingFoodId!
  const entryId = randomUUID()
  const name = action === 'log_existing' ? existingFood!.name : request.productName.trim()
  const brand = action === 'log_existing' ? existingFood!.brand : request.brand?.trim() || null
  const servingUnit = action === 'log_existing' ? existingFood!.servingUnit : request.servingUnit.trim()
  const nutrients = action === 'log_existing'
    ? {
        calories: existingFood!.calories,
        protein: existingFood!.protein,
        carbs: existingFood!.carbs,
        fat: existingFood!.fat,
        fiber: existingFood!.fiber,
        sodium: existingFood!.sodium ?? null,
        servingGrams: existingFood!.servingGrams,
      }
    : {
        calories: request.calories,
        protein: request.proteinGrams ?? null,
        carbs: request.carbsGrams ?? null,
        fat: request.fatGrams ?? null,
        fiber: request.fiberGrams ?? null,
        sodium: request.sodiumMg ?? null,
        servingGrams: request.servingGrams ?? null,
      }
  const logQuantity = request.logQuantity ?? 1
  const snapshot = snapshotFromDefinition(nutrients, { quantity: logQuantity })
  const date = resolveEntryLogDate({
    logDate: request.logDate,
    consumedAt: null,
    timezone: request.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
  })
  const reviewedFood = {
    name: request.productName.trim(),
    brand: request.brand?.trim() || null,
    barcode,
    catalog_kind: request.catalogKind ?? (barcode ? 'packaged' : 'custom'),
    serving_quantity: request.servingQuantity,
    serving_unit: request.servingUnit.trim(),
    serving_grams: request.servingGrams ?? null,
    calories: request.calories,
    protein: request.proteinGrams ?? null,
    carbs: request.carbsGrams ?? null,
    fat: request.fatGrams ?? null,
    fiber: request.fiberGrams ?? null,
    sodium: request.sodiumMg ?? null,
  }
  const reviewedEntry = {
    id: entryId,
    log_date: date.logDate,
    consumed_at: null,
    timezone: request.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
    meal: null,
    food_id: foodId,
    food_name: name,
    brand,
    serving_quantity: logQuantity,
    serving_unit: servingUnit,
    grams: snapshot.grams,
    calories: snapshot.calories,
    protein: snapshot.protein,
    carbs: snapshot.carbs,
    fat: snapshot.fat,
    fiber: snapshot.fiber,
    sodium: snapshot.sodium,
    source_kind: 'photo_ai',
    notes: null,
    meal_group_id: null,
  }
  const sql = await getSql()
  const sourceId = await nutritionLabelSourceId()
  // The first Pantry-only claim does not consume the later Log fingerprint.
  const fingerprint = nutritionLabelJobFingerprint(jobId) + (shouldLog ? '' : ':pantry')
  const params = [
    jobId, action, shouldLog, existingFoodId, foodId,
    entryId, sourceId, randomUUID(), fingerprint,
    JSON.stringify({ pipeline: 'nutrition-label-v1', reviewed: true, basis: request.basis }),
    JSON.stringify(reviewedFood),
    JSON.stringify(reviewedEntry),
  ]
  const rows = await sql.query(ATOMIC_LABEL_INITIAL_COMMIT_SQL, params) as Array<{
    food_id: string
    entry_id: string | null
  }>
  const winner = rows[0]
  if (winner) {
    const food = await getFood(winner.food_id)
    const entry = winner.entry_id ? await getEntry(winner.entry_id) : null
    if (food && (!shouldLog || entry)) return { food, entry }
    throw new HttpError(500, 'Label saved but could not be retrieved. Reopen your Nutrition page.')
  }
  // The concurrent loser must reconcile the winner instead of replaying
  // their stale food edits or creating another daily log entry.
  const committed = await findCommittedLabelFood(jobId)
  if (committed?.entryDeleted && shouldLog) {
    throw new HttpError(409, 'This scanned entry was deleted. Log a new Pantry entry if desired.', undefined, 'CAPTURE_ENTRY_DELETED')
  }
  if (committed) {
    const food = await getFood(committed.foodId)
    if (food && committed.entryId) {
      const entry = await getEntry(committed.entryId)
      if (entry) return { food, entry }
    }
    if (food && !shouldLog) return { food, entry: null }
    if (food && shouldLog) {
      return createLabelEntry({ input: request, food, jobId, atomicPantryToLog: true })
    }
  }
  throw new HttpError(409, 'This scanned label was already finalized elsewhere. Refresh the review.')
}

export async function commitNutritionLabel(body: unknown): Promise<{
  food: NutritionFood
  entry: NutritionEntry | null
}> {
  const parsed = commitNutritionLabelRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid label review')
  }
  const input = parsed.data
  const shouldLog = input.log !== false
  const reviewErrors = validateLabelReview({
    productName: input.productName,
    brand: input.brand ?? '',
    servingQuantity: input.servingQuantity,
    servingUnit: input.servingUnit,
    servingGrams: input.servingGrams ?? null,
    servingsPerContainer: input.servingsPerContainer ?? null,
    calories: input.calories,
    proteinGrams: input.proteinGrams ?? null,
    carbsGrams: input.carbsGrams ?? null,
    fatGrams: input.fatGrams ?? null,
    fiberGrams: input.fiberGrams ?? null,
    sodiumMg: input.sodiumMg ?? null,
    basis: input.basis,
    barcode: input.barcode ?? '',
    logQuantity: input.logQuantity ?? 1,
  })
  if (reviewErrors.length > 0) {
    throw new HttpError(400, reviewErrors[0]?.message ?? 'Invalid label review', reviewErrors)
  }

  const jobId = input.jobId
  if (jobId) {
    // A Meal Photo capture cannot be reused as a Label Pantry/Log workflow.
    // Require the persisted owner capture before any food or entry mutation.
    const capture = await getLabelJobRecord(jobId)
    if (!capture || capture.captureKind !== NUTRITION_LABEL_CAPTURE_KIND) {
      throw new HttpError(404, labelFailureMessage('JOB_NOT_FOUND'), undefined, 'JOB_NOT_FOUND')
    }
    const committed = await findCommittedLabelFood(jobId)
    if (committed) {
      // Deleting a scanned entry is the owner's durable decision, not an
      // invitation for an old photo-review request to recreate the log.
      if (shouldLog && committed.entryDeleted) {
        throw new HttpError(409, 'This scanned food-log entry was deleted. Log the Pantry food again as a new entry if desired.', undefined, 'CAPTURE_ENTRY_DELETED')
      }
      const food = await getFood(committed.foodId)
      if (committed.entryId) {
        const entry = await getEntry(committed.entryId)
        if (entry && food) {
          return { food, entry }
        }
      } else if (!shouldLog && food) {
        return { food, entry: null }
      } else if (shouldLog && food) {
        return createLabelEntry({ input, food, jobId, atomicPantryToLog: true })
      }
    }
    const existing = await findEntryByFingerprint(jobId)
    if (existing) {
      const food = existing.foodId ? await getFood(existing.foodId) : null
      if (food) {
        await recordLabelJobCommitted(jobId, food.id, existing.id).catch(() => undefined)
        return { food, entry: existing }
      }
    }
  }

  const barcode = input.barcode ? normalizeBarcode(input.barcode)?.normalized ?? null : null
  const matchingFood =
    barcode && input.existingAction === 'create'
      ? await getFoodByBarcodeKeys(normalizeBarcode(barcode)?.lookupKeys ?? [barcode])
      : null
  const plan = planLabelCommitFood({
    existingAction: input.existingAction,
    existingFoodId: input.existingFoodId,
    matchingFoodId: matchingFood?.id ?? null,
  })
  if (plan.type === 'error') {
    throw new HttpError(plan.status, plan.message)
  }

  if (jobId) {
    try {
      return await commitInitialLabelCaptureAtomic({
        jobId, shouldLog, action: plan.type,
        existingFoodId: plan.type === 'create' ? null : plan.foodId,
        request: input, barcode,
      })
    } catch (error) {
      if (uniqueConflict(error) && barcode) {
        throw new HttpError(409, 'Existing Health food found. Log using the existing food or update it from the label.')
      }
      throw error
    }
  }

  // Preserve non-photo/manual callers without a verified capture job.
  let food: NutritionFood | null = null
  if (plan.type === 'log_existing') {
    food = await getFood(plan.foodId)
    if (!food) {
      throw new HttpError(404, 'Food not found')
    }
  } else if (plan.type === 'update_and_log') {
    food = await updateFood([
      plan.foodId,
      input.productName.trim(),
      true,
      input.brand?.trim() || null,
      barcode !== undefined,
      barcode,
      input.servingQuantity,
      input.servingUnit.trim(),
      true,
      input.servingGrams ?? null,
      input.calories,
      true,
      input.proteinGrams ?? null,
      true,
      input.carbsGrams ?? null,
      true,
      input.fatGrams ?? null,
      true,
      input.fiberGrams ?? null,
      input.sodiumMg ?? null,
      null,
      null,
      false,
      null,
    ])
    if (!food) {
      throw new HttpError(404, 'Food not found')
    }
  } else {
    try {
      food = await insertFood([
        input.productName.trim(),
        input.brand?.trim() || null,
        barcode,
        input.catalogKind ?? (barcode ? 'packaged' : 'custom'),
        input.servingQuantity,
        input.servingUnit.trim(),
        input.servingGrams ?? null,
        input.calories,
        input.proteinGrams ?? null,
        input.carbsGrams ?? null,
        input.fatGrams ?? null,
        input.fiberGrams ?? null,
        input.sodiumMg ?? null,
        'photo_ai',
        false,
        null,
      ])
    } catch (error) {
      if (uniqueConflict(error) && barcode) {
        throw new HttpError(
          409,
          'Existing Health food found. Log using the existing food or update it from the label.',
        )
      }
      throw error
    }
  }
  if (!food) {
    throw new HttpError(500, 'Could not save food')
  }

  if (!shouldLog) {
    if (jobId) {
      await recordLabelJobCommitted(jobId, food.id, null).catch(() => undefined)
    }
    return { food, entry: null }
  }

  return createLabelEntry({
    input,
    food,
    jobId,
    snapshotSource:
      plan.type === 'log_existing'
        ? {
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
            fiber: food.fiber,
            sodium: food.sodium ?? null,
            servingGrams: food.servingGrams,
          }
        : undefined,
  })
}

async function createLabelEntry(input: {
  input: ReturnType<typeof commitNutritionLabelRequestSchema.parse>
  food: NutritionFood
  jobId?: string
  atomicPantryToLog?: boolean
  snapshotSource?: {
    calories: number
    protein: number | null
    carbs: number | null
    fat: number | null
    fiber: number | null
    sodium: number | null
    servingGrams: number | null
  }
}): Promise<{ food: NutritionFood; entry: NutritionEntry }> {
  const { input: request, food, jobId } = input
  const resolved = resolveEntryLogDate({
    logDate: request.logDate,
    consumedAt: null,
    timezone: request.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
  })
  const logQuantity = request.logQuantity ?? 1
  const snapshotSource = input.snapshotSource ?? {
    calories: request.calories,
    protein: request.proteinGrams ?? null,
    carbs: request.carbsGrams ?? null,
    fat: request.fatGrams ?? null,
    fiber: request.fiberGrams ?? null,
    sodium: request.sodiumMg ?? null,
    servingGrams: request.servingGrams ?? null,
  }
  const snapshot = snapshotFromDefinition(snapshotSource, { quantity: logQuantity })

  const entryId = randomUUID()

  if (input.atomicPantryToLog && jobId) {
    const sql = await getSql()
    const sourceId = await nutritionLabelSourceId()
    const entryFields = [
      'id', 'log_date', 'consumed_at', 'timezone', 'meal', 'food_id',
      'food_name', 'brand', 'serving_quantity', 'serving_unit', 'grams',
      'calories', 'protein', 'carbs', 'fat', 'fiber', 'sodium',
      'source_kind', 'notes', 'meal_group_id',
    ] as const
    const entryValues = [
      entryId, resolved.logDate, null,
      request.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
      null, food.id, food.name, food.brand, logQuantity, food.servingUnit,
      snapshot.grams, snapshot.calories, snapshot.protein,
      snapshot.carbs, snapshot.fat, snapshot.fiber, snapshot.sodium,
      'photo_ai', null, null,
    ]
    const entryJson = Object.fromEntries(entryFields.map((key, index) => [key, entryValues[index] ?? null]))
    const saved = await sql.query(ATOMIC_LABEL_PANTRY_TO_LOG_SQL, [
      jobId, food.id, sourceId, randomUUID(), nutritionLabelJobFingerprint(jobId),
      entryId, JSON.stringify({ pipeline: 'nutrition-label-v1', reviewed: true, basis: request.basis }),
      JSON.stringify(entryJson),
    ]) as Array<{ entry_id: string }>
    if (saved[0]) {
      const entry = await getEntry(saved[0].entry_id)
      if (entry) return { food, entry }
    }
    // Concurrent retry: reconcile the first committed association. Never
    // create an orphan daily entry or re-log a deliberately deleted one.
    const current = await findCommittedLabelFood(jobId)
    if (current?.entryDeleted) {
      throw new HttpError(409, 'This label log was deleted. Log a new Pantry entry if desired.', undefined, 'CAPTURE_ENTRY_DELETED')
    }
    if (current?.foodId === food.id && current.entryId) {
      const entry = await getEntry(current.entryId)
      if (entry) return { food, entry }
    }
    throw new HttpError(409, 'That scanned label was already finalized elsewhere')
  }

  const linkId = randomUUID()
  if (jobId) {
    const sql = await getSql()
    const sourceId = await nutritionLabelSourceId()
    const claimed = (await sql.query(
      `INSERT INTO source_record_links (
         id, source_id, import_job_id, external_id, external_fingerprint, entity_type, entity_id, source_payload
       ) VALUES ($1::uuid, $2::uuid, NULL, $3, $4, 'nutrition_entry', $5::uuid, $6::jsonb)
       ON CONFLICT (source_id, external_fingerprint) DO NOTHING
       RETURNING entity_id`,
      [
        linkId,
        sourceId,
        jobId,
        nutritionLabelJobFingerprint(jobId),
        entryId,
        JSON.stringify({
          pipeline: 'nutrition-label-v1',
          reviewed: true,
          basis: request.basis,
        }),
      ],
    )) as Array<{ entity_id: string }>
    if (!claimed[0]) {
      const raced = await findEntryByFingerprint(jobId)
      if (raced) {
        const racedFood = raced.foodId ? await getFood(raced.foodId) : food
        return { food: racedFood ?? food, entry: raced }
      }
      // A prior source claim without a surviving entry is a deleted or
      // interrupted capture. Never create an orphan entry on a retry.
      throw new HttpError(409, 'That scanned label was already finalized. Log the Pantry food as a fresh entry.', undefined, 'CAPTURE_ENTRY_DELETED')
    }
  }

  const entry = await insertEntryWithId([
    entryId,
    resolved.logDate,
    null,
    request.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
    null,
    food.id,
    food.name,
    food.brand,
    logQuantity,
    food.servingUnit,
    snapshot.grams,
    snapshot.calories,
    snapshot.protein,
    snapshot.carbs,
    snapshot.fat,
    snapshot.fiber,
    snapshot.sodium,
    'photo_ai',
    null,
    null,
  ])
  if (jobId) {
    await recordLabelJobCommitted(jobId, food.id, entry.id).catch(() => undefined)
  }
  return { food, entry }
}

export { emptyLabelCandidate, LEGACY_SOURCE_SQL, INSERT_SOURCE_LINK_SQL }
