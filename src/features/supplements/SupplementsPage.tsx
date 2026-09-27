import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatFullCalendarDate } from '@/domain/calendar-format'
import { addCalendarDays } from '@/domain/progress/dates'
import {
  EVERY_DAY_MASK,
  WEEKDAYS,
  formatPlannedDose,
  formatWeekdayMask,
  resolveOccurrence,
  type LifecycleStatus,
  type SupplementRecord,
  type SupplementSchedule,
} from '@/domain/supplements'
import {
  dangerButtonClass,
  LoadErrorNotice,
  primaryButtonClass,
  quietButtonClass,
  secondaryButtonClass,
} from '@/lib'
import {
  addSupplementSchedule,
  createSupplement,
  deleteSupplement,
  fetchSupplements,
  recordSupplementAdherence,
  setSupplementStatus,
  stopSupplementSchedule,
  updateSupplement,
  versionSupplementSchedule,
} from './api'

const fieldClass = 'mt-1 block min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base'

function statusLabel(status: LifecycleStatus | null): string {
  if (status === 'active') return 'Active'
  if (status === 'paused') return 'Paused'
  if (status === 'discontinued') return 'Discontinued'
  return 'Not started'
}

function WeekdayPicker({ mask, onChange }: { mask: number; onChange: (mask: number) => void }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {WEEKDAYS.map((day) => {
        const selected = (mask & day.bit) !== 0
        return (
          <label key={day.key} className="inline-flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={selected}
              onChange={() => onChange(selected ? mask & ~day.bit : mask | day.bit)}
            />
            {day.label}
          </label>
        )
      })}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-zinc-800">{label}</span>
      {children}
    </label>
  )
}

function AddSupplementForm({ today, onCreated }: { today: string; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [doseAmount, setDoseAmount] = useState('5')
  const [doseUnit, setDoseUnit] = useState('g')
  const [weekdayMask, setWeekdayMask] = useState(EVERY_DAY_MASK)
  const [slotLabel, setSlotLabel] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [form, setForm] = useState('')
  const [brand, setBrand] = useState('')
  const [productName, setProductName] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await createSupplement({
        name,
        form: form || null,
        brand: brand || null,
        productName: productName || null,
        notes: notes || null,
        startDate,
        schedule: {
          doseAmount,
          doseUnit,
          weekdayMask,
          slotLabel: slotLabel || null,
          effectiveFrom: startDate,
        },
      })
      setName('')
      setSlotLabel('')
      setNotes('')
      await onCreated()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add supplement')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-semibold">Add supplement</h2>
      <Field label="Name">
        <input required value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Dose">
          <input required inputMode="decimal" value={doseAmount} onChange={(event) => setDoseAmount(event.target.value)} className={fieldClass} />
        </Field>
        <Field label="Unit">
          <input required value={doseUnit} onChange={(event) => setDoseUnit(event.target.value)} className={fieldClass} />
        </Field>
      </div>
      <WeekdayPicker mask={weekdayMask} onChange={setWeekdayMask} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Slot">
          <input value={slotLabel} placeholder="Morning" onChange={(event) => setSlotLabel(event.target.value)} className={fieldClass} />
        </Field>
        <Field label="Starts">
          <input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} className={fieldClass} />
        </Field>
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-zinc-600">More details</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Form">
            <input value={form} onChange={(event) => setForm(event.target.value)} className={fieldClass} />
          </Field>
          <Field label="Brand">
            <input value={brand} onChange={(event) => setBrand(event.target.value)} className={fieldClass} />
          </Field>
          <Field label="Product">
            <input value={productName} onChange={(event) => setProductName(event.target.value)} className={fieldClass} />
          </Field>
          <Field label="Notes">
            <input value={notes} onChange={(event) => setNotes(event.target.value)} className={fieldClass} />
          </Field>
        </div>
      </details>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button type="submit" disabled={busy} className={primaryButtonClass}>
        {busy ? 'Saving…' : 'Add supplement'}
      </button>
    </form>
  )
}

