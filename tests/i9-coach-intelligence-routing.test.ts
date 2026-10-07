import { describe, expect, it } from 'vitest'
import { matchCoachIntelligenceRoute } from '../server/handlers/coach-intelligence.js'

describe('I9 Coach intelligence routing', () => {
  const id = '123e4567-e89b-42d3-a456-426614174000'

  it('matches the owner Coach intelligence endpoints', () => {
    expect(matchCoachIntelligenceRoute('/api/intelligence/coach')).toEqual({ kind: 'root' })
    expect(matchCoachIntelligenceRoute(`/api/intelligence/coach/recommendations/${id}/respond`)).toEqual({ kind: 'respond', id })
    expect(matchCoachIntelligenceRoute(`/api/intelligence/coach/recommendations/${id}/outcome`)).toEqual({ kind: 'outcome', id })
  })

  it('rejects malformed recommendation ids and unknown actions', () => {
    expect(matchCoachIntelligenceRoute('/api/intelligence/coach/recommendations/nope/respond')).toBeNull()
    expect(matchCoachIntelligenceRoute(`/api/intelligence/coach/recommendations/${id}/delete`)).toBeNull()
  })
})
