import { describe, expect, it } from 'vitest'
import type { ProgressOverview } from '../src/domain/progress/overview.js'
import type { CanonicalSetRecord, ProgressExerciseDefinition } from '../src/domain/progress/types.js'
import { focusTrainingWorkingSets } from '../src/domain/ask-health/focused-training.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const today = '2026-10-15'
const start = '2026-09-01'
const bench: ProgressExerciseDefinition = {
  id: 'bench-barbell', name: 'Barbell Bench Press', externalId: null,
  performanceType: 'loaded_reps', analyticsLoadType: 'external',
  analyticsRepMode: 'standard', measurementKind: 'reps', unilateral: false,
}
function set(date: string, i: number, edits: Partial<CanonicalSetRecord> = {}): CanonicalSetRecord {
  return {
    setId: 'set-' + i, sessionId: 'session-' + i,
    sessionExerciseId: 'session-exercise-' + i, exerciseId: bench.id,
    sessionDate: date, sessionCreatedAt: date + 'T16:00:00.000Z',
    sessionExercisePosition: 1, setNumber: 1,
    setType: 'working', loadState: 'external', weightKg: 80, reps: 5,
    durationSec: null, leftReps: null, rightReps: null,
    leftDurationSec: null, rightDurationSec: null, ...edits,
  }
}
const rows = [
  set('2026-09-03', 1), set('2026-10-02', 2), set('2026-10-06', 3),
  set('2026-10-07', 4), set('2026-10-08', 5), set('2026-10-09', 6),
  set('2026-10-10', 7), set('2026-10-11', 8), set('2026-10-13', 9),
  set('2026-10-16', 10, { weightKg: 210 }),
  set('2026-10-06', 11, { setType: 'warmup', weightKg: 150 }),
]
const options = { exercises: [bench], sets: rows, start, end: today, today, asOf: today }

function packet(question: string, asOf = today, evidenceStart = start) {
  const focus = focusTrainingWorkingSets({
    ...options, question, start: evidenceStart, end: asOf, asOf,
  })
  const input: AskHealthPacketInput = {
    question, range: '90d', lens: 'general', asOf,
    period: { start: evidenceStart, end: asOf },
    generatedAt: today + 'T18:00:00.000Z',
    // The range-wide count below MUST NOT leak into a dated named-lift question.
    overview: {
      training: {
        workouts: { status: 'available', value: { count: 99 } },
        consistency: { status: 'insufficient_data', observations: 0 },
        sessions: [],
      },
      exercises: [],
    } as unknown as ProgressOverview,
    activity: null, sleep: null, goals: [], experiments: [], benchmarks: [],
    supplements: [], context: null, patterns: [], focusedTraining: focus,
  }
  return { focus, evidence: buildAskHealthEvidencePacket(input).evidence }
}

