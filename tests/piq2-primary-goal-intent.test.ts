import { describe, expect, it, vi } from 'vitest'
import type { Sql } from '../server/db.js'
import {
  resolvePrimaryGoalIntent,
  UNSET_PRIMARY_GOAL_INTENT,
  validatePrimaryGoalSelection,
} from '../src/domain/primary-goal-intent.js'
import {
  readPrimaryGoalIntent,
  savePrimaryGoalIntent,
} from '../server/goals/primary-intent.js'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('PIQ-2.3 explicit owner primary-goal history', () => {
  it('never guesses intent from existing goals when the owner has not chosen one', () => {
    expect(resolvePrimaryGoalIntent([], '2026-10-15')).toEqual(UNSET_PRIMARY_GOAL_INTENT)
    expect(resolvePrimaryGoalIntent([{
      version: 1, primaryGoalId: A, effectiveFrom: '2026-10-16',
      recordedAt: '2026-10-15 15:00+00',
    }], '2026-10-15')).toEqual(UNSET_PRIMARY_GOAL_INTENT)
  })

  it('resolves only choices effective by the requested date, and preserves explicit clear', () => {
    const rows = [
      { version: 1, primaryGoalId: A, effectiveFrom: '2026-09-15', recordedAt: 'first' },
      { version: 2, primaryGoalId: B, effectiveFrom: '2026-10-15', recordedAt: 'second' },
      { version: 3, primaryGoalId: null, effectiveFrom: '2026-10-15', recordedAt: 'third' },
    ]
    expect(resolvePrimaryGoalIntent(rows, '2026-10-14').primaryGoalId).toBe(A)
    expect(resolvePrimaryGoalIntent(rows, '2026-10-15')).toMatchObject({
      version: 3, primaryGoalId: null, source: 'owner',
    })
  })

  it('requires an explicit nullable primaryGoalId and a valid optimistic version', () => {
    expect(validatePrimaryGoalSelection({ primaryGoalId: A, expectedVersion: 0 })).toEqual({
      primaryGoalId: A, expectedVersion: 0,
    })
    expect(validatePrimaryGoalSelection({ primaryGoalId: null, expectedVersion: 3 })).toEqual({
      primaryGoalId: null, expectedVersion: 3,
    })
    for (const input of [{}, [], null, { expectedVersion: -1, primaryGoalId: A },
      { expectedVersion: 0 }, { expectedVersion: 0, primaryGoalId: 'other' },
      { expectedVersion: 1.5, primaryGoalId: A }]) {
      expect(validatePrimaryGoalSelection(input)).toHaveProperty('error')
    }
  })

  it('stores a new event only when the owner version and active-goal qualification hold', async () => {
    const query = vi.fn().mockResolvedValue([{
      version: 2, primary_goal_id: A, effective_from: '2026-10-15',
      recorded_at: '2026-10-15 10:00+00',
    }])
    const result = await savePrimaryGoalIntent(
      { query } as unknown as Sql, '2026-10-15',
      { primaryGoalId: A, expectedVersion: 1 },
    )
    expect(result).toMatchObject({ version: 2, primaryGoalId: A, source: 'owner' })
    const [statement, params] = query.mock.calls[0] as [string, unknown[]]
    expect(statement).toContain('COALESCE(MAX(version), 0)')
    expect(statement).toContain("status = 'active' AND archived_at IS NULL")
    expect(statement).toContain('RETURNING version')
    expect(params.slice(1)).toEqual([1, A, '2026-10-15'])
  })

  it('blocks a stale tab and converts a unique version collision to a conflict', async () => {
    for (const behavior of ['empty', 'collision'] as const) {
      const query = vi.fn()
      if (behavior === 'empty') query.mockResolvedValue([])
      else query.mockRejectedValue({ code: '23505', constraint: 'primary_goal_intent_events_version_key' })
      await expect(savePrimaryGoalIntent(
        { query } as unknown as Sql, '2026-10-15',
        { primaryGoalId: null, expectedVersion: 0 },
      )).rejects.toMatchObject({ statusCode: 409 })
    }
  })

  it('does not treat a later snapshot as the current selected goal in historical reads', async () => {
    const query = vi.fn().mockResolvedValue([])
    expect(await readPrimaryGoalIntent({ query } as unknown as Sql, '2026-09-01'))
      .toEqual(UNSET_PRIMARY_GOAL_INTENT)
    expect(query.mock.calls[0][0]).toContain('effective_from <= $1::date')
    expect(query.mock.calls[0][1]).toEqual(['2026-09-01'])
  })
})
