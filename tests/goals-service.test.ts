import { beforeEach, describe, expect, it, vi } from 'vitest'
import { archiveGoal, createGoal, reviseGoal } from '../server/goals/service.ts'

const state = vi.hoisted(() => ({
  transactions: 0,
  queries: [] as string[],
  referenced: false,
}))

vi.mock('../server/db.ts', () => ({
  getSql: async () => ({
    query: async (text: string) => {
      state.queries.push(text)
      if (text.includes('FROM experiment_goals')) {
        return state.referenced ? [{ experiment_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }] : []
      }
      if (text.includes('UPDATE goals') && text.includes('archived_at')) {
        return [{ id: '11111111-1111-4111-8111-111111111111' }]
      }
      return []
    },
    transaction: async () => {
      state.transactions += 1
      return [[], [{ id: '11111111-1111-4111-8111-111111111111' }]]
    },
  }),
}))

describe('goal writes', () => {
  beforeEach(() => {
    state.transactions = 0
    state.queries = []
    state.referenced = false
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

  it('deletes an unreferenced mistaken goal with its versions', async () => {
    await expect(archiveGoal('11111111-1111-4111-8111-111111111111')).resolves.toEqual({
      ok: true,
      disposition: 'deleted',
    })
    expect(state.transactions).toBe(1)
  })

  it('archives a goal referenced by immutable experiment history', async () => {
    state.referenced = true
    await expect(archiveGoal('11111111-1111-4111-8111-111111111111')).resolves.toEqual({
      ok: true,
      disposition: 'archived',
    })
    expect(state.transactions).toBe(0)
    expect(state.queries.some((query) => query.includes('archived_at'))).toBe(true)
  })
})
