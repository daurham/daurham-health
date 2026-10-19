import { createHash, randomUUID } from 'node:crypto'
import { MEAL_PHOTO_SET_MAX_COUNT, MEAL_PHOTO_SET_SERVER_MAX_BYTES } from '../../src/domain/nutrition/meal-photos.js'
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
  mapEntryRow,
} from './queries.js'
import { NUTRITION_USER_CONTEXT_MAX, NutritionInterpretError, normalizeUserContext, parseNutritionProvider } from '../../src/domain/nutrition/interpret.js'
import { parseMealClarificationAnswers, resolveMealClarificationContext } from '../../src/domain/nutrition/meal-clarifications.js'
import { advanceGeminiCapture, interpretErrorToHttp } from './gemini-jobs.js'
import {
  findCommittedLabelEntry,
  getLabelJobRecord,
  type NutritionCaptureJobRecord,
  listOutstandingLabelJobs,
  recordLabelJobCreated,
  recordLabelJobStatus,
  requeueCaptureJob,
  dismissCaptureJob,
} from './label-jobs.js'
import {
  getMealCaptureImage,
  listMealCaptureImages,
  mealCaptureImageCount,
  mealImageSha256,
  persistMealCapture,
  type MealCapturePhoto,
} from './meal-images.js'
const JPEG_MAGIC = [0xff, 0xd8]
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

export const CLAIM_MEAL_GROUP_SQL = `INSERT INTO source_record_links (
           id, source_id, import_job_id, external_id, external_fingerprint, entity_type, entity_id, source_payload
         ) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7::jsonb)
         ON CONFLICT (source_id, external_fingerprint) DO NOTHING
         RETURNING entity_id`


/**
 * First-time Meal Photo logging must share a single atomic commit boundary
 * with Pantry-only approval. The row lock serializes the two paths; source
 * links and one-or-many entries exist only if this request wins first.
 * Legacy food-description logging intentionally stays on its existing path.
 */
export const ATOMIC_MEAL_PHOTO_LOG_SQL = `WITH eligible_capture AS MATERIALIZED (
  SELECT home_ai_job_id
  FROM nutrition_capture_jobs
  WHERE home_ai_job_id = $1 AND capture_kind = 'meal_photo' AND status = 'completed'
  FOR UPDATE
), claimed_link AS (
  INSERT INTO source_record_links (
    id, source_id, import_job_id, external_id, external_fingerprint,
    entity_type, entity_id, source_payload
  )
  SELECT $3::uuid, $2::uuid, NULL, $1, $4, $5, $6::uuid, $7::jsonb
  FROM eligible_capture
  ON CONFLICT (source_id, external_fingerprint) DO NOTHING
  RETURNING entity_id
), created_entries AS (
  INSERT INTO nutrition_entries (
    id, log_date, consumed_at, timezone, meal, food_id, food_name, brand,
    serving_quantity, serving_unit, grams, calories, protein, carbs, fat,
    fiber, sodium, source_kind, notes, meal_group_id
  )
  SELECT row.id, row.log_date, row.consumed_at, row.timezone, row.meal,
         row.food_id, row.food_name, row.brand, row.serving_quantity,
         row.serving_unit, row.grams, row.calories, row.protein, row.carbs,
         row.fat, row.fiber, row.sodium, row.source_kind, row.notes,
         row.meal_group_id
  FROM jsonb_to_recordset($8::jsonb) AS row (
    id uuid, log_date date, consumed_at timestamptz, timezone text,
    meal text, food_id uuid, food_name text, brand text,
    serving_quantity numeric, serving_unit text, grams numeric,
    calories numeric, protein numeric, carbs numeric, fat numeric,
    fiber numeric, sodium numeric, source_kind text, notes text,
    meal_group_id uuid
  )
  JOIN claimed_link ON true
  RETURNING *
), finalized_capture AS (
  UPDATE nutrition_capture_jobs
  SET status = 'committed', food_id = $9::uuid, entry_id = $10::uuid,
      failure_message = NULL, committed_at = now(), updated_at = now()
  WHERE home_ai_job_id = $1 AND capture_kind = 'meal_photo'
    AND status = 'completed'
    AND EXISTS (SELECT 1 FROM created_entries)
  RETURNING home_ai_job_id
)
SELECT entry.* FROM created_entries entry JOIN finalized_capture ON true`

