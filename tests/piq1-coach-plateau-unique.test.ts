import { describe, expect, it, vi } from 'vitest'
import type { Sql } from '../server/db.js'
import {
  isActivePlateauUniquenessConflict,
  writeCoachRecommendationResponse,
} from '../server/intelligence/coach-intelligence.js'

const ID = '11111111-1111-4111-8111-111111111111'
const UNIQUE = 'coach_recommendations_one_active_plateau_revision_idx'

describe('PIQ-1.5 hard plateau alternative mutual exclusion', () => {
  it('recognizes only its own PostgreSQL uniqueness violation', () => {
    expect(isActivePlateauUniquenessConflict({ code: '23505', constraint: UNIQUE })).toBe(true)
    expect(isActivePlateauUniquenessConflict({ code: '23505', message: 'duplicate key value violates unique constraint "' + UNIQUE + '"' })).toBe(true)
    expect(isActivePlateauUniquenessConflict({ code: '23505', constraint: 'other_unique_constraint' })).toBe(false)
    expect(isActivePlateauUniquenessConflict({ code: '23514', constraint: UNIQUE })).toBe(false)
    expect(isActivePlateauUniquenessConflict(new Error('unrelated exception'))).toBe(false)
  })

  it('returns a client-refreshable 409 when a concurrent transaction wins the unique index', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ id: ID, recommendation_kind: 'review_intake_adjustment' }])
      .mockRejectedValueOnce({ code: '23505', constraint: UNIQUE })
    await expect(writeCoachRecommendationResponse(
      { query } as unknown as Sql, ID, 'do_this', '2026-10-15', async () => undefined,
      true, null,
    )).rejects.toMatchObject({ statusCode: 409 })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('does not misreport unrelated SQL failures as a competing decision', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ id: ID, recommendation_kind: 'review_intake_adjustment' }])
      .mockRejectedValueOnce({ code: '23505', constraint: 'unrelated_idx' })
    await expect(writeCoachRecommendationResponse(
      { query } as unknown as Sql, ID, 'do_this', '2026-10-15', async () => undefined,
      true, null,
    )).rejects.toMatchObject({ code: '23505', constraint: 'unrelated_idx' })
  })
})
