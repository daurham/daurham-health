import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import {
  DELETE_WORKOUT_SESSION_EXERCISES_SQL,
  DELETE_WORKOUT_SESSION_SQL,
  DETACH_TRANSCRIPTION_SESSION_SQL,
  UPDATE_WORKOUT_SESSION_SQL,
  importedSessionReuse,
  prepareManualSession,
} from '../server/training/service.ts'
import type { WorkoutSession, WorkoutTemplate } from '../src/domain/training.ts'
import { poundsToKilograms } from '../src/domain/units.ts'
import { buildManualWorkoutPayload, draftFromSession } from '../src/features/training/draft.ts'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const EXERCISE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TEMPLATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SLOT_ROW_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const SET_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const UNI_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const UNI_EXERCISE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

function template(): WorkoutTemplate {
  return {
    id: TEMPLATE_ID,
    routineCode: 'A',
    version: '1.3.1',
    name: 'Full Body A',
    metadata: {},
    isActive: true,
    exercises: [
      {
        id: SLOT_ROW_ID,
        slotId: 'A01',
        position: 1,
        plannedSets: 3,
        prescription: { measurement: 'reps', min: 6, max: 10 },
        exercise: {
          id: EXERCISE_ID,
          externalId: 'EX01',
          name: 'Box Squat',
          measurementKind: 'reps',
          loadType: 'barbell',
          unilateral: false,
          metadata: {},
          isActive: true,
        },
      },
    ],
  }
}

function session(): WorkoutSession {
  return {
    id: SESSION_ID,
    workoutDate: '2026-09-20',
    workoutTemplateId: TEMPLATE_ID,
    routineCode: 'A',
    templateVersion: '1.3.1',
    templateName: 'Full Body A',
    durationMin: 48,
    effort: 4,
    painLevel: 1,
    bodyweightKg: poundsToKilograms(187.4),
    notes: 'dummy',
    sourceKind: 'imported_candidate',
    metadata: { transcription: { home_ai_job_id: 'job' } },
    createdAt: '2026-09-20T18:00:00.000Z',
    updatedAt: '2026-09-20T18:00:00.000Z',
    exercises: [
      {
        id: '12121212-1212-4121-8121-121212121212',
        exerciseDefinitionId: EXERCISE_ID,
        slotId: 'A01',
        position: 1,
        exerciseExternalId: 'EX01',
        exerciseName: 'Box Squat',
        notes: null,
        sets: [
          {
            id: SET_ID,
            setNumber: 1,
            setType: 'working',
            loadState: 'external',
            weightKg: poundsToKilograms(225),
            reps: 8,
            durationSec: null,
            leftReps: null,
            rightReps: null,
            leftDurationSec: null,
            rightDurationSec: null,
            notes: null,
          },
        ],
      },
      {
        id: '13131313-1313-4131-8131-131313131313',
        exerciseDefinitionId: UNI_EXERCISE_ID,
        slotId: null,
        position: 2,
        exerciseExternalId: 'EX09',
        exerciseName: 'Split Squat',
        notes: null,
        sets: [
          {
            id: UNI_ID,
            setNumber: 1,
            setType: 'working',
            loadState: 'external',
            weightKg: poundsToKilograms(50),
            reps: null,
            durationSec: null,
            leftReps: 8,
            rightReps: 7,
            leftDurationSec: null,
            rightDurationSec: null,
            notes: 'left first',
          },
        ],
      },
    ],
  }
}

