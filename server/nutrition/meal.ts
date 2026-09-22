import { createHash, randomUUID } from 'node:crypto'
import {
  NUTRITION_CONFIG,
  NUTRITION_MEAL_CAPTURE_KIND,
  NUTRITION_MEAL_GROUP_ENTITY,
  NUTRITION_MEAL_SOURCE_KEY,
  commitNutritionMealEstimateRequestSchema,
  commitNutritionMealRequestSchema,
  homeAiMealJobStatusSchema,
  mealEstimateUserAdjusted,
  isHomeAiJobId,
  mealComponentSnapshot,
  mealFailureMessage,
  nutritionMealJobFingerprint,
  pendingNutritionCaptureSchema,
  resolveEntryLogDate,
  sanitizeMealEstimate,
  snapshotFromDefinition,
  validateMealEstimateReview,
  validateMealReview,
  type MealEstimateCandidate,
  type NutritionEntry,
  type NutritionFood,
  type NutritionMealJobResponse,
} from '../../src/domain/nutrition/index.js'
import { HttpError, parseMultipart, type ApiRequest } from '../http.js'
import type { HomeAiClient } from '../integrations/home-ai/client.js'
import { getHomeAiClient } from '../integrations/home-ai/client.js'
import { getSql } from '../db.js'
import {
  getEntry,
  getFood,
  insertEntryWithId,
  listEntriesByMealGroup,
} from './queries.js'
import { NutritionInterpretError, normalizeUserContext, parseNutritionProvider } from '../../src/domain/nutrition/interpret.js'
import { advanceGeminiCapture, interpretErrorToHttp } from './gemini-jobs.js'
import {
  findCommittedLabelEntry,
  getCaptureImage,
  getLabelJobRecord,
  type NutritionCaptureJobRecord,
  listOutstandingLabelJobs,
  recordLabelJobCommitted,
  recordLabelJobCreated,
  recordLabelJobStatus,
  requeueCaptureJob,
  saveCaptureImage,
  dismissCaptureJob,
} from './label-jobs.js'

const MEAL_PHOTO_SERVER_MAX_BYTES = 4_500_000
const JPEG_MAGIC = [0xff, 0xd8]
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

export const CLAIM_MEAL_GROUP_SQL = `INSERT INTO source_record_links (
           id, source_id, import_job_id, external_id, external_fingerprint, entity_type, entity_id, source_payload
         ) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7::jsonb)
         ON CONFLICT (source_id, external_fingerprint) DO NOTHING
         RETURNING entity_id`

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

export async function readMealPhotoForm(req: ApiRequest): Promise<{
  bytes: Uint8Array
  filename: string
  mimeType: string
  userContext: string | null
  provider: 'gemini' | 'home_ai'
}> {
  const { files, fields } = await parseMultipart(req, MEAL_PHOTO_SERVER_MAX_BYTES)
  const file = files.image
  if (!file || file.data.length === 0) {
    throw new HttpError(400, mealFailureMessage('MISSING_IMAGE'))
  }
  if (file.data.length > MEAL_PHOTO_SERVER_MAX_BYTES) {
    throw new HttpError(413, mealFailureMessage('UPLOAD_TOO_LARGE'))
  }
  let userContext: string | null
  try {
    userContext = normalizeUserContext(fields.userContext)
  } catch (error) {
    if (error instanceof NutritionInterpretError) {
      throw interpretErrorToHttp(error, 'meal')
    }
    throw error
  }
  const provider = parseNutritionProvider(fields.provider)
  if (isJpeg(file.data)) {
    return {
      bytes: file.data,
      filename: /\.jpe?g$/i.test(file.filename) ? file.filename : 'meal-photo.jpg',
      mimeType: 'image/jpeg',
      userContext,
      provider,
    }
  }
  if (isPng(file.data)) {
    return {
      bytes: file.data,
      filename: /\.png$/i.test(file.filename) ? file.filename : 'meal-photo.png',
      mimeType: 'image/png',
      userContext,
      provider,
    }
  }
  throw new HttpError(400, mealFailureMessage('UNSUPPORTED_IMAGE'))
}

