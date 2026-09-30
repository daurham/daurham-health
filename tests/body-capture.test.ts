import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { BACKUP_TABLES, LATEST_SCHEMA_MIGRATION, tablesForProfile } from '../server/backup/inventory.ts'
import { buildBackupArchive, verifyBackupArchive } from '../server/backup/format.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import bodyCaptureIngestHandler from '../server/handlers/body-capture-ingest.ts'
import { handleBodyInbox, matchBodyInboxRoute } from '../server/handlers/body-inbox.ts'
import appleHealthSyncHandler from '../server/handlers/apple-health-sync.ts'
import {
  BODY_CAPTURE_COMMIT_SQL,
  BODY_CAPTURE_DISCARD_SQL,
  BODY_CAPTURE_LIST_SQL,
  BODY_CAPTURE_STAGE_SQL,
} from '../server/body/body-capture-sql.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'
import {
  BODY_CAPTURE_NOTE_LIMIT,
  BODY_INBOX_LIST_LIMIT,
  bodyCapturesMatch,
  bodyInboxReviewPath,
  bodyShortcutFingerprint,
  measuredAtFromPhoenixLocal,
  parseBodyCapture,
  phoenixDateTimeLocal,
  reviewCommitMeasuredAt,
  stagedFormValue,
} from '../src/domain/body-capture.ts'
import { BodyInputError, parseManualCreate } from '../src/domain/body-manual.ts'
import { TIMELINE_EVENT_KINDS } from '../src/domain/progress/timeline.ts'
import { reviewMeasurePreset } from '../src/features/body/measure-preset.ts'

const { stageBodyCapture } = vi.hoisted(() => ({
  stageBodyCapture: vi.fn(),
  listBodyInbox: vi.fn(),
  getBodyInbox: vi.fn(),
  commitBodyCapture: vi.fn(),
  discardBodyCapture: vi.fn(),
}))

vi.mock('../server/body/body-capture-service.ts', () => ({
  stageBodyCapture,
  listBodyInbox: vi.fn(),
  getBodyInbox: vi.fn(),
  commitBodyCapture: vi.fn(),
  discardBodyCapture: vi.fn(),
}))

const INBOX = '11111111-1111-4111-8111-111111111111'
const SESSION = '22222222-2222-4222-8222-222222222222'
const SOURCE = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-09-27T20:00:00.000Z')
const TOKEN = 'body-capture-test-token'
const APPLE = 'apple-sync-test-token'

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

function capture(method: string, url: string, headers: Record<string, string> = {}, body?: unknown) {
  const nodeRes = new ServerResponse(new IncomingMessage(new Socket()))
  const res = wrapNodeResponse(nodeRes)
  let statusCode = 200
  let payload: unknown
  const headersOut = new Map<string, string>()
  res.setHeader = ((name: string, value: string) => {
    headersOut.set(name.toLowerCase(), value)
    return res
  }) as ApiResponse['setHeader']
  res.status = (code: number) => {
    statusCode = code
    return res
  }
  res.json = ((value: unknown) => {
    payload = value
    return res
  }) as ApiResponse['json']
  const req = { method, url, headers, body, async *[Symbol.asyncIterator]() {} } as ApiRequest
  return { req, res, status: () => statusCode, payload: () => payload, allow: () => headersOut.get('allow') }
}

function callInbox(
  method: string,
  url: string,
  identity: { id: string; email: string } | null,
  headers?: Record<string, string>,
  body?: unknown,
) {
  const captured = capture(method, url, headers, body)
  return withOwnerAuth(handleBodyInbox, {
    config: ownerConfig,
    readSession: async () => identity,
  })(captured.req, captured.res).then(() => captured)
}

