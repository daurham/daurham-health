import { describe, expect, it } from 'vitest'
import {
  COACH_RULE_VERSION,
  coachPeriodFingerprint,
  coachWeek,
  generalDailyCandidates,
  rankCoachCandidates,
  repetitionPenalty,
  type CoachCandidate,
} from '../src/domain/coach.ts'

function candidate(ruleKey: string, score = 50, urgent = false): CoachCandidate {
  return {
    taskKind: 'daily_quest',
    ruleKey,
    ruleVersion: COACH_RULE_VERSION,
    domain: 'training',
    title: ruleKey,
    detail: ruleKey,
    startsOn: '2026-09-29',
    expiresOn: '2026-09-29',
    goalId: null,
    verificationMode: 'training_log',
    actionKind: 'log_training',
    actionHref: null,
    targetValue: 10,
    targetUnit: 'min',
    baselineValue: null,
    difficulty: 'routine',
    rewardBand: 'routine',
    metadata: {},
    score,
    urgent,
  }
}

describe('Coach periods and identity', () => {
  it('uses a stable Monday-Sunday Coach week', () => {
    expect(coachWeek('2026-09-29')).toEqual({ start: '2026-09-28', end: '2026-10-04' })
    expect(coachWeek('2026-10-04')).toEqual({ start: '2026-09-28', end: '2026-10-04' })
    expect(coachWeek('2026-10-05')).toEqual({ start: '2026-10-05', end: '2026-10-11' })
  })

  it('creates a stable versioned period fingerprint', () => {
    expect(coachPeriodFingerprint('daily_quest', '2026-09-29', 'manual:yoga:10m')).toBe(
      'coach:daily_quest:2026-09-29:manual:yoga:10m:v1',
    )
  })
})

describe('Coach ranking', () => {
  it('penalizes a repeated optional quest from yesterday', () => {
    const recent = [{ ruleKey: 'manual:yoga:10m', startsOn: '2026-09-28' }]
    expect(repetitionPenalty(candidate('manual:yoga:10m'), recent, '2026-09-29')).toBe(60)
    expect(
      rankCoachCandidates(
        [candidate('manual:yoga:10m', 90), candidate('manual:health-journal:10m', 50)],
        recent,
        '2026-09-29',
      )[0]?.ruleKey,
    ).toBe('manual:health-journal:10m')
  })

  it('lets urgency override repetition penalties', () => {
    const recent = [{ ruleKey: 'goal:training-session:g1', startsOn: '2026-09-28' }]
    const urgent = candidate('goal:training-session:g1', 100, true)
    const other = candidate('manual:yoga:10m', 99)
    expect(rankCoachCandidates([other, urgent], recent, '2026-09-29')[0]?.ruleKey).toBe(urgent.ruleKey)
  })

  it('uses the rule key as the deterministic tie breaker', () => {
    expect(rankCoachCandidates([candidate('z-rule'), candidate('a-rule')], [], '2026-09-29').map((item) => item.ruleKey))
      .toEqual(['a-rule', 'z-rule'])
  })
})

describe('general Daily Quest registry safety', () => {
  it('suppresses moderate physical tasks during sickness while retaining non-physical health actions', () => {
    const rules = generalDailyCandidates('2026-09-29', ['sick'])
    const keys = rules.map((rule) => rule.ruleKey)
    expect(keys).not.toContain('manual:jumping-jacks:100')
    expect(keys).not.toContain('manual:run:15m')
    expect(keys).toContain('manual:meal-prep:protein')
    expect(keys).toContain('manual:health-journal:10m')
  })

  it('keeps low-intensity movement available when only unusual stress is recorded', () => {
    const keys = generalDailyCandidates('2026-09-29', ['unusual_stress']).map((rule) => rule.ruleKey)
    expect(keys).toContain('manual:yoga:10m')
    expect(keys).toContain('manual:hike:20m')
    expect(keys).not.toContain('manual:shadow-boxing:10m')
  })
})
