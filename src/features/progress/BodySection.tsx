import type { ProgressOverview } from '@/domain/progress'
import { kilogramsToPounds } from '@/domain/units'
import { bodyTrendCopy } from './copy'
import type { EvidenceTopic } from './EvidencePanel'
import { bodyMetricLabel, formatBodyCanonical, formatCalendarDate, formatSigned } from './format'
import { WeightHistoryChart } from './ProgressCharts'

export function BodySection({
  overview,
  onEvidence,
}: {
  overview: ProgressOverview
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const weight = overview.body.weight
  const trend = weight.trend
  const points = weight.observations.map((item) => ({
    date: item.calendarDate,
    valueLb: Number(
      kilogramsToPounds(item.value).toLocaleString('en-US', { maximumFractionDigits: 1, useGrouping: false }),
    ),
  }))
  const change = overview.body.comparison.weightChange

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Body</h2>
        <p className="mt-1 text-sm text-zinc-600">Recorded measurements stay separate from derived trend.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Latest weight</h3>
          <p className="mt-2 text-xl font-semibold tracking-tight">
            {weight.latest ? formatBodyCanonical(weight.latest.unit, weight.latest.value) : 'No measurement'}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {weight.latest ? formatCalendarDate(weight.latest.calendarDate) : 'Import Body history to begin'}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Trend</h3>
          {trend.status === 'available' ? (
            <>
              <p className="mt-2 text-xl font-semibold tracking-tight">
                {formatSigned(kilogramsToPounds(trend.value.slopePerWeek), 2, 'lb')}/week
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {trend.value.measurementCount} measurements · {trend.value.spanDays} days
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-xl font-semibold tracking-tight">Not ready</p>
              <p className="mt-1 text-sm text-zinc-600">{bodyTrendCopy(overview)}</p>
            </>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Period change</h3>
          {change.status === 'available' ? (
            <>
              <p className="mt-2 text-xl font-semibold tracking-tight">
                {formatSigned(kilogramsToPounds(change.value.change), 1, 'lb')}
              </p>
              <p className="mt-1 text-sm text-zinc-600">Compared with the start of this range</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-xl font-semibold tracking-tight">Not applicable</p>
              <p className="mt-1 text-sm text-zinc-600">Need a comparison point in the previous window.</p>
            </>
          )}
        </div>
      </div>

      <WeightHistoryChart points={points} />

      <button
        type="button"
        className="text-sm font-medium text-zinc-700 underline"
        onClick={() =>
          onEvidence({
            title: 'Weight measurements',
            facts: [
              {
                label: 'Count',
                value: String(weight.observations.length),
              },
              {
                label: 'Required for trend',
                value: `${weight.requirements.minimumMeasurements} measurements across ${weight.requirements.minimumSpanDays} days`,
              },
            ],
            evidence: weight.observations.map((item) => ({
              domain: 'body',
              measurementId: item.measurementId,
              measurementSessionId: item.measurementSessionId,
              date: item.calendarDate,
            })),
          })
        }
      >
        View measurement evidence
      </button>

      <section>
        <h3 className="text-sm font-semibold tracking-tight">Other metrics</h3>
        {overview.body.metrics.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No additional body metrics in this history.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {overview.body.metrics.map((metric) => (
              <li key={metric.key} className="rounded-lg border border-zinc-200 bg-white p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {bodyMetricLabel(metric.key)}
                </h4>
                {metric.comparison.status === 'available' ? (
                  <SparseMetric comparison={metric.comparison.value} />
                ) : (
                  <p className="mt-2 text-sm text-zinc-600">
                    {metric.comparison.status === 'insufficient_data'
                      ? `${metric.comparison.observations} recorded · need a previous value to show change`
                      : 'Unavailable'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SparseMetric({
  comparison,
}: {
  comparison: {
    unit: string
    current: { value: number } | null
    previous: { value: number } | null
    change: number | null
  }
}) {
  return (
    <dl className="mt-2 space-y-1 text-sm">
      <div className="flex justify-between gap-3">
        <dt className="text-zinc-500">Current</dt>
        <dd className="font-medium">
          {comparison.current ? formatBodyCanonical(comparison.unit, comparison.current.value) : '—'}
        </dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-zinc-500">Previous</dt>
        <dd>{comparison.previous ? formatBodyCanonical(comparison.unit, comparison.previous.value) : '—'}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-zinc-500">Change</dt>
        <dd>
          {comparison.change == null
            ? '—'
            : formatSigned(
                comparison.unit === 'kg' ? kilogramsToPounds(comparison.change) : comparison.change,
                1,
                comparison.unit === 'kg' ? 'lb' : comparison.unit === 'percent' ? '%' : '',
              )}
        </dd>
      </div>
    </dl>
  )
}
