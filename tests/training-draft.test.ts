import { describe, expect, it } from 'vitest'
import type { WorkoutTemplate } from '../src/domain/training.ts'
import { poundsToKilograms } from '../src/domain/units.ts'
import {
  buildManualWorkoutPayload,
  draftFromTemplate,
  emptyDraftSet,
} from '../src/features/training/draft.ts'
import { prepareManualSession } from '../server/training/service.ts'

const EXERCISE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TEMPLATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SLOT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function boxSquatTemplate(): WorkoutTemplate {
  return {
    id: TEMPLATE_ID,
    routineCode: 'A',
    version: '1.3.1',
    name: 'Full Body A — Chest & Arms Focus',
    metadata: { paper_form: 'A-1.3.1' },
    isActive: true,
    exercises: [
      {
        id: SLOT_ID,
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
          metadata: { equipment_load: 'barbell_total_including_bar' },
          isActive: true,
        },
      },
    ],
  }
}

describe('manual workout draft', () => {
  it('prepopulates planned set rows and omits untouched rows on save', () => {
    const draft = draftFromTemplate(boxSquatTemplate(), new Date(2026, 8, 20))
    expect(draft.exercises[0]?.sets).toHaveLength(3)
    expect(draft.workoutDate).toBe('2026-09-20')
    draft.exercises[0]!.sets[0] = {
      ...emptyDraftSet(1),
      weightLb: '225',
      reps: '8',
    }
    const payload = buildManualWorkoutPayload(draft)
    expect(payload.exercises).toHaveLength(1)
    expect(payload.exercises[0]?.sets.map((set) => set.setNumber)).toEqual([1])
    expect(payload.exercises[0]?.sets[0]?.reps).toBe(8)
  })

  it('snapshots library identity and converts lb to kg without using the client name', () => {
    const request = buildManualWorkoutPayload({
      ...draftFromTemplate(boxSquatTemplate(), new Date(2026, 8, 20)),
      exercises: [
        {
          exerciseDefinitionId: EXERCISE_ID,
          slotId: 'A01',
          name: 'Client supplied wrong name',
          measurementKind: 'reps',
          plannedSets: 3,
          prescription: { measurement: 'reps', min: 6, max: 10 },
          notes: '',
          sets: [{ ...emptyDraftSet(1), weightLb: '135', reps: '5' }],
        },
      ],
    })

    const prepared = prepareManualSession({
      request,
      template: boxSquatTemplate(),
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
      ]),
      sessionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    })

    expect(prepared.templateName).toBe('Full Body A — Chest & Arms Focus')
    expect(prepared.exercises[0]?.exerciseName).toBe('Box Squat')
    expect(prepared.exercises[0]?.exerciseExternalId).toBe('EX01')
    expect(prepared.exercises[0]?.sets[0]?.weightKg).toBeCloseTo(poundsToKilograms(135), 10)
    expect(prepared.sourceKind).toBe('manual')
  })
})
