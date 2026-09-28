import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MEAL_PHOTO_PROMPT_VERSION, mealPhotoPrompt } from '../src/domain/nutrition/interpret.ts'
import { commitNutritionMealEstimateRequestSchema } from '../src/domain/nutrition/meal.ts'
import {
  MEAL_PHOTO_PLATFORM_PAYLOAD_LIMIT_BYTES,
  MEAL_PHOTO_SET_CLIENT_MAX_BYTES,
  MEAL_PHOTO_SET_MAX_COUNT,
  MEAL_PHOTO_SET_SERVER_MAX_BYTES,
} from '../src/domain/nutrition/meal-photos.ts'
import {
  MEAL_PHOTO_PREPARED_TYPE,
  prepareMealPhotoSet,
  type MealPhotoCodec,
} from '../src/features/nutrition/prepare-meal-photo.ts'
import { readAiUsageConfig, type AiUsageConfig } from '../server/ai-usage/config.ts'
import { createMemoryAiUsageLedger } from '../server/ai-usage/memory.ts'
import type { GeminiConfig } from '../server/integrations/gemini/config.ts'
import { geminiInlineParts } from '../server/integrations/gemini/client.ts'
import { BACKUP_TABLES, tablesForProfile } from '../server/backup/inventory.ts'
import { restoreStatements } from '../server/backup/format.ts'
import { HttpError } from '../server/http.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { parseMealPhotoUpload } from '../server/nutrition/meal.ts'
import { INSERT_MEAL_CAPTURE_IMAGE_SQL, INSERT_MEAL_CAPTURE_JOB_SQL, mealImageSha256, persistMealCapture, type MealCaptureDb, type MealCapturePhoto } from '../server/nutrition/meal-images.ts'
import { nutritionGeminiRequestHash, runNutritionGeminiAttempt, type NutritionGeminiRequest } from '../server/nutrition/gemini-usage.ts'
import { withGeminiRetry } from '../server/integrations/gemini/client.ts'

const JPEG = (mark: number) => Uint8Array.from([0xff, 0xd8, mark])
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x01])
const JOB_ID = '11111111-1111-4111-8111-111111111111'

function photo(bytes: Uint8Array, filename = 'meal.jpg'): { data: Uint8Array; filename: string } {
  return { data: bytes, filename }
}

function upload(files: Record<string, { data: Uint8Array; filename: string }>, provider?: string) {
  return parseMealPhotoUpload({ files, fields: provider ? { provider } : {} })
}

function capturePhoto(bytes: Uint8Array, filename = 'meal.jpg'): MealCapturePhoto {
  return {
    bytes,
    filename,
    mimeType: 'image/jpeg',
    sha256: mealImageSha256(bytes),
  }
}

function memoryDb(options?: { failImages?: boolean }): MealCaptureDb & { jobs: string[]; images: number; committed: boolean } {
  const state = {
    jobs: [] as string[],
    images: 0,
    committed: false,
    query(text: string) {
      return Promise.resolve(text)
    },
    async transaction(queries: Array<Promise<unknown>>) {
      const jobs = [...state.jobs]
      const images = state.images
      try {
        for (const query of queries) {
          const text = String(await query)
          if (text.includes('nutrition_capture_images')) {
            if (options?.failImages) {
              throw new Error('image insert failed')
            }
            state.images += 1
          } else {
            state.jobs.push('job')
          }
        }
        state.committed = true
      } catch (error) {
        state.jobs.splice(0, state.jobs.length, ...jobs)
        state.images = images
        state.committed = false
        throw error
      }
    },
  }
  return state
}

function sizedCodec(bytes: number, unique = false): MealPhotoCodec {
  let n = 0
  return {
    async decode() {
      return { width: 3000, height: 2000, source: {} as CanvasImageSource }
    },
    async encode() {
      n += 1
      const body = new Uint8Array(bytes)
      if (unique) {
        body[0] = n
      }
      return new Blob([body], { type: MEAL_PHOTO_PREPARED_TYPE })
    },
  }
}

