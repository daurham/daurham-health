import { useEffect, useMemo, useRef, useState } from 'react'
import type { NutritionEntry } from '@/domain/nutrition'
import { secondaryButtonClass } from '@/lib'
import { fetchNutritionDayCompleteness, saveNutritionDayCompleteness,
  type NutritionCompletenessReport, type NutritionCompletenessStatus } from './api'
import { NutritionSheet } from './Sheet'

export function dayCompletenessDisplay(day: NutritionCompletenessStatus) {
  const { assessment } = day
  if (assessment.confirmationStale) return {
    label: 'Needs re-confirmation', detail: 'Your food log changed since the last review.',
  }
  if (assessment.state === 'partial') return {
    label: 'Partially logged', detail: 'Some foods or drinks were not recorded.',
  }
  if (assessment.state === 'confirmed_complete') {
    if (assessment.currentDayProvisional) return {
      label: 'Confirmed for now', detail: 'Today remains provisional until tomorrow.',
    }
    if (assessment.isExplicitZeroIntakeFast) return {
      label: 'Fasting day confirmed', detail: 'This day is not used for calorie maintenance estimates.',
    }
    if (!assessment.eligibleForMaintenance) return {
      label: 'Complete, not calibration-eligible',
      detail: 'Source quality or analysis exclusions prevent using this log for maintenance estimates.',
    }
    return { label: 'Day confirmed',
      detail: 'You reported recording all intake; this does not independently verify nutrients.' }
  }
  return { label: 'Not reviewed', detail: 'Logged calories do not prove every meal was recorded.' }
}

function localEntriesKey(entries: readonly NutritionEntry[]): string {
  return entries.map((entry) => [
    entry.id, entry.updatedAt, entry.logDate, entry.servingQuantity,
    entry.calories, entry.evidenceQuality,
  ].join(':')).sort().join('|')
}

export function DayCompletenessCard({ date, today, entries }: {
  date: string
  today: string
  entries: NutritionEntry[]
}) {
  const entriesKey = useMemo(() => localEntriesKey(entries), [entries])
  const [status, setStatus] = useState<NutritionCompletenessStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [choice, setChoice] = useState<NutritionCompletenessReport['ownerReport']>('complete')
  const [fast, setFast] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const requestVersion = useRef(0)

  useEffect(() => {
    const request = ++requestVersion.current
    const abort = new AbortController()
    setStatus(null)
    setLoading(true)
    setUnavailable(false)
    setReviewOpen(false)
    void fetchNutritionDayCompleteness(date, abort.signal)
      .then((next) => {
        if (requestVersion.current === request) setStatus(next)
      })
      .catch(() => {
        if (requestVersion.current === request && !abort.signal.aborted) setUnavailable(true)
      })
      .finally(() => {
        if (requestVersion.current === request) setLoading(false)
      })
    return () => { abort.abort(); requestVersion.current += 1 }
  }, [date, entriesKey, reload])

  async function submit() {
    if (!status || saving) return
    const request = requestVersion.current
    setSaving(true)
    try {
      const next = await saveNutritionDayCompleteness({
        date, ownerReport: choice,
        zeroIntakeFast: choice === 'complete' && entries.length === 0 && fast,
        expectedRevision: status.entryRevision, expectedVersion: status.version,
      })
      if (requestVersion.current !== request) return
      setStatus(next)
      setReviewOpen(false)
      setNotice(null)
    } catch {
      if (requestVersion.current !== request) return
      setReviewOpen(false)
      setNotice('Food or review data changed. Check the latest log before saving again.')
      setReload((value) => value + 1)
    } finally {
      if (requestVersion.current === request) setSaving(false)
    }
  }

  const display = status ? dayCompletenessDisplay(status) : null
  return (
    <>
      <section className="rounded-xl border border-zinc-200 bg-white p-3" aria-label="Day log completeness">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Day log completeness</h2>
          {status && !loading && date <= today ? (
            <button type="button" className={secondaryButtonClass} onClick={() => {
              setChoice(status.ownerReport ?? 'complete')
              setFast(status.assessment.isExplicitZeroIntakeFast)
              setNotice(null)
              setReviewOpen(true)
            }}>{status.ownerReport ? 'Review' : 'Mark day'}</button>
          ) : null}
        </div>
        {loading ? <p className="mt-2 text-xs text-zinc-500">Checking day review…</p> : null}
        {!loading && unavailable ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-600">Day review unavailable. Food logging still works.</p>
            <button type="button" className="min-h-10 text-xs font-medium underline"
              onClick={() => setReload((value) => value + 1)}>Retry</button>
          </div>
        ) : null}
        {display ? (
          <div className="mt-2 space-y-1">
            <p className="text-sm font-medium text-zinc-800">{display.label}</p>
            <p className="text-xs leading-5 text-zinc-600">{display.detail}</p>
          </div>
        ) : null}
        {notice ? <p role="status" className="mt-2 text-xs text-amber-800">{notice}</p> : null}
      </section>
      {reviewOpen && status ? (
        <NutritionSheet title="Review the entire day"
          onClose={() => { if (!saving) setReviewOpen(false) }}
          footer={<button type="button" disabled={saving || (choice === 'complete' && entries.length === 0 && !fast)}
            className="min-h-11 w-full rounded-lg bg-zinc-900 px-4 font-medium text-white disabled:opacity-50"
            onClick={() => void submit()}>{saving ? 'Saving…' : 'Save day review'}</button>}>
          <p className="text-sm leading-6 text-zinc-600">
            Did you log everything you consumed this day? This is separate from food quality and nutrient accuracy.
          </p>
          <fieldset className="mt-4 space-y-2">
            <legend className="mb-2 text-sm font-semibold">Logging completeness</legend>
            {([
              ['complete', 'Everything was logged'],
              ['partial', 'Some foods or drinks are missing'],
              ['unknown', 'I am not sure'],
            ] as const).map(([value, label]) => (
              <label key={value} className="flex min-h-12 items-center gap-3 rounded-lg border border-zinc-200 px-3 text-sm">
                <input type="radio" name="day-completeness" value={value} checked={choice === value}
                  onChange={() => { setChoice(value); if (value !== 'complete') setFast(false) }} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          {entries.length === 0 && choice === 'complete' ? (
            <label className="mt-4 flex items-start gap-3 rounded-lg bg-zinc-50 p-3 text-sm">
              <input type="checkbox" checked={fast} onChange={(event) => setFast(event.target.checked)} className="mt-1" />
              <span>I intentionally fasted for the whole day and logged no food.</span>
            </label>
          ) : null}
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            You can change this later. Editing foods requires another confirmation.
            {date === today ? ' Today remains provisional until tomorrow.' : ''}
          </p>
        </NutritionSheet>
      ) : null}
    </>
  )
}
