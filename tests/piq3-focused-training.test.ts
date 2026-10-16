import { describe, expect, it } from 'vitest'
import type {
  CanonicalSetRecord, ProgressExerciseDefinition,
} from '../src/domain/progress/types.js'
import {
  focusTrainingWorkingSets, matchFocusedExercise,
} from '../src/domain/ask-health/focused-training.js'
import { buildAskHealthEvidencePacket, packetFingerprintMaterial, type AskHealthPacketInput } from '../src/domain/ask-health/index.js'

const bench: ProgressExerciseDefinition = {
  id: 'bench-barbell', name: 'Barbell Bench Press', externalId: null,
  performanceType: 'loaded_reps', analyticsLoadType: 'external',
  analyticsRepMode: 'standard', measurementKind: 'reps', unilateral: false,
}
const dumbbell: ProgressExerciseDefinition = { ...bench, id: 'bench-db', name: 'Dumbbell Bench Press' }
const squat: ProgressExerciseDefinition = { ...bench, id: 'squat', name: 'Barbell Back Squat' }

function set(date: string, index: number, overrides: Partial<CanonicalSetRecord> = {}): CanonicalSetRecord {
  return {
    setId: 'set-' + index,
    sessionId: 'session-' + index,
    sessionExerciseId: 'session-exercise-' + index,
    exerciseId: bench.id,
    sessionDate: date,
    sessionCreatedAt: date + 'T12:00:00.000Z',
    sessionExercisePosition: 1,
    setNumber: 1,
    setType: 'working',
    loadState: 'external',
    weightKg: 80,
    reps: 5,
    durationSec: null,
    leftReps: null,
    rightReps: null,
    leftDurationSec: null,
    rightDurationSec: null,
    ...overrides,
  }
}
const start = '2026-09-16'
const end = '2026-10-15'
const ask = 'How has my bench press strength changed?'
function focused(
  question: string,
  sets: CanonicalSetRecord[],
  exercises: ProgressExerciseDefinition[] = [bench],
) {
  return focusTrainingWorkingSets({ question, exercises, sets, start, end })
}
function packet(input: NonNullable<ReturnType<typeof focused>>) {
  const data: AskHealthPacketInput = {
    lens: 'general', range: '30d', asOf: end,
    generatedAt: '2026-10-15T17:00:00.000Z',
    period: { start, end },
    question: ask,
    overview: null, activity: null, sleep: null, goals: [],
    supplements: [], experiments: [], benchmarks: [],
    context: null, patterns: [],
    focusedTraining: input,
  }
  return buildAskHealthEvidencePacket(data)
}