describe('PIQ-3 named-lift historical evidence time and citation scope', () => {
  it('retrieves only the older requested day, not newer loaded sets or overall trends', () => {
    const { focus, evidence } = packet('How was my barbell bench press on 2026-10-06?')
    expect(focus?.requestedDate).toEqual({ date: '2026-10-06', inSelectedRange: true })
    expect(focus?.eligibleAppearances).toBe(1)
    expect(focus?.appearances.map(item => item.setId)).toEqual(['set-3'])
    expect(evidence.find(item => item.id === 'training.focus.set.set-3'))
      .toMatchObject({ period: { start: '2026-10-06', end: '2026-10-06' }, evidenceDates: ['2026-10-06'] })
    expect(evidence.some(item => item.id === 'training.sessions' || item.id === 'training.frequency')).toBe(false)
    expect(evidence.some(item => item.id === 'training.focus.set.set-9')).toBe(false)
  })

  it('uses all eligible working-set appearances for window coverage, but samples six', () => {
    const { focus, evidence } = packet('How did my barbell bench press perform last week?')
    expect(focus?.requestedWindow).toMatchObject({
      start: '2026-10-05', end: '2026-10-11', calendarDays: 7, inSelectedRange: true,
    })
    expect(focus?.eligibleAppearances).toBe(6)
    expect(focus?.appearances.map(item => item.setId)).toEqual([
      'set-3', 'set-4', 'set-5', 'set-6', 'set-7', 'set-8',
    ])
    expect(evidence.find(item => item.id === 'training.focus.coverage.bench-barbell')?.coverage)
      .toMatchObject({ eligibleAppearances: 6, shownAppearances: 6, requestedWindowScope: 'in_range' })
    expect(evidence.filter(item => item.id.startsWith('training.focus.set.'))).toHaveLength(6)
    expect(evidence.some(item => item.id === 'training.focus.set.set-9')).toBe(false)
  })

  it('anchors last week to selected as-of and never leaks future workouts', () => {
    const { focus, evidence } = packet('How was my barbell bench press last week?', '2026-10-09')
    expect(focus?.requestedWindow).toMatchObject({
      start: '2026-09-28', end: '2026-10-04', inSelectedRange: true,
    })
    expect(focus?.appearances.map(x => x.setId)).toEqual(['set-2'])
    expect(evidence.some(item => item.id === 'training.focus.set.set-3')).toBe(false)
    expect(evidence.some(item => item.id === 'training.focus.set.set-10')).toBe(false)
  })

  it('keeps an empty or out-of-scope historical day unknown, never substitutes a recent set', () => {
    const missing = packet('How was my barbell bench press on 2026-10-04?')
    expect(missing.focus?.eligibleAppearances).toBe(0)
    expect(missing.focus?.appearances).toEqual([])
    expect(missing.evidence.find(item => item.id === 'training.focus.coverage.bench-barbell')?.text)
      .toContain('not zero strength')
    const outside = packet('How was my barbell bench press on 2026-08-01?')
    expect(outside.focus?.requestedDate?.inSelectedRange).toBe(false)
    expect(outside.evidence.find(item => item.id === 'training.focus.coverage.bench-barbell')?.text)
      .toContain('outside the selected Health evidence range')
    expect(outside.evidence.some(item => item.id.startsWith('training.focus.set.'))).toBe(false)
  })

  it('rejects ambiguous and unsupported dates with no nearest-date fallback', () => {
    for (const question of [
      'How was my barbell bench press October 6?',
      'Compare my barbell bench press 2026-10-06 and 2026-10-13',
      'How was my barbell bench press since last month?',
    ]) {
      const { focus, evidence } = packet(question)
      expect(focus?.dateSelectionIssue).not.toBeNull()
      expect(focus?.appearances).toEqual([])
      expect(evidence.find(item => item.id === 'training.focus.coverage.bench-barbell')?.text)
        .toContain('No recent working sets were substituted')
    }
  })

  it('does not silently clip a requested month to the available selected history', () => {
    const { focus, evidence } = packet('How was my barbell bench press last month?', today, '2026-10-01')
    expect(focus?.requestedWindow?.inSelectedRange).toBe(false)
    expect(focus?.eligibleAppearances).toBe(0)
    expect(evidence.find(item => item.id === 'training.focus.coverage.bench-barbell')?.coverage)
      .toMatchObject({ requestedWindowScope: 'out_of_range' })
    expect(evidence.some(item => item.id.startsWith('training.focus.set.'))).toBe(false)
  })

  it('preserves latest six behavior for undated named-lift queries', () => {
    const { focus, evidence } = packet('How has my barbell bench press strength improved?')
    expect(focus?.requestedDate).toBeNull()
    expect(focus?.requestedWindow).toBeNull()
    expect(focus?.eligibleAppearances).toBe(9)
    expect(focus?.appearances).toHaveLength(6)
    expect(evidence.some(item => item.id === 'training.sessions')).toBe(true)
  })
})