function tryMealEstimate(raw: unknown): MealEstimateCandidate | null {
  try {
    const candidate = sanitizeMealEstimate(raw)
    return candidate.status === 'invalid' || candidate.calories <= 0 ? null : candidate
  } catch {
    return null
  }
}

function asMealResponse(input: {
  jobId: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  elapsedMs?: number | null
  imageAvailable?: boolean
  candidate: MealEstimateCandidate | null
  foods?: NutritionFood[]
  matches?: NutritionMealJobResponse['matches']
  recipeCandidates?: NutritionMealJobResponse['recipeCandidates']
  hiddenFatFoods?: NutritionMealJobResponse['hiddenFatFoods']
  failure?: { code: string; message: string } | null
  userContext?: string | null
}): NutritionMealJobResponse {
  return {
    job: {
      id: input.jobId,
      status: input.status,
      elapsedMs: input.elapsedMs ?? null,
      imageAvailable: input.imageAvailable ?? false,
    },
    userContext: input.userContext ?? null,
    candidate: input.candidate,
    foods: input.foods ?? [],
    matches: input.matches ?? {},
    recipeCandidates: input.recipeCandidates ?? [],
    hiddenFatFoods: input.hiddenFatFoods ?? [],
    failure: input.failure ?? null,
  }
}

export async function refreshOutstandingMealJobs(client?: HomeAiClient) {
  const jobs = await listOutstandingLabelJobs(NUTRITION_MEAL_CAPTURE_KIND)
  const pending = jobs.filter(
    (job) => job.provider !== 'gemini' && job.status !== 'failed' && job.status !== 'completed' && job.status !== 'committed',
  )
  if (pending.length === 0) {
    return jobs
  }
  const homeAi = client ?? (await getHomeAiClient())
  for (const job of pending) {
    if (job.status === 'failed' || job.status === 'completed' || job.status === 'committed') {
      continue
    }
    if (!isHomeAiJobId(job.id)) {
      continue
    }
    try {
      const live = await homeAi.getNutritionMealJob(job.id)
      const status = homeAiMealJobStatusSchema.parse(live.status)
      await recordLabelJobStatus({
        jobId: job.id,
        status,
        failureMessage: live.error?.message ?? null,
        candidate: live.candidate,
      })
    } catch {
      // Keep last known Health status if Home-AI is unreachable.
    }
  }
  return listOutstandingLabelJobs(NUTRITION_MEAL_CAPTURE_KIND)
}

export async function createNutritionMealJob(req: ApiRequest, client?: HomeAiClient) {
  const photo = await readMealPhotoForm(req)
  if (photo.provider === 'home_ai') {
    return createHomeAiMealJob(photo, client)
  }
  return createGeminiMealJob(photo)
}

async function createGeminiMealJob(photo: {
  bytes: Uint8Array
  filename: string
  mimeType: string
  userContext: string | null
}) {
  const jobId = randomUUID()
  await recordLabelJobCreated({
    jobId,
    filename: photo.filename,
    captureKind: NUTRITION_MEAL_CAPTURE_KIND,
    provider: 'gemini',
    userContext: photo.userContext,
  })
  await saveCaptureImage({ jobId, bytes: photo.bytes, mimeType: photo.mimeType })
  return { job: { id: jobId, status: 'queued' as const } }
}

async function createHomeAiMealJob(
  photo: { bytes: Uint8Array; filename: string; mimeType: string; userContext: string | null },
  client?: HomeAiClient,
) {
  let homeAi: HomeAiClient
  try {
    homeAi = client ?? (await getHomeAiClient())
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 503) {
      throw new HttpError(502, mealFailureMessage('HOME_AI_UNAVAILABLE'), undefined, 'HOME_AI_UNAVAILABLE')
    }
    throw error
  }
  const job = await homeAi.createNutritionMealJob(photo)
  await recordLabelJobCreated({
    jobId: job.id,
    filename: photo.filename,
    captureKind: NUTRITION_MEAL_CAPTURE_KIND,
    provider: 'home_ai',
    userContext: photo.userContext,
  })
  return { job: { id: job.id, status: 'queued' as const } }
}

