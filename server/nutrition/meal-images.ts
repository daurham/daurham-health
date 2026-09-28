import { createHash } from 'node:crypto'
import { MEAL_PHOTO_SET_MAX_COUNT } from '../../src/domain/nutrition/meal-photos.js'
import { isHomeAiJobId } from '../../src/domain/nutrition/meal.js'
import { formatDatabaseError, getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'

const TABLES_UNAVAILABLE = 'Nutrition tables are not available. Apply pending migrations.'

export type MealCapturePhoto = {
  bytes: Uint8Array
  filename: string | null
  mimeType: string
  sha256: string
}

export type StoredMealImage = MealCapturePhoto & {
  position: number
}

export type MealCaptureDb = {
  query: (text: string, params?: unknown[]) => Promise<unknown>
  transaction: (queries: Array<Promise<unknown>>) => Promise<unknown>
}

export const INSERT_MEAL_CAPTURE_JOB_SQL = `INSERT INTO nutrition_capture_jobs (
  home_ai_job_id, capture_kind, status, source_filename, provider, user_context
) VALUES ($1, 'meal_photo', 'queued', $2, $3, $4)`

export const INSERT_MEAL_CAPTURE_IMAGE_SQL = `INSERT INTO nutrition_capture_images (
  home_ai_job_id, position, source_filename, image_mime, image_bytes, content_sha256
) VALUES ($1, $2, $3, $4, decode($5, 'base64'), $6)`

export function mealImageSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function persistMealCapture(
  input: {
    jobId: string
    filename: string | null
    userContext: string | null
    provider: 'gemini'
    photos: MealCapturePhoto[]
  },
  sql?: MealCaptureDb,
): Promise<void> {
  if (!isHomeAiJobId(input.jobId)) {
    throw new HttpError(400, 'That analysis job id is invalid.')
  }
  if (input.photos.length < 1 || input.photos.length > MEAL_PHOTO_SET_MAX_COUNT) {
    throw new HttpError(400, 'A meal capture can include up to three photos.', undefined, 'TOO_MANY_PHOTOS')
  }
  const db = sql ?? ((await getSql()) as unknown as MealCaptureDb)
  await queryOrUnavailable(() =>
    db.transaction([
      db.query(INSERT_MEAL_CAPTURE_JOB_SQL, [input.jobId, input.filename, input.provider, input.userContext]),
      ...input.photos.map((photo, position) =>
        db.query(INSERT_MEAL_CAPTURE_IMAGE_SQL, [
          input.jobId,
          position,
          photo.filename,
          photo.mimeType,
          Buffer.from(photo.bytes).toString('base64'),
          photo.sha256,
        ]),
      ),
    ]),
  )
}

export async function listMealCaptureImages(jobId: string, sql?: Sql): Promise<StoredMealImage[]> {
  const db = sql ?? (await getSql())
  const rows = await queryOrUnavailable(() =>
    db.query(
      `SELECT position, source_filename, image_mime, encode(image_bytes, 'base64') AS image_base64, content_sha256
       FROM nutrition_capture_images
       WHERE home_ai_job_id = $1
       ORDER BY position`,
      [jobId],
    ),
  )
  const images = (rows as Array<Record<string, unknown>>).map(mapImageRow).filter((row): row is StoredMealImage => row != null)
  if (images.length > 0) {
    return images
  }
  const legacy = await queryOrUnavailable(() =>
    db.query(
      `SELECT image_mime, encode(image_bytes, 'base64') AS image_base64
       FROM nutrition_capture_jobs
       WHERE home_ai_job_id = $1 AND image_bytes IS NOT NULL`,
      [jobId],
    ),
  )
  const row = (legacy as Array<Record<string, unknown>>)[0]
  if (!row?.image_base64 || typeof row.image_base64 !== 'string') {
    return []
  }
  const bytes = Buffer.from(row.image_base64, 'base64')
  return [
    {
      position: 0,
      bytes,
      filename: null,
      mimeType: row.image_mime === 'image/png' ? 'image/png' : 'image/jpeg',
      sha256: mealImageSha256(bytes),
    },
  ]
}

export async function getMealCaptureImage(jobId: string, position: number, sql?: Sql): Promise<StoredMealImage | null> {
  if (position < 0 || position >= MEAL_PHOTO_SET_MAX_COUNT) {
    return null
  }
  const images = await listMealCaptureImages(jobId, sql)
  return images.find((image) => image.position === position) ?? null
}

export async function mealCaptureImageCount(jobId: string, sql?: Sql): Promise<number> {
  const db = sql ?? (await getSql())
  const rows = await queryOrUnavailable(() =>
    db.query(`SELECT COUNT(*)::int AS count FROM nutrition_capture_images WHERE home_ai_job_id = $1`, [jobId]),
  )
  const count = Number((rows as Array<{ count?: number }>)[0]?.count ?? 0)
  if (count > 0) {
    return count
  }
  const legacy = await queryOrUnavailable(() =>
    db.query(`SELECT (image_bytes IS NOT NULL) AS stored FROM nutrition_capture_jobs WHERE home_ai_job_id = $1`, [jobId]),
  )
  return (legacy as Array<{ stored?: boolean }>)[0]?.stored ? 1 : 0
}

function mapImageRow(row: Record<string, unknown>): StoredMealImage | null {
  if (typeof row.image_base64 !== 'string' || typeof row.content_sha256 !== 'string') {
    return null
  }
  const position = Number(row.position)
  return {
    position: Number.isInteger(position) ? position : 0,
    bytes: Buffer.from(row.image_base64, 'base64'),
    filename: typeof row.source_filename === 'string' ? row.source_filename : null,
    mimeType: row.image_mime === 'image/png' ? 'image/png' : 'image/jpeg',
    sha256: row.content_sha256,
  }
}

function asMissingRelation(error: unknown): boolean {
  return formatDatabaseError(error).includes('does not exist')
}

async function queryOrUnavailable<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (asMissingRelation(error)) {
      throw new HttpError(503, TABLES_UNAVAILABLE)
    }
    throw error
  }
}
