import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CLAIM_AND_INSERT_ACTIVITY_WORKOUT_SQL } from '../server/apple-health/queries.ts'
import { HttpError } from '../server/http.ts'
import { prepareManualSession } from '../server/training/service.ts'
import { applyPaperInheritanceToManualRequest } from '../src/domain/paper-load.ts'
import { exclusionReasonForSet } from '../src/domain/progress/exercise-performance.ts'
import type { CanonicalSetRecord, ProgressExerciseDefinition } from '../src/domain/progress/types.ts'
import {
  EXPERIMENT_SESSION_MESSAGE,
  OWNER_EXERCISE_ORIGIN,
  classifyHistoricalTrainingSession,
  isOwnerCreatedExercise,
  manualWorkoutRequestSchema,
  ownerExerciseAnalyticsDefaults,
  planOwnerExercisePatch,
  programmedTemplateEditError,
  sessionTypeEditError,
  trainingSessionCountsAsTraining,
  trainingSessionDisplayName,
  trainingSessionTypeSchema,
  type ExerciseDefinition,
  type ManualWorkoutRequest,
  type WorkoutTemplate,
} from '../src/domain/training.ts'
import { draftForAdHocWorkout, draftFromTemplate } from '../src/features/training/draft.ts'

const EXERCISE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const TEMPLATE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const SLOT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function definition(
  id: string,
  name: string,
  measurementKind: ExerciseDefinition['measurementKind'],
  extras: Partial<ExerciseDefinition> = {},
): ExerciseDefinition {
  return {
    id,
    externalId: 'EX01',
    name,
    measurementKind,
    loadType: 'barbell',
    unilateral: measurementKind.endsWith('per_side'),
    metadata: {},
    isActive: true,
    ...extras,
  }
}

function template(exercise: ExerciseDefinition): WorkoutTemplate {
  return {
    id: TEMPLATE,
    routineCode: 'A',
    version: '1.3.1',
    name: 'Full Body A — Chest & Arms Focus',
    metadata: {},
    isActive: true,
    exercises: [
      {
        id: SLOT,
        slotId: 'A01',
        position: 1,
        plannedSets: 3,
        prescription: { measurement: 'reps' },
        exercise,
      },
    ],
  }
}

function set(overrides: Partial<ManualWorkoutRequest['exercises'][number]['sets'][number]> = {}) {
  return {
    setNumber: 1,
    setType: 'working' as const,
    loadState: 'external' as const,
    weightLb: 95,
    reps: 8,
    durationSec: null,
    leftReps: null,
    rightReps: null,
    leftDurationSec: null,
    rightDurationSec: null,
    notes: null,
    ...overrides,
  }
}

function request(overrides: Partial<ManualWorkoutRequest> = {}): ManualWorkoutRequest {
  return manualWorkoutRequestSchema.parse({
    workoutDate: '2026-09-26',
    workoutTemplateId: null,
    sessionType: 'ad_hoc',
    sessionName: 'Garage kettlebells',
    durationMin: null,
    effort: null,
    painLevel: null,
    bodyweightLb: null,
    notes: null,
    exercises: [
      {
        exerciseDefinitionId: EXERCISE,
        slotId: null,
        notes: null,
        sets: [set()],
      },
    ],
    ...overrides,
  })
}

function prepare(input: {
  request: ManualWorkoutRequest
  exercises: ExerciseDefinition[]
  template?: WorkoutTemplate | null
}) {
  return prepareManualSession({
    request: input.request,
    exercisesById: new Map(input.exercises.map((exercise) => [exercise.id, exercise])),
    template: input.template ?? null,
  })
}

