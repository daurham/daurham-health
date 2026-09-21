import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createTranscriptionJob } from '../src/features/training/api.ts'
import {
  WORKOUT_PHOTO_BYPASS_MAX_BYTES,
  WORKOUT_PHOTO_CLIENT_MAX_BYTES,
  WORKOUT_PHOTO_FALLBACK_JPEG_QUALITY,
  WORKOUT_PHOTO_JPEG_QUALITY,
  WORKOUT_PHOTO_MAX_LONG_EDGE,
  WORKOUT_PHOTO_PREPARED_FILENAME,
  WORKOUT_PHOTO_PREPARED_TYPE,
  WORKOUT_PHOTO_USER_MESSAGES,
  WorkoutPhotoPrepareError,
  isSupportedWorkoutPhotoInput,
  prepareWorkoutPhoto,
  scaleToFitLongEdge,
  shouldBypassWorkoutPhotoPrep,
  type WorkoutPhotoCodec,
} from '../src/features/training/prepare-workout-photo.ts'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const TINY_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

function fileFrom(bytes: Uint8Array, name = 'sheet.jpg', type = 'image/jpeg'): File {
  return new File([bytes], name, { type })
}

function codec(options: {
  width: number
  height: number
  encodeSizes?: number[]
  onEncode?: (input: { width: number; height: number; quality: number }) => void
}): WorkoutPhotoCodec {
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
      return new Blob([new Uint8Array(size)], { type: WORKOUT_PHOTO_PREPARED_TYPE })
    },
  }
}