export async function reanalyzeNutritionMeal(
  jobId: string,
  input: { userContext: string | null; provider: 'gemini' | 'home_ai' },
  client?: HomeAiClient,
) {
  const stored = await getLabelJobRecord(jobId)
  if (!stored || stored.captureKind !== NUTRITION_MEAL_CAPTURE_KIND) {
    throw new HttpError(404, mealFailureMessage('JOB_NOT_FOUND'), undefined, 'JOB_NOT_FOUND')
  }
  if (stored.status === 'committed') {
    throw new HttpError(409, 'That meal is already saved.')
  }
  if (input.provider === 'home_ai') {
    const image = await getCaptureImage(jobId)
    if (!image) {
      throw new HttpError(400, mealFailureMessage('MISSING_IMAGE'), undefined, 'MISSING_IMAGE')
    }
    return createHomeAiMealJob(
      {
        bytes: image.bytes,
        filename: stored.filename ?? 'meal-photo.jpg',
        mimeType: image.mimeType,
        userContext: input.userContext,
      },
      client,
    )
  }
  const queued = await requeueCaptureJob({ jobId, userContext: input.userContext })
  if (!queued) {
    throw new HttpError(404, mealFailureMessage('JOB_NOT_FOUND'), undefined, 'JOB_NOT_FOUND')
  }
  return { job: { id: jobId, status: 'queued' as const } }
}

export async function dismissNutritionMealJob(jobId: string): Promise<{ ok: true }> {
  if (!isHomeAiJobId(jobId)) {
    throw new HttpError(400, mealFailureMessage('INVALID_JOB_ID'))
  }
  await dismissCaptureJob(jobId, NUTRITION_MEAL_CAPTURE_KIND)
  return { ok: true }
}

export async function listNutritionMealJobs(client?: HomeAiClient) {
  const jobs = await refreshOutstandingMealJobs(client).catch(() => listOutstandingLabelJobs(NUTRITION_MEAL_CAPTURE_KIND))
  return {
    jobs: jobs.flatMap((job) => {
      if (job.status === 'committed') {
        return []
      }
      return [
        pendingNutritionCaptureSchema.parse({
          id: job.id,
          status: job.status,
          captureKind: NUTRITION_MEAL_CAPTURE_KIND,
          filename: job.filename,
          failureMessage: job.failureMessage,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        }),
      ]
    }),
  }
}

export async function getNutritionMealJob(jobId: string, client?: HomeAiClient): Promise<NutritionMealJobResponse> {
  if (!isHomeAiJobId(jobId)) {
    throw new HttpError(400, mealFailureMessage('INVALID_JOB_ID'))
  }
  const stored = await getLabelJobRecord(jobId)
  if (stored?.provider === 'gemini') {
    const ready = await advanceGeminiCapture(stored)
    return mealResponseFromRecord(ready)
  }
  let homeAi: HomeAiClient | null = client ?? null
  if (!homeAi) {
    try {
      homeAi = await getHomeAiClient()
    } catch {
      homeAi = null
    }
  }

  function withEstimate(candidate: unknown, job: NutritionMealJobResponse['job']) {
    const estimate = tryMealEstimate(candidate)
    if (!estimate) {
      return asMealResponse({
        jobId: job.id,
        status: 'failed',
        elapsedMs: job.elapsedMs,
        imageAvailable: job.imageAvailable,
        candidate: null,
        userContext: stored?.userContext ?? null,
        failure: { code: 'GEMINI_SEMANTIC', message: mealFailureMessage('GEMINI_SEMANTIC') },
      })
    }
    return asMealResponse({
      jobId: job.id,
      status: job.status,
      elapsedMs: job.elapsedMs,
      imageAvailable: job.imageAvailable,
      candidate: estimate,
      userContext: stored?.userContext ?? null,
    })
  }

  if (homeAi) {
    try {
      const live = await homeAi.getNutritionMealJob(jobId)
      await recordLabelJobStatus({
        jobId: live.id,
        status: live.status,
        failureMessage: live.error?.message ?? null,
        candidate: live.candidate,
      }).catch(() => undefined)
      if (live.status === 'failed') {
        return asMealResponse({
          jobId: live.id,
          status: 'failed',
          elapsedMs: live.elapsedMs,
          imageAvailable: live.imageAvailable,
          candidate: null,
          userContext: stored?.userContext ?? null,
          failure: {
            code: live.error?.code ?? 'PIPELINE_FAILED',
            message: live.error?.message ?? mealFailureMessage('PIPELINE_FAILED'),
          },
        })
      }
      if (live.status !== 'completed' || !live.candidate) {
        return asMealResponse({
          jobId: live.id,
          status: live.status,
          elapsedMs: live.elapsedMs,
          imageAvailable: live.imageAvailable,
          candidate: live.candidate ? tryMealEstimate(live.candidate) : null,
        })
      }
      return withEstimate(live.candidate, {
        id: live.id,
        status: live.status,
        elapsedMs: live.elapsedMs,
        imageAvailable: live.imageAvailable,
      })
    } catch (error) {
      if (stored?.candidate && (stored.status === 'completed' || stored.status === 'committed')) {
        return withEstimate(stored.candidate, {
          id: stored.id,
          status: 'completed',
          elapsedMs: null,
          imageAvailable: false,
        })
      }
      if (error instanceof HttpError) {
        throw error
      }
    }
  }

  if (stored?.status === 'failed') {
    return asMealResponse({
      jobId: stored.id,
      status: 'failed',
      candidate: null,
      userContext: stored.userContext,
      failure: {
        code: stored.interpretation.failureCode ?? 'PIPELINE_FAILED',
        message: stored.failureMessage ?? mealFailureMessage(stored.interpretation.failureCode ?? 'PIPELINE_FAILED'),
      },
    })
  }
  if (stored?.candidate) {
    return withEstimate(stored.candidate, {
      id: stored.id,
      status: stored.status === 'queued' || stored.status === 'processing' ? stored.status : 'completed',
      elapsedMs: null,
      imageAvailable: false,
    })
  }
  if (stored) {
    return asMealResponse({
      jobId: stored.id,
      status: stored.status === 'queued' || stored.status === 'processing' ? stored.status : 'completed',
      candidate: null,
      userContext: stored.userContext,
      imageAvailable: stored.imageStored,
    })
  }
  throw new HttpError(404, mealFailureMessage('JOB_NOT_FOUND'))
}

