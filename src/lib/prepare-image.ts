export type ImagePrepareCode = 'UNREADABLE' | 'TOO_LARGE' | 'UNSUPPORTED'

export class ImagePrepareError extends Error {
  readonly code: ImagePrepareCode

  constructor(code: ImagePrepareCode, message: string) {
    super(message)
    this.name = 'ImagePrepareError'
    this.code = code
  }
}

export type DecodedImage = {
  width: number
  height: number
  source: CanvasImageSource
  close?: () => void
}

export type ImageCodec = {
  decode: (blob: Blob) => Promise<DecodedImage>
  encode: (input: {
    source: CanvasImageSource
    width: number
    height: number
    quality: number
  }) => Promise<Blob>
}

export type PreparedImage = {
  file: File
  processed: boolean
  originalBytes: number
  preparedBytes: number
  originalWidth: number
  originalHeight: number
  preparedWidth: number
  preparedHeight: number
}

export type ImagePreparePolicy = {
  maxLongEdge: number
  jpegQuality: number
  fallbackJpegQuality: number
  bypassMaxBytes: number
  clientMaxBytes: number
  preparedFilename: string
  preparedType: 'image/jpeg'
  messages: {
    unreadable: string
    tooLarge: string
    unsupported: string
  }
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

export function shouldBypassImagePrep(
  input: { byteLength: number; width: number; height: number },
  policy: Pick<ImagePreparePolicy, 'bypassMaxBytes' | 'maxLongEdge'>,
): boolean {
  return input.byteLength <= policy.bypassMaxBytes && Math.max(input.width, input.height) <= policy.maxLongEdge
}

export function isSupportedJpegPngInput(file: File): boolean {
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

export async function prepareImage(
  file: File,
  policy: ImagePreparePolicy,
  codec: ImageCodec,
): Promise<PreparedImage> {
  if (!isSupportedJpegPngInput(file)) {
    throw new ImagePrepareError('UNSUPPORTED', policy.messages.unsupported)
  }

  let decoded: DecodedImage
  try {
    decoded = await codec.decode(file)
  } catch (caught) {
    if (caught instanceof ImagePrepareError) {
      throw caught
    }
    throw new ImagePrepareError('UNREADABLE', policy.messages.unreadable)
  }

  try {
    if (decoded.width < 1 || decoded.height < 1) {
      throw new ImagePrepareError('UNREADABLE', policy.messages.unreadable)
    }

    const original = {
      bytes: file.size,
      width: decoded.width,
      height: decoded.height,
    }

    if (shouldBypassImagePrep({ byteLength: original.bytes, width: original.width, height: original.height }, policy)) {
      if (original.bytes > policy.clientMaxBytes) {
        throw new ImagePrepareError('TOO_LARGE', policy.messages.tooLarge)
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

    const target = scaleToFitLongEdge(original.width, original.height, policy.maxLongEdge)
    const encoded = await encodeWithinCeiling(codec, decoded.source, target, policy)
    return {
      file: new File([encoded], policy.preparedFilename, {
        type: policy.preparedType,
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
  codec: ImageCodec,
  source: CanvasImageSource,
  target: { width: number; height: number },
  policy: ImagePreparePolicy,
): Promise<Blob> {
  const primary = await encodeJpeg(codec, source, target, policy.jpegQuality, policy)
  if (primary.size <= policy.clientMaxBytes) {
    return primary
  }
  if (policy.fallbackJpegQuality >= policy.jpegQuality) {
    throw new ImagePrepareError('TOO_LARGE', policy.messages.tooLarge)
  }
  const fallback = await encodeJpeg(codec, source, target, policy.fallbackJpegQuality, policy)
  if (fallback.size <= policy.clientMaxBytes) {
    return fallback
  }
  throw new ImagePrepareError('TOO_LARGE', policy.messages.tooLarge)
}

async function encodeJpeg(
  codec: ImageCodec,
  source: CanvasImageSource,
  target: { width: number; height: number },
  quality: number,
  policy: ImagePreparePolicy,
): Promise<Blob> {
  const blob = await codec.encode({
    source,
    width: target.width,
    height: target.height,
    quality,
  })
  if (blob.size <= 0) {
    throw new ImagePrepareError('UNREADABLE', policy.messages.unreadable)
  }
  return blob
}

export function createBrowserImageCodec(messages: ImagePreparePolicy['messages']): ImageCodec {
  return {
    async decode(blob) {
      return decodeOrientedBitmap(blob, messages)
    },
    async encode(input) {
      return encodeJpegCanvas(input.source, input.width, input.height, input.quality, messages)
    },
  }
}

async function decodeOrientedBitmap(blob: Blob, messages: ImagePreparePolicy['messages']): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions)
      return bitmapFromImageBitmap(bitmap)
    } catch {
      const bitmap = await createImageBitmap(blob)
      return bitmapFromImageBitmap(bitmap)
    }
  }
  return decodeWithHtmlImage(blob, messages)
}

function bitmapFromImageBitmap(bitmap: ImageBitmap): DecodedImage {
  return {
    width: bitmap.width,
    height: bitmap.height,
    source: bitmap,
    close: () => bitmap.close(),
  }
}

async function decodeWithHtmlImage(blob: Blob, messages: ImagePreparePolicy['messages']): Promise<DecodedImage> {
  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    throw new ImagePrepareError('UNREADABLE', messages.unreadable)
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
    throw new ImagePrepareError('UNREADABLE', messages.unreadable)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function encodeJpegCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
  messages: ImagePreparePolicy['messages'],
): Promise<Blob> {
  const canvas = makeCanvas(width, height, messages)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new ImagePrepareError('UNREADABLE', messages.unreadable)
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
      return await canvas.convertToBlob({ type: 'image/jpeg', quality })
    }
    return await htmlCanvasToBlob(canvas, quality, messages)
  } catch (caught) {
    if (caught instanceof ImagePrepareError) {
      throw caught
    }
    throw new ImagePrepareError('UNREADABLE', messages.unreadable)
  }
}

function makeCanvas(width: number, height: number, messages: ImagePreparePolicy['messages']): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(width, height)
  }
  if (typeof document === 'undefined') {
    throw new ImagePrepareError('UNREADABLE', messages.unreadable)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function htmlCanvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
  messages: ImagePreparePolicy['messages'],
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }
        reject(new ImagePrepareError('UNREADABLE', messages.unreadable))
      },
      'image/jpeg',
      quality,
    )
  })
}
