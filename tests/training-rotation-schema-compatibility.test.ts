import { describe, expect, it } from 'vitest'
import { isMissingRotationSchema } from '../server/training/plan-service.ts'

describe('Training Plan forward migration compatibility', () => {
  it('recognizes only missing 0051 rotation tables as an optional read', () => {
    expect(isMissingRotationSchema({
      code: '42P01',
      message: 'relation "training_plan_rotation_anchors" does not exist',
    })).toBe(true)
    expect(isMissingRotationSchema({
      code: '42P01',
      message: 'relation "training_plan_block_ends" does not exist',
    })).toBe(true)
  })
  it('never hides other missing tables, auth/network failures, or unrelated queries', () => {
    expect(isMissingRotationSchema({ code: '42P01', message: 'relation "workout_sessions" does not exist' })).toBe(false)
    expect(isMissingRotationSchema({ code: '28P01', message: 'password authentication failed' })).toBe(false)
    expect(isMissingRotationSchema({ code: '42P01' })).toBe(false)
    expect(isMissingRotationSchema(new Error('network error'))).toBe(false)
    expect(isMissingRotationSchema(null)).toBe(false)
  })
})
