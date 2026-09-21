import { randomUUID } from 'node:crypto'
import {
  NUTRITION_CONFIG,
  NUTRITION_MEAL_CAPTURE_KIND,
  NUTRITION_MEAL_GROUP_ENTITY,
  NUTRITION_MEAL_SOURCE_KEY,
  commitNutritionMealRequestSchema,
  homeAiMealJobStatusSchema,
  isHomeAiJobId,
  looksLikeHiddenFat,
  matchMealComponent,
  mealComponentSnapshot,
  mealFailureMessage,
  nutritionMealJobFingerprint,
  pendingNutritionCaptureSchema,
  recipeCandidatesForComponents,
  resolveEntryLogDate,
  sanitizeMealCandidate,
  snapshotFromDefinition,
  validateMealReview,
  type MealPhotoCandidate,
  type NutritionEntry,
  type NutritionFood,
  type NutritionMealJobResponse,
} from '../../src/domain/nutrition/index.js'
import { HttpError, parseMultipart, type ApiRequest } from '../http.js'
import type { HomeAiClient } from '../integrations/home-ai/client.js'
import { getHomeAiClient } from '../integrations/home-ai/client.js'
import { getSql } from '../db.js'
import {
  getFood,
  insertEntryWithId,
  listEntriesByMealGroup,
  listFoods,
  listRecentFoods,
  listRecipeFoods,
} from './queries.js'
import {
  getLabelJobRecord,
  listOutstandingLabelJobs,
  recordLabelJobCommitted,
  recordLabelJobCreated,
  recordLabelJobStatus,
} from './label-jobs.js'

const MEAL_PHOTO_SERVER_MAX_BYTES = 8 * 1024 * 1024
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
}> {
  const { files } = await parseMultipart(req, MEAL_PHOTO_SERVER_MAX_BYTES)
  const file = files.image
  if (!file || file.data.length === 0) {
    throw new HttpError(400, mealFailureMessage('MISSING_IMAGE'))
  }
  if (file.data.length > MEAL_PHOTO_SERVER_MAX_BYTES) {
    throw new HttpError(413, mealFailureMessage('UPLOAD_TOO_LARGE'))
  }
  if (isJpeg(file.data)) {
    return {
      bytes: file.data,
      filename: /\.jpe?g$/i.test(file.filename) ? file.filename : 'meal-photo.jpg',
      mimeType: 'image/jpeg',
    }
  }
  if (isPng(file.data)) {
    return {
      bytes: file.data,
      filename: /\.png$/i.test(file.filename) ? file.filename : 'meal-photo.png',
      mimeType: 'image/png',
    }
  }
  throw new HttpError(400, mealFailureMessage('UNSUPPORTED_IMAGE'))
}

async function catalogContext() {
  const [foods, recents, recipes] = await Promise.all([
    listFoods(null, 400),
    listRecentFoods(NUTRITION_CONFIG.recentsLimit),
    listRecipeFoods(NUTRITION_CONFIG.recipesLimit),
  ])
  return { foods, recents, recipes }
}

function matchingPayload(candidate: MealPhotoCandidate, foods: NutritionFood[], recents: NutritionFood[], recipes: NutritionFood[]) {
  const recentIds = recents.map((food) => food.id)
  const matches: NutritionMealJobResponse['matches'] = {}
  const used = new Map<string, NutritionFood>()
  for (const component of candidate.components) {
    const ranked = matchMealComponent(component.proposedName, foods, { recentIds })
    matches[component.id] = ranked.map((item) => {
      used.set(item.food.id, item.food)
      return {
        foodId: item.food.id,
        name: item.food.name,
        brand: item.food.brand,
        catalogKind: item.food.catalogKind,
        score: item.score,
        reason: item.reason,
      }
    })
  }
  const recipeCandidates = recipeCandidatesForComponents(
    recipes,
    candidate.components.map((component) => component.proposedName),
  )
  for (const recipe of recipeCandidates) {
    used.set(recipe.id, recipe)
  }
  const hiddenFatFoods = foods.filter((food) => looksLikeHiddenFat(food.name)).slice(0, 8)
  for (const food of hiddenFatFoods) {
    used.set(food.id, food)
  }
  return {
    foods: [...used.values()],
    matches,
    recipeCandidates: recipeCandidates.map((food) => ({
      id: food.id,
      name: food.name,
      catalogKind: food.catalogKind,
    })),
    hiddenFatFoods: hiddenFatFoods.map((food) => ({
      id: food.id,
      name: food.name,
      servingUnit: food.servingUnit,
    })),
  }
}

