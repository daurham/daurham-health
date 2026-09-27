import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCalendarRange } from '@/domain/calendar-format'
import { LoadErrorNotice, primaryButtonClass, secondaryButtonClass } from '@/lib'
import { prominentRetests, type BenchmarkRetestView } from '@/domain/lab-retests'
import { fetchBenchmarks, fetchExperiments, fetchRetests, type BenchmarkSummary, type ExperimentSummary } from './api'
import { RetestList } from './RetestSection'

function statusLabel(status: string): string {
  return status.slice(0, 1).toUpperCase() + status.slice(1)
}

export function LabPage() {
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([])
  const [benchmarks, setBenchmarks] = useState<BenchmarkSummary[]>([])
  const [retests, setRetests] = useState<BenchmarkRetestView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchExperiments(), fetchBenchmarks(), fetchRetests()])
      .then(([experimentList, benchmarkList, retestList]) => {
        if (!cancelled) {
          setExperiments(experimentList.experiments)
          setBenchmarks(benchmarkList.benchmarks)
          setRetests(retestList.retests)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load Personal Lab')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const current = experiments.filter((item) => item.status === 'active' || item.status === 'scheduled')
  const completed = experiments.filter((item) => item.status === 'completed')
  const closed = experiments.filter((item) => item.status === 'inconclusive' || item.status === 'abandoned' || item.status === 'superseded')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Personal Lab</h1>
          <p className="mt-1 text-sm text-zinc-600">Experiments and repeatable benchmarks</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/lab/experiments/new" className={primaryButtonClass}>
            New experiment
          </Link>
          <Link to="/lab/benchmarks/new" className={secondaryButtonClass}>
            New benchmark
          </Link>
        </div>
      </div>
      {error ? <LoadErrorNotice message={error} /> : null}
      {loading ? <p className="text-sm text-zinc-600">Loading lab…</p> : null}
      <RetestList views={prominentRetests(retests)} />
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Active / ready to review</h2>
        {current.length === 0 ? <p className="text-sm text-zinc-600">No scheduled or active experiments.</p> : <ExperimentList items={current} />}
      </section>
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Completed</h2>
        {completed.length === 0 ? <p className="text-sm text-zinc-600">No completed experiments.</p> : <ExperimentList items={completed} />}
      </section>
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Inconclusive / stopped</h2>
        {closed.length === 0 ? <p className="text-sm text-zinc-600">No inconclusive or stopped experiments.</p> : <ExperimentList items={closed} />}
      </section>
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Benchmarks</h2>
        {benchmarks.length === 0 ? (
          <p className="text-sm text-zinc-600">No benchmarks yet.</p>
        ) : (
          <ul className="space-y-2">
            {benchmarks.map((benchmark) => (
              <li key={benchmark.id} className="rounded-lg border border-zinc-200 bg-white p-3">
                <Link to={`/lab/benchmarks/${benchmark.id}`} className="font-medium text-zinc-900 hover:underline">
                  {benchmark.title}
                </Link>
                <p className="mt-1 text-sm text-zinc-600">
                  {benchmark.domain} · v{benchmark.currentVersion}
                  {benchmark.isActive ? '' : ' · archived'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ExperimentList({ items }: { items: ExperimentSummary[] }) {
  return (
    <ul className="space-y-2">
      {items.map((experiment) => (
        <li key={experiment.id} className="rounded-lg border border-zinc-200 bg-white p-3">
          <Link to={`/lab/experiments/${experiment.id}`} className="font-medium text-zinc-900 hover:underline">
            {experiment.title}
          </Link>
          <p className="mt-1 text-sm text-zinc-600">{experiment.question}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {statusLabel(experiment.status)}
            {experiment.windowStart && experiment.windowEnd
              ? ` · ${formatCalendarRange(experiment.windowStart, experiment.windowEnd)}`
              : ''}
          </p>
        </li>
      ))}
    </ul>
  )
}
