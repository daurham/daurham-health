import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DataQualityIssue, DataQualityResponse, DataQualityReviewStatus } from '@/domain/data-quality'
import { healthFetch, primaryButtonClass, quietButtonClass, readApiError, secondaryButtonClass } from '@/lib'

async function fetchQuality(): Promise<DataQualityResponse> {
  const response = await healthFetch('/api/data-quality')
  if (!response.ok) throw new Error(await readApiError(response))
  const body = await response.json() as { quality: DataQualityResponse }
  return body.quality
}

async function reviewIssue(
  issue: DataQualityIssue,
  status: DataQualityReviewStatus,
): Promise<DataQualityResponse> {
  const response = await healthFetch('/api/data-quality/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint: issue.fingerprint, status }),
  })
  if (!response.ok) throw new Error(await readApiError(response))
  const body = await response.json() as { quality: DataQualityResponse }
  return body.quality
}

function classificationLabel(issue: DataQualityIssue): string {
  if (issue.classification === 'needs_confirmation') return 'Needs confirmation'
  if (issue.classification === 'possible_duplicate') return 'Possible duplicate'
  if (issue.classification === 'source_discontinuity') return 'Source change'
  return 'Plausible but unusual'
}

function IssueCard({
  issue,
  busy,
  onReview,
}: {
  issue: DataQualityIssue
  busy: boolean
  onReview: (status: DataQualityReviewStatus) => void
}) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{classificationLabel(issue)}</p>
          <h2 className="mt-1 font-semibold tracking-tight text-zinc-900">{issue.title}</h2>
        </div>
        <p className="text-xs text-zinc-500">{issue.date}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{issue.detail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {issue.href ? (
          <Link to={issue.href} className={secondaryButtonClass}>Open source</Link>
        ) : null}
        <button
          type="button"
          className={primaryButtonClass}
          disabled={busy}
          onClick={() => onReview('confirmed_valid')}
        >
          Confirm valid
        </button>
        <button
          type="button"
          className={quietButtonClass}
          disabled={busy}
          onClick={() => onReview('excluded_from_analysis')}
        >
          Exclude from future intelligence
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Review decisions annotate analysis only. They do not delete or edit the original Health record.
      </p>
    </article>
  )
}

export function DataQualityPage() {
  const [quality, setQuality] = useState<DataQualityResponse | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchQuality()
      .then((next) => {
        if (!cancelled) setQuality(next)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load data quality')
      })
    return () => { cancelled = true }
  }, [])

  async function decide(issue: DataQualityIssue, status: DataQualityReviewStatus) {
    setBusy(issue.fingerprint)
    setError(null)
    try {
      setQuality(await reviewIssue(issue, status))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the review')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data Quality</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          Review records that are unusual, incomplete, duplicated, future-dated, or affected by a source change. Flags are prompts to verify—not automatic corrections.
        </p>
      </div>

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

      {!quality && !error ? (
        <p className="text-sm text-zinc-500">Checking recent Health data…</p>
      ) : quality?.issues.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="font-medium text-zinc-900">No unresolved quality flags</p>
          <p className="mt-1 text-sm text-zinc-600">The watchdog found nothing in its recent review window that currently needs your confirmation.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {quality?.issues.map((issue) => (
            <IssueCard
              key={issue.fingerprint}
              issue={issue}
              busy={busy === issue.fingerprint}
              onReview={(status) => void decide(issue, status)}
            />
          ))}
        </div>
      )}

      {quality && quality.reviewed.length > 0 ? (
        <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <summary className="cursor-pointer text-sm font-medium text-zinc-800">
            Reviewed flags · {quality.reviewed.length}
          </summary>
          <ul className="mt-3 space-y-2">
            {quality.reviewed.map((issue) => (
              <li key={issue.fingerprint} className="rounded-md border border-zinc-200 bg-white px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{issue.title}</p>
                  <p className="text-xs text-zinc-500">
                    {issue.reviewStatus === 'excluded_from_analysis' ? 'Excluded from future intelligence' : 'Confirmed valid'}
                  </p>
                </div>
                <p className="mt-1 text-sm text-zinc-600">{issue.detail}</p>
                {issue.href ? <Link to={issue.href} className="mt-2 inline-flex text-sm underline">Open source</Link> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
