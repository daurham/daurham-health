import { describe, expect, it } from 'vitest'
import {
  ownerExerciseRequestSchema,
  planOwnerExercisePatch,
  type ExerciseDefinition,
} from '../src/domain/training.ts'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const SEEDED_ID = '22222222-2222-4222-8222-222222222222'

function definition(input: {
  id: string
  externalId: string | null
  origin?: 'owner'
  measurementKind?: ExerciseDefinition['measurementKind']
  loadType?: string
}): ExerciseDefinition {
  return {
    id: input.id,
    externalId: input.externalId,
    name: input.externalId ? 'Built-in Exercise' : 'Owner Exercise',
    measurementKind: input.measurementKind ?? 'reps',
    loadType: input.loadType ?? 'bodyweight',
    unilateral: false,
    metadata: input.origin ? { origin: input.origin } : {},
    gifUrl: null,
    youtubeUrl: null,
    formInstructions: null,
    notes: null,
    isActive: true,
  }
}

describe('H5 Exercise Library editing safety', () => {
  it('accepts only HTTP(S) media URLs', () => {
    const base = {
      name: 'Push-Up',
      measurementKind: 'reps' as const,
      loadType: 'bodyweight' as const,
      unilateral: false,
    }
    expect(ownerExerciseRequestSchema.safeParse({
      ...base,
      gifUrl: 'https://example.com/pushup.gif',
      youtubeUrl: 'http://youtube.com/watch?v=test',
    }).success).toBe(true)
    expect(ownerExerciseRequestSchema.safeParse({
      ...base,
      gifUrl: 'javascript:alert(1)',
    }).success).toBe(false)
    expect(ownerExerciseRequestSchema.safeParse({
      ...base,
      youtubeUrl: 'ftp://example.com/video',
    }).success).toBe(false)
  })

  it('allows semantic edits only for unused owner-created definitions', () => {
    const owner = definition({ id: OWNER_ID, externalId: null, origin: 'owner' })
    const next = {
      name: 'Owner Exercise',
      measurementKind: 'duration' as const,
      loadType: 'bodyweight' as const,
      unilateral: false,
    }
    expect(planOwnerExercisePatch({ existing: owner, next, used: false })).toMatchObject({
      ok: true,
      semanticEditable: true,
      semanticChanged: true,
      measurementKind: 'duration',
    })
    expect(planOwnerExercisePatch({ existing: owner, next, used: true })).toMatchObject({
      ok: false,
      status: 409,
    })
  })

  it('locks seeded semantics but permits seeded presentation/name edits', () => {
    const seeded = definition({
      id: SEEDED_ID,
      externalId: 'EX01',
      measurementKind: 'reps',
      loadType: 'barbell',
    })
    expect(planOwnerExercisePatch({
      existing: seeded,
      next: {
        name: 'Box Squat — My Label',
        measurementKind: 'reps',
        loadType: 'barbell',
        unilateral: false,
        formInstructions: 'Custom form cues.',
        notes: 'Use the low box.',
      },
      used: true,
    })).toMatchObject({
      ok: true,
      semanticEditable: false,
      semanticChanged: false,
      name: 'Box Squat — My Label',
    })

    expect(planOwnerExercisePatch({
      existing: seeded,
      next: {
        name: 'Box Squat',
        measurementKind: 'duration',
        loadType: 'barbell',
        unilateral: false,
      },
      used: false,
    })).toMatchObject({
      ok: false,
      status: 409,
    })
  })
})


describe('H5 seeded analytics preservation', () => {
  it('updates semantic/analytics columns only for an allowed semantic change', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('server/training/owner-exercises.ts', 'utf8')
    expect(source).toContain('measurement_kind = CASE WHEN $3::boolean THEN $4 ELSE measurement_kind END')
    expect(source).toContain('performance_type = CASE WHEN $3::boolean THEN $7 ELSE performance_type END')
    expect(source).toContain('analytics_load_type = CASE WHEN $3::boolean THEN $8 ELSE analytics_load_type END')
    expect(source).toContain('plan.semanticChanged')
  })
})
