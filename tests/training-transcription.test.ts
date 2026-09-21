import { describe, expect, it } from 'vitest'
import type { WorkoutTemplate } from '../src/domain/training.ts'
import { TRAINING_EXERCISE_SEEDS, TRAINING_TEMPLATE_SEEDS } from '../src/domain/training-library.ts'
import {
  adaptHomeAiCandidate,
  homeAiJobFingerprint,
  provenancePayload,
  type HomeAiCandidate,
  type LibraryExercise,
} from '../src/domain/training-transcription.ts'
import { prepareManualSession } from '../server/training/service.ts'
import { CLAIM_AND_INSERT_WORKOUT_SQL } from '../server/training/commit-sql.ts'
import { getTranscriptionJob } from '../server/training/transcription.ts'
import type { HomeAiClient } from '../server/integrations/home-ai/client.ts'
import { buildManualWorkoutPayload, draftFromTranscription } from '../src/features/training/draft.ts'
import { poundsToKilograms } from '../src/domain/units.ts'

const JOB_ID = '11111111-1111-4111-8111-111111111111'

function uuidFrom(n: number): string {
  return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
}

function library(): LibraryExercise[] {
  return TRAINING_EXERCISE_SEEDS.map((seed, index) => ({
    id: uuidFrom(index + 1),
    externalId: seed.externalId,
    name: seed.name,
    measurementKind: seed.measurementKind,
    unilateral: seed.unilateral,
  }))
}

function templates(): WorkoutTemplate[] {
  const exercises = library()
  const byExternal = new Map(exercises.map((exercise) => [exercise.externalId, exercise]))
  return TRAINING_TEMPLATE_SEEDS.map((seed, templateIndex) => ({
    id: uuidFrom(100 + templateIndex),
    routineCode: seed.routineCode,
    version: seed.version,
    name: seed.name,
    metadata: { paper_form: seed.paperForm },
    isActive: true,
    exercises: seed.slots.map((slot, slotIndex) => {
      const exercise = byExternal.get(slot.externalId)
      if (!exercise) {
        throw new Error(`Missing ${slot.externalId}`)
      }
      return {
        id: uuidFrom(200 + templateIndex * 20 + slotIndex),
        slotId: slot.slotId,
        position: slot.position,
        plannedSets: slot.plannedSets,
        prescription: slot.prescription,
        exercise: {
          id: exercise.id,
          externalId: exercise.externalId,
          name: exercise.name,
          measurementKind: exercise.measurementKind,
          loadType: 'dumbbell',
          unilateral: exercise.unilateral,
          metadata: {},
          isActive: true,
        },
      }
    }),
  }))
}

function candidate(overrides: Partial<HomeAiCandidate['workout']> = {}): HomeAiCandidate {
  return {
    schema_version: '1.3',
    transcription_status: 'VALID',
    workout: {
      date: '2026-09-20',
      routine: 'B',
      template_version: 'B-1.3.1',
      duration_min: 55,
      effort: 3,
      pain: { level: 1, areas: [], notes: null },
      bodyweight_lb: 190,
      notes: 'from sheet',
      exercises: [
        {
          slot_id: 'B01',
          exercise_id: 'EX08',
          notes: null,
          sets: [
            { set_number: 1, type: 'working', weight_lb: 50, load_state: 'external', reps: 10 },
            { set_number: 2, type: 'working', weight_lb: 50, load_state: 'external', reps: 10 },
            { set_number: 3, type: 'working', weight_lb: 50, load_state: 'external', reps: 9 },
          ],
        },
      ],
      ...overrides,
    },
  }
}

