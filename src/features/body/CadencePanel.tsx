import { useState } from 'react'
import { ARM_CADENCE_KEYS, FULL_CIRCUMFERENCE_KEYS, MANUAL_BODY_METRICS } from '@/domain/body-manual'
import type { BodyCadenceItem } from './api'
import { quietButtonClass, secondaryButtonClass } from '@/lib'

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

  async function run(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the schedule')
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Measurement schedule</h2>
        <p className="mt-1 text-sm text-zinc-600">This controls when Health reminds you to measure. Nothing is scheduled until you turn it on.</p>
      </div>
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
          return (
            <li key={definition.key} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              <div>
                <p className="font-medium">{definition.label}</p>
                <p className="text-xs text-zinc-500">{current ? statusText(current) : 'Off'}</p>
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
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
    </section>
  )
}

function statusText(item: BodyCadenceItem): string {
  if (item.status === 'initial_due') {
    return `Every ${item.intervalDays} days · no measurement yet`
  }
  if (item.status === 'current') {
    return `Every ${item.intervalDays} days · current`
  }
  if (item.status === 'stale') {
    return `Every ${item.intervalDays} days · stale`
  }
  return `Every ${item.intervalDays} days · due`
}
