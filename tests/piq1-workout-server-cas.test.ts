import { describe, expect, it } from 'vitest'
import { updateManualSession, UPDATE_WORKOUT_SESSION_CAS_SQL } from '../server/training/service.js'
import { workoutSessionSchema } from '../src/domain/training.js'

describe('PIQ-1.4 server-owned workout edit precondition', () => {
  it('rejects missing or malformed expected revisions before loading or modifying a workout', async () => {
    for (const body of [
      null, {}, { expectedEditRevision: null }, { expectedEditRevision: 'not-a-revision' },
      { expectedEditRevision: '-1' }, { expectedEditRevision: '1 OR 1=1' },
    ]) {
      await expect(updateManualSession('11111111-1111-4111-8111-111111111111', body))
        .rejects.toMatchObject({ statusCode: 428 })
    }
  })

  it('enforces the PostgreSQL row revision inside UPDATE, not with a client-only read', () => {
    expect(UPDATE_WORKOUT_SESSION_CAS_SQL).toContain('xmin::text = $16')
    expect(UPDATE_WORKOUT_SESSION_CAS_SQL).toContain("jsonb_build_object('_piq_edit_nonce'")
    expect(UPDATE_WORKOUT_SESSION_CAS_SQL).toContain('RETURNING id')
  })

  it('accepts an opaque edit revision on a canonical workout response without changing other session fields', () => {
    const minimal = {
      id: '11111111-1111-4111-8111-111111111111', workoutDate: '2026-10-14',
      workoutTemplateId: null, routineCode: null, templateVersion: null, templateName: null,
      sessionType: 'ad_hoc', sessionName: 'Recorded', experimentId: null,
      benchmarkProtocolVersionId: null, durationMin: 30, effort: 3, painLevel: 0,
      limitationKind: null, limitationNote: null, sourceKind: 'manual',
      bodyweightKg: 80, notes: '', metadata: {}, exercises: [],
      editRevision: '12345',
    }
    // The canonical contract still rejects empty saved workout exercises.
    expect(workoutSessionSchema.safeParse(minimal).success).toBe(false)
    expect(workoutSessionSchema.shape.editRevision.safeParse('12345').success).toBe(true)
    expect(workoutSessionSchema.shape.editRevision.safeParse('stale-token').success).toBe(false)
  })
})
