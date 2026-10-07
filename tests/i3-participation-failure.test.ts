import { describe, expect, it, vi } from 'vitest'
import { tryAwardDailyParticipation } from '../server/rewards/service.ts'

describe('I3 participation award failure isolation', () => {
  it('does not turn a saved Health mutation into an application failure when the wallet write fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const sql = {
      query: async () => {
        throw new Error('wallet unavailable')
      },
    }
    await expect(tryAwardDailyParticipation(sql as never, {
      kind: 'hydration',
      healthDate: '2026-10-06',
      today: '2026-10-06',
      awardedAt: new Date('2026-10-06T20:00:00.000Z'),
    })).resolves.toBe(false)
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()
  })
})
