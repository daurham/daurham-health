import { describe, expect, it, vi } from 'vitest'
import { acceptCoachTask, endCoachTask, passCoachTask } from '../src/features/coach/api.ts'

const TASK = '11111111-1111-4111-8111-111111111111'

describe('Stretch Coach client mutations', () => {
  it.each([['accept', acceptCoachTask], ['end', endCoachTask], ['pass', passCoachTask]] as const)('posts %s through the authenticated Coach endpoint and returns state', async (action, mutate) => {
    const state = { date: '2026-09-29', stretchQuest: { id: TASK, status: action === 'accept' ? 'active' : action === 'pass' ? 'passed' : 'failed' } }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(state))
    try {
      expect(await mutate(TASK)).toEqual(state)
      expect(fetchMock).toHaveBeenCalledWith(`/api/coach/tasks/${TASK}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'same-origin',
      })
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('surfaces an invalid lifecycle response without hiding it as success', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: 'This offer has expired' }, { status: 409 }))
    try {
      await expect(acceptCoachTask(TASK)).rejects.toThrow('This offer has expired')
    } finally {
      fetchMock.mockRestore()
    }
  })
})