describe('training session type', () => {
  it('accepts the canonical session types and rejects anything else', () => {
    expect(trainingSessionTypeSchema.parse('programmed')).toBe('programmed')
    expect(trainingSessionTypeSchema.parse('ad_hoc')).toBe('ad_hoc')
    expect(trainingSessionTypeSchema.parse('experiment')).toBe('experiment')
    expect(trainingSessionTypeSchema.safeParse('quick').success).toBe(false)
  })

  it('classifies historical rows from template identity', () => {
    expect(classifyHistoricalTrainingSession({ workoutTemplateId: TEMPLATE })).toBe('programmed')
    expect(classifyHistoricalTrainingSession({ routineCode: 'B' })).toBe('programmed')
    expect(classifyHistoricalTrainingSession({ templateVersion: '1.3.1' })).toBe('programmed')
    expect(classifyHistoricalTrainingSession({ templateName: 'Full Body A' })).toBe('programmed')
    expect(classifyHistoricalTrainingSession({})).toBe('ad_hoc')
    const migration = readFileSync('migrations/0019_training_session_types.sql', 'utf8')
    expect(migration).toContain("THEN 'programmed'")
    expect(migration).toContain("ELSE 'ad_hoc'")
    expect(migration).not.toContain('DEFAULT')
  })

  it('keeps programmed and ad-hoc creation coherent', () => {
    const bench = definition(EXERCISE, 'Barbell Bench Press', 'reps')
    const programmed = prepare({
      request: request({
        sessionType: 'programmed',
        sessionName: 'ignored',
        workoutTemplateId: TEMPLATE,
        exercises: [{ exerciseDefinitionId: EXERCISE, slotId: 'A01', notes: null, sets: [set()] }],
      }),
      exercises: [bench],
      template: template(bench),
    })
    expect(programmed.sessionType).toBe('programmed')
    expect(programmed.workoutTemplateId).toBe(TEMPLATE)
    expect(programmed.routineCode).toBe('A')
    expect(programmed.templateVersion).toBe('1.3.1')
    expect(programmed.templateName).toBe('Full Body A — Chest & Arms Focus')
    expect(programmed.sessionName).toBeNull()
    expect(programmed.exercises[0]?.exerciseName).toBe('Barbell Bench Press')

    expect(() =>
      prepare({
        request: request({ sessionType: 'programmed', workoutTemplateId: null }),
        exercises: [bench],
      }),
    ).toThrow(/needs a template/)

    const adHoc = prepare({
      request: request({ sessionName: '   ' }),
      exercises: [definition(EXERCISE, 'Kettlebell Swing', 'reps', { loadType: 'kettlebell', externalId: null })],
    })
    expect(adHoc.sessionType).toBe('ad_hoc')
    expect(adHoc.sessionName).toBeNull()
    expect(adHoc.workoutTemplateId).toBeNull()
    expect(adHoc.routineCode).toBeNull()
    expect(adHoc.templateVersion).toBeNull()
    expect(adHoc.templateName).toBeNull()
    expect(adHoc.exercises[0]?.slotId).toBeNull()
    expect(adHoc.exercises[0]?.exerciseName).toBe('Kettlebell Swing')

    expect(() =>
      prepare({
        request: request({ workoutTemplateId: TEMPLATE }),
        exercises: [bench],
        template: template(bench),
      }),
    ).toThrow(/cannot use a template/)
    expect(() =>
      prepare({
        request: request({
          exercises: [{ exerciseDefinitionId: EXERCISE, slotId: 'A01', notes: null, sets: [set()] }],
        }),
        exercises: [bench],
      }),
    ).toThrow(/template slot/)
    expect(() => prepare({ request: request({ sessionType: 'experiment' }), exercises: [bench] })).toThrow(
      EXPERIMENT_SESSION_MESSAGE,
    )
    try {
      prepare({ request: request({ sessionType: 'experiment' }), exercises: [bench] })
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).statusCode).toBe(409)
    }
  })

  it('keeps Personal Lab parents on experiment sessions only', () => {
    const bench = definition(EXERCISE, 'Push-up', 'reps')
    const experimentId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    const versionId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    expect(() =>
      prepare({
        request: request({ sessionType: 'programmed', workoutTemplateId: TEMPLATE, experimentId }),
        exercises: [bench],
        template: template(bench),
      }),
    ).toThrow(/cannot link a Personal Lab parent/)
    expect(() =>
      prepare({
        request: request({ experimentId }),
        exercises: [bench],
      }),
    ).toThrow(/cannot link a Personal Lab parent/)
    const linked = prepare({
      request: request({
        sessionType: 'experiment',
        sessionName: 'Capacity check',
        experimentId,
        benchmarkProtocolVersionId: versionId,
      }),
      exercises: [bench],
    })
    expect(linked.sessionType).toBe('experiment')
    expect(linked.experimentId).toBe(experimentId)
    expect(linked.benchmarkProtocolVersionId).toBe(versionId)
    expect(linked.workoutTemplateId).toBeNull()
    const benchmarkOnly = prepare({
      request: request({ sessionType: 'experiment', benchmarkProtocolVersionId: versionId }),
      exercises: [bench],
    })
    expect(benchmarkOnly.experimentId).toBeNull()
    expect(benchmarkOnly.benchmarkProtocolVersionId).toBe(versionId)
    expect(() =>
      prepare({
        request: request({ sessionType: 'experiment', workoutTemplateId: TEMPLATE, experimentId }),
        exercises: [bench],
        template: template(bench),
      }),
    ).toThrow(/cannot use a template/)
  })

  it('does not let an ordinary edit change session type or programmed identity', () => {
    expect(sessionTypeEditError('programmed', 'ad_hoc')?.message).toMatch(/cannot change/)
    expect(sessionTypeEditError('ad_hoc', 'programmed')?.message).toMatch(/cannot change/)
    expect(sessionTypeEditError('ad_hoc', 'ad_hoc')).toBeNull()
    expect(sessionTypeEditError('experiment', 'experiment')).toBeNull()
    expect(programmedTemplateEditError(TEMPLATE, OTHER)).toMatch(/cannot change/)
    expect(programmedTemplateEditError(TEMPLATE, null)).toBeNull()
    const service = readFileSync('server/training/service.ts', 'utf8')
    expect(service).toContain('sessionTypeEditError')
    expect(service).not.toContain('session_type =')
  })
})

