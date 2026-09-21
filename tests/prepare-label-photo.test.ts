import { describe, expect, it } from 'vitest'
import {
  LABEL_PHOTO_CLIENT_MAX_BYTES,
  LABEL_PHOTO_FALLBACK_JPEG_QUALITY,
  LABEL_PHOTO_JPEG_QUALITY,
  LABEL_PHOTO_MAX_LONG_EDGE,
  LABEL_PHOTO_PREPARED_FILENAME,
  LABEL_PHOTO_PREPARED_TYPE,
  LABEL_PHOTO_USER_MESSAGES,
  LabelPhotoPrepareError,
  isSupportedLabelPhotoInput,
  prepareLabelPhoto,
  scaleToFitLongEdge,
  shouldBypassLabelPhotoPrep,
  type LabelPhotoCodec,
} from '../src/features/nutrition/prepare-label-photo.ts'
import { WORKOUT_PHOTO_MAX_LONG_EDGE } from '../src/features/training/prepare-workout-photo.ts'

const TINY_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

function fileFrom(bytes: Uint8Array, name = 'label.jpg', type = 'image/jpeg'): File {
  return new File([bytes], name, { type })
}

function codec(options: {
  width: number
  height: number
  encodeSizes?: number[]
  onEncode?: (input: { width: number; height: number; quality: number }) => void
}): LabelPhotoCodec {
  const sizes = [...(options.encodeSizes ?? [80_000])]
  return {
    async decode() {
      return {
        width: options.width,
        height: options.height,
        source: {} as CanvasImageSource,
      }
    },
    async encode(input) {
      options.onEncode?.(input)
      const size = sizes.shift() ?? 80_000
      return new Blob([new Uint8Array(size)], { type: LABEL_PHOTO_PREPARED_TYPE })
    },
  }
}

describe('nutrition label photo preparation', () => {
  it('uses a longer edge than workout photos and preserves aspect ratio without cropping', () => {
    expect(LABEL_PHOTO_MAX_LONG_EDGE).toBeGreaterThan(WORKOUT_PHOTO_MAX_LONG_EDGE)
    expect(scaleToFitLongEdge(4000, 3000, LABEL_PHOTO_MAX_LONG_EDGE)).toEqual({
      width: LABEL_PHOTO_MAX_LONG_EDGE,
      height: Math.round((3000 / 4000) * LABEL_PHOTO_MAX_LONG_EDGE),
    })
    expect(scaleToFitLongEdge(1800, 1200, LABEL_PHOTO_MAX_LONG_EDGE)).toEqual({ width: 1800, height: 1200 })
  })

  it('bypasses already-small JPEGs and rejects HEIC before decode', () => {
    expect(shouldBypassLabelPhotoPrep({ byteLength: 400_000, width: 1600, height: 1200 })).toBe(true)
    expect(isSupportedLabelPhotoInput(fileFrom(TINY_JPEG, 'label.png', 'image/png'))).toBe(true)
    expect(isSupportedLabelPhotoInput(fileFrom(TINY_JPEG, 'label.heic', 'image/heic'))).toBe(false)
  })

  it('resizes oversized photos to JPEG under the client ceiling', async () => {
    const original = fileFrom(new Uint8Array(5 * 1024 * 1024), 'IMG_label.jpeg')
    const encodes: Array<{ width: number; height: number; quality: number }> = []
    const prepared = await prepareLabelPhoto(
      original,
      codec({
        width: 4284,
        height: 5712,
        encodeSizes: [800_000],
        onEncode: (input) => encodes.push(input),
      }),
    )
    expect(prepared.processed).toBe(true)
    expect(prepared.file.name).toBe(LABEL_PHOTO_PREPARED_FILENAME)
    expect(prepared.file.type).toBe(LABEL_PHOTO_PREPARED_TYPE)
    expect(Math.max(prepared.preparedWidth, prepared.preparedHeight)).toBe(LABEL_PHOTO_MAX_LONG_EDGE)
    expect(prepared.preparedBytes).toBeLessThanOrEqual(LABEL_PHOTO_CLIENT_MAX_BYTES)
    expect(encodes[0]?.quality).toBe(LABEL_PHOTO_JPEG_QUALITY)
    expect(encodes[0]?.width / encodes[0]?.height).toBeCloseTo(4284 / 5712)
  })

  it('falls back in quality rather than cropping when the first encode is too large', async () => {
    const qualities: number[] = []
    const prepared = await prepareLabelPhoto(
      fileFrom(new Uint8Array(6 * 1024 * 1024)),
      codec({
        width: 5000,
        height: 4000,
        encodeSizes: [LABEL_PHOTO_CLIENT_MAX_BYTES + 10, 2 * 1024 * 1024],
        onEncode: (input) => qualities.push(input.quality),
      }),
    )
    expect(prepared.processed).toBe(true)
    expect(qualities).toEqual([LABEL_PHOTO_JPEG_QUALITY, LABEL_PHOTO_FALLBACK_JPEG_QUALITY])
  })

  it('stops before upload when the photo cannot fit', async () => {
    await expect(
      prepareLabelPhoto(
        fileFrom(new Uint8Array(8 * 1024 * 1024)),
        codec({
          width: 6000,
          height: 4000,
          encodeSizes: [LABEL_PHOTO_CLIENT_MAX_BYTES + 1, LABEL_PHOTO_CLIENT_MAX_BYTES + 1],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'TOO_LARGE',
      message: LABEL_PHOTO_USER_MESSAGES.tooLarge,
    })
    await expect(
      prepareLabelPhoto(fileFrom(TINY_JPEG, 'label.heic', 'image/heic')),
    ).rejects.toBeInstanceOf(LabelPhotoPrepareError)
  })
})
