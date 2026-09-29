import { describe, expect, it } from 'vitest'
import {
  STRETCH_SUPPRESSING_TAGS,
  rankStretchCandidates,
  stretchCandidates,
  stretchChallengeExpiresOn,
  stretchCooldownAllows,
  stretchMetadata,
  stretchOfferExpiresOn,
  stretchRepetitionPenalty,
  stretchTarget,
  type StretchHistoryEntry,
} from '../src/domain/coach-stretch.ts'
import { stretchObservations, type StretchExerciseDefinition, type StretchSetRecord } from '../src/domain/progress/stretch-performance.ts'
import { poundsToKilograms } from '../src/domain/units.ts'

const DATE = '2026-09-29'

function observations(id = 'bench', name = 'Bench Press') {
  const exercise: StretchExerciseDefinition = {
    id, name, externalId: null, performanceType: 'loaded_reps', analyticsLoadType: 'external',
    analyticsRepMode: 'standard', measurementKind: 'reps', unilateral: false, loadType: 'barbell',
  }
  const sets: StretchSetRecord[] = ['2026-09-10', '2026-09-20'].map((date) => ({
    setId: `${id}-${date}`, sessionId: `session-${date}`, sessionExerciseId: `${id}-appearance-${date}`,
    exerciseId: id, sessionDate: date, sessionCreatedAt: `${date}T20:00:00.000Z`,
    sessionExercisePosition: 1, setNumber: 1, setType: 'working', sessionType: 'programmed', loadState: 'external',
    weightKg: poundsToKilograms(100), reps: 6, durationSec: null, leftReps: null,
    rightReps: null, leftDurationSec: null, rightDurationSec: null,
  }))
  return stretchObservations(sets, [exercise])
}

function candidates(history: StretchHistoryEntry[] = []) {
  return stretchCandidates({ date: DATE, observations: [...observations('a'), ...observations('b')], history })
}

describe('Stretch cadence and windows', () => {
  it('permits a first eligible offer immediately', () => {
    expect(stretchCooldownAllows(DATE, [])).toBe(true)
    expect(stretchCandidates({ date: DATE, observations: observations(), history: [] })).toHaveLength(1)
  })

  it('counts all terminal histories by original offer date and permits exactly day eight', () => {
    const history = [{ startsOn: '2026-09-21' }]
    expect(stretchCooldownAllows('2026-09-28', history)).toBe(false)
    expect(stretchCooldownAllows(DATE, history)).toBe(true)
    expect(stretchCooldownAllows('2026-09-20', history)).toBe(false)
  })

  it('uses the newest offer in unsorted history', () => {
    expect(stretchCooldownAllows(DATE, [{ startsOn: '2026-09-25' }, { startsOn: '2026-09-01' }])).toBe(false)
  })

  it('freezes three inclusive offer days and seven inclusive accepted days across month boundaries', () => {
    expect(stretchOfferExpiresOn(DATE)).toBe('2026-10-01')
    expect(stretchChallengeExpiresOn('2026-10-01')).toBe('2026-10-07')
    expect(stretchOfferExpiresOn('2028-02-28')).toBe('2028-03-01')
  })

  it('does not produce another candidate when a Stretch is already offered or active', () => {
    expect(stretchCandidates({ date: DATE, observations: observations(), history: [], hasCurrentStretch: true })).toEqual([])
  })

  it('does not substitute filler for missing eligible baselines', () => {
    expect(stretchCandidates({ date: DATE, observations: [], history: [] })).toEqual([])
    expect(stretchCandidates({ date: DATE, observations: observations().slice(0, 1), history: [] })).toEqual([])
  })
})

describe('bounded Stretch targets', () => {
  it.each([[120, 122.5], [121.8, 124.5], [100, 102]])('rounds 2%% of %s lb upward to %s', (baseline, expected) => {
    expect(stretchTarget('strength_e1rm', baseline)).toBe(expected)
  })

  it.each([[10, 11], [42, 45], [20, 21], [9, null], [1, null]])('bounds reps baseline %s to target %s', (baseline, expected) => {
    expect(stretchTarget('reps', baseline)).toBe(expected)
  })

  it.each([[95, 100], [50, 55], [100, 105], [20, null], [49, null]])('bounds duration baseline %s to target %s', (baseline, expected) => {
    expect(stretchTarget('duration', baseline)).toBe(expected)
  })

  it('suppresses the contradictory 20→25 sec example because the explicit 110% cap is mandatory', () => {
    expect(stretchTarget('duration', 20)).toBeNull()
  })

  it.each([0, -1, NaN, Infinity])('fails closed on malformed baseline %s', (baseline) => {
    expect(stretchTarget('strength_e1rm', baseline)).toBeNull()
  })

  it('rejects fractional reps/duration and overflowing targets', () => {
    expect(stretchTarget('reps', 10.1)).toBeNull()
    expect(stretchTarget('duration', 50.5)).toBeNull()
    expect(stretchTarget('strength_e1rm', Number.MAX_VALUE)).toBeNull()
  })
})

