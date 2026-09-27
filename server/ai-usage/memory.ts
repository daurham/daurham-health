import { randomUUID } from 'node:crypto'
import { utcMonthWindow } from './config.js'
import type { AiUsageLedger, AiUsageReserveInput, AiUsageReserveResult } from './ledger.js'

type MemoryRow = {
  id: string
  status: 'reserved' | 'completed' | 'released' | 'uncertain'
  reserved: number
  actual: number | null
  createdAt: number
}

/** Test double. Production budget authority is createSqlAiUsageLedger. */
export function createMemoryAiUsageLedger(): AiUsageLedger & { rows: () => readonly MemoryRow[] } {
  const rows: MemoryRow[] = []
  let chain = Promise.resolve()

  function exclusive<T>(run: () => T): Promise<T> {
    const next = chain.then(run, run)
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  return {
    rows: () => rows,
    reserve(input) {
      return exclusive(() => reserveRow(rows, input))
    },
    complete(id, actualCostUsd) {
      return exclusive(() => {
        const row = reservedRow(rows, id)
        row.status = 'completed'
        row.actual = actualCostUsd == null ? row.reserved : Math.min(row.reserved, actualCostUsd)
      })
    },
    uncertain(id) {
      return exclusive(() => {
        reservedRow(rows, id).status = 'uncertain'
      })
    },
    release(id) {
      return exclusive(() => {
        const row = reservedRow(rows, id)
        row.status = 'released'
        row.actual = 0
      })
    },
    chargedUsd(now) {
      return exclusive(() => charged(rows, now))
    },
  }
}

function reserveRow(rows: MemoryRow[], input: AiUsageReserveInput): AiUsageReserveResult {
  const attempts = rows.filter(
    (row) =>
      (row.status === 'reserved' || row.status === 'completed' || row.status === 'uncertain') &&
      row.createdAt <= input.now &&
      input.now - row.createdAt < 60_000,
  )
  const last = attempts.reduce<number | null>((latest, row) => (latest == null || row.createdAt > latest ? row.createdAt : latest), null)
  if (attempts.length >= input.maxPerMinute || (input.minIntervalMs > 0 && last != null && input.now - last < input.minIntervalMs)) {
    return { ok: false, reason: 'rate' }
  }
  if (charged(rows, input.now) + input.reservedCostUsd > input.budgetUsd) {
    return { ok: false, reason: 'budget' }
  }
  const id = randomUUID()
  rows.push({ id, status: 'reserved', reserved: input.reservedCostUsd, actual: null, createdAt: input.now })
  return { ok: true, id }
}

function charged(rows: readonly MemoryRow[], now: number): number {
  const month = utcMonthWindow(now)
  const start = Date.parse(month.start)
  const end = Date.parse(month.end)
  return rows.reduce((sum, row) => {
    if (row.createdAt < start || row.createdAt >= end) {
      return sum
    }
    if (row.status === 'completed') {
      return sum + (row.actual ?? row.reserved)
    }
    if (row.status === 'reserved' || row.status === 'uncertain') {
      return sum + row.reserved
    }
    return sum
  }, 0)
}

function reservedRow(rows: MemoryRow[], id: string): MemoryRow {
  const row = rows.find((item) => item.id === id && item.status === 'reserved')
  if (!row) {
    throw new Error('AI usage reservation could not be finalized')
  }
  return row
}
