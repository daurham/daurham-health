import { describe, expect, it, vi } from 'vitest'
import { acceptCoachTask, CoachApiError, endCoachTask, fetchCoach, passCoachTask, snoozeCoachLabItem } from '../src/features/coach/api.ts'

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

 describe('Coach Lab client state', () => {
  const item = { kind: 'benchmark_retest' as const, sourceKey: 'benchmark:b1:p1', sourceFingerprint: 'a'.repeat(64) }
  it('snoozes only exact source identity and returns the next Coach state and resurfacing date', async () => {
    const next = { date: '2026-09-29', dailyQuest: null, weeklyFocus: null, labItems: [], activeCount: 0, snoozedUntil: '2026-10-06' }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(next))
    try {
      expect(await snoozeCoachLabItem(item)).toEqual(next)
      expect(fetchMock).toHaveBeenCalledWith('/api/coach/lab/snooze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item), credentials: 'same-origin' })
    } finally { fetchMock.mockRestore() }
  })
  it('preserves the409 status so stale opportunities can refresh without treating snooze as success', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: 'Lab opportunity changed' }, { status: 409 })).mockResolvedValueOnce(Response.json({ labItems: [] }))
    try {
      const caught = await snoozeCoachLabItem(item).catch(error => error)
      expect(caught).toBeInstanceOf(CoachApiError)
      expect(caught.status).toBe(409)
      expect(await fetchCoach()).toEqual({ labItems: [] })
      expect(fetchMock).toHaveBeenLastCalledWith('/api/coach', { method: 'GET', headers: undefined, body: undefined, credentials: 'same-origin' })
    } finally { fetchMock.mockRestore() }
  })
})