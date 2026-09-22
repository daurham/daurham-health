import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { CanonicalEvidence } from '@/domain/progress'
import { cn } from '@/lib'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'
import { formatCalendarDate, formatEvidenceSet } from './format'

export type EvidenceTopic = {
  title: string
  subtitle?: string
  facts: Array<{ label: string; value: string }>
  evidence: CanonicalEvidence[]
  workoutSessionId?: string
  actions?: Array<{ label: string; to: string }>
}

export function EvidencePanel({
  topic,
  onClose,
}: {
  topic: EvidenceTopic
  onClose: () => void
}) {
  const prefix = useAppPathPrefix()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement
    panelRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (previous instanceof HTMLElement) {
        previous.focus()
      }
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-900/40"
        aria-label="Close evidence"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="progress-evidence-title"
        tabIndex={-1}
        className="relative z-50 max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-5 pb-[calc(1.25rem+var(--shell-safe-bottom))] shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="progress-evidence-title" className="text-lg font-semibold tracking-tight">
              {topic.title}
            </h2>
            {topic.subtitle ? <p className="mt-1 text-sm text-zinc-600">{topic.subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            Close
          </button>
        </div>
        {topic.facts.length > 0 ? (
          <dl className="mt-4 space-y-2 text-sm">
            {topic.facts.map((fact) => (
              <div key={fact.label} className="flex justify-between gap-4">
                <dt className="text-zinc-500">{fact.label}</dt>
                <dd className="text-right font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {topic.evidence.length > 0 ? (
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Source</h3>
            <ul className="mt-2 space-y-2">
              {topic.evidence.map((item, index) => (
                <li
                  key={item.setId ?? item.measurementId ?? item.entryId ?? `${item.sessionId ?? 'ev'}-${index}`}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                >
                  <p className="font-medium">
                    {item.date ? formatCalendarDate(item.date) : 'Recorded observation'}
                  </p>
                  {item.setId ? (
                    <p className="mt-1 text-zinc-600">
                      {formatEvidenceSet(item)}
                      {item.setNumber != null ? ` · set ${item.setNumber}` : ''}
                    </p>
                  ) : null}
                  {item.leftReps != null || item.rightReps != null ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      Recorded sides: L {item.leftReps ?? '—'} · R {item.rightReps ?? '—'}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {topic.workoutSessionId ? (
          <Link
            to={prefixedPath(prefix, `/training/${topic.workoutSessionId}`)}
            className={cn(
              'mt-5 inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white',
            )}
          >
            Open workout
          </Link>
        ) : null}
        {topic.actions && topic.actions.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {topic.actions.map((action) => (
              <Link
                key={`${action.label}-${action.to}`}
                to={prefixedPath(prefix, action.to)}
                className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
