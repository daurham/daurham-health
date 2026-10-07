import { useEffect, useState } from 'react'
import type { ChangeLedgerEntry, ChangeLedgerResponse } from '@/domain/change-ledger'
import { healthFetch, quietButtonClass, readApiError, secondaryButtonClass } from '@/lib'
import { formatCalendarDate } from './format'

async function fetchLedger(): Promise<ChangeLedgerResponse> {
  const response = await healthFetch('/api/intelligence/changes')
  if (!response.ok) throw new Error(await readApiError(response))
  const body = await response.json() as { ledger: ChangeLedgerResponse }
  return body.ledger
}

async function decideCandidate(id: string, status: 'confirmed' | 'dismissed'): Promise<ChangeLedgerResponse> {
  const response = await healthFetch('/api/intelligence/changes/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!response.ok) throw new Error(await readApiError(response))
  const body = await response.json() as { ledger: ChangeLedgerResponse }
  return body.ledger
}

function row(entry: ChangeLedgerEntry) {
  return (
    <li key={entry.id} className="rounded-md border border-zinc-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900">{entry.title}</p>
        <p className="text-xs text-zinc-500">{formatCalendarDate(entry.date)}</p>
      </div>
      {entry.detail ? <p className="mt-1 text-sm text-zinc-600">{entry.detail}</p> : null}
    </li>
  )
}

export function ChangeLedgerPanel() {
  const [ledger, setLedger] = useState<ChangeLedgerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchLedger()
      .then((next) => {
        if (!cancelled) setLedger(next)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load changes')
      })
    return () => { cancelled = true }
  }, [])

  async function decide(entry: ChangeLedgerEntry, status: 'confirmed' | 'dismissed') {
    if (!entry.sourceId) return
    setBusy(entry.sourceId)
    setError(null)
    try {
      setLedger(await decideCandidate(entry.sourceId, status))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the decision')
    } finally {
      setBusy(null)
    }
  }

  if (!ledger && !error) {
    return <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">Loading changes & interventions…</div>
  }

  const entries = ledger?.entries ?? []
  const visible = expanded ? entries : entries.slice(0, 5)
  const candidates = ledger?.openCandidates ?? []

  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:p-4" aria-labelledby="change-ledger-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="change-ledger-heading" className="font-semibold tracking-tight">Changes & interventions</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Derived from target, plan, goal, supplement, experiment, and context history. Detected behavior shifts require your confirmation.
          </p>
        </div>
        {entries.length > 5 ? (
          <button type="button" className={quietButtonClass} onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Show less' : 'Show all'}
          </button>
        ) : null}
      </div>

      {candidates.length > 0 ? (
        <div className="space-y-2">
          {candidates.slice(0, 3).map((entry) => (
            <div key={entry.id} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-amber-950">{entry.title}</p>
                <p className="text-xs text-amber-800">{formatCalendarDate(entry.date)}</p>
              </div>
              {entry.detail ? <p className="mt-1 text-sm text-amber-900">{entry.detail}</p> : null}
              <p className="mt-1 text-xs text-amber-800">Possible pattern only. Confirming records the change; it does not rewrite the source data.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className={secondaryButtonClass} disabled={busy === entry.sourceId} onClick={() => void decide(entry, 'confirmed')}>
                  Confirm shift
                </button>
                <button type="button" className={quietButtonClass} disabled={busy === entry.sourceId} onClick={() => void decide(entry, 'dismissed')}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {visible.length > 0 ? <ul className="space-y-2">{visible.map(row)}</ul> : (
        <p className="text-sm text-zinc-500">No change events are recorded yet.</p>
      )}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </section>
  )
}
