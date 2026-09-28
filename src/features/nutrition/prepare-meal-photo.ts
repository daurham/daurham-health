import {
  MEAL_PHOTO_SET_CLIENT_MAX_BYTES,
  MEAL_PHOTO_SET_FALLBACK_JPEG_QUALITY,
  MEAL_PHOTO_SET_JPEG_QUALITY,
  MEAL_PHOTO_SET_LONG_EDGE,
  MEAL_PHOTO_SET_MAX_COUNT,
  MEAL_PHOTO_SET_PER_PHOTO_MAX_BYTES,
  MEAL_PHOTO_PLATFORM_PAYLOAD_LIMIT_BYTES,
  MEAL_PHOTO_SET_SERVER_MAX_BYTES,
} from '@/domain/nutrition/meal-photos'
import {
  createBrowserImageCodec,
  isSupportedJpegPngInput,
  prepareImage,
  scaleToFitLongEdge,
  shouldBypassImagePrep,
  ImagePrepareError,
  type ImageCodec,
  type ImagePreparePolicy,
  type PreparedImage,
} from '@/lib/prepare-image'

// Meal photos are plates, not printed text. A shorter long-edge than labels (2800)
// and workouts (2400) is enough for food identity without extra upload weight.
export const MEAL_PHOTO_MAX_LONG_EDGE = 2000
export const MEAL_PHOTO_JPEG_QUALITY = 0.86
export const MEAL_PHOTO_FALLBACK_JPEG_QUALITY = 0.78
export const MEAL_PHOTO_BYPASS_MAX_BYTES = Math.floor(1.5 * 1024 * 1024)
export const MEAL_PHOTO_CLIENT_MAX_BYTES = 4 * 1024 * 1024
export const MEAL_PHOTO_PREPARED_FILENAME = 'meal-photo.jpg'
export const MEAL_PHOTO_PREPARED_TYPE = 'image/jpeg'
export const MEAL_PHOTO_SERVER_MAX_BYTES = MEAL_PHOTO_SET_SERVER_MAX_BYTES
export {
  MEAL_PHOTO_SET_CLIENT_MAX_BYTES,
  MEAL_PHOTO_SET_MAX_COUNT,
  MEAL_PHOTO_SET_PER_PHOTO_MAX_BYTES,
  MEAL_PHOTO_SET_SERVER_MAX_BYTES,
  MEAL_PHOTO_PLATFORM_PAYLOAD_LIMIT_BYTES,
}

export const MEAL_PHOTO_USER_MESSAGES = {
  unreadable: "Couldn't read that photo. Use a JPEG or PNG of the meal.",
  tooLarge: 'This photo is too large to upload. Try another photo of the meal.',
  unsupported: 'Use a JPEG or PNG meal photo.',
  duplicate: 'That photo is already in this meal. Add a different angle.',
  tooMany: 'A meal capture can include up to three photos.',
  setTooLarge: 'These photos are too large to upload together. Try fewer or smaller photos.',
} as const

export type MealPhotoPrepareCode = 'UNREADABLE' | 'TOO_LARGE' | 'UNSUPPORTED' | 'DUPLICATE' | 'TOO_MANY'

export class MealPhotoPrepareError extends Error {
  readonly code: MealPhotoPrepareCode

  constructor(code: MealPhotoPrepareCode, message: string) {
    super(message)
    this.name = 'MealPhotoPrepareError'
    this.code = code
  }
}

export type MealPhotoCodec = ImageCodec
export type PreparedMealPhoto = PreparedImage

export { scaleToFitLongEdge }

export function shouldBypassMealPhotoPrep(input: {
  byteLength: number
  width: number
  height: number
}): boolean {
  return shouldBypassImagePrep(input, {
    bypassMaxBytes: MEAL_PHOTO_BYPASS_MAX_BYTES,
    maxLongEdge: MEAL_PHOTO_MAX_LONG_EDGE,
  })
}

export function isSupportedMealPhotoInput(file: File): boolean {
  return isSupportedJpegPngInput(file)
}