function SupplementCard({
  record,
  today,
  previewDate,
  onChanged,
}: {
  record: SupplementRecord
  today: string
  previewDate: string
  onChanged: () => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(record.name)
  const [form, setForm] = useState(record.form ?? '')
  const [brand, setBrand] = useState(record.brand ?? '')
  const [productName, setProductName] = useState(record.productName ?? '')
  const [notes, setNotes] = useState(record.notes ?? '')
  const [statusDate, setStatusDate] = useState(today)
  const [adherenceDate, setAdherenceDate] = useState(addCalendarDays(today, -1))
  const [adherenceScheduleId, setAdherenceScheduleId] = useState(record.schedules[0]?.id ?? '')
  const openSchedules = record.schedules.filter((schedule) => schedule.effectiveThrough == null)

  useEffect(() => {
    setName(record.name)
    setForm(record.form ?? '')
    setBrand(record.brand ?? '')
    setProductName(record.productName ?? '')
    setNotes(record.notes ?? '')
    setAdherenceScheduleId((current) => record.schedules.some((schedule) => schedule.id === current) ? current : record.schedules[0]?.id ?? '')
  }, [record])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update supplement')
    } finally {
      setBusy(false)
    }
  }

  const preview = record.schedules.flatMap((schedule) => {
    const adherence = record.adherence.find((item) => item.scheduleId === schedule.id && item.scheduledDate === previewDate) ?? null
    const state = resolveOccurrence({
      events: record.statusEvents,
      schedule,
      date: previewDate,
      adherence,
    })
    if (state === 'not_scheduled') {
      return []
    }
    return [{ schedule, state }]
  })

  return (
    <article className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{record.name}</h2>
          <p className="text-sm text-zinc-600">
            {statusLabel(record.status)}
            {record.brand ? ` · ${record.brand}` : ''}
            {record.productName ? ` · ${record.productName}` : ''}
          </p>
        </div>
        <Link to="/" className={quietButtonClass}>Today</Link>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {formatFullCalendarDate(previewDate)}
        </h3>
        {preview.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-600">Not scheduled</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {preview.map((item) => (
              <li key={item.schedule.id}>
                {formatPlannedDose(item.schedule.doseAmount, item.schedule.doseUnit)}
                {item.schedule.slotLabel ? ` · ${item.schedule.slotLabel}` : ''} · {item.state}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Schedules</h3>
        <ul className="mt-2 space-y-3">
          {record.schedules.map((schedule) => (
            <ScheduleRow
              key={schedule.id}
              supplementId={record.id}
              schedule={schedule}
              today={today}
              busy={busy}
              onRun={run}
            />
          ))}
        </ul>
        <AddDoseForm supplementId={record.id} today={today} busy={busy} onRun={run} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Field label="Effective date">
          <input type="date" value={statusDate} onChange={(event) => setStatusDate(event.target.value)} className={fieldClass} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={secondaryButtonClass} onClick={() => void run(() => setSupplementStatus(record.id, { status: 'paused', effectiveDate: statusDate }))}>
          Pause
        </button>
        <button type="button" disabled={busy} className={secondaryButtonClass} onClick={() => void run(() => setSupplementStatus(record.id, { status: 'active', effectiveDate: statusDate }))}>
          Resume
        </button>
        <button type="button" disabled={busy} className={secondaryButtonClass} onClick={() => void run(() => setSupplementStatus(record.id, { status: 'discontinued', effectiveDate: statusDate }))}>
          Discontinue
        </button>
      </div>

      {record.statusEvents.length > 0 ? (
        <ul className="space-y-1 text-sm text-zinc-600">
          {record.statusEvents.map((event) => (
            <li key={event.id}>
              {formatFullCalendarDate(event.effectiveDate)} · {event.status}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Record a past dose</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date">
            <input type="date" max={today} value={adherenceDate} onChange={(event) => setAdherenceDate(event.target.value)} className={fieldClass} />
          </Field>
          <Field label="Dose">
            <select value={adherenceScheduleId} onChange={(event) => setAdherenceScheduleId(event.target.value)} className={fieldClass}>
              {record.schedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {formatPlannedDose(schedule.doseAmount, schedule.doseUnit)}
                  {schedule.slotLabel ? ` · ${schedule.slotLabel}` : ''} · from {schedule.effectiveFrom}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || adherenceScheduleId === ''} className={primaryButtonClass} onClick={() => void run(() => recordSupplementAdherence({ scheduleId: adherenceScheduleId, supplementId: record.id, scheduledDate: adherenceDate, action: 'taken' }))}>Taken</button>
          <button type="button" disabled={busy || adherenceScheduleId === ''} className={secondaryButtonClass} onClick={() => void run(() => recordSupplementAdherence({ scheduleId: adherenceScheduleId, supplementId: record.id, scheduledDate: adherenceDate, action: 'skipped' }))}>Skipped</button>
          <button type="button" disabled={busy || adherenceScheduleId === ''} className={secondaryButtonClass} onClick={() => void run(() => recordSupplementAdherence({ scheduleId: adherenceScheduleId, supplementId: record.id, scheduledDate: adherenceDate, action: 'clear' }))}>Clear</button>
        </div>
      </div>

      {record.adherence.length > 0 ? (
        <ul className="space-y-1 text-sm text-zinc-700">
          {record.adherence.slice(0, 12).map((item) => (
            <li key={item.id}>
              {formatFullCalendarDate(item.scheduledDate)} · {item.status}
              {item.actualDoseAmount != null && item.actualDoseUnit ? ` · ${formatPlannedDose(item.actualDoseAmount, item.actualDoseUnit)}` : ''}
              {item.status === 'taken' && !item.takenAt ? ' · taken time not recorded' : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-600">No taken or skipped doses recorded.</p>
      )}

      <details>
        <summary className="cursor-pointer text-sm text-zinc-600">Edit name and notes</summary>
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void run(() => updateSupplement(record.id, {
              name,
              form: form || null,
              brand: brand || null,
              productName: productName || null,
              notes: notes || null,
            }))
          }}
        >
          <Field label="Name">
            <input required value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Form">
              <input value={form} onChange={(event) => setForm(event.target.value)} className={fieldClass} />
            </Field>
            <Field label="Brand">
              <input value={brand} onChange={(event) => setBrand(event.target.value)} className={fieldClass} />
            </Field>
          </div>
          <Field label="Product">
            <input value={productName} onChange={(event) => setProductName(event.target.value)} className={fieldClass} />
          </Field>
          <Field label="Notes">
            <input value={notes} onChange={(event) => setNotes(event.target.value)} className={fieldClass} />
          </Field>
          <button type="submit" disabled={busy} className={secondaryButtonClass}>Save details</button>
        </form>
      </details>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="button"
        disabled={busy}
        className={dangerButtonClass}
        onClick={() => {
          if (window.confirm('Delete this supplement and its schedules, status history, and adherence? Pause or discontinue instead if you want to keep history.')) {
            void run(() => deleteSupplement(record.id))
          }
        }}
      >
        Delete supplement
      </button>
      {openSchedules.length === 0 ? <p className="text-sm text-zinc-500">No open schedule. Add a dose to plan future days.</p> : null}
    </article>
  )
}

function ScheduleRow({
  supplementId,
  schedule,
  today,
  busy,
  onRun,
}: {
  supplementId: string
  schedule: SupplementSchedule
  today: string
  busy: boolean
  onRun: (action: () => Promise<unknown>) => Promise<void>
}) {
  const [doseAmount, setDoseAmount] = useState(String(schedule.doseAmount))
  const [doseUnit, setDoseUnit] = useState(schedule.doseUnit)
  const [weekdayMask, setWeekdayMask] = useState(schedule.weekdayMask)
  const [slotLabel, setSlotLabel] = useState(schedule.slotLabel ?? '')
  const [effectiveFrom, setEffectiveFrom] = useState(addCalendarDays(today, 1))
  const [stopOn, setStopOn] = useState(addCalendarDays(today, 1))
  const open = schedule.effectiveThrough == null

  return (
    <li className="rounded-md bg-zinc-50 p-3 text-sm">
      <p className="font-medium text-zinc-900">
        {formatPlannedDose(schedule.doseAmount, schedule.doseUnit)}
        {schedule.slotLabel ? ` · ${schedule.slotLabel}` : ''} · {formatWeekdayMask(schedule.weekdayMask)}
      </p>
      <p className="text-zinc-600">
        {schedule.effectiveFrom} – {schedule.effectiveThrough ?? 'open'}
      </p>
      {open ? (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <input aria-label="New dose" value={doseAmount} onChange={(event) => setDoseAmount(event.target.value)} className={fieldClass} />
            <input aria-label="New unit" value={doseUnit} onChange={(event) => setDoseUnit(event.target.value)} className={fieldClass} />
          </div>
          <WeekdayPicker mask={weekdayMask} onChange={setWeekdayMask} />
          <input aria-label="Slot" value={slotLabel} onChange={(event) => setSlotLabel(event.target.value)} className={fieldClass} />
          <Field label="New dose starts">
            <input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className={fieldClass} />
          </Field>
          <button
            type="button"
            disabled={busy}
            className={secondaryButtonClass}
            onClick={() => void onRun(() => versionSupplementSchedule(supplementId, schedule.id, {
              doseAmount,
              doseUnit,
              weekdayMask,
              slotLabel: slotLabel || null,
              effectiveFrom,
            }))}
          >
            Change dose from this date
          </button>
          <Field label="Stop starting">
            <input type="date" value={stopOn} onChange={(event) => setStopOn(event.target.value)} className={fieldClass} />
          </Field>
          <button
            type="button"
            disabled={busy}
            className={secondaryButtonClass}
            onClick={() => void onRun(() => stopSupplementSchedule(supplementId, schedule.id, stopOn))}
          >
            Stop schedule
          </button>
        </div>
      ) : null}
    </li>
  )
}

function AddDoseForm({
  supplementId,
  today,
  busy,
  onRun,
}: {
  supplementId: string
  today: string
  busy: boolean
  onRun: (action: () => Promise<unknown>) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [doseAmount, setDoseAmount] = useState('1')
  const [doseUnit, setDoseUnit] = useState('serving')
  const [weekdayMask, setWeekdayMask] = useState(EVERY_DAY_MASK)
  const [slotLabel, setSlotLabel] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  if (!open) {
    return (
      <button type="button" className={`${quietButtonClass} mt-2`} onClick={() => setOpen(true)}>
        Add another dose
      </button>
    )
  }
  return (
    <div className="mt-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label="Additional dose" value={doseAmount} onChange={(event) => setDoseAmount(event.target.value)} className={fieldClass} />
        <input aria-label="Additional unit" value={doseUnit} onChange={(event) => setDoseUnit(event.target.value)} className={fieldClass} />
      </div>
      <WeekdayPicker mask={weekdayMask} onChange={setWeekdayMask} />
      <input aria-label="Additional slot" placeholder="Evening" value={slotLabel} onChange={(event) => setSlotLabel(event.target.value)} className={fieldClass} />
      <Field label="Starts">
        <input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className={fieldClass} />
      </Field>
      <button
        type="button"
        disabled={busy}
        className={secondaryButtonClass}
        onClick={() => void onRun(() => addSupplementSchedule(supplementId, {
          doseAmount,
          doseUnit,
          weekdayMask,
          slotLabel: slotLabel || null,
          effectiveFrom,
        }))}
      >
        Save dose
      </button>
    </div>
  )
}

export function SupplementsPage() {
  const [today, setToday] = useState<string | null>(null)
  const [records, setRecords] = useState<SupplementRecord[]>([])
  const [previewDate, setPreviewDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function reload() {
    const list = await fetchSupplements()
    setToday(list.date)
    setRecords(list.supplements)
    setPreviewDate((current) => current || list.date)
  }

  useEffect(() => {
    let cancelled = false
    fetchSupplements()
      .then((list) => {
        if (cancelled) return
        setToday(list.date)
        setRecords(list.supplements)
        setPreviewDate(list.date)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load supplements')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Supplements</h1>
        <p className="mt-1 text-sm text-zinc-600">
          A dose stays unknown until you record taken or skipped. Pausing does not count as a miss.
        </p>
      </div>
      {loading ? <p className="text-zinc-600">Loading…</p> : null}
      {error ? <LoadErrorNotice message={error} onRetry={() => { setError(null); void reload().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load supplements')) }} /> : null}
      {today ? (
        <>
          <Field label="Preview date">
            <input type="date" value={previewDate} onChange={(event) => setPreviewDate(event.target.value)} className={fieldClass} />
          </Field>
          <AddSupplementForm today={today} onCreated={reload} />
          {records.length === 0 ? <p className="text-sm text-zinc-600">No supplements yet.</p> : null}
          {records.map((record) => (
            <SupplementCard key={record.id} record={record} today={today} previewDate={previewDate || today} onChanged={reload} />
          ))}
        </>
      ) : null}
    </section>
  )
}