async function mealResponseFromRecord(record: NutritionCaptureJobRecord): Promise<NutritionMealJobResponse> {
  const failureCode = record.interpretation.failureCode ?? 'PIPELINE_FAILED'
  if (record.status === 'failed') {
    return asMealResponse({
      jobId: record.id,
      status: 'failed',
      elapsedMs: record.interpretation.latencyMs ?? null,
      imageAvailable: record.imageStored,
      candidate: null,
      userContext: record.userContext,
      failure: {
        code: failureCode,
        message: record.failureMessage ?? mealFailureMessage(failureCode),
      },
    })
  }
  if (record.candidate && (record.status === 'completed' || record.status === 'committed')) {
    const candidate = tryMealEstimate(record.candidate)
    if (!candidate) {
      return asMealResponse({
        jobId: record.id,
        status: 'failed',
        elapsedMs: record.interpretation.latencyMs ?? null,
        imageAvailable: record.imageStored,
        candidate: null,
        userContext: record.userContext,
        failure: { code: 'GEMINI_SEMANTIC', message: mealFailureMessage('GEMINI_SEMANTIC') },
      })
    }
    return asMealResponse({
      jobId: record.id,
      status: 'completed',
      elapsedMs: record.interpretation.latencyMs ?? null,
      imageAvailable: record.imageStored,
      candidate,
      userContext: record.userContext,
    })
  }
  const status = record.status === 'queued' || record.status === 'processing' ? record.status : 'completed'
  return asMealResponse({
    jobId: record.id,
    status,
    elapsedMs: record.interpretation.latencyMs ?? null,
    imageAvailable: record.imageStored,
    candidate: null,
    userContext: record.userContext,
  })
}

