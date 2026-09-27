import { Link } from 'react-router-dom'
import { formatFullCalendarDate } from '@/domain/calendar-format'
import { retestAgePhrase, type BenchmarkRetestView } from '@/domain/lab-retests'
import { formatBodyCanonical } from '@/features/progress/format'
import { primaryButtonClass, secondaryButtonClass } from '@/lib'

function formatRetestQuantity(value: number, unit: string): string {
  if (unit === 'kg' || unit === 'cm' || unit === 'percent') {
    return formatBodyCanonical(unit, value)
  }
  return `${value} ${unit}`
}

export function RetestSection({
  view,
  archived,
  benchmarkId,
  domain,
}: {
  view: BenchmarkRetestView
  archived: boolean
  benchmarkId: string
  domain: string
}) {
  const primary = view.latestResult?.primaryValues.map((item) => formatRetestQuantity(item.value, item.unit)).join(' · ') ?? ''
  return (
    <section className="space-y-2 rounded-lg border border-zinc-200 p-4 text-sm text-zinc-700">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Retest</h2>
      <p className="font-medium text-zinc-900">Protocol v{view.protocolVersion}</p>
      {archived ? (
        <p>This benchmark is archived. Automatic retest scheduling is off.</p>
      ) : (
        <RetestStatusCopy view={view} primary={primary} />
      )}
      {view.latestResult ? (
        <p>
          Last result {formatFullCalendarDate(view.latestResult.resultDate)}
          {primary ? ` · ${primary}` : ''}
        </p>
      ) : null}
      {view.minimumDate ? <p>Earliest suggested repeat {formatFullCalendarDate(view.minimumDate)}</p> : null}
      {view.suggestedDate ? <p>Suggested retest {formatFullCalendarDate(view.suggestedDate)}</p> : null}
      {archived ? null : (
        <div className="flex flex-wrap gap-2 pt-1">
          {domain === 'training' ? (
            <Link to={`/training/new?type=experiment&benchmarkProtocolVersionId=${view.protocolVersionId}`} className={primaryButtonClass}>
              Run benchmark
            </Link>
          ) : null}
          <Link to={`/lab/benchmarks/${benchmarkId}/record`} className={secondaryButtonClass}>
            Record from existing data
          </Link>
        </div>
      )}
    </section>
  )
}

function RetestStatusCopy({ view, primary }: { view: BenchmarkRetestView; primary: string }) {
  if (view.status === 'unconfigured') {
    return <p>No retest interval is configured for Protocol v{view.protocolVersion}.</p>
  }
  if (view.status === 'no_baseline') {
    return (
      <p>
        No valid result yet for Protocol v{view.protocolVersion}. Run the current protocol once to establish a baseline.
      </p>
    )
  }
  if (view.status === 'waiting_minimum') {
    return <p>Not yet at the minimum interval.</p>
  }
  if (view.status === 'available') {
    return <p>You can repeat this protocol now.</p>
  }
  return (
    <p>
      Retest suggested
      {primary ? ` · ${primary}` : ''}
    </p>
  )
}

export function HistoricalRetestNote({ view }: { view: BenchmarkRetestView }) {
  return (
    <p className="text-sm text-zinc-600">
      Protocol v{view.protocolVersion} keeps its own results. It does not schedule a current retest.
      {view.suggestedDate ? ` Suggested repeat ${formatFullCalendarDate(view.suggestedDate)}.` : ''}
    </p>
  )
}

export function RetestList({ views }: { views: BenchmarkRetestView[] }) {
  if (views.length === 0) {
    return null
  }
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Retests</h2>
      <ul className="space-y-2">
        {views.map((view) => (
          <li key={view.benchmarkDefinitionId} className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {view.status === 'due' ? 'Retest suggested' : 'Available'}
            </p>
            <Link to={`/lab/benchmarks/${view.benchmarkDefinitionId}`} className="font-medium text-zinc-900 hover:underline">
              {view.benchmarkTitle}
            </Link>
            <p className="mt-1 text-sm text-zinc-600">{retestListDetail(view)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function retestListDetail(view: BenchmarkRetestView): string {
  const protocol = `Protocol v${view.protocolVersion}`
  if (view.status === 'due' && view.daysSinceResult != null) {
    return `Last tested ${retestAgePhrase(view.daysSinceResult)} · ${protocol}`
  }
  if (view.suggestedRetestDays != null) {
    return `Can be repeated now · Suggested at ${view.suggestedRetestDays} days · ${protocol}`
  }
  return `Can be repeated now · ${protocol}`
}