describe('ad-hoc sets', () => {
  it('stores each measurement family through the canonical preparer', () => {
    const cases = [
      ['reps', set()] as const,
      ['duration', set({ reps: null, durationSec: 45, loadState: 'bodyweight', weightLb: null })] as const,
      ['reps_per_side', set({ reps: null, leftReps: 8, rightReps: null })] as const,
      ['duration_per_side', set({ reps: null, weightLb: null, loadState: 'bodyweight', leftDurationSec: 20, rightDurationSec: 20 })] as const,
    ]
    for (const [kind, performed] of cases) {
      const prepared = prepare({
        request: request({
          exercises: [{ exerciseDefinitionId: EXERCISE, slotId: null, notes: null, sets: [performed] }],
        }),
        exercises: [definition(EXERCISE, 'Custom', kind)],
      })
      expect(prepared.exercises[0]?.sets).toHaveLength(1)
    }
    const oneSided = prepare({
      request: request({
        exercises: [{ exerciseDefinitionId: EXERCISE, slotId: null, notes: null, sets: [set({ reps: null, leftReps: 6, rightReps: null })] }],
      }),
      exercises: [definition(EXERCISE, 'Lunge', 'reps_per_side')],
    })
    expect(oneSided.exercises[0]?.sets[0]?.leftReps).toBe(6)
    expect(oneSided.exercises[0]?.sets[0]?.rightReps).toBeNull()
  })

  it('rejects family mismatches, mixed fields, illegal loads, and duplicate set numbers', () => {
    const reps = definition(EXERCISE, 'Push-up', 'reps', { loadType: 'bodyweight' })
    expect(() =>
      prepare({
        request: request({
          exercises: [{ exerciseDefinitionId: EXERCISE, slotId: null, notes: null, sets: [set({ reps: null, durationSec: 30, weightLb: null, loadState: 'bodyweight' })] }],
        }),
        exercises: [reps],
      }),
    ).toThrow(/expects reps/)
    const invalid = (performed: ReturnType<typeof set>) =>
      manualWorkoutRequestSchema.safeParse({
        workoutDate: '2026-09-26',
        workoutTemplateId: null,
        sessionType: 'ad_hoc',
        sessionName: null,
        durationMin: null,
        effort: null,
        painLevel: null,
        bodyweightLb: null,
        notes: null,
        exercises: [{ exerciseDefinitionId: EXERCISE, slotId: null, notes: null, sets: [performed] }],
      })
    expect(invalid(set({ durationSec: 30 })).success).toBe(false)
    expect(invalid(set({ weightLb: null })).success).toBe(false)
    expect(invalid(set({ loadState: 'bodyweight', weightLb: 25 })).success).toBe(false)
    expect(invalid(set({ loadState: 'unknown', weightLb: 25 })).success).toBe(false)
    expect(() =>
      prepare({
        request: request({
          exercises: [{
            exerciseDefinitionId: EXERCISE,
            slotId: null,
            notes: null,
            sets: [set(), set({ setNumber: 1, reps: 6 })],
          }],
        }),
        exercises: [reps],
      }),
    ).toThrow(/Duplicate set numbers/)
    const zero = prepare({
      request: request({
        exercises: [{ exerciseDefinitionId: EXERCISE, slotId: null, notes: null, sets: [set({ loadState: 'bodyweight', weightLb: null, reps: 0 })] }],
      }),
      exercises: [reps],
    })
    expect(zero.exercises[0]?.sets[0]?.reps).toBe(0)
  })

  it('inherits load only inside the same exercise', () => {
    const inherited = applyPaperInheritanceToManualRequest({
      workoutDate: '2026-09-26',
      workoutTemplateId: null,
      sessionType: 'ad_hoc',
      durationMin: null,
      effort: null,
      painLevel: null,
      bodyweightLb: null,
      notes: null,
      exercises: [
        {
          exerciseDefinitionId: EXERCISE,
          slotId: null,
          notes: null,
          sets: [
            set({ weightLb: 24 }),
            set({ setNumber: 2, weightLb: null, reps: 10 }),
          ],
        },
        {
          exerciseDefinitionId: OTHER,
          slotId: null,
          notes: null,
          sets: [set({ weightLb: null, reps: 8 })],
        },
      ],
    })
    expect(inherited.exercises[0]?.sets.map((item) => item.weightLb)).toEqual([24, 24])
    expect(inherited.exercises[1]?.sets[0]?.weightLb).toBeNull()
    const draft = draftForAdHocWorkout(new Date('2026-09-26T18:00:00.000Z'))
    expect(draft.exercises).toEqual([])
    expect(draft.sessionType).toBe('ad_hoc')
    expect(draft.template).toBeNull()
    const programmed = draftFromTemplate(template(definition(EXERCISE, 'Box Squat', 'reps')))
    expect(programmed.sessionType).toBe('programmed')
  })
})

