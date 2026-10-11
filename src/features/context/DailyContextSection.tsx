import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  DAILY_CONTEXT_NOTE_MAX,
  DAILY_CONTEXT_TAG_CATALOG,
  characterCount,
  type DailyContext,
  type DailyContextTagKey,
} from '@/domain/context'
import { healthFetch, readApiError } from '@/lib/health-api'
import { primaryButtonClass, quietButtonClass } from '@/lib'
import { useDemoReadOnly } from '@/lib/app-prefix'

type ContextDraft = { tags: DailyContextTagKey[]; note: string }
const empty = (): ContextDraft => ({ tags: [], note: '' })

/** Date-scoped editing over the existing canonical Daily Context endpoint. */
export function DailyContextSection({
  date, onDirtyChange,
}: {
  date: string
  onDirtyChange: (dirty: boolean) => void
}) {
  const readOnly = useDemoReadOnly()
  const location = useLocation()
  const [draft, setDraft] = useState<ContextDraft>(empty)
  const [saved, setSaved] = useState<ContextDraft>(empty)
  const [recorded, setRecorded] = useState(false)
  const [expanded, setExpanded] = useState(location.hash === '#daily-context')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = draft.note !== saved.note ||
    draft.tags.join('|') !== saved.tags.join('|')

  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    const controller = new AbortController()
    healthFetch('/api/context/days/' + date, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response))
        const data = (await response.json()) as { context: DailyContext | null }
        if (controller.signal.aborted) return
        const next: ContextDraft = {
          tags: data.context?.tags ?? [],
          note: data.context?.note ?? '',
        }
        setSaved(next)
        setDraft(next)
        setRecorded(data.context != null)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Could not load context.')
        setLoading(false)
      })
    return () => controller.abort()
  }, [date])

  function toggle(key: DailyContextTagKey) {
    setDraft((current) => ({
      ...current,
      tags: current.tags.includes(key)
        ? current.tags.filter((item) => item !== key)
        : DAILY_CONTEXT_TAG_CATALOG.filter(
            (item) => item.key === key || current.tags.includes(item.key),
          ).map((item) => item.key),
    }))
  }

  async function save() {
    if (readOnly || saving || !dirty || (!draft.tags.length && !draft.note.trim())) return
    setSaving(true)
    setError(null)
    try {
      const response = await healthFetch('/api/context/days/' + date, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags: draft.tags, note: draft.note }),
      })
      if (!response.ok) throw new Error(await readApiError(response))
      setSaved({ tags: [...draft.tags], note: draft.note })
      setRecorded(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save context.')
    } finally {
      setSaving(false)
    }
  }

  async function clear() {
    if (readOnly || saving || !recorded) return
    if (dirty && !window.confirm('Clear saved context and discard unsaved edits?')) return
    setSaving(true)
    setError(null)
    try {
      const response = await healthFetch('/api/context/days/' + date, { method: 'DELETE' })
      if (!response.ok) throw new Error(await readApiError(response))
      setSaved(empty())
      setDraft(empty())
      setRecorded(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not clear context.')
    } finally {
      setSaving(false)
    }
  }

  const summary = recorded
    ? (saved.tags.length ? saved.tags.length + ' tags' : 'No tags') + (saved.note ? ' · Note saved' : '')
    : 'No context recorded'

  return (
    <section className="overflow-hidden rounded-xl border border-accent-secondary/30 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-zinc-900">Daily context</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {loading ? 'Loading context…' : summary}
            {dirty ? ' · Unsaved edits' : ''}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className={quietButtonClass}
        >{expanded ? 'Collapse' : recorded ? 'Edit context' : 'Add context'}</button>
      </div>
      {error ? <p role="alert" className="mt-3 rounded-lg bg-danger/10 p-2 text-sm text-danger">{error}</p> : null}
      {expanded && !loading ? (
        <div className="mt-4 space-y-4 border-t border-zinc-200 pt-4">
          <div>
            <p className="text-sm font-medium text-zinc-800">What was different about this day?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAILY_CONTEXT_TAG_CATALOG.map((item) => {
                const selected = draft.tags.includes(item.key)
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={selected}
                    disabled={readOnly || saving}
                    onClick={() => toggle(item.key)}
                    className={selected
                      ? 'min-h-10 rounded-full border border-accent bg-accent-muted px-3 text-sm font-medium text-accent'
                      : 'min-h-10 rounded-full border border-zinc-300 px-3 text-sm text-zinc-700 hover:bg-accent-muted'}
                  >{item.label}</button>
                )
              })}
            </div>
          </div>
          <label className="block text-sm font-medium text-zinc-800">
            Note (optional)
            <textarea
              rows={3}
              value={draft.note}
              disabled={readOnly || saving}
              maxLength={DAILY_CONTEXT_NOTE_MAX}
              onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              className="mt-1 block min-h-24 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base"
              placeholder="Travel, symptoms, disruptions, unusual stress…"
            />
            <span className="mt-1 block text-right text-xs font-normal text-zinc-500">
              {characterCount(draft.note)} / {DAILY_CONTEXT_NOTE_MAX}
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={readOnly || saving || !dirty || (!draft.tags.length && !draft.note.trim())}
              className={primaryButtonClass}
              onClick={() => void save()}
            >{saving ? 'Saving…' : 'Save context'}</button>
            <button
              type="button"
              disabled={saving || !dirty}
              className={quietButtonClass}
              onClick={() => setDraft({ tags: [...saved.tags], note: saved.note })}
            >Discard edits</button>
            {recorded ? (
              <button
                type="button"
                disabled={readOnly || saving}
                onClick={() => void clear()}
                className="min-h-11 px-3 text-sm font-medium text-danger hover:underline"
              >Clear saved context</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
