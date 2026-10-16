import { beforeEach, describe, expect, it, vi } from 'vitest'
import { putHealthProfile } from '../server/profile/service.js'

const fixture = vi.hoisted(() => ({ getSql: vi.fn(), query: vi.fn(), date: vi.fn() }))
vi.mock('../server/db.js', () => ({ getSql: fixture.getSql }))
vi.mock('../server/health-time.js', () => ({ currentHealthDate: fixture.date }))

const currentVersion = '2026-10-15T16:20:00.123Z'
const savedRow = {
  sex_for_physiology: null, date_of_birth: null, height_cm: null,
  persistent_health_context: 'Old note', training_limitations: null,
  dietary_context: null, body_measurement_protocol: null,
  clinical_conditions: [], clinical_allergies: [], clinical_medications: [],
  updated_at: currentVersion,
}

describe('PIQ-2.5 Health Profile atomic version guard', () => {
  beforeEach(() => {
    fixture.getSql.mockReset().mockResolvedValue({ query: fixture.query })
    fixture.date.mockReset().mockResolvedValue('2026-10-15')
    fixture.query.mockReset().mockImplementation((sql: string) =>
      Promise.resolve(sql.trim().startsWith('SELECT') ? [savedRow] : [{ singleton_id: 1 }]))
  })

  it('requires expectedUpdatedAt even for partial edits before touching SQL', async () => {
    await expect(putHealthProfile({ persistentHealthContext: 'new' }))
      .rejects.toMatchObject({ statusCode: 428, code: 'PROFILE_VERSION_REQUIRED' })
    expect(fixture.getSql).not.toHaveBeenCalled()
  })

  it('rejects a malformed version before DB reads/writes', async () => {
    await expect(putHealthProfile({ expectedUpdatedAt: 'yesterday' }))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(putHealthProfile({ expectedUpdatedAt: 42 }))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(fixture.query).not.toHaveBeenCalled()
  })

  it('initializes the singleton without any overwriting upsert', async () => {
    await putHealthProfile({ expectedUpdatedAt: null, persistentHealthContext: 'My note' })
    const [sql, args] = fixture.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('ON CONFLICT (singleton_id) DO NOTHING')
    expect(sql).not.toContain('DO UPDATE')
    expect(sql).toContain('RETURNING singleton_id')
    expect(args[3]).toBe('My note')
    expect(fixture.query).toHaveBeenCalledTimes(2)
  })

  it('losing concurrent initialization receives 409 without a second query', async () => {
    fixture.query.mockResolvedValueOnce([])
    await expect(putHealthProfile({ expectedUpdatedAt: null, persistentHealthContext: 'Second writer' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'PROFILE_STALE_WRITE' })
    expect(fixture.query).toHaveBeenCalledTimes(1)
  })

  it('compares the exact observed millisecond and increases the next visible version', async () => {
    await putHealthProfile({ expectedUpdatedAt: currentVersion, persistentHealthContext: 'Corrected' })
    const [sql, args] = fixture.query.mock.calls[0] as [string, unknown[]]
    expect(sql.trim()).toMatch(/^UPDATE health_profile SET/)
    expect(sql).toContain("date_trunc('milliseconds', updated_at) = $11::timestamptz")
    expect(sql).toContain("date_trunc('milliseconds', updated_at) + interval '1 millisecond'")
    expect(sql).toContain('RETURNING singleton_id')
    expect(args[10]).toBe(currentVersion)
    expect(args[14]).toBe(true)
    expect(args[18]).toBe(false)
    expect(fixture.query).toHaveBeenCalledTimes(2)
  })

  it('rejects a stale tab atomically without preflighting a separate SELECT', async () => {
    fixture.query.mockResolvedValueOnce([])
    await expect(putHealthProfile({ expectedUpdatedAt: currentVersion, clinicalConditions: [] }))
      .rejects.toMatchObject({ statusCode: 409, code: 'PROFILE_STALE_WRITE' })
    const [sql, args] = fixture.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('WHERE singleton_id = 1')
    expect(args[18]).toBe(true)
    expect(fixture.query).toHaveBeenCalledTimes(1)
  })

  it('distinguishes omitted fields from deliberately cleared ones', async () => {
    await putHealthProfile({
      expectedUpdatedAt: currentVersion, sexForPhysiology: null,
      persistentHealthContext: null, clinicalConditions: [],
    })
    const [, args] = fixture.query.mock.calls[0] as [string, unknown[]]
    expect(args.slice(11)).toEqual([
      true, false, false, true, false, false, false, true, false, false,
    ])
    expect(args[0]).toBeNull()
    expect(args[3]).toBeNull()
    expect(args[7]).toBe('[]')
  })

  it('keeps future birth-date validation separate from concurrency conflicts', async () => {
    await expect(putHealthProfile({ expectedUpdatedAt: currentVersion, dateOfBirth: '2026-10-16' }))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(fixture.getSql).not.toHaveBeenCalled()
  })
})
