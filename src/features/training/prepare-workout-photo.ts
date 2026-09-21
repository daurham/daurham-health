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

export type WorkoutPhotoCodec = {
  decode: (blob: Blob) => Promise<DecodedWorkoutPhoto>
  encode: (input: {
    source: CanvasImageSource
    width: number
    height: number
    quality: number
  }) => Promise<Blob>
}

export type PreparedWorkoutPhoto = {
  file: File
  processed: boolean
  originalBytes: number
  preparedBytes: number
  originalWidth: number
  originalHeight: number
  preparedWidth: number
  preparedHeight: number
}

export function scaleToFitLongEdge(
  width: number,
  height: number,
  maxLongEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxLongEdge) {
    return { width, height }
  }
  const scale = maxLongEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function shouldBypassWorkoutPhotoPrep(input: {
  byteLength: number
  width: number
  height: number
}): boolean {
  return (
    input.byteLength <= WORKOUT_PHOTO_BYPASS_MAX_BYTES &&
    Math.max(input.width, input.height) <= WORKOUT_PHOTO_MAX_LONG_EDGE
  )
}

export function isSupportedWorkoutPhotoInput(file: File): boolean {
  const mime = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png') {
    return true
  }
  if (mime === 'image/heic' || mime === 'image/heif' || mime === 'image/webp' || mime === 'image/gif') {
    return false
  }
  return name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || mime === ''
}

export async function prepareWorkoutPhoto(
  file: File,
  codec: WorkoutPhotoCodec = browserWorkoutPhotoCodec,
): Promise<PreparedWorkoutPhoto> {
  if (!isSupportedWorkoutPhotoInput(file)) {
    throw new WorkoutPhotoPrepareError('UNSUPPORTED', WORKOUT_PHOTO_USER_MESSAGES.unsupported)
  }

  let decoded: DecodedWorkoutPhoto
  try {
    decoded = await codec.decode(file)
  } catch (caught) {
    if (caught instanceof WorkoutPhotoPrepareError) {
      throw caught
    }
    throw new WorkoutPhotoPrepareError('UNREADABLE', WORKOUT_PHOTO_USER_MESSAGES.unreadable)
  }

  try {
    if (decoded.width < 1 || decoded.height < 1) {
      throw new WorkoutPhotoPrepareError('UNREADABLE', WORKOUT_PHOTO_USER_MESSAGES.unreadable)
    }

    const original = {
      bytes: file.size,
      width: decoded.width,
      height: decoded.height,
    }

    if (shouldBypassWorkoutPhotoPrep({
      byteLength: original.bytes,
      width: original.width,
      height: original.height,
    })) {
      if (original.bytes > WORKOUT_PHOTO_CLIENT_MAX_BYTES) {
        throw new WorkoutPhotoPrepareError('TOO_LARGE', WORKOUT_PHOTO_USER_MESSAGES.tooLarge)
      }
      return {
        file,
        processed: false,
        originalBytes: original.bytes,
        preparedBytes: original.bytes,
        originalWidth: original.width,
        originalHeight: original.height,
        preparedWidth: original.width,
        preparedHeight: original.height,
      }
    }

    const target = scaleToFitLongEdge(original.width, original.height, WORKOUT_PHOTO_MAX_LONG_EDGE)
    const encoded = await encodeWithinCeiling(codec, decoded.source, target)
    return {
      file: new File([encoded], WORKOUT_PHOTO_PREPARED_FILENAME, {
        type: WORKOUT_PHOTO_PREPARED_TYPE,
        lastModified: Date.now(),
      }),
      processed: true,
      originalBytes: original.bytes,
      preparedBytes: encoded.size,
      originalWidth: original.width,
      originalHeight: original.height,
      preparedWidth: target.width,
      preparedHeight: target.height,
    }
  } finally {
    decoded.close?.()
  }
}

