import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ownerRoutineRequestSchema } from '../src/domain/training.ts'

const EXERCISE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('H2D Saved Routines', () => {
  it('validates a bounded owner routine request', () => {
    expect(ownerRoutineRequestSchema.parse({
      name: 'Cardio day',
      slots: [{
        exerciseDefinitionId: EXERCISE,
        plannedSets: 2,
        prescription: { measurement: 'distance_duration', min_distance_m: 1609.344, min_sec: 600 },
      }],
    }).slots).toHaveLength(1)
    expect(ownerRoutineRequestSchema.safeParse({ name: 'Empty', slots: [] }).success).toBe(false)
    expect(ownerRoutineRequestSchema.safeParse({
      name: 'Too many sets',
      slots: [{ exerciseDefinitionId: EXERCISE, plannedSets: 21, prescription: { measurement: 'reps' } }],
    }).success).toBe(false)
  })

  it('keeps owner revisions immutable and protects seeded routines in the service contract', () => {
    const service = readFileSync('server/training/service.ts', 'utf8')
    expect(service).toContain("routineCode = `owner:${randomUUID()}`")
    expect(service).toContain("(version::integer + 1)::text")
    expect(service).toContain("SET is_active = false")
    expect(service).toContain("origin_kind = 'owner'")
    expect(service).toContain('Built-in routines cannot be changed.')
    expect(service).toContain('Saved Routine changed since editing began.')
    expect(service).not.toContain('DELETE FROM workout_templates')
    expect(service).toContain('programmedTemplateEditError(existing.session.workoutTemplateId, request.workoutTemplateId)')
  })

  it('exposes owner-authenticated CRUD through the existing Training template route', () => {
    const handler = readFileSync('server/handlers/training-templates.ts', 'utf8')
    const dispatch = readFileSync('server/dispatch.ts', 'utf8')
    expect(handler).toContain('withOwnerAuth(templatesHandler)')
    expect(handler).toContain("req.method === 'GET'")
    expect(handler).toContain("req.method === 'POST'")
    expect(handler).toContain("req.method === 'PATCH'")
    expect(handler).toContain("req.method === 'DELETE'")
    expect(dispatch).toContain("'/api/training/templates/'")
  })

  it('offers Built-in, Saved, and genuinely editable Empty workout paths', () => {
    const start = readFileSync('src/features/training/StartWorkoutPage.tsx', 'utf8')
    expect(start).toContain('Built-in routines')
    expect(start).toContain('Saved routines')
    expect(start).toContain('Empty workout')
    expect(start).toContain("const draftIsAdHoc = draft.sessionType === 'ad_hoc'")
    expect(start).toContain('allowExerciseManagement={draftIsAdHoc || experimentWorkout}')
    expect(start).toContain('Promise.all([fetchTemplates(), fetchExercises()])')
  })

  it('keeps the routine builder lightweight and measurement-aware', () => {
    const page = readFileSync('src/features/training/RoutinesPage.tsx', 'utf8')
    for (const copy of ['Saved Routines', 'Planned sets', 'Add exercise', 'Save new version', 'Archive']) {
      expect(page).toContain(copy)
    }
    expect(page).toContain("kind === 'distance_duration'")
    expect(page).toContain("kind === 'completion'")
    expect(page).toContain('minDistanceMi')
    expect(page).not.toContain('JSON.stringify')
  })
})
