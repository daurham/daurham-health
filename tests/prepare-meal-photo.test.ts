import { describe, expect, it } from 'vitest'
import {
  MEAL_PHOTO_CLIENT_MAX_BYTES,
  MEAL_PHOTO_MAX_LONG_EDGE,
  MEAL_PHOTO_PREPARED_FILENAME,
  MEAL_PHOTO_PREPARED_TYPE,
  isSupportedMealPhotoInput,
  prepareMealPhoto,
  shouldBypassMealPhotoPrep,
  type MealPhotoCodec,
} from '../src/features/nutrition/prepare-meal-photo.ts'
import { LABEL_PHOTO_MAX_LONG_EDGE } from '../src/features/nutrition/prepare-label-photo.ts'
import { WORKOUT_PHOTO_MAX_LONG_EDGE } from '../src/features/training/prepare-workout-photo.ts'

const TINY_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

function fileFrom(bytes: Uint8Array, name = 'meal.jpg', type = 'image/jpeg'): File {
  return new File([bytes], name, { type })
}

function codec(): MealPhotoCodec {
  return {
    async decode() {
      return { width: 4000, height: 3000, source: {} as CanvasImageSource }
    },
    async encode() {
      return new Blob([new Uint8Array(80_000)], { type: MEAL_PHOTO_PREPARED_TYPE })
    },
  }
}

describe('meal photo preparation', () => {
  it('uses a shorter long-edge than labels and workouts', () => {
    expect(MEAL_PHOTO_MAX_LONG_EDGE).toBe(2000)
    expect(MEAL_PHOTO_MAX_LONG_EDGE).toBeLessThan(LABEL_PHOTO_MAX_LONG_EDGE)
    expect(MEAL_PHOTO_MAX_LONG_EDGE).toBeLessThan(WORKOUT_PHOTO_MAX_LONG_EDGE)
  })

  it('accepts jpeg/png and bypasses already-small photos', () => {
    expect(isSupportedMealPhotoInput(fileFrom(TINY_JPEG))).toBe(true)
    expect(isSupportedMealPhotoInput(fileFrom(TINY_JPEG, 'meal.heic', 'image/heic'))).toBe(false)
    expect(shouldBypassMealPhotoPrep({ byteLength: 400_000, width: 1600, height: 1200 })).toBe(true)
  })

  it('resizes oversized photos without changing label or workout profiles', async () => {
    const prepared = await prepareMealPhoto(fileFrom(new Uint8Array(3 * 1024 * 1024), 'IMG_meal.jpeg'), codec())
    expect(prepared.processed).toBe(true)
    expect(prepared.file.name).toBe(MEAL_PHOTO_PREPARED_FILENAME)
    expect(Math.max(prepared.preparedWidth, prepared.preparedHeight)).toBe(MEAL_PHOTO_MAX_LONG_EDGE)
    expect(prepared.preparedBytes).toBeLessThanOrEqual(MEAL_PHOTO_CLIENT_MAX_BYTES)
  })
})
