import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { RESULT_CAUSALITY_FOOTER } from '@/domain/experiment-results'
import { dailyContextTagLabel, type DailyContextTagKey } from '@/domain/context'
import { LoadErrorNotice, primaryButtonClass, secondaryButtonClass } from '@/lib'
import {
  commitExperimentResult,
  fetchExperimentResult,
  invalidateExperimentResult,
  previewExperimentResult,
  type ExperimentResultView,
} from './api'
import { fieldClass } from './protocol-form'

export function ReviewExperimentResultPage() {
  const { experimentId } = useParams()
  const navigate = useNavigate()
  const [protocolFollowed, setProtocolFollowed] = useState<'followed' | 'not_followed' | 'uncertain'>('followed')
  const [stoppedForSafety, setStoppedForSafety] = useState(false)
  const [safetyReason, setSafetyReason] = useState('')
  const [ownerNote, setOwnerNote] = useState('')
  const [effectiveEndDate, setEffectiveEndDate] = useState('')
  const [preview, setPreview] = useState<ExperimentResultView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const early = stoppedForSafety || protocolFollowed === 'not_followed'
  const body = {
    protocolFollowed,
    stoppedForSafety,
    safetyReason: safetyReason.trim() || null,
    ownerNote: ownerNote.trim() || null,
    effectiveEndDate: early ? effectiveEndDate : null,
  }

  useEffect(() => {
    if (!experimentId) return
    let cancelled = false
    previewExperimentResult(experimentId, body)
      .then((next) => {
        if (!cancelled) setPreview(next)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not preview the result')
      })
    return () => {
      cancelled = true
    }
    // Preview reloads when the owner attestation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId, protocolFollowed, stoppedForSafety, safetyReason, ownerNote, effectiveEndDate])

  async function onCommit(event: FormEvent) {
    event.preventDefault()
    if (!experimentId) return
    setBusy(true)
    setError(null)
    try {
      const committed = await commitExperimentResult(experimentId, body)
      if (committed.id) navigate(`/lab/experiment-results/${committed.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not commit the result')
      setBusy(false)
    }
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void onCommit(event)}>
      <p className="text-sm text-zinc-500">
        <Link to="/lab" className="hover:underline">Personal Lab</Link>
        {experimentId ? (
          <>
            {' / '}
            <Link to={`/lab/experiments/${experimentId}`} className="hover:underline">Experiment</Link>
          </>
        ) : null}
        {' / Review result'}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Review result</h1>
      {error ? <LoadErrorNotice message={error} /> : null}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-zinc-900">Protocol</legend>
        <label className="block text-sm text-zinc-800">
          Was the material protocol followed?
          <select className={fieldClass} value={protocolFollowed} onChange={(event) => setProtocolFollowed(event.target.value as typeof protocolFollowed)}>
            <option value="followed">Followed</option>
            <option value="not_followed">Not followed</option>
            <option value="uncertain">Uncertain</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input type="checkbox" checked={stoppedForSafety} onChange={(event) => setStoppedForSafety(event.target.checked)} />
          I stopped this experiment because of pain or another safety concern.
        </label>
        {stoppedForSafety ? (
          <label className="block text-sm text-zinc-800">
            Safety reason
            <input className={fieldClass} value={safetyReason} onChange={(event) => setSafetyReason(event.target.value)} maxLength={500} required />
          </label>
        ) : null}
        {early ? (
          <label className="block text-sm text-zinc-800">
            Date the experiment ended
            <input className={fieldClass} type="date" value={effectiveEndDate} onChange={(event) => setEffectiveEndDate(event.target.value)} required />
          </label>
        ) : null}
        <label className="block text-sm text-zinc-800">
          Note
          <textarea className={`${fieldClass} min-h-16 py-2`} value={ownerNote} onChange={(event) => setOwnerNote(event.target.value)} maxLength={2000} />
        </label>
      </fieldset>
      {preview ? <ResultBody result={preview} /> : <p className="text-sm text-zinc-600">Loading preview…</p>}
      <button type="submit" className={primaryButtonClass} disabled={busy || !preview?.canCommit}>
        {busy ? 'Saving…' : 'Commit result'}
      </button>
    </form>
  )
}

export function ExperimentResultDetailPage() {
  const { resultId } = useParams()
  const [result, setResult] = useState<ExperimentResultView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!resultId) return
    let cancelled = false
    fetchExperimentResult(resultId)
      .then((next) => {
        if (!cancelled) setResult(next)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load the result')
      })
    return () => {
      cancelled = true
    }
  }, [resultId])

  async function invalidate() {
    if (!resultId) return
    setError(null)
    try {
      setResult(await invalidateExperimentResult(resultId, reason))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not invalidate the result')
    }
  }

  if (!result) {
    return error ? <LoadErrorNotice message={error} /> : <p className="text-sm text-zinc-600">Loading result…</p>
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        <Link to="/lab" className="hover:underline">Personal Lab</Link>
        {' / Result'}
      </p>
      {error ? <LoadErrorNotice message={error} /> : null}
      <ResultBody result={result} />
      {result.status === 'valid' ? (
        <div className="space-y-2">
          <label className="block text-sm text-zinc-800">
            Invalidation reason
            <input className={fieldClass} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
          </label>
          <button type="button" className={secondaryButtonClass} onClick={() => void invalidate()}>
            Invalidate result
          </button>
        </div>
      ) : (
        <p className="text-sm text-zinc-600">This result is historical. The experiment is open for review again.</p>
      )}
    </div>
  )
}

function ResultBody({ result }: { result: ExperimentResultView }) {
  return (
    <div className="space-y-4">
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Result</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{result.classificationCopy?.title ?? result.title}</h1>
        {result.classificationCopy ? <p className="mt-1 text-sm text-zinc-700">{result.classificationCopy.detail}</p> : null}
        {result.message ? <p className="mt-1 text-sm text-zinc-600">{result.message}</p> : null}
      </section>
      <section className="space-y-1 text-sm text-zinc-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Question</h2>
        <p>{result.question}</p>
        {result.hypothesis ? (
          <>
            <h2 className="pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Hypothesis</h2>
            <p>{result.hypothesis}</p>
          </>
        ) : null}
      </section>
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What was observed</h2>
        {result.requirements.map((item) => (
          <article key={item.requirementId} className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
            <p className="font-medium">{item.label}</p>
            <SummaryLines summary={item.summary} />
            <p className="mt-1 text-zinc-600">
              Evidence {item.evaluationStatus}
              {item.criterionStatus === 'pass' ? ' · Criterion met' : item.criterionStatus === 'fail' ? ' · Criterion not met' : ''}
            </p>
          </article>
        ))}
      </section>
      {result.contextControls && result.contextControls.length > 0 ? (
        <section className="space-y-1 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Context recorded</h2>
          {result.contextControls.every((item) => item.recordedDayCount === 0) ? (
            <p>No matching context was recorded.</p>
          ) : (
            result.contextControls.map((item) => (
              <p key={item.tagKey}>
                {dailyContextTagLabel(item.tagKey as DailyContextTagKey)} {item.recordedDayCount} recorded {item.recordedDayCount === 1 ? 'day' : 'days'}
              </p>
            ))
          )}
        </section>
      ) : null}
      {result.limitations.length > 0 ? (
        <section className="space-y-1 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Limitations</h2>
          <ul className="list-disc pl-5">
            {result.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-sm text-zinc-600">Protocol v{result.protocolVersion}</p>
      {result.ownerNote ? <p className="text-sm text-zinc-700">{result.ownerNote}</p> : null}
      <p className="text-sm text-zinc-600">{result.footer || RESULT_CAUSALITY_FOOTER}</p>
    </div>
  )
}

function SummaryLines({ summary }: { summary: Record<string, unknown> }) {
  const lines = Object.entries(summary).filter(([, value]) => value != null && typeof value !== 'object')
  if (lines.length === 0) return null
  return (
    <ul className="mt-1 text-zinc-700">
      {lines.map(([key, value]) => (
        <li key={key}>
          {key}: {String(value)}
        </li>
      ))}
    </ul>
  )
}
