import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { describe, expect, it } from 'vitest'
import apiHandler from '../api/index.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import appleHealthSyncHandler from '../server/handlers/apple-health-sync.ts'
import { UPSERT_HAE_DAILY_SQL, buildHaeDailyStatement, haeDailyFingerprint } from '../server/apple-health/hae-sql.ts'
import { syncTokensMatch } from '../server/apple-health/sync-auth.ts'
import {
  HAE_STEP_NORMALIZATION,
  healthDayFromHaeDate,
  parseHealthAutoExport,
  truncateHaeSteps,
} from '../src/domain/apple-health/hae.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const TOKEN = 'test-sync-token-value'

function payload(metrics: unknown[]) {
  return { data: { metrics } }
}

function point(date: string, qty: number, extra: Record<string, unknown> = {}) {
  return { date, qty, ...extra }
}

function capture(method: string, headers: Record<string, string>, body?: unknown) {
  const socket = new Socket()
  const nodeRes = new ServerResponse(new IncomingMessage(socket))
  const res = wrapNodeResponse(nodeRes)
  let statusCode = 200
  let payloadBody: unknown
  res.status = (code: number) => {
    statusCode = code
    return res
  }
  res.json = (value: unknown) => {
    payloadBody = value
  }
  const req = {
    method,
    url: '/api?path=ingest/apple-health',
    query: { path: 'ingest/apple-health' },
    headers,
    body,
    async *[Symbol.asyncIterator]() {},
  } as ApiRequest
  return {
    req,
    res: res as ApiResponse,
    status: () => statusCode,
    body: () => payloadBody,
  }
}