export async function getNutritionMealImage(jobId: string, client?: HomeAiClient) {
  if (!isHomeAiJobId(jobId)) {
    throw new HttpError(400, mealFailureMessage('INVALID_JOB_ID'))
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
  return homeAi.getNutritionMealImage(jobId)
}

export function descriptionMealFingerprint(input: {
  text: string
  logDate: string
  components: Array<{ foodId: string | null; quantity: number | null; unit: string; grams: number | null; included: boolean }>
}): string {
  const body = JSON.stringify({
    text: input.text.trim().toLowerCase().replace(/\s+/g, ' '),
    logDate: input.logDate,
    components: input.components
      .filter((component) => component.included && component.foodId)
      .map((component) => ({
        foodId: component.foodId,
        quantity: component.quantity,
        unit: component.unit,
        grams: component.grams,
      }))
      .sort((left, right) => (left.foodId ?? '').localeCompare(right.foodId ?? '')),
  })
  return `nutrition-describe|${createHash('sha256').update(body).digest('hex')}`
}

async function sourceIdByKey(key: string): Promise<string> {
  const sql = await getSql()
  const rows = (await sql.query(`SELECT id FROM data_sources WHERE key = $1 LIMIT 1`, [key])) as Array<{ id: string }>
  const id = rows[0]?.id
  if (!id) {
    throw new HttpError(500, `${key} data source is not configured`)
  }
  return id
}

async function findGroupByFingerprint(sourceId: string, fingerprint: string): Promise<string | null> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT entity_id FROM source_record_links
     WHERE source_id = $1 AND entity_type = $2 AND external_fingerprint = $3
     LIMIT 1`,
    [sourceId, NUTRITION_MEAL_GROUP_ENTITY, fingerprint],
  )) as Array<{ entity_id: string }>
  return rows[0]?.entity_id ?? null
}

async function mealPhotoSourceId(): Promise<string> {
  const sql = await getSql()
  const rows = (await sql.query(`SELECT id FROM data_sources WHERE key = $1 LIMIT 1`, [
    NUTRITION_MEAL_SOURCE_KEY,
  ])) as Array<{ id: string }>
  const id = rows[0]?.id
  if (!id) {
    throw new HttpError(500, 'meal_photo data source is not configured')
  }
  return id
}

async function findMealGroupByFingerprint(jobId: string): Promise<string | null> {
  const sql = await getSql()
  const sourceId = await mealPhotoSourceId()
  const rows = (await sql.query(
    `SELECT entity_id FROM source_record_links
     WHERE source_id = $1 AND entity_type = $2 AND external_fingerprint = $3
     LIMIT 1`,
    [sourceId, NUTRITION_MEAL_GROUP_ENTITY, nutritionMealJobFingerprint(jobId)],
  )) as Array<{ entity_id: string }>
  return rows[0]?.entity_id ?? null
}

async function insertLoggedEntry(input: {
  id: string
  logDate: string
  timezone: string
  meal: NutritionEntry['meal']
  food: NutritionFood
  quantity: number
  unit: string
  grams: number | null
  mealGroupId: string
  sourceKind?: NutritionEntry['sourceKind']
  notes?: string
}): Promise<NutritionEntry> {
  const snapshot = input.grams != null
    ? mealComponentSnapshot(input.food, { quantity: input.quantity, grams: input.grams })
    : snapshotFromDefinition(
        {
          calories: input.food.calories,
          protein: input.food.protein,
          carbs: input.food.carbs,
          fat: input.food.fat,
          fiber: input.food.fiber,
          servingGrams: input.food.servingGrams,
        },
        { quantity: input.quantity },
      )
  return insertEntryWithId([
    input.id,
    input.logDate,
    null,
    input.timezone,
    input.meal,
    input.food.id,
    input.food.name,
    input.food.brand,
    input.quantity,
    input.unit,
    snapshot.grams,
    snapshot.calories,
    snapshot.protein,
    snapshot.carbs,
    snapshot.fat,
    snapshot.fiber,
    input.sourceKind ?? 'photo_ai',
    input.notes ?? 'Reviewed from meal photo.',
    input.mealGroupId,
  ])
}

export async function commitNutritionMeal(body: unknown): Promise<{ entries: NutritionEntry[]; mealGroupId: string }> {
  const parsed = commitNutritionMealRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid meal review')
  }
  const input = parsed.data
  const reviewErrors = validateMealReview({
    recipeFoodId: input.recipeFoodId ?? null,
    components: input.components.map((component) => ({
      id: component.id,
      included: component.included,
      proposedName: component.proposedName,
      foodId: component.foodId,
      quantity: component.quantity,
      unit: component.unit,
      grams: component.grams,
      portionDescription: null,
      portionConfidence: null,
      identificationUncertain: false,
      estimated: component.grams != null,
      collapsedByRecipe: false,
    })),
    resolvedFlags: input.resolvedFlags ?? [],
    meal: input.meal ?? '',
  })
  if (reviewErrors.length > 0) {
    throw new HttpError(400, reviewErrors[0]?.message ?? 'Invalid meal review', reviewErrors)
  }

  const jobId = input.jobId
  if (jobId) {
    const existingGroup = await findMealGroupByFingerprint(jobId)
    if (existingGroup) {
      const entries = await listEntriesByMealGroup(existingGroup)
      if (entries.length > 0) {
        return { entries, mealGroupId: existingGroup }
      }
    }
  }

  const resolved = resolveEntryLogDate({
    logDate: input.logDate,
    timezone: input.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
  })
  const meal = input.meal ?? null
  const timezone = input.timezone ?? NUTRITION_CONFIG.calendarTimeZone
  const described = Boolean(input.descriptionText)
  const descriptionFingerprint = described
    ? descriptionMealFingerprint({
        text: input.descriptionText ?? '',
        logDate: resolved.logDate,
        components: input.components,
      })
    : null
  if (descriptionFingerprint) {
    const existingGroup = await findGroupByFingerprint(await sourceIdByKey('health_app'), descriptionFingerprint)
    if (existingGroup) {
      const entries = await listEntriesByMealGroup(existingGroup)
      if (entries.length > 0) {
        return { entries, mealGroupId: existingGroup }
      }
    }
  }
  const mealGroupId = randomUUID()

  if (descriptionFingerprint) {
    const sql = await getSql()
    const sourceId = await sourceIdByKey('health_app')
    const claimed = (await sql.query(CLAIM_MEAL_GROUP_SQL, [
      randomUUID(),
      sourceId,
      descriptionFingerprint,
      descriptionFingerprint,
      NUTRITION_MEAL_GROUP_ENTITY,
      mealGroupId,
      JSON.stringify({ captureKind: 'food_description', reviewed: true }),
    ])) as Array<{ entity_id: string }>
    const claimedId = claimed[0]?.entity_id
    if (claimedId && claimedId !== mealGroupId) {
      const entries = await listEntriesByMealGroup(claimedId)
      if (entries.length > 0) {
        return { entries, mealGroupId: claimedId }
      }
    }
  }

  if (jobId) {
    const sql = await getSql()
    const sourceId = await mealPhotoSourceId()
    const claimed = (await sql.query(CLAIM_MEAL_GROUP_SQL, [
      randomUUID(),
      sourceId,
      jobId,
      nutritionMealJobFingerprint(jobId),
      NUTRITION_MEAL_GROUP_ENTITY,
      mealGroupId,
      JSON.stringify({ captureKind: NUTRITION_MEAL_CAPTURE_KIND, reviewed: true, pipeline: 'nutrition-meal-v1' }),
    ])) as Array<{ entity_id: string }>
    const claimedId = claimed[0]?.entity_id
    if (claimedId && claimedId !== mealGroupId) {
      const entries = await listEntriesByMealGroup(claimedId)
      if (entries.length > 0) {
        return { entries, mealGroupId: claimedId }
      }
    }
  }

  const entries: NutritionEntry[] = []
  if (input.recipeFoodId) {
    const recipe = await getFood(input.recipeFoodId)
    if (!recipe) {
      throw new HttpError(404, 'Recipe not found')
    }
    entries.push(
      await insertLoggedEntry({
        id: randomUUID(),
        logDate: resolved.logDate,
        timezone,
        meal,
        food: recipe,
        quantity: input.recipeQuantity && input.recipeQuantity > 0 ? input.recipeQuantity : 1,
        unit: recipe.servingUnit,
        grams: null,
        mealGroupId,
      }),
    )
  }

  for (const component of input.components) {
    if (!component.included || !component.foodId) {
      continue
    }
    if (input.recipeFoodId && component.foodId === input.recipeFoodId) {
      continue
    }
    const food = await getFood(component.foodId)
    if (!food) {
      throw new HttpError(404, `Food not found for ${component.proposedName}`)
    }
    const quantity = component.quantity != null && component.quantity > 0 ? component.quantity : 1
    entries.push(
      await insertLoggedEntry({
        id: randomUUID(),
        logDate: resolved.logDate,
        timezone,
        meal,
        food,
        quantity,
        unit: component.unit || food.servingUnit,
        grams: component.grams,
        mealGroupId,
        sourceKind: described ? 'manual' : 'photo_ai',
        notes: described ? 'Reviewed from a food description.' : 'Reviewed from meal photo.',
      }),
    )
  }

  if (entries.length === 0) {
    throw new HttpError(400, 'Include at least one food, or use a saved recipe.')
  }

  if (jobId) {
    await recordLabelJobCommitted(jobId, entries[0]!.foodId ?? entries[0]!.id, entries[0]!.id).catch(() => undefined)
  }

  return { entries, mealGroupId }
}

export async function commitNutritionMealEstimate(body: unknown): Promise<{ entries: NutritionEntry[] }> {
  const parsed = commitNutritionMealEstimateRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid meal estimate')
  }
  const input = parsed.data
  const reviewErrors = validateMealEstimateReview({ name: input.name, calories: input.calories })
  if (reviewErrors.length > 0) {
    throw new HttpError(400, reviewErrors[0]?.message ?? 'Invalid meal estimate', reviewErrors)
  }
  const reviewed = {
    calories: input.calories,
    proteinGrams: input.proteinGrams,
    carbsGrams: input.carbsGrams,
    fatGrams: input.fatGrams,
    fiberGrams: input.fiberGrams,
  }
  const jobId = input.jobId
  let baseline = reviewed
  let model: string | null = null
  if (jobId) {
    const stored = await getLabelJobRecord(jobId)
    if (!stored || stored.captureKind !== NUTRITION_MEAL_CAPTURE_KIND) {
      throw new HttpError(404, mealFailureMessage('JOB_NOT_FOUND'), undefined, 'JOB_NOT_FOUND')
    }
    if (stored.status === 'committed') {
      const committed = await findCommittedLabelEntry(jobId)
      const existing = committed ? await getEntry(committed.entryId) : null
      if (existing) {
        return { entries: [existing] }
      }
    }
    const estimate = stored.candidate ? tryMealEstimate(stored.candidate) : null
    if (estimate) {
      baseline = {
        calories: estimate.calories,
        proteinGrams: estimate.proteinGrams,
        carbsGrams: estimate.carbsGrams,
        fatGrams: estimate.fatGrams,
        fiberGrams: estimate.fiberGrams,
      }
      model = estimate.model ?? stored.interpretation.model ?? null
    }
  }

  const resolved = resolveEntryLogDate({
    logDate: input.logDate,
    timezone: input.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
  })
  const entryId = randomUUID()
  if (jobId) {
    const sql = await getSql()
    const sourceId = await mealPhotoSourceId()
    const claimed = (await sql.query(CLAIM_MEAL_GROUP_SQL, [
      randomUUID(),
      sourceId,
      jobId,
      nutritionMealJobFingerprint(jobId),
      'nutrition_entry',
      entryId,
      JSON.stringify({
        source: 'meal_photo_ai',
        provider: 'gemini',
        model,
        estimated: true,
        reviewed: true,
        userAdjusted: mealEstimateUserAdjusted(baseline, reviewed),
        aiEstimate: baseline,
        reviewedValues: reviewed,
        portionScale: input.portionScale ?? 1,
      }),
    ])) as Array<{ entity_id: string }>
    const claimedId = claimed[0]?.entity_id
    if (claimedId && claimedId !== entryId) {
      const raced = await getEntry(claimedId)
      if (raced) {
        return { entries: [raced] }
      }
    }
  }

  const entry = await insertEntryWithId([
    entryId,
    resolved.logDate,
    null,
    input.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
    input.meal ?? null,
    null,
    input.name.trim(),
    null,
    1,
    'meal',
    null,
    reviewed.calories,
    reviewed.proteinGrams,
    reviewed.carbsGrams,
    reviewed.fatGrams,
    reviewed.fiberGrams,
    'photo_ai',
    'Reviewed from meal photo estimate.',
    null,
  ])
  if (jobId) {
    await recordLabelJobCommitted(jobId, entry.id, entry.id).catch(() => undefined)
  }
  return { entries: [entry] }
}

