import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { dailySignalDateError, type DailySignalsDay } from '@/domain/daily-signals'
import { formatWeekdayCalendarDate } from '@/domain/calendar-format'
import { DAILY_PARTICIPATION_XP, participationDateEligible } from '@/domain/rewards'
import { BristolReferenceChart } from './BristolReferenceChart'
import { primaryButtonClass, quietButtonClass, useHealthCalendarDate } from '@/lib'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'
import {
  addBowelEvent,
  addHydrationEvent,
  clearNoBowelMovement,
  clearDailyWellness,
  deleteBowelEvent,
  deleteHydrationEvent,
  fetchDailySignalsDay,
  saveDailyWellness,
  setNoBowelMovement,
} from './api'

const WATER_AMOUNTS = [8, 12, 16, 24] as const
const RATINGS = [1, 2, 3, 4, 5] as const
const BRISTOL_TYPES = [1, 2, 3, 4, 5, 6, 7] as const

type WellnessDraft = {
  energy: number | null
  hunger: number | null
  soreness: number | null
  stress: number | null
}

const EMPTY_WELLNESS: WellnessDraft = { energy: null, hunger: null, soreness: null, stress: null }

export function DailyCheckInPage() {
  const [search, setSearch] = useSearchParams()
  const today = useHealthCalendarDate()
  const requested = search.get('date')?.trim() ?? ''
  const date = requested || today
  const dateError = dailySignalDateError(date, today)
  const prefix = useAppPathPrefix()
  const [day, setDay] = useState<DailySignalsDay | null>(null)
  const [wellness, setWellness] = useState<WellnessDraft>(EMPTY_WELLNESS)
  const [customWater, setCustomWater] = useState('')
  const [loading, setLoading] = useState(dateError == null)
  const [busy, setBusy] = useState(false)
  const [showBristol, setShowBristol] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(signal?: AbortSignal) {
    if (dateError) return
    setLoading(true)
    setError(null)
    try {
      const next = await fetchDailySignalsDay(date, signal)
      if (signal?.aborted) return
      setDay(next)
      setWellness({
        energy: next.wellness?.energy ?? null,
        hunger: next.wellness?.hunger ?? null,
        soreness: next.wellness?.soreness ?? null,
        stress: next.wellness?.stress ?? null,
      })
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Could not load daily check-in.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    if (dateError) return
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, dateError])

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save daily check-in.')
    } finally {
      setBusy(false)
    }
  }

  const xpEligible = participationDateEligible(date, today)
  const totalWater = day?.hydrationEvents.reduce((sum, event) => sum + event.amountOz, 0) ?? 0

  return (
    <section className="mx-auto max-w-3xl space-y-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">Daily check-in</p>
          <h1 className="text-2xl font-semibold tracking-tight">{formatWeekdayCalendarDate(date)}</h1>
          <p className="mt-1 text-sm text-zinc-600">Missing stays unknown. Record only what you actually tracked.</p>
        </div>
        <Link to={prefixedPath(prefix, '/')} className={quietButtonClass}>Today</Link>
      </div>

      <label className="block rounded-lg border border-zinc-200 bg-white p-4 text-sm font-medium text-zinc-700">
        Health date
        <div className="mt-1 w-full min-w-0 max-w-full overflow-hidden rounded-md border border-zinc-300 px-3 focus-within:ring-2 focus-within:ring-accent">
          <input
            type="date"
            value={date}
            max={today}
            onChange={(event) => setSearch({ date: event.target.value })}
            className="daily-checkin-date-input block min-h-11 min-w-0 w-full max-w-full box-border appearance-none border-0 bg-transparent p-0 text-left text-base"
          />
        </div>
      </label>

      {dateError ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{dateError}</p> : null}
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {loading ? <div className="h-28 animate-pulse rounded-lg bg-zinc-200" /> : null}

      {!loading && !dateError ? (
        <>
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Water</h2>{xpEligible ? <span className="text-xs font-semibold text-reward">+{DAILY_PARTICIPATION_XP.hydration} XP · first log</span> : null}</div>
            <p className="mt-1 text-sm text-zinc-600">
              {day?.hydrationEvents.length ? `${Math.round(totalWater)} oz logged` : 'No water tracking recorded for this day.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {WATER_AMOUNTS.map((amount) => (
                <button key={amount} type="button" disabled={busy} className={quietButtonClass} onClick={() => void mutate(() => addHydrationEvent(date, amount))}>
                  +{amount} oz
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                inputMode="decimal"
                value={customWater}
                onChange={(event) => setCustomWater(event.target.value)}
                placeholder="Custom oz"
                className="min-h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-base"
              />
              <button
                type="button"
                className={quietButtonClass}
                disabled={busy || !(Number(customWater) > 0)}
                onClick={() => {
                  const amount = Number(customWater)
                  void mutate(async () => {
                    await addHydrationEvent(date, amount)
                    setCustomWater('')
                  })
                }}
              >
                Add
              </button>
            </div>
            {day?.hydrationEvents.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {day.hydrationEvents.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2">
                    <span>{Math.round(event.amountOz * 10) / 10} oz</span>
                    <button type="button" disabled={busy} className="min-h-11 text-zinc-600 hover:underline" onClick={() => void mutate(() => deleteHydrationEvent(event.id))}>Remove</button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Bowel</h2>{xpEligible ? <span className="text-xs font-semibold text-reward">+{DAILY_PARTICIPATION_XP.bowel} XP · one/day</span> : null}</div>
            <p className="mt-1 text-sm text-zinc-600">
              {day?.noBowelMovement
                ? 'Explicitly recorded: no bowel movement.'
                : day?.bowelEvents.length
                  ? `${day.bowelEvents.length} bowel movement${day.bowelEvents.length === 1 ? '' : 's'} logged.`
                  : 'No bowel data recorded. This is unknown, not zero.'}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-zinc-700">Log Bristol type</p>
              <button type="button" className="min-h-11 rounded-md border border-accent px-3 text-sm font-medium text-accent" onClick={() => setShowBristol(true)}>Bristol chart</button>
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {BRISTOL_TYPES.map((type) => (
                <button key={type} type="button" disabled={busy} aria-label={`Log Bristol type ${type}`} className="flex min-h-11 min-w-0 items-center justify-center rounded-md border border-zinc-300 text-sm font-medium hover:bg-accent-muted" onClick={() => void mutate(() => addBowelEvent(date, type))}>
                  {type}
                </button>
              ))}
            </div>
            <div className="mt-3">
              {day?.noBowelMovement ? (
                <button type="button" disabled={busy} className={quietButtonClass} onClick={() => void mutate(() => clearNoBowelMovement(date))}>Clear no-BM state</button>
              ) : (
                <button type="button" disabled={busy || Boolean(day?.bowelEvents.length)} className={quietButtonClass} onClick={() => void mutate(() => setNoBowelMovement(date))}>No bowel movement this day</button>
              )}
            </div>
            {day?.bowelEvents.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {day.bowelEvents.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2">
                    <span>Bristol type {event.bristolType}</span>
                    <button type="button" disabled={busy} className="min-h-11 text-zinc-600 hover:underline" onClick={() => void mutate(() => deleteBowelEvent(event.id))}>Remove</button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">How do you feel?</h2>{xpEligible ? <span className="text-xs font-semibold text-reward">+{DAILY_PARTICIPATION_XP.wellness} XP · one/day</span> : null}</div>
            <p className="mt-1 text-sm text-zinc-600">1 is low / mild; 5 is high / strong. Stress is optional.</p>
            <div className="mt-4 space-y-4">
              {(['energy', 'hunger', 'soreness', 'stress'] as const).map((key) => (
                <div key={key}>
                  <p className="text-sm font-medium capitalize text-zinc-700">{key}</p>
                  <div className="mt-1 grid max-w-sm grid-cols-5 gap-2">
                    {RATINGS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={wellness[key] === value}
                        aria-label={`${key} ${value} out of 5`}
                        className={`flex min-h-11 min-w-0 items-center justify-center rounded-md border text-sm font-semibold ${wellness[key] === value ? 'border-accent bg-accent text-accent-fg' : 'border-zinc-300 bg-white text-zinc-700 hover:bg-accent-muted'}`}
                        onClick={() => setWellness((current) => ({ ...current, [key]: current[key] === value ? null : value }))}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className={`${primaryButtonClass} mt-4`}
              disabled={busy || Object.values(wellness).every((value) => value == null)}
              onClick={() => void mutate(() => saveDailyWellness(date, wellness))}
            >
              Save check-in
            </button>
            {day?.wellness ? (
              <button
                type="button"
                className={`${quietButtonClass} ml-2 mt-4`}
                disabled={busy}
                onClick={() => void mutate(() => clearDailyWellness(date))}
              >
                Clear ratings
              </button>
            ) : null}
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="font-semibold">Context</h2>
            <p className="mt-1 text-sm text-zinc-600">Travel, illness, unusual stress, pain, rest-day context, and notes stay in the existing Daily Context authority.</p>
            <Link to={prefixedPath(prefix, `/context?date=${date}&from=check-in`)} className={`${quietButtonClass} mt-3`}>
              Add or edit context
            </Link>
          </section>
        </>
      ) : null}
      {showBristol ? <BristolReferenceChart onClose={() => setShowBristol(false)} /> : null}
    </section>
  )
}