describe('Health Auto Export parser', () => {
  it('reads JSON v2 metrics independent of order and ignores unknown metrics', () => {
    const parsed = parseHealthAutoExport(
      payload([
        {
          name: 'resting_heart_rate',
          units: 'bpm',
          data: [point('2026-09-20 00:00:00 -0700', 52)],
        },
        { name: 'heart_rate', units: 'bpm', data: [point('2026-09-20 00:00:00 -0700', 70)] },
        {
          name: 'step_count',
          units: 'count',
          data: [point('2026-09-20 00:00:00 -0700', 5354)],
        },
      ]),
    )
    expect(parsed.days).toHaveLength(1)
    expect(parsed.days[0]).toMatchObject({
      date: '2026-09-20',
      timezone: 'America/Phoenix',
      stepsCount: 5354,
      restingHeartRateBpm: 52,
      activeEnergyKcal: null,
      exerciseMinutes: null,
    })
    expect(parsed.ignoredMetrics).toEqual([{ name: 'heart_rate', count: 1 }])
    const withSleep = parseHealthAutoExport(
      payload([
        { name: 'step_count', units: 'count', data: [point('2026-09-20 00:00:00 -0700', 5354)] },
        {
          name: 'sleep_analysis',
          units: 'hr',
          data: [{ date: '2026-09-20 00:00:00 -0700', qty: 7.5 }],
        },
        {
          name: 'walking_running_distance',
          units: 'mi',
          data: [point('2026-09-20 00:00:00 -0700', 3)],
        },
      ]),
    )
    expect(withSleep.days[0]?.stepsCount).toBe(5354)
    expect(withSleep.ignoredMetrics.map((metric) => metric.name)).toEqual(['walking_running_distance'])
    expect(withSleep.ignoredDistanceCount).toBe(1)
    expect(JSON.stringify(withSleep.days)).not.toContain('sleep')
    expect(parsed.metricsApplied.step_count).toBe(1)
    expect(parsed.metricsApplied.active_energy).toBe(0)
  })

  it('truncates fractional steps toward zero and rejects negatives', () => {
    expect(truncateHaeSteps(18525.951)).toBe(18525)
    expect(truncateHaeSteps(6851.477)).toBe(6851)
    expect(truncateHaeSteps(7645.73)).toBe(7645)
    expect(truncateHaeSteps(10248)).toBe(10248)
    expect(truncateHaeSteps(5354)).toBe(5354)
    expect(() => truncateHaeSteps(-1)).toThrow(/step_count/)
    const parsed = parseHealthAutoExport(
      payload([
        {
          name: 'step_count',
          units: 'count',
          data: [
            point('2024-09-22 00:00:00 -0700', 18525.951),
            point('2025-06-02 00:00:00 -0700', 6851.477),
            point('2025-08-30 00:00:00 -0700', 7645.73),
            point('2024-01-10 00:00:00 -0700', 10248),
            point('2026-09-20 00:00:00 -0700', 5354),
          ],
        },
      ]),
    )
    expect(parsed.days.map((day) => [day.date, day.stepsCount])).toEqual([
      ['2024-01-10', 10248],
      ['2024-09-22', 18525],
      ['2025-06-02', 6851],
      ['2025-08-30', 7645],
      ['2026-09-20', 5354],
    ])
    expect(parsed.days[1]?.metrics.step_count).toMatchObject({
      providerQty: 18525.951,
      canonicalQty: 18525,
      normalization: HAE_STEP_NORMALIZATION,
      basis: 'daily_summary',
      source: 'health_auto_export',
      sourceVersion: 'v2',
    })
  })

  it('rejects an invalid quantity, unit, or date', () => {
    expect(() =>
      parseHealthAutoExport(
        payload([{ name: 'step_count', units: 'count', data: [{ date: '2026-09-20 00:00:00 -0700', qty: '12' }] }]),
      ),
    ).toThrow(/quantity/)
    expect(() =>
      parseHealthAutoExport(
        payload([{ name: 'active_energy', units: 'mi', data: [point('2026-09-20 00:00:00 -0700', 10)] }]),
      ),
    ).toThrow(/unit/)
    expect(() =>
      parseHealthAutoExport(payload([{ name: 'step_count', units: 'count', data: [point('yesterday', 10)] }])),
    ).toThrow(/date/)
    expect(() => parseHealthAutoExport({ metrics: [] })).toThrow(/data\.metrics/)
  })

  it('leaves a missing metric null and ignores walking_running_distance', () => {
    const parsed = parseHealthAutoExport(
      payload([
        {
          name: 'active_energy',
          units: 'kcal',
          data: [point('2026-09-20 00:00:00 -0700', 473.064)],
        },
        {
          name: 'walking_running_distance',
          units: 'mi',
          data: [point('2026-09-20 00:00:00 -0700', 6.624, { source: 'Circular' })],
        },
      ]),
    )
    expect(parsed.ignoredDistanceCount).toBe(1)
    expect(parsed.days[0]?.stepsCount).toBeNull()
    expect(parsed.days[0]?.restingHeartRateBpm).toBeNull()
    expect(parsed.days[0]?.activeEnergyKcal).toBeCloseTo(473.064)
    expect(JSON.stringify(parsed.days[0])).not.toContain('6.624')
  })

  it('maps an offset-aware timestamp onto the Phoenix calendar day', () => {
    expect(healthDayFromHaeDate('2026-11-02 00:00:00 -0700')).toBe('2026-11-02')
    expect(healthDayFromHaeDate('2026-11-01 23:30:00 -0800')).toBe('2026-11-02')
  })
})

