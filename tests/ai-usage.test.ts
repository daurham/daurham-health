import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NutritionInterpretError } from '../src/domain/nutrition/interpret.ts'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.ts'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.ts'
import { boundedProviderCostUsd } from '../server/ai-usage/cost.ts'
import { createSqlAiUsageLedger, type AiUsageLedger, type AiUsageSession } from '../server/ai-usage/ledger.ts'
import { buildBackupArchive, restoreStatements, verifyBackupArchive } from '../server/backup/format.ts'
import { LATEST_SCHEMA_MIGRATION, tablesForProfile } from '../server/backup/inventory.ts'
import { createAskHealthGate } from '../server/ask-health/gate.ts'
import { explainAskHealth } from '../server/ask-health/service.ts'

const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55432
const NOW = Date.parse('2026-09-15T19:00:00.000Z')

let dir = ''
const clients: Client[] = []

function sessionFor(client: Client): AiUsageSession {
  return {
    async transaction(queries) {
      await client.query('BEGIN')
      try {
        const results = []
        for (const query of queries) {
          const result = await client.query(query.text, [...query.params])
          results.push(result.rows)
        }
        await client.query('COMMIT')
        return results
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    },
  }
}

async function connect(): Promise<Client> {
  const client = new Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'ai_usage' })
  await client.connect()
  clients.push(client)
  return client
}

function reserveInput(overrides: Record<string, unknown> = {}) {
  return {
    requestType: 'ask_health',
    provider: 'gemini',
    model: 'gemini-test',
    requestHash: 'a'.repeat(64),
    reservedCostUsd: 0.02,
    now: NOW,
    budgetUsd: 0.02,
    minIntervalMs: 0,
    maxPerMinute: 8,
    ...overrides,
  }
}

function packet(question = 'QUESTION_SENTINEL_do_not_store') {
  const input: AskHealthPacketInput = {
    lens: 'general',
    range: '30d',
    asOf: '2026-09-15',
    period: { start: '2026-08-17', end: '2026-09-15' },
    generatedAt: '2026-09-15T12:00:00.000Z',
    question,
    overview: null,
    activity: null,
    sleep: null,
    goals: [
      {
        id: 'goal-1',
        kind: 'body_metric',
        lifecycle: 'active',
        label: 'Weight',
        targetText: '175 lb',
        targetState: 'below_target',
        deadlineState: 'none',
        projectionState: 'insufficient_data',
        projectionReason: null,
      },
    ],
    experiments: [],
    benchmarks: [],
    supplements: [],
    context: null,
    patterns: [],
  }
  return buildAskHealthEvidencePacket(input)
}

