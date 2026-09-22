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

// Labels are text-dense. Use a longer edge than workout sheets (2400) so small
// printed digits survive, still JPEG-reencoded under the ~4 MB Vercel body limit.
// No crop, no sharpening, no contrast filters — visual evidence stays unchanged.
export const LABEL_PHOTO_MAX_LONG_EDGE = 2800
export const LABEL_PHOTO_JPEG_QUALITY = 0.92
export const LABEL_PHOTO_FALLBACK_JPEG_QUALITY = 0.82
export const LABEL_PHOTO_BYPASS_MAX_BYTES = Math.floor(2.5 * 1024 * 1024)
export const LABEL_PHOTO_CLIENT_MAX_BYTES = 4 * 1024 * 1024
export const LABEL_PHOTO_PREPARED_FILENAME = 'nutrition-label.jpg'
export const LABEL_PHOTO_PREPARED_TYPE = 'image/jpeg'
export const LABEL_PHOTO_SERVER_MAX_BYTES = 4_500_000

export const LABEL_PHOTO_USER_MESSAGES = {
  unreadable: "Couldn't read that photo. Use a JPEG or PNG of the Nutrition Facts label.",
  tooLarge: 'This photo is too large to upload. Try another photo of the label.',
  unsupported: 'Use a JPEG or PNG nutrition label photo.',
} as const

export type LabelPhotoPrepareCode = 'UNREADABLE' | 'TOO_LARGE' | 'UNSUPPORTED'

export class LabelPhotoPrepareError extends Error {
  readonly code: LabelPhotoPrepareCode

  constructor(code: LabelPhotoPrepareCode, message: string) {
    super(message)
    this.name = 'LabelPhotoPrepareError'
    this.code = code
  }
}

export type LabelPhotoCodec = ImageCodec
export type PreparedLabelPhoto = PreparedImage

export { scaleToFitLongEdge }

export function shouldBypassLabelPhotoPrep(input: {
  byteLength: number
  width: number
  height: number
}): boolean {
  return shouldBypassImagePrep(input, {
    bypassMaxBytes: LABEL_PHOTO_BYPASS_MAX_BYTES,
    maxLongEdge: LABEL_PHOTO_MAX_LONG_EDGE,
  })
}

export function isSupportedLabelPhotoInput(file: File): boolean {
  return isSupportedJpegPngInput(file)
}

const LABEL_POLICY = {
  maxLongEdge: LABEL_PHOTO_MAX_LONG_EDGE,
  jpegQuality: LABEL_PHOTO_JPEG_QUALITY,
  fallbackJpegQuality: LABEL_PHOTO_FALLBACK_JPEG_QUALITY,
  bypassMaxBytes: LABEL_PHOTO_BYPASS_MAX_BYTES,
  clientMaxBytes: LABEL_PHOTO_CLIENT_MAX_BYTES,
  preparedFilename: LABEL_PHOTO_PREPARED_FILENAME,
  preparedType: LABEL_PHOTO_PREPARED_TYPE,
  messages: LABEL_PHOTO_USER_MESSAGES,
} as const

export async function prepareLabelPhoto(
  file: File,
  codec: LabelPhotoCodec = browserLabelPhotoCodec,
): Promise<PreparedLabelPhoto> {
  try {
    return await prepareImage(file, LABEL_POLICY, codec)
  } catch (caught) {
    if (caught instanceof ImagePrepareError) {
      throw new LabelPhotoPrepareError(caught.code, caught.message)
    }
    throw caught
  }
}

export const browserLabelPhotoCodec: LabelPhotoCodec = createBrowserImageCodec(LABEL_PHOTO_USER_MESSAGES)