describe('Health Auto Export daily upsert', () => {
  it('does not null an absent metric and does not write distance', () => {
    const parsed = parseHealthAutoExport(
      payload([{ name: 'step_count', units: 'count', data: [point('2026-09-20 00:00:00 -0700', 5354)] }]),
    )
    const day = parsed.days[0]
    if (!day) {
      throw new Error('expected a day')
    }
    const statement = buildHaeDailyStatement({ sourceId: 'source', jobId: 'job', day })
    const again = buildHaeDailyStatement({ sourceId: 'source', jobId: 'job-2', day })
    expect(statement.params[3]).toBe(5354)
    expect(statement.params[4]).toBeNull()
    expect(statement.params[5]).toBeNull()
    expect(statement.params[6]).toBeNull()
    expect(statement.fingerprint).toBe(haeDailyFingerprint('2026-09-20'))
    expect(again.fingerprint).toBe(statement.fingerprint)
    const update = UPSERT_HAE_DAILY_SQL.split('DO UPDATE SET')[1] ?? ''
    expect(update).toContain('COALESCE(EXCLUDED.steps_count, activity_daily_summaries.steps_count)')
    expect(update).toContain('COALESCE(EXCLUDED.resting_heart_rate_bpm, activity_daily_summaries.resting_heart_rate_bpm)')
    expect(update).not.toContain('walking_running_distance')
    expect(UPSERT_HAE_DAILY_SQL).not.toContain('activity_samples')
  })

  it('keeps a repeated rolling window on the same day keys', () => {
    const body = payload([
      {
        name: 'step_count',
        units: 'count',
        data: [point('2026-09-14 00:00:00 -0700', 1000), point('2026-09-20 00:00:00 -0700', 5354.8)],
      },
      {
        name: 'apple_exercise_time',
        units: 'min',
        data: [point('2026-09-20 00:00:00 -0700', 6)],
      },
    ])
    const first = parseHealthAutoExport(body)
    const second = parseHealthAutoExport(body)
    expect(second.days.map((day) => day.date)).toEqual(first.days.map((day) => day.date))
    expect(second.days.map((day) => day.stepsCount)).toEqual([1000, 5354])
    expect(second.days[1]?.exerciseMinutes).toBe(6)
    expect(second.days[0]?.exerciseMinutes).toBeNull()
  })
})

describe('Apple Health sync auth', () => {
  it('rejects a missing or invalid token and accepts the matching token', async () => {
    expect(syncTokensMatch('a', 'b')).toBe(false)
    expect(syncTokensMatch(TOKEN, TOKEN)).toBe(true)
    const previous = process.env.APPLE_HEALTH_SYNC_TOKEN
    process.env.APPLE_HEALTH_SYNC_TOKEN = TOKEN
    try {
      const missing = capture('POST', {}, payload([]))
      await appleHealthSyncHandler(missing.req, missing.res)
      expect(missing.status()).toBe(401)

      const invalid = capture('POST', { authorization: 'Bearer wrong-token' }, payload([]))
      await appleHealthSyncHandler(invalid.req, invalid.res)
      expect(invalid.status()).toBe(401)

      const malformed = capture('POST', { authorization: `Bearer ${TOKEN}` }, { nope: true })
      await appleHealthSyncHandler(malformed.req, malformed.res)
      expect(malformed.status()).toBe(400)

      const read = capture('GET', { authorization: `Bearer ${TOKEN}` })
      await appleHealthSyncHandler(read.req, read.res)
      expect(read.status()).toBe(405)
      expect(JSON.stringify(read.body())).not.toContain('step')
      expect(JSON.stringify(read.body())).not.toContain('qty')
    } finally {
      if (previous === undefined) {
        delete process.env.APPLE_HEALTH_SYNC_TOKEN
      } else {
        process.env.APPLE_HEALTH_SYNC_TOKEN = previous
      }
    }
  })

  it('is a write-only route on the single API function and does not log the token', async () => {
    expect(matchHealthApiRoute('/api/ingest/apple-health')).toBe('apple-health-sync')
    const captured = capture('POST', {})
    await apiHandler(
      {
        ...captured.req,
        headers: {},
      },
      captured.res,
    )
    expect([401, 503]).toContain(captured.status())
    const auth = readFileSync('server/apple-health/sync-auth.ts', 'utf8')
    const handler = readFileSync('server/handlers/apple-health-sync.ts', 'utf8')
    expect(auth).not.toContain('console.')
    expect(handler).not.toContain('console.')
    expect(readFileSync('.env.example', 'utf8')).toContain('APPLE_HEALTH_SYNC_TOKEN=')
    expect(readFileSync('.env.example', 'utf8')).not.toContain('VITE_APPLE_HEALTH_SYNC_TOKEN')
    expect(readFileSync('server/apple-health/archive-cli.ts', 'utf8')).not.toContain('activity_samples')
    expect(readFileSync('server/apple-health/archive-cli.ts', 'utf8')).not.toContain('reconcile')
    expect(readFileSync('server/apple-health/hae-service.ts', 'utf8')).not.toContain('reconcile')
    expect(readFileSync('server/apple-health/hae-cli.ts', 'utf8')).not.toContain('fetch(')
  })
})