describe('workout photo preparation policy', () => {
  it('preserves aspect ratio when shrinking the long edge', () => {
    expect(scaleToFitLongEdge(4000, 3000, 2400)).toEqual({ width: 2400, height: 1800 })
    expect(scaleToFitLongEdge(3000, 4000, 2400)).toEqual({ width: 1800, height: 2400 })
    expect(scaleToFitLongEdge(1800, 1200, 2400)).toEqual({ width: 1800, height: 1200 })
    expect(scaleToFitLongEdge(4284, 5712, 2400)).toEqual({ width: 1800, height: 2400 })
  })

  it('bypasses processing for already-small, reasonably sized photos', () => {
    expect(
      shouldBypassWorkoutPhotoPrep({
        byteLength: 400_000,
        width: 1600,
        height: 1200,
      }),
    ).toBe(true)
    expect(
      shouldBypassWorkoutPhotoPrep({
        byteLength: WORKOUT_PHOTO_BYPASS_MAX_BYTES + 1,
        width: 1600,
        height: 1200,
      }),
    ).toBe(false)
    expect(
      shouldBypassWorkoutPhotoPrep({
        byteLength: 400_000,
        width: WORKOUT_PHOTO_MAX_LONG_EDGE + 1,
        height: 1200,
      }),
    ).toBe(false)
  })

  it('uploads the original when the photo is already suitable', async () => {
    const original = fileFrom(TINY_JPEG)
    const prepared = await prepareWorkoutPhoto(
      original,
      codec({ width: 1200, height: 900, encodeSizes: [1] }),
    )
    expect(prepared.processed).toBe(false)
    expect(prepared.file).toBe(original)
    expect(prepared.preparedBytes).toBe(original.size)
    expect(prepared.preparedWidth).toBe(1200)
  })

  it('resizes oversized photos to JPEG under the client ceiling', async () => {
    const original = fileFrom(new Uint8Array(5 * 1024 * 1024), 'IMG_1326.jpeg')
    const encodes: Array<{ width: number; height: number; quality: number }> = []
    const prepared = await prepareWorkoutPhoto(
      original,
      codec({
        width: 4284,
        height: 5712,
        encodeSizes: [665_896],
        onEncode: (input) => encodes.push(input),
      }),
    )
    expect(prepared.processed).toBe(true)
    expect(prepared.file.name).toBe(WORKOUT_PHOTO_PREPARED_FILENAME)
    expect(prepared.file.type).toBe(WORKOUT_PHOTO_PREPARED_TYPE)
    expect(prepared.preparedWidth).toBe(1800)
    expect(prepared.preparedHeight).toBe(2400)
    expect(prepared.preparedBytes).toBe(665_896)
    expect(prepared.preparedBytes).toBeLessThanOrEqual(WORKOUT_PHOTO_CLIENT_MAX_BYTES)
    expect(encodes).toEqual([{ width: 1800, height: 2400, quality: WORKOUT_PHOTO_JPEG_QUALITY, source: expect.anything() }])
  })

  it('uses one quality fallback when the first encode is still too large', async () => {
    const original = fileFrom(new Uint8Array(6 * 1024 * 1024))
    const qualities: number[] = []
    const prepared = await prepareWorkoutPhoto(
      original,
      codec({
        width: 5000,
        height: 4000,
        encodeSizes: [WORKOUT_PHOTO_CLIENT_MAX_BYTES + 10, 3 * 1024 * 1024],
        onEncode: (input) => qualities.push(input.quality),
      }),
    )
    expect(prepared.processed).toBe(true)
    expect(prepared.preparedBytes).toBe(3 * 1024 * 1024)
    expect(qualities).toEqual([WORKOUT_PHOTO_JPEG_QUALITY, WORKOUT_PHOTO_FALLBACK_JPEG_QUALITY])
  })

  it('stops before upload when preparation cannot fit the ceiling', async () => {
    const original = fileFrom(new Uint8Array(8 * 1024 * 1024))
    await expect(
      prepareWorkoutPhoto(
        original,
        codec({
          width: 6000,
          height: 4000,
          encodeSizes: [WORKOUT_PHOTO_CLIENT_MAX_BYTES + 1, WORKOUT_PHOTO_CLIENT_MAX_BYTES + 1],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'TOO_LARGE',
      message: WORKOUT_PHOTO_USER_MESSAGES.tooLarge,
    })
  })

  it('handles decode failure without codec terminology', async () => {
    await expect(
      prepareWorkoutPhoto(fileFrom(TINY_JPEG), {
        async decode() {
          throw new Error('createImageBitmap failed')
        },
        async encode() {
          throw new Error('should not encode')
        },
      }),
    ).rejects.toBeInstanceOf(WorkoutPhotoPrepareError)
    await expect(
      prepareWorkoutPhoto(fileFrom(TINY_JPEG), {
        async decode() {
          throw new Error('createImageBitmap failed')
        },
        async encode() {
          throw new Error('should not encode')
        },
      }),
    ).rejects.toMatchObject({
      code: 'UNREADABLE',
      message: WORKOUT_PHOTO_USER_MESSAGES.unreadable,
    })
  })

  it('rejects unsupported types before decoding', async () => {
    await expect(
      prepareWorkoutPhoto(fileFrom(TINY_JPEG, 'sheet.heic', 'image/heic')),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED',
      message: WORKOUT_PHOTO_USER_MESSAGES.unsupported,
    })
    expect(isSupportedWorkoutPhotoInput(fileFrom(TINY_JPEG, 'sheet.png', 'image/png'))).toBe(true)
  })
})

describe('prepared photo upload', () => {
  it('POSTs the prepared JPEG blob and never sends a home-ai credential', async () => {
    const original = fileFrom(new Uint8Array(5 * 1024 * 1024), 'IMG_1326.jpeg')
    const prepared = await prepareWorkoutPhoto(
      original,
      codec({ width: 4284, height: 5712, encodeSizes: [200_000] }),
    )
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('x-api-key')).toBeNull()
      expect(headers.get('authorization')).toBeNull()
      const image = (init?.body as FormData).get('image')
      expect(image).toBeInstanceOf(File)
      expect((image as File).name).toBe('workout.jpg')
      expect((image as File).type).toBe('image/jpeg')
      expect((image as File).size).toBe(200_000)
      expect((image as File).size).toBeLessThan(original.size)
      return new Response(JSON.stringify({ job: { id: JOB_ID, status: 'queued' } }), { status: 202 })
    })
    const previous = globalThis.fetch
    globalThis.fetch = fetchImpl as typeof fetch
    try {
      await expect(createTranscriptionJob(prepared.file)).resolves.toEqual({
        id: JOB_ID,
        status: 'queued',
      })
    } finally {
      globalThis.fetch = previous
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('/api/training/transcription/jobs')
  })
})

describe('client source does not hold home-ai credentials', () => {
  it('does not mention HOME_AI_API_KEY in browser training upload code', () => {
    const root = process.cwd()
    const files = [
      'src/features/training/prepare-workout-photo.ts',
      'src/features/training/ImportWorkoutPage.tsx',
      'src/features/training/api.ts',
      'src/features/training/transcription-state.ts',
    ]
    for (const file of files) {
      const source = readFileSync(path.join(root, file), 'utf8')
      expect(source).not.toContain('HOME_AI_API_KEY')
      expect(source).not.toContain('x-api-key')
    }
  })
})
