import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WorkoutSession } from '../src/domain/training.js'
import { workoutDraftIsStale, workoutEditRevision } from '../src/features/training/workout-draft-freshness.js'
import { WorkoutDraftConflictNotice } from '../src/features/training/WorkoutDetailPage.js'

function session(): WorkoutSession {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workoutDate: '2026-10-15', sessionType: 'ad_hoc', sessionName: 'Full body',
    workoutTemplateId: null, routineCode: null, templateVersion: null,
    durationMin: 45, effort: 3, painLevel: 0, limitationKind: null,
    limitationNote: null, bodyweightKg: 81, notes: 'Session note', experimentId: null,
    benchmarkProtocolVersionId: null,
    exercises: [{
      id: '22222222-2222-4222-8222-222222222222',
      exerciseDefinitionId: '33333333-3333-4333-8333-333333333333',
      position: 1, slotId: null, exerciseName: 'Squat',
      notes: null, performanceBests: [],
      sets: [{
        id: '44444444-4444-4444-8444-444444444444',
        setNumber: 1, setType: 'working', loadState: 'external',
        weightKg: 50, reps: 8, durationSec: null,
        leftReps: null, rightReps: null, leftDurationSec: null, rightDurationSec: null,
        distanceM: null, completed: null, rir: 2, rpe: 7,
        failureKind: null, leftFailureKind: null, rightFailureKind: null,
        notes: 'Working set',
      }],
    }],
  } as unknown as WorkoutSession
}
describe('PIQ-1.4 workout saved-source revalidation', () => {
  it('a fresh copy or derived performance-best update does not mark an unsaved draft stale', () => {
    const original = session()
    const rev = workoutEditRevision(original)
    expect(workoutDraftIsStale(rev, structuredClone(original))).toBe(false)
    const derived = structuredClone(original)
    derived.exercises[0]!.performanceBests = [{
      kind: 'reps', value: 10, unit: 'reps', date: '2026-10-15',
      sessionId: original.id, setId: original.exercises[0]!.sets[0]!.id,
      distanceM: null, durationSec: null, completed: null,
    }]
    expect(workoutDraftIsStale(rev, derived)).toBe(false)
  })

  it('detects another-tab set edits, deletes, added sets, backdating and note changes', () => {
    const base = session()
    const rev = workoutEditRevision(base)
    const update = (fn: (value: WorkoutSession) => void) => {
      const changed = structuredClone(base)
      fn(changed)
      expect(workoutDraftIsStale(rev, changed)).toBe(true)
    }
    update((s) => { s.exercises[0]!.sets[0]!.weightKg = 52.5 })
    update((s) => { s.exercises[0]!.sets[0]!.reps = 9 })
    update((s) => { s.exercises[0]!.sets[0]!.notes = 'Updated elsewhere' })
    update((s) => { s.exercises[0]!.sets.splice(0, 1) })
    update((s) => { s.exercises.push(structuredClone(s.exercises[0]!)) })
    update((s) => { s.workoutDate = '2026-10-14' })
    update((s) => { s.notes = 'Changed on phone' })
  })

  it('cannot authorize a blind overwrite after a missing, unreadable, or deleted source', () => {
    expect(workoutDraftIsStale(null, session())).toBe(true)
    expect(workoutDraftIsStale(undefined, session())).toBe(true)
    expect(workoutDraftIsStale(workoutEditRevision(session()), null)).toBe(true)
    expect(workoutDraftIsStale(workoutEditRevision(session()), { ...session(), id: 'different' })).toBe(true)
  })

  it('renders owner-visible alert and explicit draft-discard control without automatic overwrite', () => {
    const html = renderToStaticMarkup(<WorkoutDraftConflictNotice busy={false} onReload={() => undefined} />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Saved workout changed while you were editing')
    expect(html).toContain('Your unsaved draft is still here')
    expect(html).toContain('saving is paused')
    expect(html).toContain('Discard my draft and load latest saved workout')
    expect(html).not.toContain('Save anyway')
  })

  it('disables the explicit reload while an outstanding request is active', () => {
    const html = renderToStaticMarkup(<WorkoutDraftConflictNotice busy onReload={() => undefined} />)
    expect(html).toContain('disabled=""')
  })
})
