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

// Chosen from IMG_1326.jpeg (iPhone 17, stored 5712×4284, EXIF 6, 4.07 MB).
// 2400px long-edge JPEG q=0.90 produced 1800×2400 / 666 KB, registered, and
// matched the original frozen v1.3.1 candidate semantically. 1600px @ q=0.80
// still registered but misread RDL set 3 as 36 lb instead of 30 lb. We keep
// the largest high-quality setting that is comfortably under Vercel's ~4.5 MB
// body limit, not the smallest passing file.
export const WORKOUT_PHOTO_MAX_LONG_EDGE = 2400
export const WORKOUT_PHOTO_JPEG_QUALITY = 0.9
export const WORKOUT_PHOTO_FALLBACK_JPEG_QUALITY = 0.8
export const WORKOUT_PHOTO_BYPASS_MAX_BYTES = Math.floor(2.5 * 1024 * 1024)
export const WORKOUT_PHOTO_CLIENT_MAX_BYTES = 4 * 1024 * 1024
export const WORKOUT_PHOTO_PREPARED_FILENAME = 'workout.jpg'
export const WORKOUT_PHOTO_PREPARED_TYPE = 'image/jpeg'

export const WORKOUT_PHOTO_USER_MESSAGES = {
  unreadable: "Couldn't read that photo. Use a JPEG or PNG of the workout sheet.",
  tooLarge: 'This photo is too large to upload. Try taking another photo at a lower resolution.',
  unsupported: 'Use a JPEG or PNG workout photo.',
} as const

export type WorkoutPhotoPrepareCode = 'UNREADABLE' | 'TOO_LARGE' | 'UNSUPPORTED'

export class WorkoutPhotoPrepareError extends Error {
  readonly code: WorkoutPhotoPrepareCode

  constructor(code: WorkoutPhotoPrepareCode, message: string) {
    super(message)
    this.name = 'WorkoutPhotoPrepareError'
    this.code = code
  }
}

export type DecodedWorkoutPhoto = {
  width: number
  height: number
  source: CanvasImageSource
  close?: () => void
}

export type WorkoutPhotoCodec = ImageCodec
export type PreparedWorkoutPhoto = PreparedImage

export { scaleToFitLongEdge }

export function shouldBypassWorkoutPhotoPrep(input: {
  byteLength: number
  width: number
  height: number
}): boolean {
  return shouldBypassImagePrep(input, {
    bypassMaxBytes: WORKOUT_PHOTO_BYPASS_MAX_BYTES,
    maxLongEdge: WORKOUT_PHOTO_MAX_LONG_EDGE,
  })
}

export function isSupportedWorkoutPhotoInput(file: File): boolean {
  return isSupportedJpegPngInput(file)
}

const WORKOUT_POLICY = {
  maxLongEdge: WORKOUT_PHOTO_MAX_LONG_EDGE,
  jpegQuality: WORKOUT_PHOTO_JPEG_QUALITY,
  fallbackJpegQuality: WORKOUT_PHOTO_FALLBACK_JPEG_QUALITY,
  bypassMaxBytes: WORKOUT_PHOTO_BYPASS_MAX_BYTES,
  clientMaxBytes: WORKOUT_PHOTO_CLIENT_MAX_BYTES,
  preparedFilename: WORKOUT_PHOTO_PREPARED_FILENAME,
  preparedType: WORKOUT_PHOTO_PREPARED_TYPE,
  messages: WORKOUT_PHOTO_USER_MESSAGES,
} as const

export async function prepareWorkoutPhoto(
  file: File,
  codec: WorkoutPhotoCodec = browserWorkoutPhotoCodec,
): Promise<PreparedWorkoutPhoto> {
  try {
    return await prepareImage(file, WORKOUT_POLICY, codec)
  } catch (caught) {
    if (caught instanceof ImagePrepareError) {
      throw new WorkoutPhotoPrepareError(caught.code, caught.message)
    }
    throw caught
  }
}

export const browserWorkoutPhotoCodec: WorkoutPhotoCodec = createBrowserImageCodec(WORKOUT_PHOTO_USER_MESSAGES)
