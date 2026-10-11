import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  buildTodaySupplementSection,
  formatPlannedDose,
  type AdherenceAction,
  type SupplementRecord,
  type TodaySupplementItem,
} from '@/domain/supplements'
import { fetchSupplements, recordSupplementAdherence } from '@/features/supplements/api'
import { useAppPathPrefix, useDemoReadOnly, prefixedPath } from '@/lib/app-prefix'
import { quietButtonClass } from '@/lib'

/**
 * Adherence for exactly one selected Health day, including historical dates.
 * Supplement definitions still live on /supplements, not inside Daily Log.
 */
export function DailySupplementsSection({ date }: { date: string }) {
  const [records, setRecords] = useState<SupplementRecord[] | null>(null)
  const requestGeneration = useRef(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const prefix = useAppPathPrefix()
  const readOnly = useDemoReadOnly()

  useEffect(() => {
    let cancelled = false
    requestGeneration.current += 1
    setBusyId(null)
    setRecords(null)
    setError(null)
    fetchSupplements()
      .then((result) => { if (!cancelled) setRecords(result.supplements) })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load supplements.')
      })
    return () => { cancelled = true }
  }, [date])

  async function record(item: TodaySupplementItem, action: AdherenceAction) {
    if (readOnly || busyId) return
    const itemKey = item.scheduleId
    const generation = ++requestGeneration.current
    setBusyId(itemKey)
    setError(null)
    try {
      await recordSupplementAdherence({
        supplementId: item.supplementId,
        scheduleId: item.scheduleId,
        scheduledDate: date,
        action,
      })
      // Refresh only this supplement section; preserve the surrounding
      // hydration, bowel, wellness, context and selected-date UI.
      const refreshed = await fetchSupplements()
      if (requestGeneration.current === generation) setRecords(refreshed.supplements)
    } catch (cause) {
      if (requestGeneration.current === generation) {
        setError(cause instanceof Error ? cause.message : 'Could not record supplement dose.')
      }
    } finally {
      if (requestGeneration.current === generation) setBusyId(null)
    }
  }

  const section = records == null ? null : buildTodaySupplementSection(date, records.map((record) => ({
    id: record.id,
    name: record.name,
    sortOrder: record.sortOrder,
    schedules: record.schedules,
    events: record.statusEvents,
    adherence: record.adherence,
  })))
  const scheduled = section?.scheduledCount ?? 0
  const recorded = (section?.takenCount ?? 0) + (section?.skippedCount ?? 0)

  return (
    <section className="overflow-hidden rounded-xl border border-accent-secondary/25 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-zinc-900">Supplements</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {records == null ? 'Loading scheduled doses…' : scheduled
              ? `${recorded} of ${scheduled} doses recorded`
              : 'No supplements scheduled for this date.'}
          </p>
        </div>
        <Link to={prefixedPath(prefix, '/supplements')} className={quietButtonClass}>Manage</Link>
      </div>
      {error ? <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {section?.items.length ? (
        <ul className="mt-3 space-y-2">
          {section.items.map((item) => {
            const busy = busyId === item.scheduleId
            return (
              <li key={item.scheduleId} className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900">{item.name}</p>
                    <p className="text-xs text-zinc-600">
                      {formatPlannedDose(item.plannedDoseAmount, item.plannedDoseUnit)}
                      {item.slotLabel ? ` · ${item.slotLabel}` : ''}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                    item.state === 'taken' ? 'bg-success/10 text-success' :
                      item.state === 'skipped' ? 'bg-warning/10 text-warning' :
                        'bg-zinc-100 text-zinc-600'
                  }`}>{item.state === 'unknown' ? 'Not recorded' : item.state === 'taken' ? 'Taken' : 'Skipped'}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={readOnly || busyId != null || item.state === 'taken'}
                    className={`min-h-10 rounded-lg border border-success/30 px-3 text-sm font-medium text-success ${
                      item.state === 'taken' ? 'bg-success/10' : 'hover:bg-success/10'
                    }`}
                    onClick={() => void record(item, 'taken')}
                  >Taken</button>
                  <button
                    type="button"
                    disabled={readOnly || busyId != null || item.state === 'skipped'}
                    className="min-h-10 rounded-lg border border-warning/30 px-3 text-sm font-medium text-warning hover:bg-warning/10"
                    onClick={() => void record(item, 'skipped')}
                  >Skipped</button>
                  {item.state !== 'unknown' ? (
                    <button
                      type="button"
                      disabled={readOnly || busyId != null}
                      className="min-h-10 rounded-lg px-3 text-sm text-zinc-600 hover:bg-zinc-100"
                      onClick={() => void record(item, 'clear')}
                    >Clear</button>
                  ) : null}
                  {busy ? <span className="text-xs text-zinc-500">Saving…</span> : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-zinc-500">
        Unrecorded doses stay unknown, not skipped. Past dates are editable without changing when you actually logged the dose.
      </p>
    </section>
  )
}