describe('owner exercises', () => {
  const owner = definition(EXERCISE, 'Push-up', 'reps', {
    externalId: null,
    loadType: 'bodyweight',
    metadata: { ...OWNER_EXERCISE_ORIGIN },
  })

  it('defaults analytics conservatively and protects seeded definitions', () => {
    expect(ownerExerciseAnalyticsDefaults('reps', false)).toEqual({
      performanceType: 'other',
      analyticsLoadType: 'none',
      analyticsRepMode: 'standard',
    })
    expect(ownerExerciseAnalyticsDefaults('reps_per_side', true).analyticsRepMode).toBe('per_side')
    expect(isOwnerCreatedExercise(owner)).toBe(true)
    expect(isOwnerCreatedExercise(definition(OTHER, 'Box Squat', 'reps'))).toBe(false)
    const seeded = planOwnerExercisePatch({
      existing: definition(OTHER, 'Box Squat', 'reps'),
      next: { name: 'Box Squat', measurementKind: 'reps', loadType: 'barbell', unilateral: false },
      used: false,
    })
    expect(seeded.ok).toBe(false)
    const archived = planOwnerExercisePatch({
      existing: owner,
      next: { name: 'Push-up', measurementKind: 'reps', loadType: 'bodyweight', unilateral: false },
      used: true,
    })
    expect(archived.ok).toBe(true)
    const unused = planOwnerExercisePatch({
      existing: owner,
      next: { name: 'Push-up', measurementKind: 'duration', loadType: 'bodyweight', unilateral: false },
      used: false,
    })
    expect(unused.ok).toBe(true)
    if (unused.ok) {
      expect(unused.measurementKind).toBe('duration')
    }
    const used = planOwnerExercisePatch({
      existing: owner,
      next: { name: 'Push-up', measurementKind: 'duration', loadType: 'bodyweight', unilateral: false },
      used: true,
    })
    expect(used.ok).toBe(false)
    const unilateral = planOwnerExercisePatch({
      existing: owner,
      next: { name: 'Push-up', measurementKind: 'reps_per_side', loadType: 'bodyweight', unilateral: true },
      used: true,
    })
    expect(unilateral.ok).toBe(false)
    const renamed = planOwnerExercisePatch({
      existing: owner,
      next: { name: 'Push-up (strict)', measurementKind: 'reps', loadType: 'bodyweight', unilateral: false },
      used: true,
    })
    expect(renamed.ok).toBe(true)
    if (renamed.ok) {
      expect(renamed.nameOnly).toBe(true)
    }
    const sql = readFileSync('server/training/owner-exercises.ts', 'utf8')
    expect(sql).toContain("'other'")
    expect(sql).toContain("'none'")
    expect(sql).toContain('is_active = false')
    expect(sql).not.toContain('DELETE FROM exercise_definitions')
    expect(sql).not.toContain('exercise_name =')
  })
})