function weightCapture(overrides: Record<string, unknown> = {}) {
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

describe('body capture contract', () => {
  it('stages body-capture-v1 without inventing metrics', () => {
    const parsed = parseBodyCapture(weightCapture(), NOW)
    expect(parsed.metrics).toEqual([{ key: 'weight', value: 190.4, unit: 'lb' }])
    expect(parsed.notes).toBeNull()
    expect(parsed.timezone).toBe('America/Phoenix')
    expect(parsed.capturedAt).toBe('2026-09-27T19:00:00.000Z')
    expect(bodyCapturesMatch(parsed, parseBodyCapture(weightCapture({ capturedAt: '2026-09-27T19:00:00Z' }), NOW))).toBe(true)
  })

  it('rejects an unknown version, a bad capture id, and nested metadata', () => {
    expect(() => parseBodyCapture(weightCapture({ version: 'body-capture-v0' }), NOW)).toThrow(/version/i)
    expect(() => parseBodyCapture(weightCapture({ captureId: '' }), NOW)).toThrow(BodyInputError)
    expect(() => parseBodyCapture(weightCapture({ captureId: 'a'.repeat(81) }), NOW)).toThrow(/capture id/i)
    expect(() => parseBodyCapture(weightCapture({ captureId: 'has space' }), NOW)).toThrow(/capture id/i)
    expect(() => parseBodyCapture(weightCapture({ device: { name: 'scale' } }), NOW)).toThrow(/unsupported/i)
    expect(() =>
      parseBodyCapture(weightCapture({ metrics: [{ key: 'weight', value: 190.4, unit: 'lb', raw: 1 }] }), NOW),
    ).toThrow(/unsupported/i)
  })

  it('requires an offset-aware Phoenix time and the existing future skew', () => {
    expect(() => parseBodyCapture(weightCapture({ capturedAt: '2026-09-27' }), NOW)).toThrow(/real time/i)
    expect(() => parseBodyCapture(weightCapture({ capturedAt: '2026-09-27T12:00:00' }), NOW)).toThrow(/timezone offset/i)
    expect(parseBodyCapture(weightCapture({ capturedAt: '2026-09-27 12:00:00 -0700' }), NOW).capturedAt).toBe(
      '2026-09-27T19:00:00.000Z',
    )
    expect(() => parseBodyCapture(weightCapture({ timezone: 'UTC' }), NOW)).toThrow(/America\/Phoenix/)
    const soon = new Date(NOW.getTime() + 30_000).toISOString()
    expect(parseBodyCapture(weightCapture({ capturedAt: soon }), NOW).captureId).toBe('shortcut-weight-1')
    const later = new Date(NOW.getTime() + 180_000).toISOString()
    expect(() => parseBodyCapture(weightCapture({ capturedAt: later }), NOW)).toThrow('Future measurements are not recorded')
  })

  it('reuses Body metric rules and does not zero-fill missing metrics', () => {
    expect(() => parseBodyCapture(weightCapture({ metrics: [] }), NOW)).toThrow(/at least one/i)
    expect(() => parseBodyCapture(weightCapture({ metrics: [{ key: 'mood', value: 1, unit: 'lb' }] }), NOW)).toThrow(
      /unknown measurement/i,
    )
    expect(() =>
      parseBodyCapture(
        weightCapture({
          metrics: [
            { key: 'weight', value: 190, unit: 'lb' },
            { key: 'weight', value: 191, unit: 'lb' },
          ],
        }),
        NOW,
      ),
    ).toThrow(/duplicate/i)
    expect(() => parseBodyCapture(weightCapture({ metrics: [{ key: 'weight', value: 190, unit: 'stone' }] }), NOW)).toThrow(
      /unit/i,
    )
    expect(() => parseBodyCapture(weightCapture({ metrics: [{ key: 'weight', value: Number.POSITIVE_INFINITY, unit: 'lb' }] }), NOW)).toThrow(
      /number/i,
    )
    expect(() => parseBodyCapture(weightCapture({ metrics: [{ key: 'weight', value: 0, unit: 'lb' }] }), NOW)).toThrow(
      /greater than 0/i,
    )
    expect(parseBodyCapture(weightCapture({ metrics: [{ key: 'body_fat_percentage', value: 0, unit: 'percent' }] }), NOW).metrics).toEqual([
      { key: 'body_fat_percentage', value: 0, unit: 'percent' },
    ])
    expect(() => parseBodyCapture(weightCapture({ metrics: [{ key: 'body_fat_percentage', value: 101, unit: 'percent' }] }), NOW)).toThrow(
      /0 and 100/,
    )
    const staged = parseBodyCapture(
      weightCapture({ metrics: [{ key: 'weight', value: 80, unit: 'kg' }] }),
      NOW,
    )
    expect(staged.metrics).toEqual([{ key: 'weight', value: 80, unit: 'kg' }])
    expect(staged.metrics.some((metric) => metric.key === 'body_fat_percentage')).toBe(false)
  })

  it('bounds notes and keeps the review URL free of measurements', () => {
    expect(parseBodyCapture(weightCapture({ notes: '  morning ' }), NOW).notes).toBe('morning')
    expect(() => parseBodyCapture(weightCapture({ notes: 'n'.repeat(BODY_CAPTURE_NOTE_LIMIT + 1) }), NOW)).toThrow(/too long/i)
    expect(parseBodyCapture(weightCapture({ notes: 'n'.repeat(BODY_CAPTURE_NOTE_LIMIT) }), NOW).notes).toHaveLength(2000)
    const path = bodyInboxReviewPath(INBOX)
    expect(path).toBe(`/body/inbox/${INBOX}`)
    expect(path.includes('?')).toBe(false)
    expect(path).not.toContain('190')
    expect(path).not.toContain('morning')
    expect(bodyShortcutFingerprint('shortcut-weight-1')).toBe('body_shortcut|body-capture-v1|shortcut-weight-1')
    expect(stagedFormValue({ key: 'weight', value: 80, unit: 'kg' })).not.toBe('80')
    expect(phoenixDateTimeLocal('2026-09-27T19:00:00.000Z')).toBe('2026-09-27T12:00:00')
    expect(measuredAtFromPhoenixLocal('2026-09-27T12:00')).toBe('2026-09-27T12:00:00-07:00')
    expect(measuredAtFromPhoenixLocal('2026-09-27T12:04:37')).toBe('2026-09-27T12:04:37-07:00')
    expect(reviewMeasurePreset(['weight'])).toEqual({ preset: 'weight', customKeys: [] })
    expect(reviewMeasurePreset(['weight', 'waist_circumference']).preset).toBe('custom')
  })

  it('keeps the staged instant unless the owner edits the measurement time', () => {
    const seconds = '2026-09-27T19:04:37.000Z'
    const fractional = '2026-09-27T19:04:37.456Z'
    const displayed = phoenixDateTimeLocal(fractional)
    expect(displayed).toBe('2026-09-27T12:04:37')
    expect(displayed.endsWith(':37')).toBe(true)
    const untouched = {
      measuredAtLocal: displayed,
      measuredAtEdited: false,
    }
    expect(reviewCommitMeasuredAt({ originalCapturedAt: seconds, ...untouched, measuredAtLocal: phoenixDateTimeLocal(seconds) })).toBe(seconds)
    expect(reviewCommitMeasuredAt({ originalCapturedAt: fractional, ...untouched })).toBe(fractional)
    expect(new Date(reviewCommitMeasuredAt({ originalCapturedAt: fractional, ...untouched })).toISOString()).toBe(fractional)
    const changedWeight = parseManualCreate(
      {
        measuredAt: reviewCommitMeasuredAt({ originalCapturedAt: fractional, ...untouched }),
        notes: null,
        metrics: [{ key: 'weight', value: '191', unit: 'lb' }],
      },
      NOW,
    )
    expect(changedWeight.measuredAt.toISOString()).toBe(fractional)
    expect(changedWeight.metrics[0]).toMatchObject({ unit: 'kg', valueKind: 'manual' })
    const changedNotes = parseManualCreate(
      {
        measuredAt: reviewCommitMeasuredAt({ originalCapturedAt: fractional, ...untouched }),
        notes: 'after breakfast',
        metrics: [{ key: 'weight', value: '190.4', unit: 'lb' }],
      },
      NOW,
    )
    expect(changedNotes.measuredAt.toISOString()).toBe(fractional)
    expect(changedNotes.notes).toBe('after breakfast')
    const edited = reviewCommitMeasuredAt({
      originalCapturedAt: fractional,
      measuredAtLocal: '2026-09-27T12:05:08',
      measuredAtEdited: true,
    })
    expect(edited).toBe('2026-09-27T12:05:08-07:00')
    expect(new Date(edited).toISOString()).toBe('2026-09-27T19:05:08.000Z')
    const future = reviewCommitMeasuredAt({
      originalCapturedAt: fractional,
      measuredAtLocal: '2026-09-27T13:05:00',
      measuredAtEdited: true,
    })
    expect(() =>
      parseManualCreate(
        { measuredAt: future, notes: null, metrics: [{ key: 'weight', value: '190.4', unit: 'lb' }] },
        NOW,
      ),
    ).toThrow('Future measurements are not recorded')
    const page = readFileSync('src/features/body/BodyInboxPage.tsx', 'utf8')
    expect(page).toContain('step={1}')
    expect(page).toContain('reviewCommitMeasuredAt')
    expect(page).toContain('setMeasuredAtEdited(true)')
  })
})

describe('body capture migration and routes', () => {
  const migration = readFileSync('migrations/0032_body_capture_inbox.sql', 'utf8')

  it('adds a staging table and body_shortcut source without a user id', () => {
    expect(LATEST_SCHEMA_MIGRATION).toBe('0039_xp_reward_wallet.sql')
    expect(migration).toContain("VALUES ('body_shortcut', 'Body Shortcut', 'shortcut')")
    expect(migration).toContain('CREATE TABLE body_capture_inbox')
    expect(migration).toContain('ON DELETE SET NULL')
    expect(migration).toContain('body_capture_inbox_source_capture_key')
    expect(migration).not.toMatch(/\buser_id\b/)
    expect(migration).not.toContain("key = 'manual'")
    expect(BODY_CAPTURE_STAGE_SQL).not.toContain('body_measurement_sessions')
    expect(BODY_CAPTURE_STAGE_SQL).not.toContain('body_metrics')
    expect(BODY_CAPTURE_STAGE_SQL).toContain('ON CONFLICT (source_id, external_capture_id) DO NOTHING')
    expect(BODY_CAPTURE_LIST_SQL).toContain(`LIMIT ${BODY_INBOX_LIST_LIMIT}`)
    expect(BODY_INBOX_LIST_LIMIT).toBeLessThanOrEqual(20)
  })

  it('commits one manual session, provenance, and inbox status in one statement', () => {
    expect(BODY_CAPTURE_COMMIT_SQL).toContain('FOR UPDATE')
    expect(BODY_CAPTURE_COMMIT_SQL).toContain("locked.status = 'pending'")
    expect(BODY_CAPTURE_COMMIT_SQL).toContain('INSERT INTO body_measurement_sessions')
    expect(BODY_CAPTURE_COMMIT_SQL).toContain('import_job_id, device_name, notes')
    expect(BODY_CAPTURE_COMMIT_SQL).toContain('NULL, NULL, $6')
    expect(BODY_CAPTURE_COMMIT_SQL).toContain('value_kind')
    expect(BODY_CAPTURE_COMMIT_SQL).toContain("'manual'")
    expect(BODY_CAPTURE_COMMIT_SQL).toContain('INSERT INTO source_record_links')
    expect(BODY_CAPTURE_COMMIT_SQL).toContain("'body_measurement_session'")
    expect(BODY_CAPTURE_COMMIT_SQL).toContain("'body_shortcut|body-capture-v1|' || locked.external_capture_id")
    expect(BODY_CAPTURE_COMMIT_SQL).toContain('jsonb_build_object')
    expect(BODY_CAPTURE_COMMIT_SQL).toContain('locked.metrics')
    expect(BODY_CAPTURE_COMMIT_SQL).toContain("status = 'committed'")
    expect(BODY_CAPTURE_COMMIT_SQL.match(/sql.query|getSql/g)).toBeNull()
    expect(BODY_CAPTURE_DISCARD_SQL).toContain('COALESCE(inbox.discarded_at, now())')
    expect(BODY_CAPTURE_DISCARD_SQL).toContain("locked.status IN ('pending', 'discarded')")
    const plan = parseManualCreate(
      { measuredAt: '2026-09-27T12:00:00-07:00', notes: null, metrics: [{ key: 'weight', value: '190.4', unit: 'lb' }] },
      NOW,
    )
    expect(plan.metrics[0]).toMatchObject({ key: 'weight', unit: 'kg', valueKind: 'manual' })
    expect(plan.metrics[0]?.value).toBeCloseTo(86.364, 3)
  })

  it('keeps the machine token off owner routes and the Apple token off Body intake', () => {
    expect(matchHealthApiRoute('/api/ingest/body')).toBe('body-capture-ingest')
    expect(matchHealthApiRoute('/api/body/inbox')).toBe('body-inbox')
    expect(matchHealthApiRoute(`/api/body/inbox/${INBOX}`)).toBe('body-inbox')
    expect(matchHealthApiRoute(`/api/body/inbox/${INBOX}/commit`)).toBe('body-inbox')
    expect(matchHealthApiRoute(`/api/body/inbox/${INBOX}/discard`)).toBe('body-inbox')
    expect(matchBodyInboxRoute(`/api/body/inbox/${INBOX}/commit`)).toEqual({ kind: 'commit', id: INBOX })
    const example = readFileSync('.env.example', 'utf8')
    expect(example).toContain('BODY_CAPTURE_TOKEN=')
    expect(example).not.toContain('VITE_BODY_CAPTURE_TOKEN')
    const ingest = readFileSync('server/handlers/body-capture-ingest.ts', 'utf8')
    const auth = readFileSync('server/body/body-capture-auth.ts', 'utf8')
    const apple = readFileSync('server/handlers/apple-health-sync.ts', 'utf8')
    const inbox = readFileSync('server/handlers/body-inbox.ts', 'utf8')
    expect(auth).toContain('BODY_CAPTURE_TOKEN')
    expect(auth).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(ingest).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(ingest).not.toContain('withOwnerAuth')
    expect(apple).not.toContain('BODY_CAPTURE_TOKEN')
    expect(inbox).toContain('withOwnerAuth')
    expect(inbox).not.toContain('BODY_CAPTURE_TOKEN')
    expect(inbox).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(ingest).not.toContain('console.')
    expect(readFileSync('server/body/body-capture-service.ts', 'utf8')).not.toContain('gemini')
    expect(readFileSync('server/body/body-capture-service.ts', 'utf8')).not.toContain('home_ai')
  })
})

describe('body capture HTTP auth', () => {
  beforeEach(() => {
    stageBodyCapture.mockReset()
    stageBodyCapture.mockResolvedValue({
      accepted: true,
      id: INBOX,
      status: 'pending',
      reviewPath: `/body/inbox/${INBOX}`,
      duplicate: false,
    })
  })

  it('fails closed without a token, rejects the wrong token, and allows only POST', async () => {
    const previousBody = process.env.BODY_CAPTURE_TOKEN
    const previousApple = process.env.APPLE_HEALTH_SYNC_TOKEN
    delete process.env.BODY_CAPTURE_TOKEN
    process.env.APPLE_HEALTH_SYNC_TOKEN = APPLE
    try {
      const missing = capture('POST', '/api/ingest/body', { authorization: `Bearer ${TOKEN}` }, weightCapture())
      await bodyCaptureIngestHandler(missing.req, missing.res)
      expect(missing.status()).toBe(503)
      expect(stageBodyCapture).not.toHaveBeenCalled()

      process.env.BODY_CAPTURE_TOKEN = TOKEN
      const appleToken = capture('POST', '/api/ingest/body', { authorization: `Bearer ${APPLE}` }, weightCapture())
      await bodyCaptureIngestHandler(appleToken.req, appleToken.res)
      expect(appleToken.status()).toBe(401)

      const invalid = capture('POST', '/api/ingest/body', { authorization: 'Bearer wrong' }, weightCapture())
      await bodyCaptureIngestHandler(invalid.req, invalid.res)
      expect(invalid.status()).toBe(401)

      const read = capture('GET', '/api/ingest/body', { authorization: `Bearer ${TOKEN}` })
      await bodyCaptureIngestHandler(read.req, read.res)
      expect(read.status()).toBe(405)
      expect(read.allow()).toBe('POST')

      const accepted = capture('POST', '/api/ingest/body', { authorization: `Bearer ${TOKEN}` }, weightCapture())
      await bodyCaptureIngestHandler(accepted.req, accepted.res)
      expect(accepted.status()).toBe(200)
      expect(accepted.payload()).toEqual({
        accepted: true,
        id: INBOX,
        status: 'pending',
        reviewPath: `/body/inbox/${INBOX}`,
        duplicate: false,
      })
      expect(JSON.stringify(accepted.payload())).not.toContain(TOKEN)

      const appleRead = capture('POST', '/api/ingest/apple-health', { authorization: `Bearer ${TOKEN}` }, { version: 'body-capture-v1' })
      await appleHealthSyncHandler(appleRead.req, appleRead.res)
      expect(appleRead.status()).toBe(401)
    } finally {
      restoreEnv('BODY_CAPTURE_TOKEN', previousBody)
      restoreEnv('APPLE_HEALTH_SYNC_TOKEN', previousApple)
    }
  })

  it('requires the owner for inbox routes and ignores machine tokens', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    const { listBodyInbox, getBodyInbox } = await import('../server/body/body-capture-service.ts')
    expect((await callInbox('GET', '/api/body/inbox', null)).status()).toBe(401)
    expect((await callInbox('GET', '/api/body/inbox', null, { authorization: `Bearer ${TOKEN}` })).status()).toBe(401)
    expect((await callInbox('GET', `/api/body/inbox/${INBOX}`, { id: 'other', email: 'other@example.com' })).status()).toBe(403)
    expect(listBodyInbox).not.toHaveBeenCalled()
    expect(getBodyInbox).not.toHaveBeenCalled()
    vi.mocked(listBodyInbox).mockResolvedValue({ pendingCount: 1, items: [] })
    vi.mocked(getBodyInbox).mockResolvedValue({
      id: INBOX,
      status: 'pending',
      capturedAt: '2026-09-27T19:00:00.000Z',
      timezone: 'America/Phoenix',
      metrics: [{ key: 'weight', label: 'Weight', value: 190.4, unit: 'lb' }],
      notes: 'morning',
      canCommit: true,
      canDiscard: true,
    })
    const listed = await callInbox('GET', '/api/body/inbox', owner)
    expect(listed.status()).toBe(200)
    const detail = await callInbox('GET', `/api/body/inbox/${INBOX}`, owner)
    expect(detail.status()).toBe(200)
    expect(JSON.stringify(detail.payload())).toContain('190.4')
    expect(JSON.stringify(detail.payload())).not.toContain('BODY_CAPTURE_TOKEN')
    expect(JSON.stringify(detail.payload())).not.toContain(TOKEN)
    expect((await callInbox('POST', '/api/body/inbox', owner)).status()).toBe(405)
    expect((await callInbox('GET', `/api/body/inbox/${INBOX}/commit`, owner)).status()).toBe(405)
  })
})

