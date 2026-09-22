import {
  createBrowserImageCodec,
  isSupportedJpegPngInput,
  prepareImage,
  scaleToFitLongEdge,
  shouldBypassImagePrep,
  ImagePrepareError,
  type ImageCodec,
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
export const MEAL_PHOTO_SERVER_MAX_BYTES = 4_500_000

export const MEAL_PHOTO_USER_MESSAGES = {
  unreadable: "Couldn't read that photo. Use a JPEG or PNG of the meal.",
  tooLarge: 'This photo is too large to upload. Try another photo of the meal.',
  unsupported: 'Use a JPEG or PNG meal photo.',
} as const

export type MealPhotoPrepareCode = 'UNREADABLE' | 'TOO_LARGE' | 'UNSUPPORTED'

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
  try {
    return await prepareImage(file, MEAL_POLICY, codec)
  } catch (caught) {
    if (caught instanceof ImagePrepareError) {
      throw new MealPhotoPrepareError(caught.code, caught.message)
    }
    throw caught
  }
}

export const browserMealPhotoCodec: MealPhotoCodec = createBrowserImageCodec(MEAL_PHOTO_USER_MESSAGES)