const ATOMIC_MEAL_ENTRY_KEYS = [
  'id', 'log_date', 'consumed_at', 'timezone', 'meal', 'food_id',
  'food_name', 'brand', 'serving_quantity', 'serving_unit', 'grams',
  'calories', 'protein', 'carbs', 'fat', 'fiber', 'sodium',
  'source_kind', 'notes', 'meal_group_id',
] as const

function atomicMealEntryJson(values: unknown[][]): string {
  return JSON.stringify(values.map(value =>
    Object.fromEntries(ATOMIC_MEAL_ENTRY_KEYS.map((key, index) => [key, value[index] ?? null])),
  ))
}

async function commitPhotoEntriesAtomic(input: {
  jobId: string
  entityType: string
  entityId: string
  payload: Record<string, unknown>
  values: unknown[][]
}): Promise<NutritionEntry[]> {
  const sql = await getSql()
  const sourceId = await mealPhotoSourceId()
  const first = input.values[0]
  if (!first) throw new HttpError(400, 'Include at least one reviewed food')
  const rows = await sql.query(ATOMIC_MEAL_PHOTO_LOG_SQL, [
    input.jobId, sourceId, randomUUID(), nutritionMealJobFingerprint(input.jobId),
    input.entityType, input.entityId, JSON.stringify(input.payload),
    atomicMealEntryJson(input.values), first[5] ?? null, first[0],
  ]) as Array<Record<string, unknown>>
  const order = new Map(input.values.map((value, index) => [String(value[0]), index]))
  return rows.map(mapEntryRow).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
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

export type ParsedMealPhotoUpload = {
  photos: MealCapturePhoto[]
  userContext: string | null
  provider: 'gemini' | 'home_ai'
}

export function parseMealPhotoUpload(input: {
  files: Record<string, { data: Uint8Array; filename: string }>
  fields: Record<string, string | undefined>
}): ParsedMealPhotoUpload {
  const numbered = Object.keys(input.files)
    .map((name) => {
      const match = /^image(\d+)$/.exec(name)
      return match ? Number(match[1]) : null
    })
    .filter((index): index is number => index != null)
    .sort((left, right) => left - right)
  const legacy = input.files.image
  if (legacy && numbered.length > 0) {
    throw new HttpError(400, mealFailureMessage('MIXED_IMAGE_FIELDS'), undefined, 'MIXED_IMAGE_FIELDS')
  }
  const selected = legacy
    ? [{ index: 0, file: legacy }]
    : numbered.map((index) => ({ index, file: input.files[`image${index}`]! }))
  if (selected.length === 0) {
    throw new HttpError(400, mealFailureMessage('MISSING_IMAGE'), undefined, 'MISSING_IMAGE')
  }
  if (!legacy) {
    if (numbered[0] !== 0 || numbered.some((index, offset) => index !== offset)) {
      throw new HttpError(400, mealFailureMessage('IMAGE_GAP'), undefined, 'IMAGE_GAP')
    }
  }
  if (selected.length > MEAL_PHOTO_SET_MAX_COUNT) {
    throw new HttpError(400, mealFailureMessage('TOO_MANY_PHOTOS'), undefined, 'TOO_MANY_PHOTOS')
  }
  const photos: MealCapturePhoto[] = []
  const seen = new Set<string>()
  for (const item of selected) {
    const photo = validatedMealPhoto(item.file.data, item.file.filename)
    if (seen.has(photo.sha256)) {
      throw new HttpError(400, mealFailureMessage('DUPLICATE_IMAGE'), undefined, 'DUPLICATE_IMAGE')
    }
    seen.add(photo.sha256)
    photos.push(photo)
  }
  let userContext: string | null
  try {
    userContext = normalizeUserContext(input.fields.userContext)
  } catch (error) {
    if (error instanceof NutritionInterpretError) {
      throw interpretErrorToHttp(error, 'meal')
    }
    throw error
  }
  const provider = parseNutritionProvider(input.fields.provider)
  if (provider === 'home_ai' && photos.length !== 1) {
    throw new HttpError(400, mealFailureMessage('MULTI_PHOTO_UNSUPPORTED'), undefined, 'MULTI_PHOTO_UNSUPPORTED')
  }
  return { photos, userContext, provider }
}

function validatedMealPhoto(bytes: Uint8Array, filename: string): MealCapturePhoto {
  if (bytes.length === 0) {
    throw new HttpError(400, mealFailureMessage('MISSING_IMAGE'), undefined, 'MISSING_IMAGE')
  }
  if (isJpeg(bytes)) {
    return {
      bytes,
      filename: /\.jpe?g$/i.test(filename) ? filename : 'meal-photo.jpg',
      mimeType: 'image/jpeg',
      sha256: mealImageSha256(bytes),
    }
  }
  if (isPng(bytes)) {
    return {
      bytes,
      filename: /\.png$/i.test(filename) ? filename : 'meal-photo.png',
      mimeType: 'image/png',
      sha256: mealImageSha256(bytes),
    }
  }
  throw new HttpError(400, mealFailureMessage('UNSUPPORTED_IMAGE'), undefined, 'UNSUPPORTED_IMAGE')
}

export async function readMealPhotoForm(req: ApiRequest): Promise<ParsedMealPhotoUpload> {
  const { files, fields } = await parseMultipart(req, MEAL_PHOTO_SET_SERVER_MAX_BYTES)
  return parseMealPhotoUpload({ files, fields })
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
  imageCount?: number
  provider?: 'gemini' | 'home_ai'
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
      imageCount: input.imageCount ?? (input.imageAvailable ? 1 : 0),
      provider: input.provider,
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
    const only = photo.photos[0]
    if (!only) {
      throw new HttpError(400, mealFailureMessage('MISSING_IMAGE'), undefined, 'MISSING_IMAGE')
    }
    return createHomeAiMealJob(
      {
        bytes: only.bytes,
        filename: only.filename ?? 'meal-photo.jpg',
        mimeType: only.mimeType,
        userContext: photo.userContext,
      },
      client,
    )
  }
  return createGeminiMealJob(photo)
}