describe('body capture product boundaries', () => {
  it('keeps pending captures out of Today, Progress, Goals, and Timeline', () => {
    expect(readFileSync('server/today/queries.ts', 'utf8')).not.toContain('body_capture_inbox')
    expect(readFileSync('server/progress/queries.ts', 'utf8')).not.toContain('body_capture_inbox')
    expect(readFileSync('server/goals/service.ts', 'utf8')).not.toContain('body_capture_inbox')
    expect(readFileSync('server/progress/queries.ts', 'utf8')).toContain('body_measurement_sessions')
    expect(TIMELINE_EVENT_KINDS).toContain('body_measurement')
    expect(TIMELINE_EVENT_KINDS).not.toContain('body_capture')
    expect(readFileSync('src/domain/progress/timeline.ts', 'utf8')).not.toContain('body_capture')
  })

  it('leaves Fit Profile and demo capture-free', () => {
    expect(readFileSync('server/handlers/fit-profile-commit.ts', 'utf8')).not.toContain('body_capture_inbox')
    expect(readFileSync('server/handlers/body-capture-ingest.ts', 'utf8')).not.toContain('fit_profile')
    const demo = readFileSync('src/features/demo/DemoBodyPage.tsx', 'utf8') + readFileSync('src/demo/dataset.ts', 'utf8')
    expect(demo).not.toContain('/api/ingest/body')
    expect(demo).not.toContain('BODY_CAPTURE_TOKEN')
    expect(demo).not.toContain('body_capture_inbox')
    const shortcut = readFileSync('docs/body-shortcut.md', 'utf8')
    expect(shortcut).toContain('https://health.daurham.com/api/ingest/body')
    expect(shortcut).toContain('yyyy-MM-dd\'T\'HH:mm:ssxxx')
    expect(shortcut).not.toMatch(/Bearer [A-Za-z0-9+/]{20,}/)
  })

  it('backs up the inbox in full archives only, with a valid session reference and no token', () => {
    const inbox = BACKUP_TABLES.find((table) => table.name === 'body_capture_inbox')
    expect(inbox?.portable).toBe(false)
    expect(tablesForProfile('portable').map((table) => table.name)).not.toContain('body_capture_inbox')
    expect(tablesForProfile('full').map((table) => table.name)).toContain('body_capture_inbox')
    expect(tablesForProfile('portable').map((table) => table.name)).toContain('body_measurement_sessions')
    const names = BACKUP_TABLES.map((table) => table.name)
    expect(names.indexOf('data_sources')).toBeLessThan(names.indexOf('body_measurement_sessions'))
    expect(names.indexOf('body_measurement_sessions')).toBeLessThan(names.indexOf('body_capture_inbox'))
    expect(names.indexOf('body_capture_inbox')).toBeLessThan(names.indexOf('source_record_links'))
    expect(readFileSync('server/backup/inventory.ts', 'utf8')).not.toContain('BODY_CAPTURE_TOKEN')
    const rows = {
      data_sources: [
        {
          id: SOURCE,
          key: 'body_shortcut',
          display_name: 'Body Shortcut',
          source_kind: 'shortcut',
          created_at: '2026-09-27T19:00:00.000Z',
        },
      ],
      body_measurement_sessions: [
        {
          id: SESSION,
          measured_at: '2026-09-27T19:00:00.000Z',
          timezone: 'America/Phoenix',
          source_id: SOURCE,
          import_job_id: null,
          device_name: null,
          notes: null,
          metadata: null,
          created_at: '2026-09-27T19:00:00.000Z',
          updated_at: '2026-09-27T19:00:00.000Z',
        },
      ],
      body_capture_inbox: [
        {
          id: INBOX,
          external_capture_id: 'shortcut-weight-1',
          status: 'committed',
          captured_at: '2026-09-27T19:00:00.000Z',
          timezone: 'America/Phoenix',
          metrics: '[{"key":"weight","value":190.4,"unit":"lb"}]',
          notes: null,
          source_id: SOURCE,
          canonical_session_id: SESSION,
          created_at: '2026-09-27T19:00:00.000Z',
          updated_at: '2026-09-27T19:00:00.000Z',
          committed_at: '2026-09-27T19:05:00.000Z',
          discarded_at: null,
        },
      ],
    }
    const full = verifyBackupArchive(
      buildBackupArchive({
        profile: 'full',
        createdAt: '2026-09-27T20:00:00.000Z',
        schemaMigration: LATEST_SCHEMA_MIGRATION,
        appVersionOrCommit: '1.0.0',
        rowsByTable: rows,
      }),
    )
    expect(full.errors).toEqual([])
    expect(full.tables.body_capture_inbox).toHaveLength(1)
    const portable = verifyBackupArchive(
      buildBackupArchive({
        profile: 'portable',
        createdAt: '2026-09-27T20:00:00.000Z',
        schemaMigration: LATEST_SCHEMA_MIGRATION,
        appVersionOrCommit: '1.0.0',
        rowsByTable: rows,
      }),
    )
    expect(portable.tables.body_capture_inbox ?? []).toHaveLength(0)
    expect(portable.tables.body_measurement_sessions).toHaveLength(1)
    const dangling = verifyBackupArchive(
      buildBackupArchive({
        profile: 'full',
        createdAt: '2026-09-27T20:00:00.000Z',
        schemaMigration: LATEST_SCHEMA_MIGRATION,
        appVersionOrCommit: '1.0.0',
        rowsByTable: {
          ...rows,
          body_capture_inbox: [{ ...rows.body_capture_inbox[0], canonical_session_id: '99999999-9999-4999-8999-999999999999' }],
        },
      }),
    )
    expect(dangling.errors.join('\n')).toContain('canonical_session_id references a missing body_measurement_sessions')
    expect(JSON.stringify(rows)).not.toContain('BODY_CAPTURE_TOKEN')
  })
})

function restoreEnv(name: string, previous: string | undefined) {
  if (previous === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = previous
  }
}
