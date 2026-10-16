import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { IntelligenceContextItem } from '@/domain/intelligence'
import {
  isOwnerClarificationSuppressed,
  ownerClarificationStorageKey,
  parseOwnerClarificationPreference,
  selectOwnerClarification,
  serializeOwnerClarificationPreference,
  type OwnerClarificationPreference,
} from '@/domain/ask-health/clarification'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'
import { quietButtonClass } from '@/lib'

function localPreference(key: string): OwnerClarificationPreference {
  try {
    return typeof localStorage === 'undefined'
      ? null
      : parseOwnerClarificationPreference(localStorage.getItem(key))
  } catch {
    return null
  }
}

/** At most one relevant, optional question after an answer. No model calls and
 * no automatic canonical writes; the owner reviews the original nutrition day.
 */
export function OptionalClarification({ question, missing, today }: {
  question: string
  missing: readonly IntelligenceContextItem[]
  today: string
}) {
  const prefix = useAppPathPrefix()
  const storageKey = ownerClarificationStorageKey(prefix)
  const candidate = selectOwnerClarification(question, missing)
  const [preference, setPreference] = useState<OwnerClarificationPreference>(() => localPreference(storageKey))
  const [skipped, setSkipped] = useState(false)

  if (!candidate) return null

  function store(value: OwnerClarificationPreference) {
    setPreference(value)
    setSkipped(false)
    try {
      const serialized = serializeOwnerClarificationPreference(value)
      if (serialized == null) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, serialized)
    } catch {
      // Private browsing or disabled storage: session-local React state still works.
    }
  }

  if (preference === 'never') {
    return (
      <p className="text-xs text-zinc-500">
        Optional data questions are disabled on this device.{' '}
        <button type="button" className="underline" onClick={() => store(null)}>Enable again</button>
      </p>
    )
  }
  if (skipped || isOwnerClarificationSuppressed(preference, today)) return null

  return (
    <section aria-label="Optional Health clarification" className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Optional · improve this answer</p>
      <p className="text-sm font-semibold text-zinc-900">{candidate.question}</p>
      <p className="text-xs leading-5 text-zinc-600">{candidate.reason}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link className="min-h-10 content-center font-medium underline"
          to={prefixedPath(prefix, candidate.destination)}>
          Review food-log days
        </Link>
        <button type="button" className={quietButtonClass} onClick={() => setSkipped(true)}>Skip</button>
        <button type="button" className={quietButtonClass}
          onClick={() => store({ laterThrough: today })}>Ask later</button>
        <button type="button" className={quietButtonClass}
          onClick={() => store('never')}>Never ask again</button>
      </div>
      <p className="text-xs text-zinc-500">
        These preferences apply only to this browser. Health will not mark days complete from this question.
      </p>
    </section>
  )
}
