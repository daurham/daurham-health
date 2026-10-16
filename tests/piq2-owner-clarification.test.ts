import { describe, expect, it } from 'vitest'
import type { IntelligenceContextItem } from '../src/domain/intelligence/shared.js'
import {
  isOwnerClarificationSuppressed,
  ownerClarificationStorageKey,
  parseOwnerClarificationPreference,
  selectOwnerClarification,
  serializeOwnerClarificationPreference,
} from '../src/domain/ask-health/clarification.js'

const incomplete: IntelligenceContextItem = {
  key: 'nutrition.calories',
  label: 'Calories',
  detail: '4 logged day(s), but no verified complete, source-reliable days for personal trends.',
  confidence: 'unknown',
  detailPath: '/nutrition',
}

describe('PIQ-2.5 decision-relevant optional clarification', () => {
  it('asks one question for a personal intake decision with incomplete, logged days', () => {
    expect(selectOwnerClarification('Has my protein intake improved this month?', [incomplete]))
      .toMatchObject({ destination: '/nutrition' })
    expect(selectOwnerClarification('Why is my weight plateauing?', [incomplete])?.question)
      .toContain('past food-log days')
  })

  it('never nags for general education, unrelated personal concerns, or nondecisions', () => {
    for (const question of ['What is protein?', 'Does creatine work?',
      'Why am I tired?', 'I ate eggs today', 'What are calories?',
      'How does my sleep compare this month?']) {
      expect(selectOwnerClarification(question, [incomplete])).toBeNull()
    }
  })

  it('fails closed on no logged days, source unavailable, unrelated missing signals', () => {
    const noObservations = { ...incomplete, detail: 'No usable observations are available in this range.' }
    const untrusted = { ...incomplete, detail: incomplete.detail + ' (verification unavailable).' }
    const underSampled = { ...incomplete, detail: 'Only 1 of 30 eligible days are observed.' }
    const sleep = { ...incomplete, key: 'sleep.total_minutes' }
    for (const item of [noObservations, untrusted, underSampled, sleep]) {
      expect(selectOwnerClarification('How has my diet changed?', [item])).toBeNull()
    }
    expect(selectOwnerClarification('How has my diet changed?', [])).toBeNull()
  })

  it('does not prompt when usable records already cover the question', () => {
    expect(selectOwnerClarification('Is my calorie trend accurate?', [
      { ...incomplete, key: 'nutrition.protein_g' },
    ])).toBeNull()
  })

  it('supports skip-this-answer in UI and browser-local later/never semantics', () => {
    expect(isOwnerClarificationSuppressed(null, '2026-10-15')).toBe(false)
    expect(isOwnerClarificationSuppressed('never', '2026-10-15')).toBe(true)
    expect(isOwnerClarificationSuppressed({ laterThrough: '2026-10-15' }, '2026-10-15')).toBe(true)
    expect(isOwnerClarificationSuppressed({ laterThrough: '2026-10-15' }, '2026-10-16')).toBe(false)
    expect(parseOwnerClarificationPreference('later:2026-10-15'))
      .toEqual({ laterThrough: '2026-10-15' })
    expect(serializeOwnerClarificationPreference({ laterThrough: '2026-10-15' }))
      .toBe('later:2026-10-15')
    expect(serializeOwnerClarificationPreference('never')).toBe('never')
    expect(serializeOwnerClarificationPreference(null)).toBeNull()
    expect(parseOwnerClarificationPreference('later:not-a-day')).toBeNull()
  })

  it('never writes sensitive prose into the preference storage key', () => {
    expect(ownerClarificationStorageKey('')).toContain('owner-clarification')
    expect(ownerClarificationStorageKey('/demo'))
      .not.toBe(ownerClarificationStorageKey(''))
    expect(ownerClarificationStorageKey('/demo')).not.toContain('protein')
  })
})