describe('PIQ-3.3 bounded named-lift source retrieval', () => {
  it('matches a saved specific name without guessing an ambiguous bench variation', () => {
    expect(matchFocusedExercise('How has my barbell bench press improved?', [bench, dumbbell])).toEqual(bench)
    expect(matchFocusedExercise('How is my bench press?', [bench, dumbbell])).toBeNull()
    expect(matchFocusedExercise('How is my bench?', [bench, dumbbell])).toBeNull()
    expect(matchFocusedExercise('How is my squat?', [bench, squat])).toEqual(squat)
    expect(matchFocusedExercise('How has my barbell bench press changed?', [bench, dumbbell])).toEqual(bench)
    expect(matchFocusedExercise('How is my running?', [bench])).toBeNull()
    expect(matchFocusedExercise('How does creatine work?', [bench])).toBeNull()
  })

  it('only uses canonical eligible loaded working sets within the selected time window', () => {
    const rows = [
      set('2026-09-20', 1),
      set('2026-10-14', 2, { weightKg: 90, reps: 3 }),
      set('2026-10-15', 3, { setType: 'warmup', weightKg: 150 }),
      set('2026-10-15', 4, { loadState: 'bodyweight', weightKg: 200 }),
      set('2026-10-16', 5, { weightKg: 250 }),
      set('2026-09-15', 6, { weightKg: 300 }),
      set('2026-10-10', 7, { exerciseId: squat.id, weightKg: 280 }),
    ]
    const result = focused(ask, rows)
    expect(result).toMatchObject({
      exerciseId: bench.id, eligibleAppearances: 2,
    })
    expect(result?.appearances.map(x => x.setId)).toEqual(['set-1', 'set-2'])
    expect(result?.appearances.map(x => x.date)).toEqual(['2026-09-20', '2026-10-14'])
    expect(JSON.stringify(result)).not.toMatch(/set-[34567]|250|300|280/)
  })

  it('samples only the latest six eligible appearances while preserving coverage', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      set('2026-10-' + String(i + 1).padStart(2, '0'), i + 1, { weightKg: 60 + i }))
    const result = focused(ask, rows)
    expect(result?.eligibleAppearances).toBe(10)
    expect(result?.appearances).toHaveLength(6)
    expect(result?.appearances.map(x=>x.setId)).toEqual(['set-5','set-6','set-7','set-8','set-9','set-10'])
    const built = packet(result!)
    const coverage = built.evidence.find(x=>x.id === 'training.focus.coverage.bench-barbell')
    expect(coverage?.coverage).toMatchObject({
      eligibleAppearances: 10, shownAppearances: 6,
    })
    expect(built.evidence.filter(x=>x.id.startsWith('training.focus.set.'))).toHaveLength(6)
    expect(built.evidence.map(x=>x.text ?? '').join(' ')).not.toContain('set-1')
  })

  it('uses one eligible best high-confidence working set per session; never invents a measured 1RM', () => {
    const sameSession = set('2026-10-10', 2, {
      sessionId: 'session-1', sessionExerciseId: 'session-exercise-1',
      setNumber: 2, weightKg: 84, reps: 5,
    })
    const result = focused(ask, [set('2026-10-10', 1), sameSession])
    expect(result?.eligibleAppearances).toBe(1)
    expect(result?.appearances[0]).toMatchObject({
      setId: 'set-2', weightKg: 84, reps: 5,
    })
    const evidence = packet(result!).evidence.find(x=>x.id === 'training.focus.set.set-2')
    expect(evidence).toMatchObject({
      value: 98, domain: 'training', substantive: true,
      detailPath: '/progress/strength/bench-barbell',
      provenance: 'derived_from_owner_logged_working_set', evidenceDates: ['2026-10-10'],
    })
    expect(evidence?.text).toContain('not directly tested')
  })

  it('does not treat unsupported/per-side incomplete sets as comparable strength records', () => {
    const unilateral = { ...bench, analyticsRepMode: 'per_side' as const, unilateral: true }
    const noSides = set('2026-10-14', 1, {
      reps: null, leftReps: 8, rightReps: null,
    })
    const result = focused(ask, [noSides], [unilateral])
    expect(result?.eligibleAppearances).toBe(0)
    expect(result?.appearances).toEqual([])
    const coverage = packet(result!).evidence.find(x=>x.id === 'training.focus.coverage.bench-barbell')
    expect(coverage?.substantive).toBe(false)
    expect(coverage?.text).toContain('not zero performance')
  })

  it('does not emit an arbitrary set for an ambiguous exercise question', () => {
    expect(focused(ask, [set('2026-10-10', 1)], [bench, dumbbell])).toBeNull()
    expect(focused('How is my barbell bench press?', [set('2026-10-10', 1)], [bench, dumbbell])?.exerciseId)
      .toBe(bench.id)
  })

  it('changing source reps changes packet fingerprint, avoiding a stale cached explanation', () => {
    const old = focused(ask, [set('2026-10-10', 1, { reps: 5 })])!
    const changed = focused(ask, [set('2026-10-10', 1, { reps: 7 })])!
    const a = packet(old), b = packet(changed)
    expect(packetFingerprintMaterial(a)).not.toBe(packetFingerprintMaterial(b))
    expect(a.evidence.find(x=>x.id === 'training.focus.set.set-1')?.coverage).toMatchObject({ reps: 5 })
    expect(b.evidence.find(x=>x.id === 'training.focus.set.set-1')?.coverage).toMatchObject({ reps: 7 })
  })

  it('does not flood an evidence packet with historical working sets', () => {
    const rows = Array.from({ length: 80 }, (_, i) => set(
      '2026-10-' + String(i % 15 + 1).padStart(2, '0'),
      i + 1,
    ))
    const result = focused(ask, rows)!
    expect(result.appearances.length).toBeLessThanOrEqual(6)
    const built = packet(result)
    expect(built.evidenceSelectionAudit?.selectedSerializedChars)
      .toBeLessThanOrEqual(built.evidenceSelectionAudit!.maxChars)
  })
})