async function encodeWithinCeiling(
  codec: WorkoutPhotoCodec,
  source: CanvasImageSource,
  target: { width: number; height: number },
): Promise<Blob> {
  const primary = await encodeJpeg(codec, source, target, WORKOUT_PHOTO_JPEG_QUALITY)
  if (primary.size <= WORKOUT_PHOTO_CLIENT_MAX_BYTES) {
    return primary
  }
  if (WORKOUT_PHOTO_FALLBACK_JPEG_QUALITY >= WORKOUT_PHOTO_JPEG_QUALITY) {
    throw new WorkoutPhotoPrepareError('TOO_LARGE', WORKOUT_PHOTO_USER_MESSAGES.tooLarge)
  }
  const fallback = await encodeJpeg(codec, source, target, WORKOUT_PHOTO_FALLBACK_JPEG_QUALITY)
  if (fallback.size <= WORKOUT_PHOTO_CLIENT_MAX_BYTES) {
    return fallback
  }
  throw new WorkoutPhotoPrepareError('TOO_LARGE', WORKOUT_PHOTO_USER_MESSAGES.tooLarge)
}

async function encodeJpeg(
  codec: WorkoutPhotoCodec,
  source: CanvasImageSource,
  target: { width: number; height: number },
  quality: number,
): Promise<Blob> {
  const blob = await codec.encode({
    source,
    width: target.width,
    height: target.height,
    quality,
  })
  if (blob.size <= 0) {
    throw new WorkoutPhotoPrepareError('UNREADABLE', WORKOUT_PHOTO_USER_MESSAGES.unreadable)
  }
  return blob
}

export const browserWorkoutPhotoCodec: WorkoutPhotoCodec = {
  async decode(blob) {
    return decodeOrientedBitmap(blob)
  },
  async encode(input) {
    return encodeJpegCanvas(input.source, input.width, input.height, input.quality)
  },
}

async function decodeOrientedBitmap(blob: Blob): Promise<DecodedWorkoutPhoto> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions)
      return bitmapFromImageBitmap(bitmap)
    } catch {
      const bitmap = await createImageBitmap(blob)
      return bitmapFromImageBitmap(bitmap)
    }
  }
  return decodeWithHtmlImage(blob)
}

function bitmapFromImageBitmap(bitmap: ImageBitmap): DecodedWorkoutPhoto {
  return {
    width: bitmap.width,
    height: bitmap.height,
    source: bitmap,
    close: () => bitmap.close(),
  }
}

async function decodeWithHtmlImage(blob: Blob): Promise<DecodedWorkoutPhoto> {
  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    throw new WorkoutPhotoPrepareError('UNREADABLE', WORKOUT_PHOTO_USER_MESSAGES.unreadable)
  }
  const url = URL.createObjectURL(blob)
  const image = new Image()
  try {
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image,
    }
  } catch {
    throw new WorkoutPhotoPrepareError('UNREADABLE', WORKOUT_PHOTO_USER_MESSAGES.unreadable)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function encodeJpegCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = makeCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new WorkoutPhotoPrepareError('UNREADABLE', WORKOUT_PHOTO_USER_MESSAGES.unreadable)
  }
  if ('imageSmoothingEnabled' in context) {
    context.imageSmoothingEnabled = true
  }
  if ('imageSmoothingQuality' in context) {
    context.imageSmoothingQuality = 'high'
  }
  context.drawImage(source, 0, 0, width, height)
  try {
    if ('convertToBlob' in canvas) {
      return await canvas.convertToBlob({ type: WORKOUT_PHOTO_PREPARED_TYPE, quality })
    }
    return await htmlCanvasToBlob(canvas, quality)
  } catch (caught) {
    if (caught instanceof WorkoutPhotoPrepareError) {
      throw caught
    }
    throw new WorkoutPhotoPrepareError('UNREADABLE', WORKOUT_PHOTO_USER_MESSAGES.unreadable)
  }
}

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(width, height)
  }
  if (typeof document === 'undefined') {
    throw new WorkoutPhotoPrepareError('UNREADABLE', WORKOUT_PHOTO_USER_MESSAGES.unreadable)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function htmlCanvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }
        reject(new WorkoutPhotoPrepareError('UNREADABLE', WORKOUT_PHOTO_USER_MESSAGES.unreadable))
      },
      WORKOUT_PHOTO_PREPARED_TYPE,
      quality,
    )
  })
}
