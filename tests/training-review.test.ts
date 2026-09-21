import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { HttpError } from '../server/http.ts'
import { parseManualWorkoutRequest } from '../server/training/service.ts'
import { CLAIM_AND_INSERT_WORKOUT_SQL } from '../server/training/commit-sql.ts'
import {
  DraftValidationError,
  buildManualWorkoutPayload,
  draftFromTemplate,
  emptyDraftSet,
  validateWorkoutDraft,
} from '../src/features/training/draft.ts'
import type { WorkoutTemplate } from '../src/domain/training.ts'
import { homeAiJobFingerprint } from '../src/domain/training-transcription.ts'

const ROOT = process.cwd()
const EXERCISE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TEMPLATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SLOT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const JOB_ID = '11111111-1111-4111-8111-111111111111'

function template(): WorkoutTemplate {
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
          metadata: {},
          isActive: true,
        },
      },
    ],
  }
}

function source(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), 'utf8')
}

describe('review draft validation after paper inference', () => {
  it('saves inherited loads and omits blank unperformed rows', () => {
    const draft = draftFromTemplate(template(), new Date(2026, 8, 20))
    draft.exercises[0]!.sets[0] = { ...emptyDraftSet(1), weightLb: '30', reps: '10' }
    draft.exercises[0]!.sets[1] = { ...emptyDraftSet(2), reps: '10' }
    draft.exercises[0]!.sets[2] = emptyDraftSet(3)
    const payload = buildManualWorkoutPayload(draft)
    expect(payload.exercises[0]?.sets).toEqual([
      expect.objectContaining({ setNumber: 1, loadState: 'external', weightLb: 30, reps: 10 }),
      expect.objectContaining({ setNumber: 2, loadState: 'external', weightLb: 30, reps: 10 }),
    ])
  })

  it('does not block save for optional blanks or reps outside the planned range', () => {
    const draft = draftFromTemplate(template(), new Date(2026, 8, 20))
    draft.durationMin = ''
    draft.bodyweightLb = ''
    draft.effort = null
    draft.painLevel = null
    draft.notes = ''
    draft.exercises[0]!.sets[0] = { ...emptyDraftSet(1), loadState: 'bodyweight', reps: '20' }
    expect(validateWorkoutDraft(draft)).toEqual([])
    const payload = buildManualWorkoutPayload(draft)
    expect(payload.durationMin).toBeNull()
    expect(payload.bodyweightLb).toBeNull()
    expect(payload.exercises[0]?.sets[0]).toMatchObject({ loadState: 'bodyweight', weightLb: null, reps: 20 })
  })

  it('surfaces exact field errors and clears them when corrected', () => {
    const draft = draftFromTemplate(template(), new Date(2026, 8, 20))
    draft.exercises[0]!.sets[0] = { ...emptyDraftSet(1), reps: '10' }
    const errors = validateWorkoutDraft(draft)
    expect(errors).toEqual([
      {
        path: 'exercises.0.sets.0.weightLb',
        message: 'Load required — no previous load exists to inherit.',
      },
    ])
    expect(() => buildManualWorkoutPayload(draft)).toThrow(DraftValidationError)
    draft.exercises[0]!.sets[0] = { ...emptyDraftSet(1), weightLb: '30', reps: '10' }
    expect(validateWorkoutDraft(draft)).toEqual([])
  })

  it('validates the same inherited request on the commit path', () => {
    const parsed = parseManualWorkoutRequest({
      workoutDate: '2026-09-20',
      workoutTemplateId: TEMPLATE_ID,
      durationMin: null,
      effort: null,
      painLevel: null,
      bodyweightLb: null,
      notes: null,
      exercises: [
        {
          exerciseDefinitionId: EXERCISE_ID,
          slotId: 'A01',
          notes: null,
          sets: [
            {
              setNumber: 1,
              loadState: 'external',
              weightLb: 25,
              reps: 10,
              durationSec: null,
              leftReps: null,
              rightReps: null,
              leftDurationSec: null,
              rightDurationSec: null,
              notes: null,
            },
            {
              setNumber: 2,
              loadState: 'external',
              weightLb: null,
              reps: 10,
              durationSec: null,
              leftReps: null,
              rightReps: null,
              leftDurationSec: null,
              rightDurationSec: null,
              notes: null,
            },
            {
              setNumber: 3,
              loadState: 'external',
              weightLb: 30,
              reps: 8,
              durationSec: null,
              leftReps: null,
              rightReps: null,
              leftDurationSec: null,
              rightDurationSec: null,
              notes: null,
            },
            {
              setNumber: 4,
              loadState: 'external',
              weightLb: null,
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
      ],
    })
    expect(parsed.exercises[0]?.sets.map((set) => set.weightLb)).toEqual([25, 25, 30, 30])

    try {
      parseManualWorkoutRequest({
        workoutDate: '2026-09-20',
        workoutTemplateId: null,
        durationMin: null,
        effort: null,
        painLevel: null,
        bodyweightLb: null,
        notes: null,
        exercises: [
          {
            exerciseDefinitionId: EXERCISE_ID,
            slotId: null,
            notes: null,
            sets: [
              {
                setNumber: 1,
                loadState: 'external',
                weightLb: null,
                reps: 10,
                durationSec: null,
                leftReps: null,
                rightReps: null,
                leftDurationSec: null,
                rightDurationSec: null,
                notes: null,
              },
            ],
          },
        ],
      })
      throw new Error('expected HttpError')
    } catch (caught) {
      expect(caught).toBeInstanceOf(HttpError)
      const error = caught as HttpError
      expect(error.statusCode).toBe(400)
      expect(error.message).toBe('1 field needs attention')
      expect(error.fields).toEqual([
        {
          path: 'exercises.0.sets.0.weightLb',
          message: 'Load required — no previous load exists to inherit.',
        },
      ])
    }
  })
})

describe('cross-device pending reviews', () => {
  it('discovers jobs from the Health API and URL, not browser storage', () => {
    expect(existsSync(path.join(ROOT, 'src/features/training/transcription-state.ts'))).toBe(false)
    const training = source('src/features/training/TrainingPage.tsx')
    const importPage = source('src/features/training/ImportWorkoutPage.tsx')
    const api = source('src/features/training/api.ts')
    for (const text of [training, importPage, api]) {
      expect(text).not.toContain('sessionStorage')
      expect(text).not.toContain('localStorage')
    }
    expect(api).toContain("healthFetch('/api/training/transcription/jobs')")
    expect(training).toContain('fetchTranscriptionJobs')
    expect(training).toContain('/training/import?job=')
    expect(importPage).toContain("searchParams.get('job')")
    expect(importPage).toContain('/training/import?job=')
  })

  it('keeps a completed candidate human-review-required and never auto-commits', () => {
    const importPage = source('src/features/training/ImportWorkoutPage.tsx')
    expect(importPage).toContain('commitImportedSession')
    expect(importPage).toContain('nothing is saved until you confirm')
    expect(importPage).toMatch(/async function onCommit\([\s\S]*commitImportedSession/)
    expect(importPage.split('commitImportedSession')).toHaveLength(3)
    expect(importPage).not.toContain('auto-commit')
    const adapter = source('src/domain/training-transcription.ts')
    expect(adapter).toContain('STILL_NEEDS_HUMAN_REVIEW')
    expect(adapter).toContain('Review the whole workout anyway')
    const listSchema = source('src/domain/training-transcription.ts')
    expect(listSchema).toContain("status: z.enum(['queued', 'processing', 'completed', 'failed'])")
    expect(listSchema).not.toMatch(/pendingTranscriptionJobSchema[\s\S]*committed/)
  })

  it('keeps commit idempotent on job identity', () => {
    expect(homeAiJobFingerprint(JOB_ID)).toBe(`workout-v1.3.1-job:${JOB_ID}`)
    expect(CLAIM_AND_INSERT_WORKOUT_SQL).toContain('ON CONFLICT (source_id, external_fingerprint) DO NOTHING')
    const service = source('server/training/service.ts')
    expect(service).toContain('recordTranscriptionJobCommitted')
    expect(service).toContain('findSessionIdByHomeAiJob')
    const store = source('server/training/job-store.ts')
    expect(store).toContain('ON CONFLICT (home_ai_job_id)')
    expect(store).toContain("WHEN workout_transcription_jobs.status = 'committed'")
  })
})

describe('review UI field treatment', () => {
  it('marks inherited loads in the editor without mutating raw candidate mapping', () => {
    const editor = source('src/features/training/WorkoutEditor.tsx')
    expect(editor).toContain('inherited')
    expect(editor).toContain('interpretPaperSets')
    expect(editor).toContain('fields need attention')
    expect(editor).toContain('data-field-path')
    const adapter = source('src/domain/training-transcription.ts')
    expect(adapter).toContain('transcribedLoadState: loadState')
    expect(adapter).toContain('transcribedWeightLb: weightLb')
    expect(adapter).toContain('candidate: input.candidate')
  })
})