describe('candidate adapter', () => {
  it('maps routine/template and keeps lb values in the review draft', () => {
    const adapted = adaptHomeAiCandidate({
      candidate: candidate(),
      review: { status: 'AUTO_ACCEPT', review_status: 'AUTO_ACCEPT', save_ready: true, issues: [] },
      templates: templates(),
      exercises: library(),
    })
    expect(adapted.canAdapt).toBe(true)
    expect(adapted.draft?.workoutTemplateId).toBe(uuidFrom(101))
    const squat = adapted.draft?.exercises.find((exercise) => exercise.slotId === 'B01')
    expect(squat?.name).toBe('Goblet Squat to Bench')
    expect(squat?.sets[0]?.weightLb).toBe('50')
    expect(squat?.sets[0]?.reps).toBe('10')
    expect(adapted.warnings.some((item) => item.code === 'STILL_NEEDS_HUMAN_REVIEW')).toBe(true)
  })

  it('preserves a null/partial date and does not invent a year', () => {
    const adapted = adaptHomeAiCandidate({
      candidate: {
        ...candidate({ date: null }),
        transcription_status: 'REVIEW_REQUIRED',
        ambiguities: [
          {
            location: 'workout.date',
            field: 'date',
            detected_value: '4/12',
            reason: 'PARTIAL_DATE: year is not written',
          },
        ],
      },
      review: { status: 'REVIEW_REQUIRED', issues: [{ code: 'PARTIAL_DATE', location: 'header.date' }] },
      templates: templates(),
      exercises: library(),
    })
    expect(adapted.draft?.workoutDate).toBe('')
    expect(adapted.warnings.some((item) => item.code === 'DATE_NEEDS_CONFIRMATION')).toBe(true)
  })

  it('preserves a missing unilateral side and unknown load', () => {
    const adapted = adaptHomeAiCandidate({
      candidate: candidate({
        exercises: [
          {
            slot_id: 'B05',
            exercise_id: 'EX11',
            notes: null,
            sets: [
              {
                set_number: 1,
                type: 'working',
                weight_lb: 20,
                load_state: 'external',
                left_reps: 8,
                right_reps: null,
              },
              { set_number: 2, type: 'working', load_state: 'unknown', reps: 6 },
            ],
          },
        ],
      }),
      review: null,
      templates: templates(),
      exercises: library(),
    })
    const lunge = adapted.draft?.exercises.find((exercise) => exercise.slotId === 'B05')
    expect(lunge?.sets[0]?.leftReps).toBe('8')
    expect(lunge?.sets[0]?.rightReps).toBe('')
    expect(lunge?.sets[1]?.loadState).toBe('unknown')
    expect(lunge?.sets[1]?.weightLb).toBe('')
  })

  it('flags unknown exercise IDs and slot/exercise conflicts without guessing', () => {
    const adapted = adaptHomeAiCandidate({
      candidate: candidate({
        exercises: [
          { slot_id: 'B01', exercise_id: 'EX99', notes: null, sets: [{ set_number: 1, reps: 8, load_state: 'bodyweight' }] },
          { slot_id: 'Z99', exercise_id: 'EX99', notes: null, sets: [{ set_number: 1, reps: 5, load_state: 'bodyweight' }] },
        ],
      }),
      review: null,
      templates: templates(),
      exercises: library(),
    })
    expect(adapted.warnings.some((item) => item.code === 'SLOT_EXERCISE_CONFLICT')).toBe(true)
    expect(adapted.warnings.some((item) => item.code === 'UNKNOWN_EXERCISE')).toBe(true)
    const squat = adapted.draft?.exercises.find((exercise) => exercise.slotId === 'B01')
    expect(squat?.sets.every((set) => set.reps === '')).toBe(true)
  })

  it('does not resolve a routine/template mismatch', () => {
    const adapted = adaptHomeAiCandidate({
      candidate: candidate({ routine: 'B', template_version: 'C-1.3.1' }),
      review: null,
      templates: templates(),
      exercises: library(),
    })
    expect(adapted.draft?.workoutTemplateId).toBeNull()
    expect(adapted.warnings.some((item) => item.code === 'TEMPLATE_ROUTINE_CONFLICT')).toBe(true)
  })
})