describe('ad-hoc training still counts', () => {
  it('names sessions from intent and keeps unsupported analytics unsupported', () => {
    expect(trainingSessionDisplayName({
      sessionType: 'programmed',
      templateName: 'Full Body B — Legs, Glutes & Dad Strength Focus',
      routineCode: 'B',
    })).toBe('Full Body B — Legs, Glutes & Dad Strength Focus')
    expect(trainingSessionDisplayName({ sessionType: 'ad_hoc', sessionName: 'Push-up volume' })).toBe('Push-up volume')
    expect(trainingSessionDisplayName({ sessionType: 'ad_hoc', sessionName: null })).toBe('Ad-hoc workout')
    expect(trainingSessionDisplayName({ sessionType: 'experiment', sessionName: null })).toBe('Experiment workout')
    expect(trainingSessionCountsAsTraining('ad_hoc')).toBe(true)
    expect(trainingSessionCountsAsTraining('programmed')).toBe(true)
    const today = readFileSync('server/today/queries.ts', 'utf8')
    const trainingDates = today.slice(
      today.indexOf('export async function listTrainingSessionsBetween'),
      today.indexOf('export async function listTrainingToday'),
    )
    expect(trainingDates).toContain('FROM workout_sessions')
    expect(trainingDates).not.toContain('session_type')
    const custom: ProgressExerciseDefinition = {
      id: EXERCISE,
      name: 'Push-up',
      externalId: null,
      performanceType: 'other',
      analyticsLoadType: 'none',
      analyticsRepMode: 'standard',
      measurementKind: 'reps',
      unilateral: false,
    }
    const performed: CanonicalSetRecord = {
      setId: 'set',
      sessionId: 'session',
      sessionExerciseId: 'session-exercise',
      exerciseId: EXERCISE,
      sessionDate: '2026-09-26',
      sessionCreatedAt: '2026-09-26T18:00:00.000Z',
      sessionExercisePosition: 1,
      setNumber: 1,
      setType: 'working',
      loadState: 'bodyweight',
      weightKg: null,
      reps: 20,
      durationSec: null,
      leftReps: null,
      rightReps: null,
      leftDurationSec: null,
      rightDurationSec: null,
    }
    expect(exclusionReasonForSet(performed, custom)).toBe('unsupported_performance_type:other')
    const classified: ProgressExerciseDefinition = { ...custom, name: 'Barbell Bench Press', externalId: 'EX02', performanceType: 'loaded_reps', analyticsLoadType: 'external' }
    expect(exclusionReasonForSet({ ...performed, loadState: 'external', weightKg: 100, reps: 5 }, classified)).toBeNull()
    expect(CLAIM_AND_INSERT_ACTIVITY_WORKOUT_SQL).not.toContain('workout_sessions')
  })
})
