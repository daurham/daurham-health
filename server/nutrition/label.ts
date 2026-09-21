import { randomUUID } from 'node:crypto'
import {
  NUTRITION_CONFIG,
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
import { HttpError, parseMultipart, type ApiRequest } from '../http.js'
import type { HomeAiClient } from '../integrations/home-ai/client.js'
import { getHomeAiClient } from '../integrations/home-ai/client.js'
import { getSql } from '../db.js'
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
import {
  getLabelJobRecord,
  listOutstandingLabelJobs,
  recordLabelJobCommitted,
  recordLabelJobCreated,
  recordLabelJobStatus,
  refreshOutstandingLabelJobs,
  findCommittedLabelEntry,
} from './label-jobs.js'

const LABEL_PHOTO_SERVER_MAX_BYTES = 8 * 1024 * 1024

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
}> {
  const { files } = await parseMultipart(req, LABEL_PHOTO_SERVER_MAX_BYTES)
  const file = files.image
  if (!file || file.data.length === 0) {
    throw new HttpError(400, labelFailureMessage('MISSING_IMAGE'))
  }
  if (file.data.length > LABEL_PHOTO_SERVER_MAX_BYTES) {
    throw new HttpError(413, labelFailureMessage('UPLOAD_TOO_LARGE'))
  }
  if (isJpeg(file.data)) {
    return {
      bytes: file.data,
      filename: /\.jpe?g$/i.test(file.filename) ? file.filename : 'nutrition-label.jpg',
      mimeType: 'image/jpeg',
    }
  }
  if (isPng(file.data)) {
    return {
      bytes: file.data,
      filename: /\.png$/i.test(file.filename) ? file.filename : 'nutrition-label.png',
      mimeType: 'image/png',
    }
  }
  throw new HttpError(400, labelFailureMessage('UNSUPPORTED_IMAGE'))
}

export async function createNutritionLabelJob(req: ApiRequest, client?: HomeAiClient) {
  const photo = await readLabelPhotoForm(req)
  let homeAi: HomeAiClient
  try {
    homeAi = client ?? (await getHomeAiClient())
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 503) {
      throw new HttpError(502, labelFailureMessage('HOME_AI_UNAVAILABLE'))
    }
    throw error
  }
  const job = await homeAi.createNutritionLabelJob(photo)
  await recordLabelJobCreated({ jobId: job.id, filename: photo.filename })
  return { job: { id: job.id, status: 'queued' as const } }
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
          failure: null,
        })
      }
      const comparison = await comparisonForCandidate(live.candidate)
      return nutritionLabelJobResponseSchema.parse({
        job: { id: live.id, status: live.status, elapsedMs: live.elapsedMs, imageAvailable: live.imageAvailable },
        candidate: live.candidate,
        comparison,
        failure: null,
      })
    } catch (error) {
      if (stored?.candidate && stored.status === 'completed') {
        const comparison = await comparisonForCandidate(stored.candidate)
        return nutritionLabelJobResponseSchema.parse({
          job: { id: stored.id, status: 'completed', elapsedMs: null, imageAvailable: false },
          candidate: stored.candidate,
          comparison,
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
      job: { id: stored.id, status: 'failed', elapsedMs: null, imageAvailable: false },
      candidate: null,
      comparison: null,
      failure: {
        code: 'PIPELINE_FAILED',
        message: stored.failureMessage ?? labelFailureMessage('PIPELINE_FAILED'),
      },
    })
  }
  if (stored?.candidate) {
    const comparison = await comparisonForCandidate(stored.candidate)
    return nutritionLabelJobResponseSchema.parse({
      job: { id: stored.id, status: stored.status === 'committed' ? 'completed' : stored.status, elapsedMs: null, imageAvailable: false },
      candidate: stored.candidate,
      comparison,
      failure: null,
    })
  }
  if (stored) {
    return nutritionLabelJobResponseSchema.parse({
      job: {
        id: stored.id,
        status: stored.status === 'committed' ? 'completed' : stored.status,
        elapsedMs: null,
        imageAvailable: false,
      },
      candidate: null,
      comparison: null,
      failure: null,
    })
  }
  throw new HttpError(404, labelFailureMessage('JOB_NOT_FOUND'))
}

export async function getNutritionLabelImage(jobId: string, client?: HomeAiClient) {
  if (!isHomeAiJobId(jobId)) {
    throw new HttpError(400, labelFailureMessage('INVALID_JOB_ID'))
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

export async function commitNutritionLabel(body: unknown): Promise<{ food: NutritionFood; entry: NutritionEntry }> {
  const parsed = commitNutritionLabelRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid label review')
  }
  const input = parsed.data
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
    basis: input.basis,
    barcode: input.barcode ?? '',
    logQuantity: input.logQuantity ?? 1,
  })
  if (reviewErrors.length > 0) {
    throw new HttpError(400, reviewErrors[0]?.message ?? 'Invalid label review', reviewErrors)
  }

  const jobId = input.jobId
  if (jobId) {
    const committed = await findCommittedLabelEntry(jobId)
    if (committed) {
      const entry = await getEntry(committed.entryId)
      const food = await getFood(committed.foodId)
      if (entry && food) {
        return { food, entry }
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

  const resolved = resolveEntryLogDate({
    logDate: input.logDate,
    consumedAt: null,
    timezone: input.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
  })
  const logQuantity = input.logQuantity ?? 1
  const snapshotSource =
    plan.type === 'log_existing'
      ? {
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          fiber: food.fiber,
          servingGrams: food.servingGrams,
        }
      : {
          calories: input.calories,
          protein: input.proteinGrams ?? null,
          carbs: input.carbsGrams ?? null,
          fat: input.fatGrams ?? null,
          fiber: input.fiberGrams ?? null,
          servingGrams: input.servingGrams ?? null,
        }
  const snapshot = snapshotFromDefinition(snapshotSource, { quantity: logQuantity })

  const entryId = randomUUID()
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
          basis: input.basis,
        }),
      ],
    )) as Array<{ entity_id: string }>
    if (!claimed[0]) {
      const raced = await findEntryByFingerprint(jobId)
      if (raced) {
        const racedFood = raced.foodId ? await getFood(raced.foodId) : food
        return { food: racedFood ?? food, entry: raced }
      }
    }
  }

  const entry = await insertEntryWithId([
    entryId,
    resolved.logDate,
    null,
    input.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
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
    'photo_ai',
    null,
  ])
  if (jobId) {
    await recordLabelJobCommitted(jobId, food.id, entry.id).catch(() => undefined)
  }
  return { food, entry }
}

export { emptyLabelCandidate, LEGACY_SOURCE_SQL, INSERT_SOURCE_LINK_SQL }
