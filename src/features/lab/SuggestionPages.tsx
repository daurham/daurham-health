import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  SUGGESTION_EMPTY_COPY,
  type ExperimentCandidate,
  type SuggestionDraft,
} from '@/domain/experiment-suggestions'
import { LoadErrorNotice, primaryButtonClass, secondaryButtonClass } from '@/lib'
import { acceptSuggestion, draftSuggestion, fetchSuggestion, fetchSuggestions } from './api'

export function SuggestionList({
  suggestions,
  empty,
  toSuggestion,
}: {
  suggestions: ExperimentCandidate[]
  empty: string | null
  toSuggestion: (candidate: ExperimentCandidate) => string
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Suggested experiments</h2>
      {suggestions.length === 0 ? <p className="text-sm text-zinc-600">{empty ?? SUGGESTION_EMPTY_COPY}</p> : null}
      {suggestions.map((candidate) => (
        <Link key={candidate.candidateId} to={toSuggestion(candidate)} className="block rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {candidate.presentation === 'challenge' ? 'Challenge' : 'Observation'}
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-900">{candidate.title}</p>
          <p className="mt-1 text-sm text-zinc-600">{candidate.why}</p>
        </Link>
      ))}
    </section>
  )
}

export function LabSuggestions() {
  const [suggestions, setSuggestions] = useState<ExperimentCandidate[]>([])
  const [empty, setEmpty] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchSuggestions()
      .then((payload) => {
        if (!cancelled) {
          setSuggestions(payload.suggestions)
          setEmpty(payload.empty)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load suggestions')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {error ? <LoadErrorNotice message={error} /> : null}
      <SuggestionList
        suggestions={suggestions}
        empty={empty}
        toSuggestion={(candidate) => `/lab/suggestions/${encodeURIComponent(candidate.candidateId)}`}
      />
    </>
  )
}

export function SuggestionReviewPage() {
  const params = useParams()
  const candidateId = params['*'] ?? ''
  const [suggestion, setSuggestion] = useState<ExperimentCandidate | null>(null)
  const [draft, setDraft] = useState<SuggestionDraft | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [pending, setPending] = useState<'draft' | 'accept' | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchSuggestion(candidateId)
      .then((payload) => {
        if (!cancelled) {
          setSuggestion(payload.suggestion)
          setTitle(payload.suggestion.title)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load this suggestion')
        }
      })
    return () => {
      cancelled = true
    }
  }, [candidateId])

  async function draftProposal() {
    setPending('draft')
    setError(null)
    try {
      const payload = await draftSuggestion(candidateId)
      setDraft(payload.draft)
      setNotice(payload.notice)
      if (payload.draft) {
        setTitle(payload.draft.title)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not draft this proposal')
    } finally {
      setPending(null)
    }
  }

  async function createExperiment() {
    if (!suggestion) return
    setPending('accept')
    setError(null)
    try {
      const created = await acceptSuggestion(candidateId, {
        candidateFingerprint: suggestion.candidateFingerprint,
        title,
        notes,
        usedAiDraft: draft != null,
      })
      setCreatedId(created.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create this experiment')
    } finally {
      setPending(null)
    }
  }

  if (!suggestion) {
    return (
      <div className="space-y-4">
        <Link to="/lab" className="text-sm text-zinc-500 hover:underline">Personal Lab</Link>
        {error ? <LoadErrorNotice message={error} /> : <p className="text-sm text-zinc-600">Loading suggestion…</p>}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/lab" className="text-sm text-zinc-500 hover:underline">Personal Lab</Link>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {suggestion.presentation === 'challenge' ? 'Challenge' : 'Observation'}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{suggestion.title}</h1>
      </div>
      {error ? <LoadErrorNotice message={error} /> : null}
      {notice ? <p className="text-sm text-zinc-700">{notice}</p> : null}
      {createdId ? (
        <p className="text-sm text-zinc-700">
          Experiment created. <Link to={`/lab/experiments/${createdId}`} className="underline">Open it</Link>
        </p>
      ) : null}
      <ReviewBlock label="Why this was suggested" text={suggestion.why} />
      <ReviewBlock label="Question" text={suggestion.question} />
      <ReviewBlock label="Hypothesis" text={suggestion.hypothesis} />
      <ReviewBlock label="Protocol" text={suggestion.protocol.instructions} />
      <ReviewBlock label="Duration / window" text={suggestion.protocol.durationLabel} />
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Required measurements</h2>
        {suggestion.protocol.requirements.map((requirement) => (
          <p key={requirement.label} className="text-sm text-zinc-800">{requirement.label}</p>
        ))}
      </section>
      {suggestion.protocol.contextControls.length > 0 ? (
        <ReviewBlock label="Context controls" text={suggestion.protocol.contextControls.map((item) => item.tagKey).join(', ')} />
      ) : (
        <ReviewBlock label="Context controls" text="None" />
      )}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Supporting evidence</h2>
        {suggestion.evidence.map((item) => (
          <p key={item.ref} className="text-sm text-zinc-800">{item.label}</p>
        ))}
      </section>
      <ReviewBlock label="Limitations" text={suggestion.limitations} />
      {suggestion.linkedGoalLabel ? <ReviewBlock label="Linked goal" text={suggestion.linkedGoalLabel} /> : null}
      {suggestion.linkedBenchmarkLabel ? <ReviewBlock label="Linked benchmark" text={suggestion.linkedBenchmarkLabel} /> : null}
      {draft ? <ReviewBlock label="Example wording" text={draft.rationale} /> : null}
      <label className="block text-sm font-medium" htmlFor="suggestion-title">Title</label>
      <input id="suggestion-title" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" value={title} onChange={(event) => setTitle(event.target.value)} />
      <label className="block text-sm font-medium" htmlFor="suggestion-notes">Notes</label>
      <textarea id="suggestion-notes" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} />
      <p className="text-sm text-zinc-600">Changing the protocol, duration, threshold, or measurements belongs in the manual experiment form. That creates an owner experiment, not this suggestion.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButtonClass} disabled={pending != null} onClick={() => void draftProposal()}>
          Draft proposal
        </button>
        <button type="button" className={primaryButtonClass} disabled={pending != null || createdId != null} onClick={() => void createExperiment()}>
          Create experiment
        </button>
        <Link to="/lab/experiments/new" className={secondaryButtonClass}>Manual experiment</Link>
      </div>
    </div>
  )
}

function ReviewBlock({ label, text }: { label: string; text: string }) {
  return (
    <section className="space-y-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</h2>
      <p className="text-sm text-zinc-800">{text}</p>
    </section>
  )
}