describe('deterministic Stretch selection', () => {
  it('uses stable strategy/exercise IDs to break ties independently of input order', () => {
    const original = candidates()
    const reversed = stretchCandidates({ date: DATE, observations: [...observations('b'), ...observations('a')], history: [] })
    expect(original.map((item) => item.ruleKey)).toEqual(['stretch:strength_e1rm:a', 'stretch:strength_e1rm:b'])
    expect(reversed).toEqual(original)
  })

  it('explicitly links a matching active strength Goal only after independent baseline eligibility', () => {
    const goals = [{ id: 'goal-b', kind: 'strength_e1rm', status: 'active', exerciseDefinitionId: 'b' }]
    const result = stretchCandidates({ date: DATE, observations: [...observations('a'), ...observations('b')], history: [], goals })
    expect(result[0]).toMatchObject({ goalId: 'goal-b', ruleKey: 'stretch:strength_e1rm:b' })
    expect(stretchCandidates({ date: DATE, observations: [], history: [], goals })).toEqual([])
  })

  it('ignores archived/non-strength Goals', () => {
    const result = stretchCandidates({ date: DATE, observations: observations(), history: [], goals: [
      { id: 'archived', kind: 'strength_e1rm', status: 'archived', exerciseDefinitionId: 'bench' },
      { id: 'different-kind', kind: 'training_frequency', status: 'active', exerciseDefinitionId: 'bench' },
    ] })
    expect(result[0]?.goalId).toBeNull()
  })

  it('avoids the same exercise/strategy within thirty days when an alternative exists', () => {
    const history: StretchHistoryEntry[] = [{ startsOn: '2026-09-21', exerciseId: 'a', strategy: 'strength_e1rm' }]
    expect(candidates(history).map((item) => item.ruleKey)).toEqual(['stretch:strength_e1rm:b'])
    const raw = candidates()
    expect(stretchRepetitionPenalty(raw[0]!, history, DATE)).toBeGreaterThan(1000)
  })

  it('allows the only eligible exercise again after the global cooldown', () => {
    const history: StretchHistoryEntry[] = [{ startsOn: '2026-09-21', exerciseId: 'bench', strategy: 'strength_e1rm' }]
    expect(stretchCandidates({ date: DATE, observations: observations(), history })).toHaveLength(1)
    expect(stretchCandidates({ date: '2026-09-28', observations: observations(), history })).toEqual([])
  })

  it('keeps previous-strategy penalty after the thirty-day avoidance expires', () => {
    const history: StretchHistoryEntry[] = [{ startsOn: '2026-08-30', exerciseId: 'a', strategy: 'strength_e1rm' }]
    expect(rankStretchCandidates(candidates(), history, DATE)[0]?.ruleKey).toBe('stretch:strength_e1rm:b')
    expect(stretchRepetitionPenalty(candidates()[0]!, history, DATE)).toBe(300)
  })

  it('freezes exact provenance, target, reward classification and offer metadata', () => {
    const candidate = stretchCandidates({ date: DATE, observations: observations(), history: [] })[0]!
    expect(candidate).toMatchObject({ taskKind: 'stretch_quest', difficulty: 'stretch', rewardBand: 'stretch', targetValue: 122.5, verificationMode: 'canonical' })
    const metadata = stretchMetadata(candidate.metadata)
    expect(metadata).toMatchObject({ strategy: 'strength_e1rm', offeredOn: DATE, offerExpiresOn: '2026-10-01', baseline: { evidence: { setId: 'bench-2026-09-10' } } })
    expect(metadata?.baseline.value).toBeCloseTo(120, 10)
    expect(candidate.detail).toContain('not a load to put on the bar')
    expect(candidate.detail).toContain('weight × rep combination')
  })

  it('rejects malformed metadata instead of manufacturing a performance threshold', () => {
    expect(stretchMetadata({})).toBeNull()
    expect(stretchMetadata({ stretch: { strategy: 'distance' } })).toBeNull()
    const candidate = candidates()[0]!
    const metadata = stretchMetadata(candidate.metadata)!
    expect(stretchMetadata({ stretch: { ...metadata, exerciseId: 'unrelated' } })).toBeNull()
  })
})

describe('Stretch deterministic context suppression', () => {
  it.each([...STRETCH_SUPPRESSING_TAGS])('suppresses all performance offers for %s', (tag) => {
    expect(stretchCandidates({ date: DATE, observations: observations(), history: [], contextTags: [tag] })).toEqual([])
  })

  it('uses the existing exact vocabulary and allows unlisted context without a readiness claim', () => {
    expect(stretchCandidates({ date: DATE, observations: observations(), history: [], contextTags: ['travel'] })).toHaveLength(1)
  })
})
