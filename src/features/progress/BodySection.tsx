import type { ProgressOverview } from '@/domain/progress'
import { kilogramsToPounds } from '@/domain/units'
import { remainingCount } from './copy'
import type { EvidenceTopic } from './EvidencePanel'
import { bodyMetricLabel, formatBodyCanonical, formatBodyMetricChange, formatCalendarDate, formatSigned } from './format'
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

      <div className={showHistoryChart ? 'grid gap-4 lg:grid-cols-[minmax(16rem,24rem)_minmax(0,1fr)] lg:items-start' : undefined}>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Weight</h3>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {weight.latest ? formatBodyCanonical(weight.latest.unit, weight.latest.value) : 'No measurement'}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {weight.latest ? formatCalendarDate(weight.latest.calendarDate) : 'Import Body history to begin'}
          </p>
          {trendReady ? (
            <div className="mt-4 border-t border-zinc-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Derived trend</p>
              <p className="mt-1 text-lg font-semibold tracking-tight">
                {formatSigned(kilogramsToPounds(trend.value.slopePerWeek), 2, 'lb')}/week
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {trend.value.measurementCount} measurements · {trend.value.spanDays} days
              </p>
            </div>
          ) : (
            <HistoryMeter overview={overview} />
          )}
        </div>
        {showHistoryChart ? <WeightHistoryChart points={points} trendAvailable={trendReady} /> : null}
      </div>

      {change.status === 'available' ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 md:max-w-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Period change</h3>
          <p className="mt-2 text-xl font-semibold tracking-tight">
            {formatSigned(kilogramsToPounds(change.value.change), 1, 'lb')}
          </p>
          <p className="mt-1 text-sm text-zinc-600">Compared with the start of this range</p>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Period comparison unavailable until a previous measurement exists.</p>
      )}

      {weight.observations.length > 0 ? (
        <button
          type="button"
          className="text-sm font-medium text-zinc-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
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
        <h3 className="text-sm font-semibold tracking-tight">Body composition</h3>
        {overview.body.metrics.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No additional body metrics in this history.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(6rem,1fr)_minmax(6rem,1fr)] gap-3 border-b border-zinc-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 md:grid">
              <span>Metric</span>
              <span>Current</span>
              <span>Change</span>
            </div>
            <ul>
              {overview.body.metrics.map((metric) => {
                const current = metric.latest
                  ? formatBodyCanonical(metric.latest.unit, metric.latest.value)
                  : '—'
                const changeValue =
                  metric.comparison.status === 'available' ? metric.comparison.value.change : null
                const changeLabel = formatBodyMetricChange(
                  metric.latest?.unit ?? (metric.comparison.status === 'available' ? metric.comparison.value.unit : ''),
                  changeValue,
                )
                return (
                  <li key={metric.key} className="border-b border-zinc-100 last:border-b-0">
                    <button
                      type="button"
                      className="grid w-full grid-cols-2 gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900 md:grid-cols-[minmax(0,1.4fr)_minmax(6rem,1fr)_minmax(6rem,1fr)] md:items-baseline md:gap-3"
                      onClick={() =>
                        onEvidence({
                          title: bodyMetricLabel(metric.key),
                          facts: [
                            { label: 'Current', value: current },
                            { label: 'Change', value: changeLabel },
                          ],
                          evidence: metric.latest
                            ? [
                                {
                                  domain: 'body',
                                  measurementId: metric.latest.measurementId,
                                  measurementSessionId: metric.latest.measurementSessionId,
                                  date: metric.latest.calendarDate,
                                },
                              ]
                            : [],
                        })
                      }
                    >
                      <span className="text-zinc-600">{bodyMetricLabel(metric.key)}</span>
                      <span className="text-right font-medium text-zinc-900 md:text-left">{current}</span>
                      <span className="col-span-2 text-xs text-zinc-500 md:col-span-1 md:text-sm md:text-zinc-700">
                        <span className="md:hidden">Change </span>
                        {changeLabel}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}

function HistoryMeter({ overview }: { overview: ProgressOverview }) {
  const { observations, requirements, trend } = overview.body.weight
  const have = observations.length
  const need = requirements.minimumMeasurements
  const remaining = remainingCount(trend)
  if (have === 0) {
    return <p className="mt-3 text-sm text-zinc-500">No measurements yet</p>
  }
  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="text-sm text-zinc-600">Building weight history</p>
      <div
        className="mt-2 flex gap-1"
        role="img"
        aria-label={`${have} of ${need} measurements`}
      >
        {Array.from({ length: need }, (_, index) => (
          <span
            key={index}
            className={index < have ? 'h-1.5 flex-1 rounded-full bg-zinc-900' : 'h-1.5 flex-1 rounded-full bg-zinc-200'}
          />
        ))}
      </div>
      <p className="mt-2 text-sm text-zinc-600">
        {have} of {need} measurements
        {remaining != null && remaining > 0 ? ` · ${remaining} more needed` : ''}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        At least {requirements.minimumSpanDays} days of history required
      </p>
    </div>
  )
}
