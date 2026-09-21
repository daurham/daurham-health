import type { ProgressOverview } from '@/domain/progress'
import { kilogramsToPounds } from '@/domain/units'
import { remainingCount } from './copy'
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
  const trendReady = trend.status === 'available'
  const showHistoryChart = weight.observations.length >= 2

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Body</h2>
        <p className="mt-1 hidden text-sm text-zinc-600 md:block">
          Recorded measurements stay separate from derived trend.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Latest weight</h3>
        <p className="mt-2 text-xl font-semibold tracking-tight">
          {weight.latest ? formatBodyCanonical(weight.latest.unit, weight.latest.value) : 'No measurement'}
        </p>
        <p className="mt-1 text-sm text-zinc-600">
          {weight.latest ? formatCalendarDate(weight.latest.calendarDate) : 'Import Body history to begin'}
        </p>
        {!trendReady ? (
          <p className="mt-2 text-sm text-zinc-500">{historyBuildingCopy(overview)}</p>
        ) : null}
      </div>

      {trendReady ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Derived trend</h3>
          <p className="mt-2 text-xl font-semibold tracking-tight">
            {formatSigned(kilogramsToPounds(trend.value.slopePerWeek), 2, 'lb')}/week
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {trend.value.measurementCount} measurements · {trend.value.spanDays} days
          </p>
        </div>
      ) : null}

      {change.status === 'available' ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Period change</h3>
          <p className="mt-2 text-xl font-semibold tracking-tight">
            {formatSigned(kilogramsToPounds(change.value.change), 1, 'lb')}
          </p>
          <p className="mt-1 text-sm text-zinc-600">Compared with the start of this range</p>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Period comparison unavailable until a previous measurement exists.</p>
      )}

      {showHistoryChart ? (
        <WeightHistoryChart points={points} trendAvailable={trendReady} />
      ) : null}

      {weight.observations.length > 0 ? (
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
      ) : null}

      <section>
        <h3 className="text-sm font-semibold tracking-tight">Other metrics</h3>
        {overview.body.metrics.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No additional body metrics in this history.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {overview.body.metrics.map((metric) => (
              <li key={metric.key} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-zinc-600">{bodyMetricLabel(metric.key)}</span>
                <span className="font-medium text-zinc-900">{compactMetricValue(metric)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function historyBuildingCopy(overview: ProgressOverview): string {
  const { trend, observations, requirements } = overview.body.weight
  if (observations.length === 0) {
    return 'No measurements yet'
  }
  if (observations.length === 1) {
    return 'History building · one recorded measurement is not enough for a chart or derived trend'
  }
  const remaining = remainingCount(trend)
  if (remaining != null && remaining > 0) {
    return `Recorded history · ${remaining} more measurement${remaining === 1 ? '' : 's'} needed for a derived trend`
  }
  return `Recorded history · ${requirements.minimumMeasurements} measurements across ${requirements.minimumSpanDays} days are required for a derived trend`
}

function compactMetricValue(metric: ProgressOverview['body']['metrics'][number]): string {
  if (metric.comparison.status === 'available') {
    const current = metric.comparison.value.current
    return current ? formatBodyCanonical(metric.comparison.value.unit, current.value) : '—'
  }
  if (metric.comparison.status === 'insufficient_data') {
    return metric.comparison.observations === 1
      ? '1 recorded'
      : `${metric.comparison.observations} recorded`
  }
  return '—'
}
