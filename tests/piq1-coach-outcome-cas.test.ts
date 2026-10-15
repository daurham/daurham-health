import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { Sql } from '../server/db.js'
import {
  dueFollowUps,
  writeCoachRecommendationOutcome,
} from '../server/intelligence/coach-intelligence.js'

const ID = '11111111-1111-4111-8111-111111111111'
const REVISION = '2026-10-15 12:04:09.123456+00'

describe('PIQ-1.5 outcome ownership and concurrency', () => {
  it('requires the exact saved response revision before any DB request', async () => {
    for (const revision of [undefined, '', 'x'.repeat(81)]) {
      const query = vi.fn()
      await expect(writeCoachRecommendationOutcome(
        { query } as unknown as Sql, ID, 'helped', '2026-10-23', revision,
      )).rejects.toMatchObject({ statusCode: 428 })
      expect(query).not.toHaveBeenCalled()
    }
  })

  it('limits a feedback write to a due, explicitly started, still-unanswered response', async () => {
    const query = vi.fn().mockResolvedValue([{ id: ID }])
    await writeCoachRecommendationOutcome(
      { query } as unknown as Sql, ID, 'helped', '2026-10-23', REVISION,
    )
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, values] = query.mock.calls[0] as [string, unknown[]]
    for (const clause of [
      "response_state = 'do_this'",
      "metadata ->> 'ownerStarted' = 'true'",
      'outcome_state IS NULL',
      'follow_up_on IS NOT NULL',
      'follow_up_on <= $3::date',
      'response_at::text = $4::text',
      'RETURNING id::text AS id',
    ]) expect(sql).toContain(clause)
    expect(values).toEqual([ID, 'helped', '2026-10-23', REVISION])
  })

  it('returns conflict instead of overwriting a later owner decision or another completed outcome', async () => {
    const query = vi.fn().mockResolvedValue([])
    await expect(writeCoachRecommendationOutcome(
      { query } as unknown as Sql, ID, 'made_worse', '2026-10-23', REVISION,
    )).rejects.toMatchObject({ statusCode: 409 })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('requires a source response timestamp before including a card in the due list', async () => {
    const query = vi.fn().mockResolvedValue([])
    await dueFollowUps({ query } as unknown as Sql, '2026-10-23', null, [])
    expect(query.mock.calls[0][0]).toContain('response_at IS NOT NULL')
  })

  it('the client posts the saved response revision and refreshes on conflict', () => {
    const api = readFileSync('src/features/coach/api.ts', 'utf8')
    const panel = readFileSync('src/features/coach/CoachCard.tsx', 'utf8')
    const handler = readFileSync('server/handlers/coach-intelligence.ts', 'utf8')
    expect(api).toContain('{ outcome, expectedResponseAt }')
    expect(panel).toContain('recordCoachRecommendationOutcome(item.id, outcome, item.responseAt)')
    expect(handler).toContain("typeof body.expectedResponseAt === 'string'")
  })
})
