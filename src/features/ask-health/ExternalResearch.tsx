import { useState } from 'react'
import {
  buildLiteratureQueryPrefill,
  LITERATURE_LIMITATION,
  LITERATURE_PRIVACY,
  type LiteratureSearchResponse,
} from '@/domain/literature'
import { primaryButtonClass } from '@/lib'
import { searchLiterature } from './literature-api'
import { ResearchSources } from './ResearchSources'

export function ExternalResearch({ question }: { question: string }) {
  const prefill = buildLiteratureQueryPrefill(question)
  const [seenQuestion, setSeenQuestion] = useState(question)
  const [query, setQuery] = useState(prefill)
  const [searching, setSearching] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [result, setResult] = useState<LiteratureSearchResponse | null>(null)
  if (seenQuestion !== question) {
    setSeenQuestion(question)
    setQuery(prefill)
    setSearching(false)
    setFormError(null)
    setResult(null)
  }

  async function search() {
    const trimmed = query.trim()
    if (!trimmed || searching) {
      return
    }
    setSearching(true)
    setFormError(null)
    try {
      setResult(await searchLiterature(trimmed))
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'External research is unavailable right now. Your Health evidence is unchanged.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <details className="rounded-lg border border-zinc-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900">External research</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm leading-6 text-zinc-600">{LITERATURE_PRIVACY}</p>
        <label className="block text-sm font-medium text-zinc-800" htmlFor="literature-query">
          Research query
        </label>
        <textarea
          id="literature-query"
          value={query}
          maxLength={300}
          rows={3}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button type="button" className={primaryButtonClass} disabled={searching || query.trim().length === 0} onClick={() => void search()}>
          {searching ? 'Searching' : 'Search research'}
        </button>
        {formError ? <p className="text-sm text-zinc-700">{formError}</p> : null}
        {result ? <ResearchSources result={result} /> : <p className="text-sm leading-6 text-zinc-600">{LITERATURE_LIMITATION}</p>}
      </div>
    </details>
  )
}
