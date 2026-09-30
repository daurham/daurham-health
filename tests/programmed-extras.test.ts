import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  trainingSessionDisplayName,
  workoutSessionRowSchema,
  sessionSummaryFromRow,
} from '../src/domain/training.ts'
import { prepareManualSession } from '../server/training/service.ts'

const TEMPLATE_ID = '11111111-1111-4111-8111-111111111111'
const EXERCISE_A = '22222222-2222-4222-8222-222222222222'
const EXERCISE_EXTRA = '33333333-3333-4333-8333-333333333333'

describe('H5 programmed workout extras', () => {
  it('adds + to programmed display names only when session metadata says extras were saved', () => {
    expect(trainingSessionDisplayName({
      sessionType: 'programmed',
      templateName: 'Full Body A',
      routineCode: 'A',
    })).toBe('Full Body A')
    expect(trainingSessionDisplayName({
      sessionType: 'programmed',
      templateName: 'Full Body A',
      routineCode: 'A',
      hasProgrammedExtras: true,
    })).toBe('Full Body A+')
  })

  it('exposes persisted extras from session metadata without changing old summaries', () => {
    const base = {
      id: '44444444-4444-4444-8444-444444444444',
      workout_date: '2026-09-30',
      workout_template_id: TEMPLATE_ID,
      routine_code: 'A',
      template_version: '1.3.1',
      template_name: 'Full Body A',
      session_type: 'programmed',
      session_name: null,
      experiment_id: null,
      benchmark_protocol_version_id: null,
      duration_min: null,
      effort: null,
      pain_level: null,
      bodyweight_kg: null,
      notes: null,
      source_kind: 'manual',
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    }
    const plain = sessionSummaryFromRow(workoutSessionRowSchema.parse(base))
    expect(plain.hasProgrammedExtras).toBeUndefined()
    const extra = sessionSummaryFromRow(workoutSessionRowSchema.parse({
      ...base,
      metadata: { has_programmed_extras: true },
    }))
    expect(extra.hasProgrammedExtras).toBe(true)
  })

  it('marks a slotless programmed exercise as session-only metadata while preserving the template', () => {
    const exercises = new Map([
      [EXERCISE_A, {
        id: EXERCISE_A,
        externalId: 'EX01',
        name: 'Box Squat',
        measurementKind: 'reps' as const,
        loadType: 'barbell',
        unilateral: false,
        metadata: {},
        gifUrl: null,
        youtubeUrl: null,
        formInstructions: null,
        notes: null,
        isActive: true,
      }],
      [EXERCISE_EXTRA, {
        id: EXERCISE_EXTRA,
        externalId: null,
        name: 'Push-Up',
        measurementKind: 'reps' as const,
        loadType: 'bodyweight',
        unilateral: false,
        metadata: { origin: 'owner' },
        gifUrl: null,
        youtubeUrl: null,
        formInstructions: null,
        notes: null,
        isActive: true,
      }],
    ])
    const template = {
      id: TEMPLATE_ID,
      routineCode: 'A',
      version: '1.3.1',
      name: 'Full Body A',
      metadata: {},
      isActive: true,
      originKind: 'seeded' as const,
      exercises: [{
        id: '55555555-5555-4555-8555-555555555555',
        slotId: 'A01',
        position: 1,
        plannedSets: 1,
        prescription: { measurement: 'reps' as const, min: 6, max: 10 },
        exercise: exercises.get(EXERCISE_A)!,
      }],
    }
    const prepared = prepareManualSession({
      request: {
        workoutDate: '2026-09-30',
        workoutTemplateId: TEMPLATE_ID,
        sessionType: 'programmed',
        sessionName: null,
        durationMin: null,
        effort: null,
        painLevel: null,
        bodyweightLb: null,
        notes: null,
        experimentId: null,
        benchmarkProtocolVersionId: null,
        exercises: [
          {
            exerciseDefinitionId: EXERCISE_A,
            slotId: 'A01',
            notes: null,
            sets: [{
              setNumber: 1, setType: 'working', loadState: 'external', weightLb: 45,
              reps: 8, durationSec: null, leftReps: null, rightReps: null,
              leftDurationSec: null, rightDurationSec: null, distance: null,
              distanceUnit: null, completed: null, notes: null,
            }],
          },
          {
            exerciseDefinitionId: EXERCISE_EXTRA,
            slotId: null,
            notes: null,
            sets: [{
              setNumber: 1, setType: 'working', loadState: 'bodyweight', weightLb: null,
              reps: 10, durationSec: null, leftReps: null, rightReps: null,
              leftDurationSec: null, rightDurationSec: null, distance: null,
              distanceUnit: null, completed: null, notes: null,
            }],
          },
        ],
      },
      exercisesById: exercises,
      template,
    })
    expect(prepared.workoutTemplateId).toBe(TEMPLATE_ID)
    expect(prepared.metadata.has_programmed_extras).toBe(true)
    expect(prepared.exercises[1]?.slotId).toBeNull()
    expect(template.exercises).toHaveLength(1)
  })
})


describe('H5 extras and archived definitions remain visible to Progress', () => {
  it('does not filter canonical Training sets by template slot or active exercise state', () => {
    const progress = readFileSync('server/progress/queries.ts', 'utf8')
    const exerciseQuery = progress.slice(
      progress.indexOf('SELECT id, external_id, name, measurement_kind'),
      progress.indexOf('sql.query(', progress.indexOf('SELECT id, external_id, name, measurement_kind') + 1),
    )
    expect(exerciseQuery).not.toContain('WHERE is_active = true')
    const setQuery = progress.slice(
      progress.indexOf('sets.id AS set_id'),
      progress.indexOf('ORDER BY sessions.workout_date', progress.indexOf('sets.id AS set_id')),
    )
    expect(setQuery).toContain('JOIN workout_session_exercises AS exercises')
    expect(setQuery).not.toContain('slot_id')
  })
})
