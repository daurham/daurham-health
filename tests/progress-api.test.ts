import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseProgressQuery } from '../server/progress/service.ts'
import { classificationForExternalId } from '../src/domain/progress/exercise-classification.ts'
import { TRAINING_EXERCISE_SEEDS } from '../src/domain/training-library.ts'
import { HEALTH_DOMAINS } from '../src/domain/progress/types.ts'

describe('progress query and classification', () => {
  it('parses trailing ranges and calendar asOf without using Date.now internally', () => {
    expect(parseProgressQuery({ range: '90d', asOf: '2026-09-21', now: new Date('2026-01-01T00:00:00Z') })).toEqual({
      range: '90d',
      asOf: '2026-09-21',
    })
    expect(parseProgressQuery({ range: null, asOf: null, now: new Date(Date.UTC(2026, 8, 21)) }).asOf).toBe('2026-09-21')
    expect(() => parseProgressQuery({ range: 'week', asOf: null })).toThrow(/range must be/)
  })

  it('classifies known library exercises from stable external ids, not names', () => {
    expect(classificationForExternalId('EX01')).toEqual({
      performanceType: 'loaded_reps',
      analyticsLoadType: 'external',
      analyticsRepMode: 'standard',
    })
    expect(classificationForExternalId('EX07')).toEqual({
      performanceType: 'timed',
      analyticsLoadType: 'external',
      analyticsRepMode: 'standard',
    })
    expect(classificationForExternalId('EX11')).toEqual({
      performanceType: 'loaded_reps',
      analyticsLoadType: 'external',
      analyticsRepMode: 'per_side',
    })
    expect(classificationForExternalId('EX13')).toEqual({
      performanceType: 'timed',
      analyticsLoadType: 'external',
      analyticsRepMode: 'per_side',
    })
    expect(classificationForExternalId('EX16')).toEqual({
      performanceType: 'loaded_reps',
      analyticsLoadType: 'external',
      analyticsRepMode: 'per_side',
    })
    expect(classificationForExternalId('unknown')).toEqual({
      performanceType: 'other',
      analyticsLoadType: 'none',
      analyticsRepMode: 'standard',
    })
    for (const seed of TRAINING_EXERCISE_SEEDS) {
      expect(classificationForExternalId(seed.externalId).analyticsLoadType).toBe('external')
    }
  })

  it('reserves future Health domains without implementing nutrition or Apple Health tables', () => {
    expect(HEALTH_DOMAINS).toEqual(['training', 'body', 'nutrition', 'activity', 'sleep'])
    const sql = readFileSync('migrations/0005_exercise_analytics.sql', 'utf8')
    expect(sql).not.toContain('nutrition')
    expect(sql).not.toContain('apple_health')
    expect(sql).toContain('performance_type')
    const repMode = readFileSync('migrations/0006_analytics_rep_mode.sql', 'utf8')
    expect(repMode).toContain('analytics_rep_mode')
    expect(repMode).toContain('EX11')
    expect(repMode).toContain('EX13')
    expect(repMode).toContain('EX16')
    expect(repMode).not.toContain('nutrition')
  })
})