const MEAL_POLICY = {
  maxLongEdge: MEAL_PHOTO_MAX_LONG_EDGE,
  jpegQuality: MEAL_PHOTO_JPEG_QUALITY,
  fallbackJpegQuality: MEAL_PHOTO_FALLBACK_JPEG_QUALITY,
  bypassMaxBytes: MEAL_PHOTO_BYPASS_MAX_BYTES,
  clientMaxBytes: MEAL_PHOTO_CLIENT_MAX_BYTES,
  preparedFilename: MEAL_PHOTO_PREPARED_FILENAME,
  preparedType: MEAL_PHOTO_PREPARED_TYPE,
  messages: MEAL_PHOTO_USER_MESSAGES,
} as const

export async function prepareMealPhoto(
  file: File,
  codec: MealPhotoCodec = browserMealPhotoCodec,
): Promise<PreparedMealPhoto> {
  return prepareWithPolicy(file, MEAL_POLICY, codec)
}

export async function prepareMealPhotoSet(
  files: File[],
  codec: MealPhotoCodec = browserMealPhotoCodec,
): Promise<PreparedMealPhoto[]> {
  if (files.length < 1) {
    throw new MealPhotoPrepareError('UNSUPPORTED', MEAL_PHOTO_USER_MESSAGES.unsupported)
  }
  if (files.length > MEAL_PHOTO_SET_MAX_COUNT) {
    throw new MealPhotoPrepareError('TOO_MANY', MEAL_PHOTO_USER_MESSAGES.tooMany)
  }
  const policy = files.length === 1 ? singlePhotoSetPolicy() : multiPhotoSetPolicy()
  const prepared: PreparedMealPhoto[] = []
  const seen = new Set<string>()
  for (const file of files) {
    const next = await prepareWithPolicy(file, policy, codec)
    const digest = await sha256Hex(new Uint8Array(await next.file.arrayBuffer()))
    if (seen.has(digest)) {
      throw new MealPhotoPrepareError('DUPLICATE', MEAL_PHOTO_USER_MESSAGES.duplicate)
    }
    seen.add(digest)
    prepared.push(next)
  }
  const total = prepared.reduce((sum, item) => sum + item.preparedBytes, 0)
  if (total > MEAL_PHOTO_SET_CLIENT_MAX_BYTES) {
    throw new MealPhotoPrepareError('TOO_LARGE', MEAL_PHOTO_USER_MESSAGES.setTooLarge)
  }
  return prepared
}

function singlePhotoSetPolicy(): ImagePreparePolicy {
  return {
    ...MEAL_POLICY,
    clientMaxBytes: MEAL_PHOTO_SET_CLIENT_MAX_BYTES,
    messages: { ...MEAL_POLICY.messages, tooLarge: MEAL_PHOTO_USER_MESSAGES.setTooLarge },
  }
}

function multiPhotoSetPolicy(): ImagePreparePolicy {
  return {
    maxLongEdge: MEAL_PHOTO_SET_LONG_EDGE,
    jpegQuality: MEAL_PHOTO_SET_JPEG_QUALITY,
    fallbackJpegQuality: MEAL_PHOTO_SET_FALLBACK_JPEG_QUALITY,
    bypassMaxBytes: MEAL_PHOTO_SET_PER_PHOTO_MAX_BYTES,
    clientMaxBytes: MEAL_PHOTO_SET_PER_PHOTO_MAX_BYTES,
    preparedFilename: MEAL_PHOTO_PREPARED_FILENAME,
    preparedType: MEAL_PHOTO_PREPARED_TYPE,
    messages: {
      ...MEAL_PHOTO_USER_MESSAGES,
      tooLarge: MEAL_PHOTO_USER_MESSAGES.setTooLarge,
    },
  }
}

async function prepareWithPolicy(file: File, policy: ImagePreparePolicy, codec: MealPhotoCodec): Promise<PreparedMealPhoto> {
  try {
    return await prepareImage(file, policy, codec)
  } catch (caught) {
    if (caught instanceof ImagePrepareError) {
      throw new MealPhotoPrepareError(caught.code, caught.message)
    }
    throw caught
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const browserMealPhotoCodec: MealPhotoCodec = createBrowserImageCodec(MEAL_PHOTO_USER_MESSAGES)
