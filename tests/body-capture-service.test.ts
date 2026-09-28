import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '../server/http.ts'
import {
  BODY_CAPTURE_COMMIT_SQL,
  BODY_CAPTURE_DISCARD_SQL,
  BODY_CAPTURE_STAGE_SQL,
} from '../server/body/body-capture-sql.ts'

const query = vi.fn()

vi.mock('../server/db.ts', () => ({
  getSql: async () => ({ query }),
}))

const INBOX = '11111111-1111-4111-8111-111111111111'
const MANUAL = '33333333-3333-4333-8333-333333333333'
const SHORTCUT = '44444444-4444-4444-8444-444444444444'
const SESSION = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-09-27T20:00:00.000Z')

function sources() {
  return [
    { key: 'manual', id: MANUAL },
    { key: 'body_shortcut', id: SHORTCUT },
  ]
}

function capture(overrides: Record<string, unknown> = {}) {
  return {
    version: 'body-capture-v1',
    captureId: 'shortcut-weight-1',
    capturedAt: '2026-09-27T12:00:00-07:00',
    timezone: 'America/Phoenix',
    metrics: [{ key: 'weight', value: 190.4, unit: 'lb' }],
    notes: null,
    ...overrides,
  }
}

describe('body capture persistence', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('returns the same inbox row for an identical capture id and conflicts on a different payload', async () => {
    const { stageBodyCapture } = await import('../server/body/body-capture-service.ts')
    query.mockResolvedValueOnce(sources()).mockResolvedValueOnce([
      {
        id: INBOX,
        status: 'pending',
        captured_at: '2026-09-27T19:00:00.000Z',
        timezone: 'America/Phoenix',
        metrics: [{ key: 'weight', value: 190.4, unit: 'lb' }],
        notes: null,
        existing: false,
      },
    ])
    const created = await stageBodyCapture(capture(), NOW)
    expect(created).toMatchObject({ id: INBOX, duplicate: false, status: 'pending' })
    expect(query.mock.calls[1]?.[0]).toBe(BODY_CAPTURE_STAGE_SQL)
    expect(String(query.mock.calls[1]?.[0])).not.toContain('body_metrics')

    query.mockResolvedValueOnce(sources()).mockResolvedValueOnce([
      {
        id: INBOX,
        status: 'pending',
        captured_at: '2026-09-27T19:00:00.000Z',
        timezone: 'America/Phoenix',
        metrics: [{ key: 'weight', value: 190.4, unit: 'lb' }],
        notes: null,
        existing: true,
      },
    ])
    const retry = await stageBodyCapture(capture(), NOW)
    expect(retry.duplicate).toBe(true)
    expect(retry.id).toBe(INBOX)

    query.mockResolvedValueOnce(sources()).mockResolvedValueOnce([
      {
        id: INBOX,
        status: 'pending',
        captured_at: '2026-09-27T19:00:00.000Z',
        timezone: 'America/Phoenix',
        metrics: [{ key: 'weight', value: 191, unit: 'lb' }],
        notes: null,
        existing: true,
      },
    ])
    await expect(stageBodyCapture(capture(), NOW)).rejects.toMatchObject({ statusCode: 409 })
    expect(query).toHaveBeenCalledTimes(6)
  })

  it('revalidates a review, writes once, and leaves a failed write pending', async () => {
    const { commitBodyCapture } = await import('../server/body/body-capture-service.ts')
    query.mockResolvedValue([])
    await expect(commitBodyCapture(INBOX, { notes: null, metrics: [] }, NOW)).rejects.toBeInstanceOf(HttpError)
    expect(query).not.toHaveBeenCalled()

    query.mockResolvedValueOnce(sources()).mockRejectedValueOnce(new Error('canonical write failed'))
    await expect(
      commitBodyCapture(
        INBOX,
        { measuredAt: '2026-09-27T12:04:00-07:00', notes: null, metrics: [{ key: 'weight', value: '190.4', unit: 'lb' }] },
        NOW,
      ),
    ).rejects.toThrow('canonical write failed')
    expect(query.mock.calls[1]?.[0]).toBe(BODY_CAPTURE_COMMIT_SQL)
    expect(query).toHaveBeenCalledTimes(2)

    query.mockReset()
    query.mockResolvedValueOnce(sources()).mockResolvedValueOnce([
      { previous_status: 'committed', existing_session_id: SESSION, inserted_session_id: null },
    ])
    const repeated = await commitBodyCapture(
      INBOX,
      { measuredAt: '2026-09-27T12:04:00-07:00', notes: 'edited', metrics: [{ key: 'weight', value: '191', unit: 'lb' }] },
      NOW,
    )
    expect(repeated).toEqual({ id: INBOX, status: 'committed', canonicalSessionId: SESSION, alreadyCommitted: true })

    query.mockResolvedValueOnce(sources()).mockResolvedValueOnce([{ previous_status: 'discarded' }])
    await expect(
      commitBodyCapture(
        INBOX,
        { measuredAt: '2026-09-27T12:04:00-07:00', notes: null, metrics: [{ key: 'weight', value: '190.4', unit: 'lb' }] },
        NOW,
      ),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('discards once and refuses to discard a saved measurement', async () => {
    const { discardBodyCapture } = await import('../server/body/body-capture-service.ts')
    query.mockResolvedValueOnce([{ previous_status: 'pending' }])
    expect(await discardBodyCapture(INBOX)).toEqual({ id: INBOX, status: 'discarded' })
    expect(query.mock.calls[0]?.[0]).toBe(BODY_CAPTURE_DISCARD_SQL)

    query.mockResolvedValueOnce([{ previous_status: 'discarded' }])
    expect(await discardBodyCapture(INBOX)).toEqual({ id: INBOX, status: 'discarded' })

    query.mockResolvedValueOnce([{ previous_status: 'committed' }])
    await expect(discardBodyCapture(INBOX)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('keeps Shortcut-origin sessions on the manual edit path', () => {
    const manual = readFileSync('server/body/manual-service.ts', 'utf8')
    const foundation = readFileSync('migrations/0001_health_foundation.sql', 'utf8')
    expect(manual).toContain("sources.key = 'manual'")
    expect(BODY_CAPTURE_COMMIT_SQL).toContain('NULL, NULL, $6')
    expect(foundation).not.toContain('entity_id UUID NOT NULL REFERENCES')
    expect(readFileSync('migrations/0032_body_capture_inbox.sql', 'utf8')).toContain('ON DELETE SET NULL')
  })
})