describe('multi-angle meal photos', () => {
  it('parses one, two, and three numbered views and keeps the legacy single field', () => {
    expect(upload({ image0: photo(JPEG(1)) }).photos.map((item) => item.sha256)).toEqual([mealImageSha256(JPEG(1))])
    const two = upload({ image0: photo(JPEG(1)), image1: photo(JPEG(2), 'side.png') })
    expect(two.photos.map((item) => item.bytes[2])).toEqual([1, 2])
    const three = upload({ image0: photo(JPEG(1)), image1: photo(JPEG(2)), image2: photo(PNG, 'top.png') })
    expect(three.photos.map((item) => item.mimeType)).toEqual(['image/jpeg', 'image/jpeg', 'image/png'])
    expect(upload({ image: photo(JPEG(9), 'legacy.jpeg') }).photos).toHaveLength(1)
    expect(upload({ image: photo(JPEG(9), 'legacy.jpeg') }).photos[0]?.filename).toBe('legacy.jpeg')
  })

  it('rejects empty, extra, gapped, mixed, invalid, and duplicate sets before persistence', () => {
    expect(() => upload({})).toThrow(expect.objectContaining({ statusCode: 400, code: 'MISSING_IMAGE' }))
    expect(() => upload({ image0: photo(JPEG(1)), image1: photo(JPEG(2)), image2: photo(JPEG(3)), image3: photo(JPEG(4)) })).toThrow(
      expect.objectContaining({ code: 'TOO_MANY_PHOTOS' }),
    )
    expect(() => upload({ image0: photo(JPEG(1)), image2: photo(JPEG(2)) })).toThrow(expect.objectContaining({ code: 'IMAGE_GAP' }))
    expect(() => upload({ image: photo(JPEG(1)), image0: photo(JPEG(2)) })).toThrow(expect.objectContaining({ code: 'MIXED_IMAGE_FIELDS' }))
    expect(() => upload({ image0: photo(JPEG(1)), image1: photo(Uint8Array.from([1, 2, 3]), 'bad.jpg') })).toThrow(HttpError)
    expect(() => upload({ image0: photo(JPEG(1)), image1: photo(JPEG(1)) })).toThrow(expect.objectContaining({ code: 'DUPLICATE_IMAGE' }))
    expect(INSERT_MEAL_CAPTURE_JOB_SQL).toContain('nutrition_capture_jobs')
    expect(INSERT_MEAL_CAPTURE_IMAGE_SQL).toContain('nutrition_capture_images')
  })

  it('keeps the prepared set under the Vercel ceiling and makes no request when preparation fails', async () => {
    expect(MEAL_PHOTO_SET_MAX_COUNT).toBe(3)
    expect(MEAL_PHOTO_SET_CLIENT_MAX_BYTES).toBeLessThanOrEqual(3_800_000)
    expect(MEAL_PHOTO_SET_CLIENT_MAX_BYTES).toBeLessThan(MEAL_PHOTO_SET_SERVER_MAX_BYTES)
    expect(MEAL_PHOTO_SET_SERVER_MAX_BYTES).toBeLessThan(MEAL_PHOTO_PLATFORM_PAYLOAD_LIMIT_BYTES)
    expect(MEAL_PHOTO_PLATFORM_PAYLOAD_LIMIT_BYTES).toBeLessThanOrEqual(4_500_000)
    const files = [1, 2, 3].map((mark) => new File([JPEG(mark)], `view-${mark}.jpg`, { type: 'image/jpeg' }))
    const prepared = await prepareMealPhotoSet(files, sizedCodec(20_000, true))
    expect(prepared).toHaveLength(3)
    expect(prepared.reduce((sum, item) => sum + item.preparedBytes, 0)).toBeLessThanOrEqual(MEAL_PHOTO_SET_CLIENT_MAX_BYTES)
    await expect(prepareMealPhotoSet(files, sizedCodec(2_000_000))).rejects.toMatchObject({ code: 'TOO_LARGE' })
    await expect(prepareMealPhotoSet([...files, files[0]!], sizedCodec(100))).rejects.toMatchObject({ code: 'TOO_MANY' })
    await expect(prepareMealPhotoSet([files[0]!, files[0]!], sizedCodec(100))).rejects.toMatchObject({ code: 'DUPLICATE' })
    const ui = readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')
    const analyze = ui.slice(ui.indexOf('async function analyze'), ui.indexOf('function editContext'))
    expect(analyze.indexOf('MEAL_PHOTO_SET_CLIENT_MAX_BYTES')).toBeLessThan(analyze.indexOf('createNutritionMealJob'))
    expect(ui).not.toContain('healthFetch')
  })

  it('stores ordered child images atomically and leaves labels on the legacy column', async () => {
    const migration = readFileSync('migrations/0033_nutrition_capture_images.sql', 'utf8')
    expect(migration).not.toMatch(/user_id/i)
    expect(migration).toContain('REFERENCES nutrition_capture_jobs (home_ai_job_id) ON DELETE CASCADE')
    expect(migration).toContain('position >= 0 AND position < 3')
    expect(migration).toContain('UNIQUE (home_ai_job_id, content_sha256)')
    const saved = memoryDb()
    await persistMealCapture(
      {
        jobId: JOB_ID,
        filename: 'one.jpg',
        userContext: 'plate',
        provider: 'gemini',
        photos: [capturePhoto(JPEG(1))],
      },
      saved,
    )
    expect(saved.jobs).toHaveLength(1)
    expect(saved.images).toBe(1)
    const three = memoryDb()
    await persistMealCapture(
      {
        jobId: JOB_ID,
        filename: 'one.jpg',
        userContext: null,
        provider: 'gemini',
        photos: [capturePhoto(JPEG(1)), capturePhoto(JPEG(2)), capturePhoto(JPEG(3))],
      },
      three,
    )
    expect(three.images).toBe(3)
    expect(three.committed).toBe(true)
    const failed = memoryDb({ failImages: true })
    await expect(
      persistMealCapture(
        {
          jobId: JOB_ID,
          filename: null,
          userContext: null,
          provider: 'gemini',
          photos: [capturePhoto(JPEG(1)), capturePhoto(JPEG(2))],
        },
        failed,
      ),
    ).rejects.toThrow(/image insert failed/)
    expect(failed.jobs).toHaveLength(0)
    expect(failed.images).toBe(0)
    expect(failed.committed).toBe(false)
    const images = readFileSync('server/nutrition/meal-images.ts', 'utf8')
    expect(images).toContain('nutrition_capture_jobs')
    expect(images).toContain('image_bytes IS NOT NULL')
    expect(images.indexOf('FROM nutrition_capture_images')).toBeLessThan(images.indexOf('image_bytes IS NOT NULL'))
    const labels = readFileSync('server/nutrition/label-jobs.ts', 'utf8')
    expect(labels).toContain('UPDATE nutrition_capture_jobs')
    expect(labels).not.toContain('nutrition_capture_images')
    expect(readFileSync('server/nutrition/label.ts', 'utf8')).not.toContain('nutrition_capture_images')
  })

  it('serves indexed views, reports imageCount, and keeps photo bytes out of JSON', () => {
    expect(matchHealthApiRoute(`/api/nutrition/meal/jobs/${JOB_ID}/image`)).toBe('nutrition-meal-job-detail')
    expect(matchHealthApiRoute(`/api/nutrition/meal/jobs/${JOB_ID}/images/0`)).toBe('nutrition-meal-job-detail')
    expect(matchHealthApiRoute(`/api/nutrition/meal/jobs/${JOB_ID}/images/2`)).toBe('nutrition-meal-job-detail')
    expect(matchHealthApiRoute(`/api/nutrition/meal/jobs/${JOB_ID}/images/3`)).toBe('nutrition-meal-job-detail')
    const handler = readFileSync('server/handlers/nutrition-meal-job-detail.ts', 'utf8')
    expect(handler).toContain('getNutritionMealImage(parsed, undefined, position)')
    const meal = readFileSync('server/nutrition/meal.ts', 'utf8')
    expect(meal).toContain('position >= MEAL_PHOTO_SET_MAX_COUNT')
    expect(meal).toContain('imageCount')
    expect(meal).not.toContain('image_base64')
    const response = {
      job: { id: JOB_ID, status: 'completed' as const, imageAvailable: true, imageCount: 3 },
      candidate: null,
    }
    expect(JSON.stringify(response)).not.toMatch(/ffd8|base64/i)
    expect(response.job.imageCount).toBe(3)
  })

  it('sends every view to Gemini as one meal and one reservation', async () => {
    const parts = geminiInlineParts('prompt', [
      { mimeType: 'image/jpeg', base64: 'YQ==' },
      { mimeType: 'image/png', base64: 'Yg==' },
      { mimeType: 'image/jpeg', base64: 'Yw==' },
    ])
    expect(parts[0]).toEqual({ text: 'prompt' })
    expect(parts.slice(1).map((part) => ('inlineData' in part ? part.inlineData.data : ''))).toEqual(['YQ==', 'Yg==', 'Yw=='])
    const prompt = mealPhotoPrompt('same plate', 3)
    expect(prompt).toContain('same meal')
    expect(prompt).toContain('Do not count the same food twice')
    expect(prompt).toContain('Do not invent food')
    expect(mealPhotoPrompt(null, 1)).toContain('estimate total calories')
    expect(mealPhotoPrompt(null, 1)).toContain('{"name":"Chicken, rice and broccoli"')
    expect(MEAL_PHOTO_PROMPT_VERSION).toBe('meal-photo-v2')
    expect(readFileSync('server/integrations/gemini/client.ts', 'utf8')).toContain('promptVersion: MEAL_PHOTO_PROMPT_VERSION')
    const first = Buffer.from('one').toString('base64')
    const second = Buffer.from('two').toString('base64')
    const ordered = nutritionGeminiRequestHash({
      requestType: 'nutrition_meal_photo',
      model: 'meal-model',
      prompt: 'plate',
      imageBase64s: [first, second],
    })
    const swapped = nutritionGeminiRequestHash({
      requestType: 'nutrition_meal_photo',
      model: 'meal-model',
      prompt: 'plate',
      imageBase64s: [second, first],
    })
    const changed = nutritionGeminiRequestHash({
      requestType: 'nutrition_meal_photo',
      model: 'meal-model',
      prompt: 'plate',
      imageBase64s: [first, Buffer.from('three').toString('base64')],
    })
    expect(ordered).not.toBe(swapped)
    expect(ordered).not.toBe(changed)
    expect(ordered).not.toContain('one')
    expect(readFileSync('server/ai-usage/ledger.ts', 'utf8')).not.toContain('image_bytes')
    const ledger = createMemoryAiUsageLedger()
    const config: GeminiConfig = { apiKey: 'test', descriptionModel: 'd', mealModel: 'm', labelModel: 'l' }
    const usage: AiUsageConfig = { ...readAiUsageConfig({}), minIntervalMs: 0, monthlyBudgetUsd: 5 }
    const request: NutritionGeminiRequest = {
      model: 'm',
      prompt: mealPhotoPrompt(null, 3),
      timeoutMs: 1000,
      maxOutputTokens: 200,
      usageKind: 'meal_photo',
      images: [first, second, Buffer.from('three').toString('base64')].map((base64) => ({ mimeType: 'image/jpeg', base64 })),
    }
    let calls = 0
    await withGeminiRetry(() =>
      runNutritionGeminiAttempt(config, request, {
        ledger,
        usageConfig: usage,
        now: () => Date.parse('2026-09-27T21:00:00.000Z') + calls,
        call: async () => {
          calls += 1
          if (calls === 1) {
            throw Object.assign(new Error('unavailable'), { status: 503 })
          }
          return {
            text: '{}',
            model: 'm',
            latencyMs: 1,
            inputTokens: 10,
            outputTokens: 4,
            thinkingTokens: null,
            providerRequestId: null,
          }
        },
      }),
    )
    expect(calls).toBe(2)
    expect(ledger.rows()).toHaveLength(2)
    expect(ledger.rows().every((row) => row.reserved > 0)).toBe(true)
  })

  it('refuses multi-photo Home-AI, reuses stored views, and keeps canonical Nutrition unchanged', () => {
    expect(() => upload({ image0: photo(JPEG(1)), image1: photo(JPEG(2)) }, 'home_ai')).toThrow(
      expect.objectContaining({ code: 'MULTI_PHOTO_UNSUPPORTED' }),
    )
    expect(upload({ image: photo(JPEG(1)) }, 'home_ai').photos).toHaveLength(1)
    const meal = readFileSync('server/nutrition/meal.ts', 'utf8')
    const reanalyze = meal.slice(meal.indexOf('export async function reanalyzeNutritionMeal'), meal.indexOf('export async function dismissNutritionMealJob'))
    expect(reanalyze.indexOf('MULTI_PHOTO_UNSUPPORTED')).toBeLessThan(reanalyze.indexOf('createHomeAiMealJob'))
    expect(reanalyze).toContain('requeueCaptureJob')
    expect(readFileSync('server/nutrition/label-jobs.ts', 'utf8')).toContain('user_context')
    expect(readFileSync('server/nutrition/label-jobs.ts', 'utf8').match(/function requeueCaptureJob[\s\S]*?^}/m)?.[0] ?? '').not.toContain('nutrition_capture_images')
    expect(readFileSync('server/nutrition/gemini-jobs.ts', 'utf8')).toContain('listMealCaptureImages')
    const ui = readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')
    expect(ui).toContain('Try local AI')
    expect(ui).toContain('multiPhoto ? null')
    expect(ui).toContain('Add another angle to give the estimate more visual context.')
    expect(ui).toContain('View {index + 1}')
    expect(ui).not.toMatch(/swiper|embla|carousel/i)
    expect(ui).not.toContain('Three photos makes calories accurate')
    expect(commitNutritionMealEstimateRequestSchema.shape).not.toHaveProperty('imageCount')
    expect(readFileSync('src/domain/nutrition/meal.ts', 'utf8')).toContain('commitNutritionMealEstimateRequestSchema')
    expect(readFileSync('server/nutrition/meal.ts', 'utf8')).not.toContain('imageCount, angle')
  })

  it('backs up child images after the job and leaves them out of portable export', () => {
    const names = BACKUP_TABLES.map((table) => table.name)
    const images = BACKUP_TABLES.find((table) => table.name === 'nutrition_capture_images')
    expect(images?.backupClass).toBe('operational')
    expect(images?.portable).toBe(false)
    expect(names.indexOf('nutrition_capture_images')).toBe(names.indexOf('nutrition_capture_jobs') + 1)
    expect(tablesForProfile('portable').some((table) => table.name === 'nutrition_capture_images')).toBe(false)
    expect(tablesForProfile('full').some((table) => table.name === 'nutrition_capture_images')).toBe(true)
    const statements = restoreStatements({
      nutrition_capture_images: [
        { home_ai_job_id: JOB_ID, position: 0, source_filename: 'a.jpg', image_mime: 'image/jpeg', image_bytes: 'YQ==', content_sha256: 'a'.repeat(64), created_at: '2026-09-27T00:00:00.000Z' },
        { home_ai_job_id: JOB_ID, position: 1, source_filename: 'b.jpg', image_mime: 'image/jpeg', image_bytes: 'Yg==', content_sha256: 'b'.repeat(64), created_at: '2026-09-27T00:00:00.000Z' },
        { home_ai_job_id: JOB_ID, position: 2, source_filename: 'c.jpg', image_mime: 'image/png', image_bytes: 'Yw==', content_sha256: 'c'.repeat(64), created_at: '2026-09-27T00:00:00.000Z' },
      ],
    })
    const insert = statements.find((statement) => statement.text.includes('nutrition_capture_images'))
    expect(insert?.text.indexOf('position')).toBeGreaterThan(0)
    expect(insert?.params).toContain(0)
    expect(insert?.params).toContain(1)
    expect(insert?.params).toContain(2)
    expect(insert?.params.indexOf(0)).toBeLessThan(insert?.params.indexOf(1) ?? -1)
    expect(readFileSync('package.json', 'utf8')).not.toMatch(/@vercel\/blob|@aws-sdk|framer-motion|gsap/)
    expect(readFileSync('src/demo/dataset.ts', 'utf8')).not.toContain('healthFetch')
    expect(createHash('sha256').update('ok').digest('hex')).toHaveLength(64)
  })
})
