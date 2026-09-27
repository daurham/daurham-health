import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGoal, reviseGoal } from '../server/goals/service.ts'

const state = vi.hoisted(() => ({ transactions: 0, queries: [] as string[] }))

vi.mock('../server/db.ts', () => ({
  getSql: async () => ({
    query: async (text: string) => {
      state.queries.push(text)
      return []
    },
    transaction: async () => {
      state.transactions += 1
      return []
    },
  }),
}))

describe('goal writes', () => {
  beforeEach(() => {
    state.transactions = 0
    state.queries = []
  })

  it('does not insert when the selector is invalid', async () => {
    await expect(
      createGoal({
        goalKind: 'body_metric',
        bodyMetricKey: 'weight',
        exerciseDefinitionId: '66666666-6666-4666-8666-666666666666',
        startedOn: '2026-09-01',
        targetMode: 'at_most',
        targetMax: 175,
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(state.transactions).toBe(0)
    expect(state.queries.some((query) => query.includes('INSERT INTO goals'))).toBe(false)
  })

  it('rejects a stale revision before opening a version transaction', async () => {
    state.queries = []
    await expect(reviseGoal('11111111-1111-4111-8111-111111111111', { sourceVersionId: 'missing' })).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(state.transactions).toBe(0)
  })
})