async function createGeminiMealJob(photo: ParsedMealPhotoUpload) {
  const jobId = randomUUID()
  await persistMealCapture({
    jobId,
    filename: photo.photos[0]?.filename ?? null,
    userContext: photo.userContext,
    provider: 'gemini',
    photos: photo.photos,
  })
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

function clarificationHttpError(code: string, status: number): HttpError {
  return new HttpError(status, mealFailureMessage(code), undefined, code)
}

export async function reanalyzeNutritionMeal(
  jobId: string,
  input: { userContext: string | null; provider: 'gemini' | 'home_ai'; clarificationAnswers?: unknown },
  client?: HomeAiClient,
) {
  const parsedAnswers = parseMealClarificationAnswers(input.clarificationAnswers)
  if (!parsedAnswers.ok) {
    throw clarificationHttpError(parsedAnswers.failure.code, parsedAnswers.failure.status)
  }
  if (parsedAnswers.answers.length > 0 && input.provider === 'home_ai') {
    throw clarificationHttpError('CLARIFICATION_PROVIDER_UNSUPPORTED', 400)
  }
  const stored = await getLabelJobRecord(jobId)
  if (!stored || stored.captureKind !== NUTRITION_MEAL_CAPTURE_KIND) {
    throw new HttpError(404, mealFailureMessage('JOB_NOT_FOUND'), undefined, 'JOB_NOT_FOUND')
  }
  if (stored.status === 'committed') {
    throw new HttpError(409, 'That meal is already saved.')
  }
  if (input.provider === 'home_ai') {
    const images = await listMealCaptureImages(jobId)
    if (images.length > 1) {
      throw new HttpError(400, mealFailureMessage('MULTI_PHOTO_UNSUPPORTED'), undefined, 'MULTI_PHOTO_UNSUPPORTED')
    }
    const image = images[0]
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
  if (parsedAnswers.answers.length === 0) {
    const queued = await requeueCaptureJob({ jobId, userContext: input.userContext })
    if (!queued) {
      throw new HttpError(404, mealFailureMessage('JOB_NOT_FOUND'), undefined, 'JOB_NOT_FOUND')
    }
    return { job: { id: jobId, status: 'queued' as const } }
  }
  const resolved = resolveMealClarificationContext({
    provider: 'gemini',
    storedUserContext: stored.userContext,
    clarifications: sanitizeMealEstimate(stored.candidate ?? {}).clarifications,
    answers: parsedAnswers.answers,
    contextMax: NUTRITION_USER_CONTEXT_MAX,
  })
  if (!resolved.ok) {
    throw clarificationHttpError(resolved.failure.code, resolved.failure.status)
  }
  if (resolved.mode !== 'refine') {
    throw clarificationHttpError('CLARIFICATION_ANSWER', 400)
  }
  const queued = await requeueCaptureJob({ jobId, userContext: resolved.userContext })
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
  const imageCount = await mealCaptureImageCount(record.id)
  const imageAvailable = imageCount > 0
  const failureCode = record.interpretation.failureCode ?? 'PIPELINE_FAILED'
  if (record.status === 'failed') {
    return asMealResponse({
      jobId: record.id,
      status: 'failed',
      elapsedMs: record.interpretation.latencyMs ?? null,
      imageAvailable,
      imageCount,
      provider: record.provider === 'gemini' || record.provider === 'home_ai' ? record.provider : undefined,
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
        imageAvailable,
        imageCount,
        provider: record.provider === 'gemini' || record.provider === 'home_ai' ? record.provider : undefined,
        candidate: null,
        userContext: record.userContext,
        failure: { code: 'GEMINI_SEMANTIC', message: mealFailureMessage('GEMINI_SEMANTIC') },
      })
    }
    return asMealResponse({
      jobId: record.id,
      status: 'completed',
      elapsedMs: record.interpretation.latencyMs ?? null,
      imageAvailable,
      imageCount,
      provider: record.provider === 'gemini' || record.provider === 'home_ai' ? record.provider : undefined,
      candidate,
      userContext: record.userContext,
    })
  }
  const status = record.status === 'queued' || record.status === 'processing' ? record.status : 'completed'
  return asMealResponse({
    jobId: record.id,
    status,
    elapsedMs: record.interpretation.latencyMs ?? null,
    imageAvailable,
    imageCount,
    provider: record.provider === 'gemini' || record.provider === 'home_ai' ? record.provider : undefined,
    candidate: null,
    userContext: record.userContext,
  })
}

export async function getNutritionMealImage(jobId: string, client?: HomeAiClient, position = 0) {
  if (!isHomeAiJobId(jobId)) {
    throw new HttpError(400, mealFailureMessage('INVALID_JOB_ID'))
  }
  if (!Number.isInteger(position) || position < 0 || position >= MEAL_PHOTO_SET_MAX_COUNT) {
    throw new HttpError(400, 'That meal photo view is invalid.', undefined, 'INVALID_IMAGE')
  }
  const stored = await getMealCaptureImage(jobId, position)
  if (stored) {
    return { bytes: stored.bytes, mimeType: stored.mimeType }
  }
  if (position !== 0) {
    return null
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

function loggedEntryValues(input: {
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
}): unknown[] {
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
  return [
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
    null,
    input.sourceKind ?? 'photo_ai',
    input.notes ?? 'Reviewed from meal photo.',
    input.mealGroupId,
  ]
}

async function insertLoggedEntry(input: Parameters<typeof loggedEntryValues>[0]): Promise<NutritionEntry> {
  return insertEntryWithId(loggedEntryValues(input))
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
    // Pantry-only approval is a terminal outcome for this capture.
    // It must not be repurposed to log a meal from a stale review sheet.
    const stored = await getLabelJobRecord(jobId)
    if (!stored || stored.captureKind !== NUTRITION_MEAL_CAPTURE_KIND) {
      throw new HttpError(404, mealFailureMessage('JOB_NOT_FOUND'), undefined, 'JOB_NOT_FOUND')
    }
    if (stored.status === 'committed') {
      throw new HttpError(409, 'That meal capture has already been saved to Pantry.')
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
  if (descriptionFingerprint && !jobId) {
    const existingGroup = await findGroupByFingerprint(await sourceIdByKey('health_app'), descriptionFingerprint)
    if (existingGroup) {
      const entries = await listEntriesByMealGroup(existingGroup)
      if (entries.length > 0) {
        return { entries, mealGroupId: existingGroup }
      }
    }
  }
  const mealGroupId = randomUUID()

  if (descriptionFingerprint && !jobId) {
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


  const entries: NutritionEntry[] = []
  const prepared: unknown[][] = []
  const save = async (details: Parameters<typeof loggedEntryValues>[0]) => {
    if (jobId) prepared.push(loggedEntryValues(details))
    else entries.push(await insertLoggedEntry(details))
  }
  if (input.recipeFoodId) {
    const recipe = await getFood(input.recipeFoodId)
    if (!recipe) throw new HttpError(404, 'Recipe not found')
    await save({
      id: randomUUID(), logDate: resolved.logDate, timezone, meal, food: recipe,
      quantity: input.recipeQuantity && input.recipeQuantity > 0 ? input.recipeQuantity : 1,
      unit: recipe.servingUnit, grams: null, mealGroupId,
    })
  }
  for (const component of input.components) {
    if (!component.included || !component.foodId) continue
    if (input.recipeFoodId && component.foodId === input.recipeFoodId) continue
    const food = await getFood(component.foodId)
    if (!food) throw new HttpError(404, `Food not found for ${component.proposedName}`)
    const quantity = component.quantity != null && component.quantity > 0 ? component.quantity : 1
    await save({
      id: randomUUID(), logDate: resolved.logDate, timezone, meal, food,
      quantity, unit: component.unit || food.servingUnit, grams: component.grams,
      mealGroupId, sourceKind: described ? 'manual' : 'photo_ai',
      notes: described ? 'Reviewed from a food description.' : 'Reviewed from meal photo.',
    })
  }
  if (entries.length === 0 && prepared.length === 0) {
    throw new HttpError(400, 'Include at least one food, or use a saved recipe.')
  }
  if (jobId) {
    const committed = await commitPhotoEntriesAtomic({
      jobId, entityType: NUTRITION_MEAL_GROUP_ENTITY, entityId: mealGroupId,
      payload: { captureKind: NUTRITION_MEAL_CAPTURE_KIND, reviewed: true, pipeline: 'nutrition-meal-v1' },
      values: prepared,
    })
    if (committed.length === prepared.length) return { entries: committed, mealGroupId }
    const racedGroup = await findMealGroupByFingerprint(jobId)
    if (racedGroup) {
      const racedEntries = await listEntriesByMealGroup(racedGroup)
      if (racedEntries.length > 0) return { entries: racedEntries, mealGroupId: racedGroup }
    }
    throw new HttpError(409, 'That meal capture has already been finalized elsewhere')
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
    sodiumMg: input.sodiumMg,
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
      // Saved-to-Pantry photo is terminal; do not create a second Nutrition
      // entry or overwrite its immutable capture association.
      throw new HttpError(409, 'That meal capture has already been finalized.')
    }
    const estimate = stored.candidate ? tryMealEstimate(stored.candidate) : null
    if (estimate) {
      baseline = {
        calories: estimate.calories,
        proteinGrams: estimate.proteinGrams,
        carbsGrams: estimate.carbsGrams,
        fatGrams: estimate.fatGrams,
        fiberGrams: estimate.fiberGrams,
        sodiumMg: estimate.sodiumMg,
      }
      model = estimate.model ?? stored.interpretation.model ?? null
    }
  }

  const resolved = resolveEntryLogDate({
    logDate: input.logDate,
    timezone: input.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
  })
  const entryId = randomUUID()
  const values: unknown[] = [
    entryId, resolved.logDate, null,
    input.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
    input.meal ?? null, null, input.name.trim(), null,
    1, 'meal', null, reviewed.calories, reviewed.proteinGrams,
    reviewed.carbsGrams, reviewed.fatGrams, reviewed.fiberGrams,
    reviewed.sodiumMg, 'photo_ai', 'Reviewed from meal photo estimate.', null,
  ]
  if (jobId) {
    const committed = await commitPhotoEntriesAtomic({
      jobId, entityType: 'nutrition_entry', entityId: entryId,
      payload: {
        source: 'meal_photo_ai', provider: 'gemini', model,
        estimated: true, reviewed: true,
        userAdjusted: mealEstimateUserAdjusted(baseline, reviewed),
        aiEstimate: baseline, reviewedValues: reviewed,
        portionScale: input.portionScale ?? 1,
      },
      values: [values],
    })
    if (committed.length === 1) return { entries: committed }
    // A concurrent successful retry may have finalized first. Recover its
    // canonical entry, never create a second entry or overwrite Pantry.
    const raced = await findCommittedLabelEntry(jobId)
    const existing = raced ? await getEntry(raced.entryId) : null
    if (existing) return { entries: [existing] }
    throw new HttpError(409, 'That meal capture has already been finalized elsewhere')
  }
  const entry = await insertEntryWithId(values)
  return { entries: [entry] }
}