describe('durable ai usage', () => {
  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'ai-usage-'))
    execFileSync(`${BIN}/initdb`, ['-D', dir, '--username=postgres', '--auth=trust', '--no-sync'], { stdio: 'pipe' })
    execFileSync(
      `${BIN}/pg_ctl`,
      ['-D', dir, '-w', 'start', '-o', `-p ${PORT} -k ${dir} -c listen_addresses=127.0.0.1`, '-l', path.join(dir, 'server.log')],
      { stdio: 'pipe' },
    )
    execFileSync(`${BIN}/createdb`, ['-h', '127.0.0.1', '-p', String(PORT), '-U', 'postgres', 'ai_usage'], { stdio: 'pipe' })
    execFileSync(
      `${BIN}/psql`,
      ['-h', '127.0.0.1', '-p', String(PORT), '-U', 'postgres', '-d', 'ai_usage', '-v', 'ON_ERROR_STOP=1', '-f', 'migrations/0030_ai_usage.sql'],
      { stdio: 'pipe' },
    )
  }, 60_000)

  afterAll(async () => {
    await Promise.all(clients.splice(0).map((client) => client.end()))
    if (dir) {
      execFileSync(`${BIN}/pg_ctl`, ['-D', dir, '-w', 'stop', '-m', 'immediate'], { stdio: 'pipe' })
      rmSync(dir, { recursive: true, force: true })
    }
  })

  beforeEach(async () => {
    const client = await connect()
    await client.query('DELETE FROM ai_usage')
    await client.end()
    clients.pop()
  })

  it('shares one ledger across cold gate instances and concurrent reservations', async () => {
    const first = await connect()
    const second = await connect()
    const ledgerA = createSqlAiUsageLedger(sessionFor(first))
    const ledgerB = createSqlAiUsageLedger(sessionFor(second))
    const reserved = await ledgerA.reserve(reserveInput())
    expect(reserved.ok).toBe(true)
    expect(await ledgerB.chargedUsd(NOW)).toBeCloseTo(0.02, 6)
    await expect(ledgerB.reserve(reserveInput({ requestHash: 'b'.repeat(64), now: NOW + 5_000 }))).resolves.toEqual({
      ok: false,
      reason: 'budget',
    })
    const [left, right] = await Promise.all([
      ledgerA.reserve(reserveInput({ requestHash: 'c'.repeat(64), now: NOW + 20_000, budgetUsd: 0.04 })),
      ledgerB.reserve(reserveInput({ requestHash: 'd'.repeat(64), now: NOW + 20_000, budgetUsd: 0.04 })),
    ])
    expect([left.ok, right.ok].filter(Boolean)).toHaveLength(1)
    expect([left, right].find((item) => !item.ok)).toEqual({ ok: false, reason: 'budget' })
  })

  it('charges the actual cost, keeps crash and uncertain reservations, and releases a pre-call failure', async () => {
    const client = await connect()
    const ledger = createSqlAiUsageLedger(sessionFor(client))
    const fresh = createSqlAiUsageLedger(sessionFor(await connect()))
    const open = await ledger.reserve(reserveInput())
    expect(open.ok).toBe(true)
    if (!open.ok) {
      return
    }
    expect(await fresh.chargedUsd(NOW)).toBeCloseTo(0.02, 6)
    await ledger.complete(open.id, 0.004, 0, null, NOW + 1)
    expect(await fresh.chargedUsd(NOW)).toBeCloseTo(0.004, 6)

    const hung = await ledger.reserve(reserveInput({ requestHash: 'e'.repeat(64), now: NOW + 2_000, budgetUsd: 3 }))
    expect(hung.ok).toBe(true)
    if (!hung.ok) {
      return
    }
    await ledger.uncertain(hung.id, NOW + 3)
    expect(await fresh.chargedUsd(NOW)).toBeCloseTo(0.024, 6)

    const local = await ledger.reserve(reserveInput({ requestHash: 'f'.repeat(64), now: NOW + 4_000, budgetUsd: 3 }))
    expect(local.ok).toBe(true)
    if (!local.ok) {
      return
    }
    await ledger.release(local.id, NOW + 5)
    expect(await fresh.chargedUsd(NOW)).toBeCloseTo(0.024, 6)

    const blocked = await ledger.reserve(reserveInput({ budgetUsd: 0, reservedCostUsd: 0.05, now: NOW + 6_000 }))
    expect(blocked).toEqual({ ok: false, reason: 'budget' })
    const count = await client.query('SELECT count(*)::int AS count FROM ai_usage')
    expect(count.rows[0]?.count).toBe(3)
  })

  it('keeps provider cost when the answer is rejected and shares the rate limit', async () => {
    const client = await connect()
    const ledger = createSqlAiUsageLedger(sessionFor(client))
    const gate = createAskHealthGate({
      ledger,
      budgetUsd: 1,
      maxRequestCostUsd: 0.05,
      minIntervalMs: 1_500,
      maxPerMinute: 8,
    })
    const called = provider('{"blocks":[{"text":"SECRET PROSE","evidence_refs":["made.up.ref"]}]}', 0, 10_000)
    await expect(
      explainAskHealth({
        packet: packet(),
        question: 'QUESTION_SENTINEL_do_not_store',
        conversation: [],
        provider: called,
        gate,
        model: 'gemini-test',
        now: NOW,
      }),
    ).rejects.toThrow("couldn't generate an explanation")
    const stored = await client.query('SELECT status, actual_cost_usd::text AS actual, request_hash, request_type FROM ai_usage')
    expect(stored.rows).toHaveLength(1)
    expect(stored.rows[0]?.status).toBe('completed')
    expect(Number(stored.rows[0]?.actual)).toBeCloseTo(boundedProviderCostUsd(0, 10_000, 0.05), 6)
    expect(JSON.stringify(stored.rows)).not.toContain('QUESTION_SENTINEL_do_not_store')
    expect(JSON.stringify(stored.rows)).not.toContain('SECRET PROSE')
    expect(stored.rows[0]?.request_hash).toMatch(/^[0-9a-f]{64}$/)

    const other = createAskHealthGate({
      ledger: createSqlAiUsageLedger(sessionFor(await connect())),
      budgetUsd: 1,
      maxRequestCostUsd: 0.05,
      minIntervalMs: 10_000,
      maxPerMinute: 8,
    })
    const again = provider('{"blocks":[{"text":"Goal.","evidence_refs":["goals.goal-1"]}]}')
    await expect(
      explainAskHealth({
        packet: packet('Another question'),
        question: 'Another question',
        conversation: [],
        provider: again,
        gate: other,
        model: 'gemini-test',
        now: NOW + 1_000,
      }),
    ).rejects.toThrow('too quickly')
    expect(again).not.toHaveBeenCalled()
  })

  it('does not let a restarted cache erase spent budget', async () => {
    const ledger = createSqlAiUsageLedger(sessionFor(await connect()))
    const gate = createAskHealthGate({ ledger, budgetUsd: 0.02, maxRequestCostUsd: 0.02, minIntervalMs: 0, maxPerMinute: 8 })
    const called = provider('{"blocks":[{"text":"The goal is below target.","evidence_refs":["goals.goal-1"]}]}', null, null)
    const first = await explainAskHealth({
      packet: packet('How is the goal?'),
      question: 'How is the goal?',
      conversation: [],
      provider: called,
      gate,
      model: 'gemini-test',
      now: NOW,
    })
    const second = await explainAskHealth({
      packet: packet('How is the goal?'),
      question: 'How is the goal?',
      conversation: [],
      provider: called,
      gate,
      model: 'gemini-test',
      now: NOW + 2_000,
    })
    expect(first.meta.cached).toBe(false)
    expect(second.meta.cached).toBe(true)
    expect(called).toHaveBeenCalledTimes(1)
    const restarted = createAskHealthGate({
      ledger: createSqlAiUsageLedger(sessionFor(await connect())),
      budgetUsd: 0.02,
      maxRequestCostUsd: 0.02,
      minIntervalMs: 0,
      maxPerMinute: 8,
    })
    const missed = provider('{"blocks":[{"text":"The goal is below target.","evidence_refs":["goals.goal-1"]}]}')
    await expect(
      explainAskHealth({
        packet: packet('How is the goal?'),
        question: 'How is the goal?',
        conversation: [],
        provider: missed,
        gate: restarted,
        model: 'gemini-test',
        now: NOW + 4_000,
      }),
    ).rejects.toThrow('AI monthly budget reached')
    expect(missed).not.toHaveBeenCalled()
    expect(await ledger.chargedUsd(NOW)).toBeCloseTo(0.02, 6)
  })

  it('releases a provider that never sent a request and keeps an uncertain timeout', async () => {
    const client = await connect()
    const ledger = createSqlAiUsageLedger(sessionFor(client))
    const gate = createAskHealthGate({ ledger, budgetUsd: 1, maxRequestCostUsd: 0.02, minIntervalMs: 0, maxPerMinute: 8 })
    await expect(
      explainAskHealth({
        packet: packet('Configured?'),
        question: 'Configured?',
        conversation: [],
        provider: async () => {
          throw new NutritionInterpretError('GEMINI_NOT_CONFIGURED', 'Meal analysis is temporarily unavailable.')
        },
        gate,
        model: 'gemini-test',
        now: NOW,
      }),
    ).rejects.toThrow("couldn't generate an explanation")
    expect(await ledger.chargedUsd(NOW)).toBe(0)
    await expect(
      explainAskHealth({
        packet: packet('Timeout?'),
        question: 'Timeout?',
        conversation: [],
        provider: async () => {
          throw new Error('timeout')
        },
        gate,
        model: 'gemini-test',
        now: NOW + 2_000,
      }),
    ).rejects.toThrow("couldn't generate an explanation")
    const rows = await client.query('SELECT status FROM ai_usage ORDER BY created_at')
    expect(rows.rows.map((row) => row.status)).toEqual(['released', 'uncertain'])
    expect(await ledger.chargedUsd(NOW)).toBeCloseTo(0.02, 6)
  })

  it('backs up the ledger, restores the ceiling, and leaves portable export alone', async () => {
    const client = await connect()
    const ledger: AiUsageLedger = createSqlAiUsageLedger(sessionFor(client))
    const reserved = await ledger.reserve(reserveInput({ budgetUsd: 1, reservedCostUsd: 0.02 }))
    expect(reserved.ok).toBe(true)
    if (!reserved.ok) {
      return
    }
    await ledger.complete(reserved.id, 0.02, null, null, NOW)
    const raw = await client.query(
      `SELECT id::text, request_type, provider, model, request_hash, status,
              reserved_cost_usd::text, actual_cost_usd::text, input_tokens, output_tokens,
              created_at, finalized_at
       FROM ai_usage`,
    )
    const row = Object.fromEntries(
      Object.entries(raw.rows[0] as Record<string, unknown>).map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value == null ? null : String(value),
      ]),
    )
    const full = buildBackupArchive({
      profile: 'full',
      createdAt: '2026-09-27T20:00:00.000Z',
      schemaMigration: LATEST_SCHEMA_MIGRATION,
      appVersionOrCommit: '1.0.0',
      rowsByTable: { ai_usage: [row] },
    })
    const verified = verifyBackupArchive(full)
    expect(verified.errors).toEqual([])
    expect(verified.tables.ai_usage).toHaveLength(1)
    const portable = unzipSync(
      buildBackupArchive({
        profile: 'portable',
        createdAt: '2026-09-27T20:00:00.000Z',
        schemaMigration: LATEST_SCHEMA_MIGRATION,
        appVersionOrCommit: '1.0.0',
        rowsByTable: { ai_usage: [row] },
      }),
    )
    expect(Object.keys(portable).join('\n')).not.toContain('ai_usage')
    expect(tablesForProfile('portable').map((table) => table.name)).not.toContain('ai_usage')
    await client.query('DELETE FROM ai_usage')
    const insert = restoreStatements(verified.tables).find((statement) => statement.text.startsWith('INSERT INTO ai_usage'))
    expect(insert).toBeTruthy()
    await client.query(insert!.text, insert!.params)
    const restored = createSqlAiUsageLedger(sessionFor(await connect()))
    await expect(restored.reserve(reserveInput())).resolves.toEqual({ ok: false, reason: 'budget' })
    expect(readFileSync('migrations/0030_ai_usage.sql', 'utf8')).not.toMatch(/^\s*user_id\b/m)
    expect(readFileSync('server/integrations/gemini/client.ts', 'utf8')).not.toContain('ai_usage')
    expect(readFileSync('src/features/demo/ask-health-demo.ts', 'utf8')).not.toContain('ai_usage')
  })
})

function provider(text: string, inputTokens: number | null = 1, outputTokens: number | null = 1) {
  return vi.fn(async () => ({ text, model: 'gemini-test', inputTokens, outputTokens }))
}
