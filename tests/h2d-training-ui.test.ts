import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { trainingPerformanceBestViewSchema, workoutSessionExerciseSchema } from '../src/domain/training.ts'
import { formatTrainingPerformanceBest } from '../src/features/training/format.ts'

const best = (kind: 'reps' | 'duration' | 'distance' | 'pace' | 'skill', value: number, unit: 'reps' | 'sec' | 'mi' | 'sec/mi' | 'completion') =>
  trainingPerformanceBestViewSchema.parse({
    kind, value, unit, date: '2026-09-29',
    sessionId: '11111111-1111-4111-8111-111111111111',
    setId: '22222222-2222-4222-8222-222222222222',
    distanceM: kind === 'pace' ? 3218.688 : null,
    durationSec: kind === 'pace' ? 1180 : null,
    completed: kind === 'skill' ? true : null,
  })

describe('H2D Training best presentation', () => {
  it('formats every new canonical best without persisting a PR flag', () => {
    expect(formatTrainingPerformanceBest(best('reps', 43, 'reps'))).toBe('Best reps · 43')
    expect(formatTrainingPerformanceBest(best('duration', 95, 'sec'))).toBe('Longest duration · 1:35')
    expect(formatTrainingPerformanceBest(best('distance', 2.13, 'mi'))).toBe('Longest distance · 2.13 mi')
    expect(formatTrainingPerformanceBest(best('pace', 590, 'sec/mi'))).toBe('Fastest pace · 9:50/mi · over 2 mi')
    expect(formatTrainingPerformanceBest(best('skill', 1, 'completion'))).toBe('Skill achieved')
    expect(readFileSync('migrations/0038_training_measurements_goals_routines.sql', 'utf8')).not.toMatch(/pr_flag|is_pr|pace_sec_per_mile/i)
  })

  it('keeps performanceBests backward-compatible on session exercise payloads', () => {
    const parsed = workoutSessionExerciseSchema.parse({
      id: '33333333-3333-4333-8333-333333333333',
      exerciseDefinitionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      position: 1,
      slotId: null,
      exerciseExternalId: 'EX18',
      exerciseName: 'Running',
      measurementKind: 'distance_duration',
      notes: null,
      sets: [{
        id: '44444444-4444-4444-8444-444444444444',
        setNumber: 1, setType: 'working', loadState: 'bodyweight', weightKg: null,
        reps: null, durationSec: 1200, leftReps: null, rightReps: null,
        leftDurationSec: null, rightDurationSec: null, distanceM: 3218.688, completed: null, notes: null,
      }],
    })
    expect(parsed.performanceBests).toEqual([])
  })

  it('renders the compact Training bests surface on workout detail', () => {
    const detail = readFileSync('src/features/training/WorkoutDetailPage.tsx', 'utf8')
    expect(detail).toContain('Training bests')
    expect(detail).toContain('formatTrainingPerformanceBest(best)')
    expect(detail).toContain('/training/\\${best.sessionId}')
    expect(detail).toContain('min-h-11')
  })
})
