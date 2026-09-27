import { getSql } from '../db.js'
import { usdText, utcMonthWindow } from './config.js'

export type AiUsageSession = {
  transaction(queries: readonly { text: string; params: readonly unknown[] }[]): Promise<readonly (readonly Record<string, unknown>[])[]>
}

export type AiUsageReserveInput = {
  requestType: string
  provider: string
  model: string
  requestHash: string | null
  reservedCostUsd: number
  now: number
  budgetUsd: number
  minIntervalMs: number
  maxPerMinute: number
}

export type AiUsageReserveResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'budget' | 'rate' }

export type AiUsageLedger = {
  reserve(input: AiUsageReserveInput): Promise<AiUsageReserveResult>
  complete(id: string, actualCostUsd: number | null, inputTokens: number | null, outputTokens: number | null, now: number): Promise<void>
  uncertain(id: string, now: number): Promise<void>
  release(id: string, now: number): Promise<void>
  chargedUsd(now: number): Promise<number>
}

const LOCK_SQL = `
SELECT pg_advisory_xact_lock(hashtext('ai_usage')::bigint) AS global_lock,
       pg_advisory_xact_lock(hashtext('ai_usage:' || $1)::bigint) AS month_lock
`

const RESERVE_SQL = `
WITH attempts AS (
  SELECT created_at
  FROM ai_usage
  WHERE status IN ('reserved', 'completed', 'uncertain')
    AND created_at > $1::timestamptz - interval '60 seconds'
    AND created_at <= $1::timestamptz
),
rate AS (
  SELECT COUNT(*)::int AS calls, MAX(created_at) AS last_at
  FROM attempts
),
charged AS (
  SELECT COALESCE(SUM(
    CASE
      WHEN status = 'completed' THEN actual_cost_usd
      WHEN status IN ('reserved', 'uncertain') THEN reserved_cost_usd
      ELSE 0
    END
  ), 0)::numeric AS amount
  FROM ai_usage
  WHERE created_at >= $2::timestamptz
    AND created_at < $3::timestamptz
),
decision AS (
  SELECT
    CASE
      WHEN rate.calls >= $4::int THEN 'rate'
      WHEN $5::int > 0
        AND rate.last_at IS NOT NULL
        AND rate.last_at > $1::timestamptz - ($5::int * interval '1 millisecond')
        THEN 'rate'
      WHEN charged.amount + $6::numeric > $7::numeric THEN 'budget'
      ELSE 'reserve'
    END AS outcome
  FROM rate
  CROSS JOIN charged
),
inserted AS (
  INSERT INTO ai_usage (
    request_type,
    provider,
    model,
    request_hash,
    status,
    reserved_cost_usd,
    created_at
  )
  SELECT $8, $9, $10, $11, 'reserved', $6::numeric, $1::timestamptz
  FROM decision
  WHERE decision.outcome = 'reserve'
  RETURNING id
)
SELECT decision.outcome::text AS outcome, inserted.id::text AS id
FROM decision
LEFT JOIN inserted ON true
`

export function createSqlAiUsageLedger(session: AiUsageSession): AiUsageLedger {
  return {
    async reserve(input) {
      const month = utcMonthWindow(input.now)
      const [, rows] = await session.transaction([
        { text: LOCK_SQL, params: [month.key] },
        {
          text: RESERVE_SQL,
          params: [
            new Date(input.now).toISOString(),
            month.start,
            month.end,
            input.maxPerMinute,
            input.minIntervalMs,
            usdText(input.reservedCostUsd),
            usdText(input.budgetUsd),
            input.requestType,
            input.provider,
            input.model,
            input.requestHash,
          ],
        },
      ])
      const row = rows?.[0]
      const outcome = text(row?.outcome)
      if (outcome === 'reserve') {
        const id = text(row?.id)
        if (!id) {
          throw new Error('AI usage reservation did not return an id')
        }
        return { ok: true, id }
      }
      if (outcome === 'budget' || outcome === 'rate') {
        return { ok: false, reason: outcome }
      }
      throw new Error('AI usage reservation failed')
    },
    async complete(id, actualCostUsd, inputTokens, outputTokens, now) {
      const [rows] = await session.transaction([
        {
          text: `UPDATE ai_usage
                 SET status = 'completed',
                     actual_cost_usd = CASE
                       WHEN $2::numeric IS NULL THEN reserved_cost_usd
                       ELSE LEAST($2::numeric, reserved_cost_usd)
                     END,
                     input_tokens = $3::integer,
                     output_tokens = $4::integer,
                     finalized_at = $5::timestamptz
                 WHERE id = $1::uuid AND status = 'reserved'
                 RETURNING id::text AS id`,
          params: [id, actualCostUsd == null ? null : usdText(actualCostUsd), inputTokens, outputTokens, new Date(now).toISOString()],
        },
      ])
      if (!rows?.[0]) {
        throw new Error('AI usage reservation could not be completed')
      }
    },
    async uncertain(id, now) {
      await transition(session, id, 'uncertain', null, now)
    },
    async release(id, now) {
      await transition(session, id, 'released', 0, now)
    },
    async chargedUsd(now) {
      const month = utcMonthWindow(now)
      const [rows] = await session.transaction([
        {
          text: `SELECT COALESCE(SUM(
                   CASE
                     WHEN status = 'completed' THEN actual_cost_usd
                     WHEN status IN ('reserved', 'uncertain') THEN reserved_cost_usd
                     ELSE 0
                   END
                 ), 0)::text AS charged
                 FROM ai_usage
                 WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
          params: [month.start, month.end],
        },
      ])
      return Number(text(rows?.[0]?.charged) || 0)
    },
  }
}

export function neonAiUsageSession(): AiUsageSession {
  return {
    async transaction(queries) {
      const sql = await getSql()
      const results = await sql.transaction(queries.map((query) => sql.query(query.text, [...query.params])))
      return results
    },
  }
}

async function transition(
  session: AiUsageSession,
  id: string,
  status: 'uncertain' | 'released',
  actual: number | null,
  now: number,
): Promise<void> {
  const [rows] = await session.transaction([
    {
      text: `UPDATE ai_usage
             SET status = $2,
                 actual_cost_usd = $3::numeric,
                 finalized_at = $4::timestamptz
             WHERE id = $1::uuid AND status = 'reserved'
             RETURNING id::text AS id`,
      params: [id, status, actual == null ? null : usdText(actual), new Date(now).toISOString()],
    },
  ])
  if (!rows?.[0]) {
    throw new Error('AI usage reservation could not be finalized')
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}
