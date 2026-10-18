import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { RESULT_CAUSALITY_FOOTER } from '@/domain/experiment-results'
import { experimentComparisonCopy } from '@/domain/experiment-comparison'
import { feedbackPromptCopy, type OutcomeFeedbackAnswer } from '@/domain/experiment-outcome-feedback'
import { feedbackHistoryCopy } from '@/domain/experiment-evidence-memory'
import { currentOutcomeComparisonCopy, type CurrentOutcomeComparison } from '@/domain/experiment-current-outcomes'
import { dailyContextTagLabel, type DailyContextTagKey } from '@/domain/context'
import { LoadErrorNotice, primaryButtonClass, secondaryButtonClass } from '@/lib'
import {
  commitExperimentResult,
  fetchExperimentResult,
  invalidateExperimentResult,
  previewExperimentResult,
  submitExperimentOutcomeFeedback,
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
  const [feedbackAnswer, setFeedbackAnswer] = useState<OutcomeFeedbackAnswer | ''>('')
  const [feedbackNote, setFeedbackNote] = useState('')
  const [feedbackBusy, setFeedbackBusy] = useState(false)

  useEffect(() => {
    if (!resultId) return
    let cancelled = false
    fetchExperimentResult(resultId)
      .then((next) => {
        if (!cancelled) {
          setResult(next)
          if (next.outcomeFeedbackLatest?.action !== 'withdrawn') {
            setFeedbackAnswer(next.outcomeFeedbackLatest?.unloggedFactors ?? '')
            setFeedbackNote(next.outcomeFeedbackLatest?.ownerNote ?? '')
          }
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load the result')
      })
    return () => {
      cancelled = true
    }
  }, [resultId])

  async function submitFeedback(action: 'record' | 'withdraw') {
    if (!resultId || !result) return
    setFeedbackBusy(true)
    setError(null)
    try {
      await submitExperimentOutcomeFeedback(resultId, {
        action, expectedVersion: result.outcomeFeedbackLatest?.version ?? 0, confirmFeedback: true,
        ...(action === 'record' ? { unloggedFactors: feedbackAnswer as OutcomeFeedbackAnswer,
          ownerNote: feedbackAnswer === 'other_changes' ? feedbackNote : null } : {}),
      })
      setResult(await fetchExperimentResult(resultId))
      if (action === 'withdraw') { setFeedbackAnswer(''); setFeedbackNote('') }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save feedback')
    } finally {
      setFeedbackBusy(false)
    }
  }

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
      {result.currentOutcomeComparison ? <CurrentOutcomeComparisonSection comparison={result.currentOutcomeComparison} /> : null}
      {(result.outcomeFeedbackHistory?.status !== 'unavailable' &&
        (result.outcomeFeedbackReadiness?.state === 'ready' ||
        (result.outcomeFeedbackLatest && result.outcomeFeedbackLatest.action !== 'withdrawn'))) ? (
        <section className="space-y-3 rounded-lg border border-zinc-200 p-3 text-sm">
          <h2 className="font-semibold">Optional follow-up review</h2>
          <p className="text-zinc-700">{feedbackPromptCopy()}</p>
          {result.outcomeFeedbackLatest?.action !== 'withdrawn' && result.outcomeFeedbackLatest ? (
            <p className="text-xs text-zinc-500">An answer was recorded. You can revise or withdraw it without changing the experiment result.</p>
          ) : null}
          {result.outcomeFeedbackReadiness?.state === 'ready' ? (
            <>
              <label className="block space-y-1">
                <span>Were any other important factors unlogged?</span>
                <select className={fieldClass} value={feedbackAnswer}
                  onChange={(event) => setFeedbackAnswer(event.target.value as OutcomeFeedbackAnswer | '')}>
                  <option value="">Choose an answer</option>
                  <option value="none_reported">No other changes I recall</option>
                  <option value="other_changes">Yes, other changes or circumstances</option>
                  <option value="unsure">I'm not sure</option>
                </select>
              </label>
              {feedbackAnswer === 'other_changes' ? (
                <label className="block space-y-1">
                  <span>Optional context (500 characters max)</span>
                  <textarea className={fieldClass} value={feedbackNote} maxLength={500}
                    onChange={(event) => setFeedbackNote(event.target.value)} />
                </label>
              ) : null}
              <button type="button" className={primaryButtonClass}
                disabled={feedbackBusy || !feedbackAnswer} onClick={() => void submitFeedback('record')}>
                {feedbackBusy ? 'Saving…' : result.outcomeFeedbackLatest ? 'Revise feedback' : 'Save feedback'}
              </button>
            </>
          ) : (
            <p className="text-zinc-600">The original record is no longer eligible for a new review. Recorded feedback can still be withdrawn.</p>
          )}
          {result.outcomeFeedbackLatest && result.outcomeFeedbackLatest.action !== 'withdrawn' ? (
            <button type="button" className={secondaryButtonClass}
              disabled={feedbackBusy} onClick={() => void submitFeedback('withdraw')}>
              Withdraw previous feedback
            </button>
          ) : null}
          <p className="text-xs text-zinc-500">Your answer is voluntary. It does not alter targets, rewards, results or treatment decisions.</p>
        </section>
      ) : null}
      {result.outcomeFeedbackHistory && result.outcomeFeedbackHistory.status !== 'empty' ? (
        <section className="space-y-2 rounded-lg border border-zinc-200 p-3 text-sm">
          <h2 className="font-semibold">Owner feedback history</h2>
          <p className="text-zinc-600">{feedbackHistoryCopy(result.outcomeFeedbackHistory)}</p>
          {result.outcomeFeedbackHistory.status === 'partial' ? (
            <p className="text-xs text-zinc-500">Showing only the most recent 25 entries, not the complete audit.</p>
          ) : null}
          {result.outcomeFeedbackHistory.status === 'complete' ||
            result.outcomeFeedbackHistory.status === 'partial' ? (
            <details>
              <summary className="cursor-pointer text-sm font-medium">Review saved versions</summary>
              <ol className="mt-2 space-y-2">
                {result.outcomeFeedbackHistory.events.map((entry) => (
                  <li key={entry.version} className="rounded border border-zinc-100 p-2">
                    <p className="font-medium">
                      Version {entry.version} · {entry.action} · {entry.recordedAt.slice(0, 10)}
                    </p>
                    <p className="text-zinc-600">
                      {entry.action === 'withdrawn' ? 'Owner withdrew this answer.' :
                        entry.unloggedFactors === 'none_reported' ? 'No additional factors recalled.' :
                        entry.unloggedFactors === 'other_changes' ? 'Other changes or circumstances reported.' :
                        'Owner was unsure of other factors.'}
                    </p>
                    {entry.action !== 'withdrawn' && entry.ownerNote ? (
                      <p className="whitespace-pre-wrap text-zinc-600">{entry.ownerNote}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
          <p className="text-xs text-zinc-500">The history describes owner-reported context, not a proven benefit or medical recommendation.</p>
        </section>
      ) : null}
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


/** Explicitly descriptive, opt-in disclosure: no positive/negative clinical
 * verdict and no automatic writes to Lab, Goals, Coach or XP.
 */
export function CurrentOutcomeComparisonSection({comparison}: {comparison: CurrentOutcomeComparison}) {
  return (
    <details className="rounded-lg border border-zinc-200 p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Current-record before/after comparison</summary>
      <p className="mt-2 text-zinc-600">{currentOutcomeComparisonCopy(comparison)}</p>
      {comparison.state === 'available' ? (
        <>
          <p className="mt-2 text-xs text-zinc-500">
            As of {comparison.asOf}. Baseline {comparison.baselineWindow?.start}–{comparison.baselineWindow?.end};
            follow-up {comparison.followUpWindow?.start}–{comparison.followUpWindow?.end}.
            Observed-day averages only; missing days are not zero.
          </p>
          <ul className="mt-2 space-y-2">
            {comparison.metrics.map((metric) => (
              <li key={metric.requirementId} className="rounded border border-zinc-100 p-2">
                <p className="font-medium">{metric.metricKey.replaceAll('_',' ')}</p>
                <p className="text-zinc-700">
                  Before: {metric.beforeMean} {metric.unit} ({metric.beforeDays} days).
                  After: {metric.afterMean} {metric.unit} ({metric.afterDays} days).
                  Recorded difference: {metric.change > 0 ? '+' : ''}{metric.change} {metric.unit}.
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </details>
  )
}

export function ResultBody({ result }: { result: ExperimentResultView }) {
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
            <p className="font-medium">{item.label || 'Recorded outcome'}</p>
            <SummaryLines summary={item.summary} />
            <p className="mt-1 text-zinc-600">
              Evidence {item.evaluationStatus}
              {item.criterionStatus === 'pass' ? ' · Criterion met' : item.criterionStatus === 'fail' ? ' · Criterion not met' : ''}
            </p>
          </article>
        ))}
      </section>
      {result.comparisonSnapshotStatus === 'not_recorded' ? (
        <p className="text-sm text-zinc-600">A before/after coverage assessment was not recorded with this historical result. It cannot be reconstructed as if it were available at the time.</p>
      ) : result.comparisonSnapshotStatus === 'unavailable_integrity_check' ? (
        <p role="alert" className="text-sm text-zinc-700">The stored before/after assessment could not be verified. It is unavailable, not an accepted comparison.</p>
      ) : null}
      {result.comparisonReview ? (
        <section className="space-y-1 rounded-lg border border-zinc-200 p-3 text-sm">
          <h2 className="font-semibold text-zinc-900">Before/after recording coverage</h2>
          <p>{experimentComparisonCopy(result.comparisonReview)}</p>
          {result.comparisonReview.metrics.map((metric) => (
            <p key={metric.requirementId} className="text-zinc-600">
              {metric.outcomeKind === 'sleep_metric' ? 'Sleep' : 'Nutrition'} · {metric.metricKey}:
              {' '}{metric.beforeDays}/{metric.beforeExpected} prior {metric.outcomeKind === 'sleep_metric' ? 'eligible nights' : 'full days'},
              {' '}{metric.afterDays}/{metric.afterExpected} post-change {metric.outcomeKind === 'sleep_metric' ? 'eligible nights' : 'full days'}.
            </p>
          ))}
          {result.comparisonSnapshotStatus === 'verified' ? (
            <p className="text-zinc-500">
              Recorded with this result on {result.comparisonSnapshot?.recordedHealthDate}.
              {' '}Implementation source: {result.comparisonSnapshot?.implementation.provenance}.
              {' '}This is a preserved coverage assessment, not proof that the change worked.
            </p>
          ) : (
            <p className="text-zinc-500">Preview only: coverage not yet saved, and not proof that the change worked.</p>
          )}
        </section>
      ) : null}
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
      {(result.limitations?.length ?? 0) > 0 ? (
        <section className="space-y-1 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Limitations</h2>
          <ul className="list-disc pl-5">
            {result.limitations?.map((item) => (
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
