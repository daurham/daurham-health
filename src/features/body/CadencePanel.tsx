import { useState } from 'react'
import { ARM_CADENCE_KEYS, FULL_CIRCUMFERENCE_KEYS, MANUAL_BODY_METRICS } from '@/domain/body-manual'
import type { BodyCadenceItem } from './api'
import { cn, quietButtonClass, secondaryButtonClass } from '@/lib'

const fieldClass =
  'min-h-11 w-24 rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900'

export function CadencePanel({
  items,
  busy,
  onSave,
  onDisable,
  onApply,
}: {
  items: BodyCadenceItem[]
  busy: boolean
  onSave: (metricKey: string, intervalDays: number, enabledFrom?: string) => Promise<void>
  onDisable: (metricKey: string) => Promise<void>
  onApply: (keys: readonly string[], intervalDays: number) => Promise<void>
}) {
  const byKey = new Map(items.map((item) => [item.metricKey, item]))
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const due = items.filter((item) => item.status !== 'current')
  const overdue = due.filter((item) => item.daysOverdue > 0 || item.status === 'stale')
  const nextCurrent = items
    .filter((item) => item.status === 'current')
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0] ?? null

  async function run(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the schedule')
    }
  }

  const summary =
    items.length === 0
      ? 'No measurement schedule configured'
      : due.length > 0
        ? `${due.length} measurement${due.length === 1 ? '' : 's'} due${overdue.length > 0 ? ` · ${overdue.length} overdue` : ''}`
        : nextCurrent
          ? `All current · next due ${nextCurrent.dueDate}`
          : 'All measurements current'

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Measurement schedule</h2>
          <p
            className={cn(
              'mt-1 text-sm',
              due.length > 0 ? 'font-semibold text-warning' : 'text-zinc-600',
            )}
          >
            {summary}
          </p>
          {!expanded && due.length > 0 ? (
            <p className="mt-1 text-xs text-zinc-500">Open the schedule to see which measurements need attention.</p>
          ) : null}
        </div>
        <button
          type="button"
          className={secondaryButtonClass}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Collapse' : 'View schedule'}
        </button>
      </div>

      {expanded ? (
        <div className="motion-panel-enter space-y-3">
          <p className="text-sm text-zinc-600">This controls when Health reminds you to measure. Nothing is scheduled until you turn it on.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy}
              onClick={() => {
                void run(() => onApply(ARM_CADENCE_KEYS, 30))
              }}
            >
              Arms · 30 days
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy}
              onClick={() => {
                void run(() => onApply(FULL_CIRCUMFERENCE_KEYS, 30))
              }}
            >
              Full measurements · 30 days
            </button>
          </div>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {MANUAL_BODY_METRICS.map((definition) => {
              const current = byKey.get(definition.key)
              const draft = drafts[definition.key] ?? (current ? String(current.intervalDays) : '')
              const needsAttention = current != null && current.status !== 'current'
              return (
                <li key={definition.key} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className={cn('font-medium', needsAttention ? 'text-warning' : 'text-zinc-900')}>{definition.label}</p>
                    <p className={cn('text-xs', needsAttention ? 'font-medium text-warning' : 'text-zinc-500')}>
                      {current ? statusText(current) : 'Off'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-zinc-600">
                      Every
                      <input
                        className={`${fieldClass} mx-2`}
                        inputMode="numeric"
                        value={draft}
                        onChange={(event) => setDrafts((existing) => ({ ...existing, [definition.key]: event.target.value }))}
                      />
                      days
                    </label>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={busy}
                      onClick={() => {
                        void run(() => onSave(definition.key, Number(draft), current?.enabledFrom))
                      }}
                    >
                      On
                    </button>
                    {current ? (
                      <button
                        type="button"
                        className={quietButtonClass}
                        disabled={busy}
                        onClick={() => {
                          void run(() => onDisable(definition.key))
                        }}
                      >
                        Off
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
    </section>
  )
}

function statusText(item: BodyCadenceItem): string {
  if (item.status === 'initial_due') {
    return `Due now · every ${item.intervalDays} days · no measurement yet`
  }
  if (item.status === 'current') {
    return `Every ${item.intervalDays} days · next due ${item.dueDate}`
  }
  if (item.status === 'stale') {
    return `Overdue by ${item.daysOverdue} day${item.daysOverdue === 1 ? '' : 's'} · every ${item.intervalDays} days`
  }
  return item.daysOverdue > 0
    ? `Due · ${item.daysOverdue} day${item.daysOverdue === 1 ? '' : 's'} overdue`
    : `Due today · every ${item.intervalDays} days`
}