function asMealResponse(input: {
  jobId: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  elapsedMs?: number | null
  imageAvailable?: boolean
  candidate: MealPhotoCandidate | null
  foods?: NutritionFood[]
  matches?: NutritionMealJobResponse['matches']
  recipeCandidates?: NutritionMealJobResponse['recipeCandidates']
  hiddenFatFoods?: NutritionMealJobResponse['hiddenFatFoods']
  failure?: { code: string; message: string } | null
}): NutritionMealJobResponse {
  return {
    job: {
      id: input.jobId,
      status: input.status,
      elapsedMs: input.elapsedMs ?? null,
      imageAvailable: input.imageAvailable ?? false,
    },
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
  const homeAi = client ?? (await getHomeAiClient())
  for (const job of jobs) {
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
  let homeAi: HomeAiClient
  try {
    homeAi = client ?? (await getHomeAiClient())
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 503) {
      throw new HttpError(502, mealFailureMessage('HOME_AI_UNAVAILABLE'))
    }
    throw error
  }
  const job = await homeAi.createNutritionMealJob(photo)
  await recordLabelJobCreated({
    jobId: job.id,
    filename: photo.filename,
    captureKind: NUTRITION_MEAL_CAPTURE_KIND,
  })
  return { job: { id: job.id, status: 'queued' as const } }
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
  let homeAi: HomeAiClient | null = client ?? null
  if (!homeAi) {
    try {
      homeAi = await getHomeAiClient()
    } catch {
      homeAi = null
    }
  }

  async function withCatalog(candidate: MealPhotoCandidate, job: NutritionMealJobResponse['job']) {
    const { foods, recents, recipes } = await catalogContext()
    const matched = matchingPayload(candidate, foods, recents, recipes)
    return asMealResponse({
      jobId: job.id,
      status: job.status,
      elapsedMs: job.elapsedMs,
      imageAvailable: job.imageAvailable,
      candidate,
      ...matched,
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
          candidate: live.candidate,
        })
      }
      return withCatalog(live.candidate, {
        id: live.id,
        status: live.status,
        elapsedMs: live.elapsedMs,
        imageAvailable: live.imageAvailable,
      })
    } catch (error) {
      if (stored?.candidate && (stored.status === 'completed' || stored.status === 'committed')) {
        return withCatalog(sanitizeMealCandidate(stored.candidate), {
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
      failure: {
        code: 'PIPELINE_FAILED',
        message: stored.failureMessage ?? mealFailureMessage('PIPELINE_FAILED'),
      },
    })
  }
  if (stored?.candidate) {
    return withCatalog(sanitizeMealCandidate(stored.candidate), {
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
    })
  }
  throw new HttpError(404, mealFailureMessage('JOB_NOT_FOUND'))
}

export async function getNutritionMealImage(jobId: string, client?: HomeAiClient) {
  if (!isHomeAiJobId(jobId)) {
    throw new HttpError(400, mealFailureMessage('INVALID_JOB_ID'))
  }
  const homeAi = client ?? (await getHomeAiClient())
  return homeAi.getNutritionMealImage(jobId)
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
    'photo_ai',
    'Reviewed from meal photo.',
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
  const mealGroupId = randomUUID()

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
