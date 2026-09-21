import { afterEach, describe, expect, it, vi } from 'vitest'
import { bodyHistoryResponseSchema } from '../src/domain/body.ts'
import { commitFitProfile } from '../src/features/body/api.ts'
import { selectedFingerprints, selectionFromPreview } from '../src/features/body/import-state.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('preview is not history', () => {
  it('selects new fingerprints for commit and does not turn preview rows into sessions', () => {
    const selected = selectionFromPreview([
      { fingerprint: 'new-row', selectedByDefault: true },
      { fingerprint: 'dup-row', selectedByDefault: false },
    ])
    expect(selectedFingerprints(selected)).toEqual(['new-row'])
    expect(() =>
      bodyHistoryResponseSchema.parse({
        sessions: [
          {
            fingerprint: 'new-row',
            duplicate: false,
            measuredAt: '2026-09-20T16:13:07.000Z',
            timezone: 'America/Phoenix',
            metrics: [],
          },
        ],
      }),
    ).toThrow()
  })
})

describe('commitFitProfile client', () => {
  it('POSTs the original file, timezone, and selected fingerprints', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response(
        JSON.stringify({
          importJobId: '11111111-1111-4111-8111-111111111111',
          insertedCount: 1,
          matchedCount: 0,
          skippedCount: 0,
          errorCount: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch

    const file = new File([new Uint8Array([80, 75])], 'fit-profile.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    await commitFitProfile(file, 'America/Phoenix', ['abc123'])

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/api/body/import/fit-profile/commit')
    expect(calls[0]?.init.method).toBe('POST')
    const body = calls[0]?.init.body
    expect(body).toBeInstanceOf(FormData)
    const form = body as FormData
    expect(form.get('timezone')).toBe('America/Phoenix')
    expect(form.get('fingerprints')).toBe(JSON.stringify(['abc123']))
    expect(form.get('file')).toBe(file)
  })

  it('does not treat a non-2xx commit as success', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'Import could not be completed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch

    const file = new File([new Uint8Array([80, 75])], 'fit-profile.xlsx')
    await expect(commitFitProfile(file, 'America/Phoenix', ['abc123'])).rejects.toThrow(
      'Import could not be completed',
    )
  })
})
