import { Link } from 'react-router-dom'
import { INSIGHTS_EMPTY_COPY, type ProactiveInsight } from '@/domain/insights'
import { quietButtonClass } from '@/lib'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'

export function InsightsSection({ insights }: { insights: ProactiveInsight[] }) {
  const prefix = useAppPathPrefix()
  return (
    <section className="space-y-3" aria-label="Insights">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Insights</h2>
        <p className="mt-1 text-sm text-zinc-600">Observed changes and patterns from the evidence already recorded.</p>
      </div>
      {insights.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">{INSIGHTS_EMPTY_COPY}</p>
      ) : (
        <div className="space-y-3">
          {insights.map((insight) => (
            <article
              key={insight.id}
              className={[
                'rounded-lg border bg-white p-4',
                insight.signal === 'positive'
                  ? 'signal-positive-surface border-zinc-200'
                  : insight.signal === 'negative'
                    ? 'signal-negative-surface border-zinc-200'
                    : 'border-zinc-200',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{insight.title}</p>
                {insight.signal === 'positive' ? (
                  <span className="trend-toward text-xs font-semibold">↑ Positive signal</span>
                ) : insight.signal === 'negative' ? (
                  <span className="trend-away text-xs font-semibold">↓ Needs attention</span>
                ) : null}
              </div>
              <h3 className="mt-1 text-sm font-semibold text-zinc-900">{insight.summary}</h3>
              <dl className="mt-3 space-y-1 text-sm text-zinc-700">
                {insight.evidence.map((item) => (
                  <div key={`${insight.id}-${item.label}`}>
                    <dt className="text-zinc-500">{item.label}</dt>
                    <dd>
                      {item.value}
                      {item.detail ? <span className="text-zinc-500"> · {item.detail}</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-zinc-500">{insight.periodLabel}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Link to={prefixedPath(prefix, insight.detailPath)} className={`${quietButtonClass} inline-flex min-h-11 items-center`}>
                  Explore
                </Link>
                {insight.goalPath ? (
                  <Link to={prefixedPath(prefix, insight.goalPath)} className={`${quietButtonClass} inline-flex min-h-11 items-center`}>
                    View goal
                  </Link>
                ) : null}
                {insight.askHealth ? (
                  <Link
                    to={prefixedPath(prefix, `/ask-health?${askSearch(insight)}`)}
                    className={`${quietButtonClass} inline-flex min-h-11 items-center`}
                  >
                    Ask Health about this
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function askSearch(insight: ProactiveInsight): string {
  const ask = insight.askHealth
  if (!ask) {
    return ''
  }
  const params = new URLSearchParams()
  params.set('lens', ask.lens)
  params.set('range', ask.range)
  params.set('question', ask.suggestedQuestion)
  return params.toString()
}