describe('training edit in place', () => {
  it('preserves session identity and persists set corrections through the same update path', () => {
    const current = session()
    const draft = draftFromSession(current, template())
    expect(draft.workoutDate).toBe('2026-09-20')
    expect(draft.workoutTemplateId).toBe(TEMPLATE_ID)
    expect(draft.exercises[0]?.sets[0]?.weightLb).toBe('225')
    expect(draft.exercises[0]?.sets[0]?.reps).toBe('8')
    expect(draft.exercises[1]?.sets[0]?.leftReps).toBe('8')
    expect(draft.exercises[1]?.sets[0]?.rightReps).toBe('7')
    draft.exercises[0]!.sets[0]!.reps = '6'
    draft.exercises[1]!.sets[0]!.rightReps = '8'
    const request = buildManualWorkoutPayload(draft)
    const prepared = prepareManualSession({
      request,
      template: template(),
      sessionId: current.id,
      sourceKind: current.sourceKind,
      metadata: current.metadata,
      exercisesById: new Map([
        [
          EXERCISE_ID,
          {
            id: EXERCISE_ID,
            externalId: 'EX01',
            name: 'Box Squat',
            measurementKind: 'reps',
            loadType: 'barbell',
            unilateral: false,
            metadata: {},
            isActive: true,
          },
        ],
        [
          UNI_EXERCISE_ID,
          {
            id: UNI_EXERCISE_ID,
            externalId: 'EX09',
            name: 'Split Squat',
            measurementKind: 'reps_per_side',
            loadType: 'dumbbell',
            unilateral: true,
            metadata: {},
            isActive: true,
          },
        ],
      ]),
    })
    expect(prepared.sessionId).toBe(SESSION_ID)
    expect(prepared.sourceKind).toBe('imported_candidate')
    expect(prepared.exercises[0]?.sets[0]?.reps).toBe(6)
    expect(prepared.exercises[1]?.sets[0]?.leftReps).toBe(8)
    expect(prepared.exercises[1]?.sets[0]?.rightReps).toBe(8)
    expect(UPDATE_WORKOUT_SESSION_SQL).toContain('WHERE id = $1::uuid')
    expect(DELETE_WORKOUT_SESSION_EXERCISES_SQL).toContain('WHERE workout_session_id = $1::uuid')
  })

  it('rejects an invalid semantic edit with the same training validation', () => {
    const draft = draftFromSession(session(), template())
    draft.exercises[0]!.measurementKind = 'duration'
    draft.exercises[0]!.sets[0]!.reps = ''
    draft.exercises[0]!.sets[0]!.durationSec = '30'
    const request = buildManualWorkoutPayload(draft)
    expect(() =>
      prepareManualSession({
        request,
        template: template(),
        sessionId: SESSION_ID,
        exercisesById: new Map([
          [
            EXERCISE_ID,
            {
              id: EXERCISE_ID,
              externalId: 'EX01',
              name: 'Box Squat',
              measurementKind: 'reps',
              loadType: 'barbell',
              unilateral: false,
              metadata: {},
              isActive: true,
            },
          ],
          [
            UNI_EXERCISE_ID,
            {
              id: UNI_EXERCISE_ID,
              externalId: 'EX09',
              name: 'Split Squat',
              measurementKind: 'reps_per_side',
              loadType: 'dumbbell',
              unilateral: true,
              metadata: {},
              isActive: true,
            },
          ],
        ]),
      }),
    ).toThrow(/expects reps/i)
  })
})

describe('training delete provenance', () => {
  it('detaches committed transcriptions, refuses recreation, and leaves Apple Activity alone', () => {
    expect(importedSessionReuse(SESSION_ID, false)).toBe('deleted')
    expect(importedSessionReuse(SESSION_ID, true)).toBe('reuse')
    expect(importedSessionReuse(null, false)).toBe('create')
    expect(DETACH_TRANSCRIPTION_SESSION_SQL).toContain('workout_session_id = NULL')
    expect(DELETE_WORKOUT_SESSION_SQL).toBe('DELETE FROM workout_sessions WHERE id = $1::uuid')
    const service = readFileSync('server/training/service.ts', 'utf8')
    expect(service).toContain('The workout was deleted.')
    expect(service).not.toContain('DELETE FROM apple')
    expect(service).toContain('sourceKind: existing.session.sourceKind')
    const handler = readFileSync('server/handlers/training-session-detail.ts', 'utf8')
    expect(handler).toContain('withOwnerAuth')
    expect(handler).toContain("req.method === 'PATCH'")
    expect(handler).toContain("req.method === 'DELETE'")
    expect(handler).toContain('Allow',)
    expect(matchHealthApiRoute(`/api/training/sessions/${SESSION_ID}`)).toBe('training-session-detail')
    const detail = readFileSync('src/features/training/WorkoutDetailPage.tsx', 'utf8')
    expect(detail).toContain('Edit workout')
    expect(detail).toContain('Delete workout?')
    expect(detail).toContain('This permanently removes this workout')
    expect(detail).toContain('updateSession(sessionId')
    expect(detail).not.toContain('createSession(')
  })
})