describe('imported commit reuse', () => {
  it('turns reviewed draft edits into a canonical imported request in kg', () => {
    const adapted = adaptHomeAiCandidate({
      candidate: candidate(),
      review: null,
      templates: templates(),
      exercises: library(),
    })
    const workoutDraft = draftFromTranscription(adapted.draft!, templates()[1] ?? null)
    workoutDraft.exercises[0]!.sets[0] = {
      ...workoutDraft.exercises[0]!.sets[0]!,
      weightLb: '55',
      reps: '8',
    }
    const request = buildManualWorkoutPayload(workoutDraft)
    const prepared = prepareManualSession({
      request,
      template: templates()[1]!,
      sourceKind: 'imported_candidate',
      exercisesById: new Map(
        library().map((exercise) => [
          exercise.id,
          {
            id: exercise.id,
            externalId: exercise.externalId,
            name: exercise.name,
            measurementKind: exercise.measurementKind,
            loadType: 'dumbbell',
            unilateral: exercise.unilateral,
            metadata: {},
            isActive: true,
          },
        ]),
      ),
    })
    expect(prepared.sourceKind).toBe('imported_candidate')
    expect(prepared.exercises[0]?.sets[0]?.weightKg).toBeCloseTo(poundsToKilograms(55), 10)
    expect(prepared.metadata.entry_mass_unit).toBe('lb')
  })

  it('uses a job-identity fingerprint and claim-before-insert SQL', () => {
    expect(homeAiJobFingerprint(JOB_ID)).toBe('workout-v1.3.1-job:11111111-1111-4111-8111-111111111111')
    expect(CLAIM_AND_INSERT_WORKOUT_SQL).toMatch(
      /INSERT INTO source_record_links[\s\S]*ON CONFLICT \(source_id, external_fingerprint\) DO NOTHING/,
    )
    expect(CLAIM_AND_INSERT_WORKOUT_SQL).toContain('INSERT INTO workout_sessions')
    expect(CLAIM_AND_INSERT_WORKOUT_SQL).toContain('FROM claimed')
    const payload = provenancePayload({
      jobId: JOB_ID,
      candidate: candidate(),
      review: { save_ready: true, review_status: 'AUTO_ACCEPT' },
    })
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('/home/')
    expect(serialized).not.toContain('API_KEY')
    expect(payload).not.toHaveProperty('image')
    expect(payload.originating_source).toBe('workout_image')
    expect(payload.interpreter).toBe('home_ai')
  })
})

describe('Health transcription GET mapping', () => {
  it('returns queued/processing without starting extra work, and keeps the API key out of the body', async () => {
    const mock: HomeAiClient = {
      createWorkoutTranscriptionJob: async () => ({ id: JOB_ID, status: 'queued' }),
      getWorkoutTranscriptionJob: async () => ({
        id: JOB_ID,
        status: 'processing',
        elapsedMs: null,
        candidate: null,
        review: null,
        error: null,
      }),
      createNutritionLabelJob: async () => ({ id: JOB_ID, status: 'queued' }),
      getNutritionLabelJob: async () => ({
        id: JOB_ID,
        status: 'queued',
        elapsedMs: null,
        imageAvailable: false,
        candidate: null,
        error: null,
      }),
      getNutritionLabelImage: async () => null,
    }
    const body = await getTranscriptionJob(JOB_ID, mock, { templates: templates(), exercises: library() })
    const serialized = JSON.stringify(body)
    expect(body.job.status).toBe('processing')
    expect(body.draft).toBeNull()
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('HOME_AI')
    expect(serialized).not.toContain('/home/')
  })

  it('maps a failed home-ai job to a Health failure without a 500 draft', async () => {
    const mock: HomeAiClient = {
      createWorkoutTranscriptionJob: async () => ({ id: JOB_ID, status: 'queued' }),
      getWorkoutTranscriptionJob: async () => ({
        id: JOB_ID,
        status: 'failed',
        elapsedMs: null,
        candidate: null,
        review: null,
        error: { code: 'PIPELINE_INTERRUPTED', message: 'Analysis was interrupted on the home server. Try the photo again.' },
      }),
      createNutritionLabelJob: async () => ({ id: JOB_ID, status: 'queued' }),
      getNutritionLabelJob: async () => ({
        id: JOB_ID,
        status: 'failed',
        elapsedMs: null,
        imageAvailable: false,
        candidate: null,
        error: null,
      }),
      getNutritionLabelImage: async () => null,
    }
    const body = await getTranscriptionJob(JOB_ID, mock, { templates: templates(), exercises: library() })
    expect(body.job.status).toBe('failed')
    expect(body.failure?.code).toBe('PIPELINE_INTERRUPTED')
    expect(body.draft).toBeNull()
  })
})
