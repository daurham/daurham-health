import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  DAILY_CONTEXT_NOTE_MAX,
  DAILY_CONTEXT_TAG_CATALOG,
  characterCount,
  contextDateError,
  type DailyContext,
  type DailyContextTagKey,
} from '@/domain/context'
import { formatWeekdayCalendarDate } from '@/domain/calendar-format'
import { healthFetch, readApiError } from '@/lib/health-api'
import { dangerButtonClass, primaryButtonClass, quietButtonClass, useHealthCalendarDate } from '@/lib'

type EditorState = {
  recordedId: string | null
  tags: DailyContextTagKey[]
  note: string
}

export function ContextPage() {
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const today = useHealthCalendarDate()
  const requested = search.get('date')?.trim() ?? ''
  const date = requested.length > 0 ? requested : today
  const dateError = contextDateError(date, today)
  const from = search.get('from')
  const backTo = from === 'timeline' ? '/progress/timeline' : from === 'check-in' ? `/check-in?date=${date}` : '/'
  const [editor, setEditor] = useState<EditorState>({ recordedId: null, tags: [], note: '' })
  const [loading, setLoading] = useState(dateError == null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (dateError) {
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    healthFetch(`/api/context/days/${date}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readApiError(response))
        }
        const body = (await response.json()) as { context: DailyContext | null }
        if (controller.signal.aborted) {
          return
        }
        setEditor({
          recordedId: body.context?.id ?? null,
          tags: body.context?.tags ?? [],
          note: body.context?.note ?? '',
        })
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        setError(reason instanceof Error ? reason.message : 'Could not load context.')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [date, dateError])

  function toggle(tag: DailyContextTagKey) {
    setEditor((current) => ({
      ...current,
      tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag],
    }))
  }

  const canSave = dateError == null && (editor.tags.length > 0 || editor.note.trim().length > 0)

  async function save() {
    if (!canSave || saving) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await healthFetch(`/api/context/days/${date}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags: editor.tags, note: editor.note }),
      })
      if (!response.ok) {
        throw new Error(await readApiError(response))
      }
      navigate(backTo)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save context.')
      setSaving(false)
    }
  }

  async function clearContext() {
    if (!editor.recordedId || saving) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await healthFetch(`/api/context/days/${date}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error(await readApiError(response))
      }
      navigate(backTo)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not clear context.')
      setSaving(false)
    }
  }

  return (
    <ContextEditor
      date={date}
      today={today}
      dateError={dateError}
      loading={loading}
      saving={saving}
      error={error}
      recorded={editor.recordedId != null}
      tags={editor.tags}
      note={editor.note}
      canSave={canSave}
      backTo={backTo}
      onDate={(next) => {
        const params = new URLSearchParams(search)
        params.set('date', next)
        navigate(`/context?${params.toString()}`)
      }}
      onToggle={toggle}
      onNote={(note) => setEditor((current) => ({ ...current, note }))}
      onSave={() => void save()}
      onDelete={() => void clearContext()}
    />
  )
}

export function ContextEditor({
  date,
  today,
  dateError,
  loading,
  saving,
  error,
  recorded,
  tags,
  note,
  canSave,
  backTo,
  onDate,
  onToggle,
  onNote,
  onSave,
  onDelete,
}: {
  date: string
  today: string
  dateError: string | null
  loading: boolean
  saving: boolean
  error: string | null
  recorded: boolean
  tags: readonly DailyContextTagKey[]
  note: string
  canSave: boolean
  backTo: string
  onDate: (date: string) => void
  onToggle: (tag: DailyContextTagKey) => void
  onNote: (note: string) => void
  onSave: () => void
  onDelete: () => void
}) {
  const count = characterCount(note)
  const heading = dateError ? date : formatWeekdayCalendarDate(date)
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <Link to={backTo} className={quietButtonClass}>
          Back
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Daily context</h1>
        <p className="mt-1 text-sm text-zinc-600">{heading}</p>
      </div>
      <label className="block text-sm text-zinc-600">
        Date
        <input
          type="date"
          value={dateError ? '' : date}
          max={today}
          onChange={(event) => onDate(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded-md border border-zinc-300 px-3"
        />
      </label>
      {dateError ? <p className="text-sm text-zinc-700">{dateError}</p> : null}
      {error ? <p className="text-sm text-zinc-700">{error}</p> : null}
      {dateError || loading ? null : (
        <>
          <div>
            <p className="text-sm font-medium text-zinc-900">What was different about this day?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DAILY_CONTEXT_TAG_CATALOG.map((item) => {
                const selected = tags.includes(item.key)
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onToggle(item.key)}
                    className={
                      selected
                        ? 'min-h-11 rounded-full border border-zinc-900 bg-zinc-900 px-3 text-sm text-white'
                        : 'min-h-11 rounded-full border border-zinc-300 bg-white px-3 text-sm text-zinc-800'
                    }
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
          <label className="block text-sm font-medium text-zinc-900">
            Note
            <textarea
              value={note}
              maxLength={DAILY_CONTEXT_NOTE_MAX}
              rows={4}
              onChange={(event) => onNote(event.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal"
              placeholder="Optional. What should this day be read alongside?"
            />
          </label>
          {count >= 400 ? (
            <p className="text-xs text-zinc-500">
              {count}/{DAILY_CONTEXT_NOTE_MAX}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={primaryButtonClass} disabled={!canSave || saving} onClick={onSave}>
              Save context
            </button>
            {recorded ? (
              <button type="button" className={dangerButtonClass} disabled={saving} onClick={onDelete}>
                Clear context
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
