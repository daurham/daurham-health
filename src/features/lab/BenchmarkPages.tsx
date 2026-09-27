import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BENCHMARK_DOMAINS, type BenchmarkDomain } from '@/domain/lab'
import { LoadErrorNotice, primaryButtonClass, quietButtonClass, secondaryButtonClass } from '@/lib'
import {
  addBenchmarkProtocolVersion,
  archiveBenchmark,
  createBenchmark,
  fetchBenchmark,
  fetchBenchmarkResults,
  fetchBenchmarkRetest,
  updateBenchmark,
  type BenchmarkDetail,
  type BenchmarkRetestDetail,
  type ResultHistory,
} from './api'
import { HistoricalRetestNote, RetestSection } from './RetestSection'
import { useLabCatalogs } from './catalogs'
import { ProtocolFields } from './ProtocolFields'
import { draftsFromVersion, fieldClass, newRequirementDraft, requirementPayload, describeRequirement, type RequirementDraft } from './protocol-form'

function optionalDays(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return Number(trimmed)
}

export function NewBenchmarkPage() {
  const catalogs = useLabCatalogs()
  const [title, setTitle] = useState('')
  const [domain, setDomain] = useState<BenchmarkDomain>('training')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [requirements, setRequirements] = useState<RequirementDraft[]>(() => [newRequirementDraft()])
  const [contextTags, setContextTags] = useState<string[]>([])
  const [minimum, setMinimum] = useState('')
  const [suggested, setSuggested] = useState('')
  const [saved, setSaved] = useState<BenchmarkDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const created = await createBenchmark({
        title,
        domain,
        description: description.trim() || null,
        instructions,
        requirements: requirementPayload(requirements, catalogs),
        contextTags,
        minimumRetestDays: optionalDays(minimum),
        suggestedRetestDays: optionalDays(suggested),
      })
      setSaved(created)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the benchmark')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">{saved.title}</h1>
        <p className="text-sm text-zinc-700">Protocol v1 is saved.</p>
        <Link to={`/lab/benchmarks/${saved.id}`} className={primaryButtonClass}>
          Open benchmark
        </Link>
      </section>
    )
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void onSubmit(event)}>
      <p className="text-sm text-zinc-500">
        <Link to="/lab" className="hover:underline">
          Personal Lab
        </Link>
        {' / New benchmark'}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">New benchmark</h1>
      {error ? <LoadErrorNotice message={error} /> : null}
      <label className="block text-sm font-medium text-zinc-800">
        Name
        <input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label className="block text-sm font-medium text-zinc-800">
        Domain
        <select className={fieldClass} value={domain} onChange={(event) => setDomain(event.target.value as BenchmarkDomain)}>
          {BENCHMARK_DOMAINS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-zinc-800">
        Description
        <textarea className={`${fieldClass} min-h-16 py-2`} value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <ProtocolFields
        instructions={instructions}
        onInstructions={setInstructions}
        requirements={requirements}
        onRequirements={setRequirements}
        contextTags={contextTags}
        onContextTags={setContextTags}
        catalogs={catalogs}
        showRetest
        minimumRetestDays={minimum}
        suggestedRetestDays={suggested}
        onMinimumRetestDays={setMinimum}
        onSuggestedRetestDays={setSuggested}
      />
      <button type="submit" className={primaryButtonClass} disabled={saving}>
        {saving ? 'Saving…' : 'Save protocol v1'}
      </button>
    </form>
  )
}

export function BenchmarkDetailPage() {
  const { benchmarkId } = useParams()
  const catalogs = useLabCatalogs()
  const [benchmark, setBenchmark] = useState<BenchmarkDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [requirements, setRequirements] = useState<RequirementDraft[]>([])
  const [contextTags, setContextTags] = useState<string[]>([])
  const [minimum, setMinimum] = useState('')
  const [suggested, setSuggested] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [history, setHistory] = useState<ResultHistory | null>(null)
  const [retest, setRetest] = useState<BenchmarkRetestDetail | null>(null)
  const [showInvalidated, setShowInvalidated] = useState(false)

  useEffect(() => {
    if (!benchmarkId) {
      return
    }
    let cancelled = false
    fetchBenchmark(benchmarkId)
      .then((next) => {
        if (!cancelled) {
          setBenchmark(next)
          setSelectedVersionId(next.currentVersion?.id ?? null)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load the benchmark')
        }
      })
    fetchBenchmarkResults(benchmarkId)
      .then((next) => {
        if (!cancelled) {
          setHistory(next)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistory(null)
        }
      })
    fetchBenchmarkRetest(benchmarkId)
      .then((next) => {
        if (!cancelled) {
          setRetest(next)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRetest(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [benchmarkId])

  if (!benchmark) {
    return error ? <LoadErrorNotice message={error} /> : <p className="text-sm text-zinc-600">Loading benchmark…</p>
  }

  const selected = benchmark.versions.find((item) => item.id === selectedVersionId) ?? benchmark.currentVersion
  const current = benchmark.currentVersion

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        <Link to="/lab" className="hover:underline">
          Personal Lab
        </Link>
        {' / '}
        {benchmark.title}
      </p>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{benchmark.title}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {benchmark.domain}
          {benchmark.isActive ? '' : ' · archived'}
          {current ? ` · Current protocol v${current.version}` : ''}
        </p>
        {benchmark.description ? <p className="mt-2 text-sm text-zinc-700">{benchmark.description}</p> : null}
      </div>
      {error ? <LoadErrorNotice message={error} /> : null}
      <section>
        <h2 className="text-sm font-semibold text-zinc-900">Protocol history</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {[...benchmark.versions].reverse().map((version) => (
            <li key={version.id}>
              <button type="button" className="hover:underline" onClick={() => setSelectedVersionId(version.id)}>
                v{version.version}
                {version.isCurrent ? ' · current' : ''}
              </button>
            </li>
          ))}
        </ul>
      </section>
      {selected ? (
        <section className="space-y-2 text-sm text-zinc-700">
          <h2 className="font-semibold text-zinc-900">v{selected.version}</h2>
          <p className="whitespace-pre-wrap">{selected.instructions}</p>
          <ul>
            {selected.requirements.map((item) => (
              <li key={item.id}>{describeRequirement(item)}</li>
            ))}
          </ul>
          {selected.minimumRetestDays || selected.suggestedRetestDays ? (
            <p>
              Retest {selected.minimumRetestDays ? `minimum ${selected.minimumRetestDays} days` : ''}
              {selected.suggestedRetestDays ? ` · suggested ${selected.suggestedRetestDays} days` : ''}
            </p>
          ) : null}
        </section>
      ) : null}
      {retest ? (
        <RetestSection view={retest.current} archived={!benchmark.isActive} benchmarkId={benchmark.id} domain={benchmark.domain} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {retest || !(benchmark.domain === 'training' && benchmark.isActive && current) ? null : (
          <Link to={`/training/new?type=experiment&benchmarkProtocolVersionId=${current.id}`} className={primaryButtonClass}>
            Run benchmark
          </Link>
        )}
        {retest ? null : (
          <Link to={`/lab/benchmarks/${benchmark.id}/record`} className={secondaryButtonClass}>
            Record result from existing data
          </Link>
        )}
        {benchmark.isActive ? (
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => {
              setInstructions(current?.instructions ?? '')
              setRequirements(draftsFromVersion(current))
              setContextTags(current?.contextControls.map((item) => item.tagKey) ?? [])
              setMinimum(current?.minimumRetestDays == null ? '' : String(current.minimumRetestDays))
              setSuggested(current?.suggestedRetestDays == null ? '' : String(current.suggestedRetestDays))
              setEditing(true)
            }}
          >
            New protocol version
          </button>
        ) : null}
        {benchmark.isActive ? (
          <button
            type="button"
            className={quietButtonClass}
            onClick={() => {
              void archiveBenchmark(benchmark.id)
                .then(setBenchmark)
                .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not archive the benchmark'))
            }}
          >
            Archive
          </button>
        ) : null}
      </div>
      {history ? (
        <BenchmarkHistory
          history={history}
          retestHistory={retest?.history ?? []}
          showInvalidated={showInvalidated}
          onToggle={() => setShowInvalidated((value) => !value)}
        />
      ) : null}
      {editing && benchmark.isActive ? (
        <form
          className="space-y-4 rounded-lg border border-zinc-200 p-4"
          onSubmit={(event) => {
            event.preventDefault()
            void addBenchmarkProtocolVersion(benchmark.id, {
              instructions,
              requirements: requirementPayload(requirements, catalogs),
              contextTags,
              minimumRetestDays: optionalDays(minimum),
              suggestedRetestDays: optionalDays(suggested),
            })
              .then((next) => {
                setBenchmark(next)
                setSelectedVersionId(next.currentVersion?.id ?? null)
                setEditing(false)
              })
              .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not save the protocol version'))
          }}
        >
          <h2 className="text-sm font-semibold">Updated protocol</h2>
          <ProtocolFields
            instructions={instructions}
            onInstructions={setInstructions}
            requirements={requirements}
            onRequirements={setRequirements}
            contextTags={contextTags}
            onContextTags={setContextTags}
            catalogs={catalogs}
            showRetest
            minimumRetestDays={minimum}
            suggestedRetestDays={suggested}
            onMinimumRetestDays={setMinimum}
            onSuggestedRetestDays={setSuggested}
          />
          <button type="submit" className={primaryButtonClass}>
            Save next version
          </button>
        </form>
      ) : null}
      <DescriptionEditor benchmark={benchmark} onSaved={setBenchmark} onError={setError} />
      <section>
        <h2 className="text-sm font-semibold text-zinc-900">Training sessions</h2>
        <ul className="mt-1 text-sm text-zinc-700">
          {benchmark.sessions.length === 0 ? (
            <li>None</li>
          ) : (
            benchmark.sessions.map((session) => (
              <li key={session.id}>
                <Link to={`/training/${session.id}`} className="hover:underline">
                  {session.sessionName || 'Benchmark workout'}
                </Link>{' '}
                · {session.workoutDate}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  )
}

function DescriptionEditor({
  benchmark,
  onSaved,
  onError,
}: {
  benchmark: BenchmarkDetail
  onSaved: (benchmark: BenchmarkDetail) => void
  onError: (message: string) => void
}) {
  const [title, setTitle] = useState(benchmark.title)
  const [description, setDescription] = useState(benchmark.description ?? '')
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        void updateBenchmark(benchmark.id, { title, description: description.trim() || null })
          .then(onSaved)
          .catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'Could not update the benchmark'))
      }}
    >
      <h2 className="text-sm font-semibold text-zinc-900">Name</h2>
      <input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} />
      <textarea className={`${fieldClass} min-h-16 py-2`} value={description} onChange={(event) => setDescription(event.target.value)} />
      <button type="submit" className={secondaryButtonClass}>
        Save name
      </button>
    </form>
  )
}

function HistoricalVersionNote({
  versionId,
  history,
}: {
  versionId: string
  history: BenchmarkRetestDetail['history']
}) {
  const view = history.find((item) => item.protocolVersionId === versionId)
  if (!view) {
    return null
  }
  return <HistoricalRetestNote view={view} />
}

function BenchmarkHistory({
  history,
  retestHistory,
  showInvalidated,
  onToggle,
}: {
  history: ResultHistory
  retestHistory: BenchmarkRetestDetail['history']
  showInvalidated: boolean
  onToggle: () => void
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">Results</h2>
        <button type="button" className="text-sm text-zinc-500 hover:text-zinc-900" onClick={onToggle}>
          {showInvalidated ? 'Hide invalidated' : 'Show invalidated'}
        </button>
      </div>
      {history.protocolChangeNote ? <p className="text-sm text-zinc-600">{history.protocolChangeNote}</p> : null}
      {history.versions.map((version) => {
        const visible = version.results.filter((result) => showInvalidated || result.status === 'valid')
        return (
          <div key={version.protocolVersionId} className="space-y-2">
            <h3 className="text-sm font-medium">
              Protocol v{version.version}
              {version.isCurrent ? ' · current' : ''}
            </h3>
            {version.isCurrent ? null : <HistoricalVersionNote versionId={version.protocolVersionId} history={retestHistory} />}
            {version.validResultCount === 0 ? <p className="text-sm text-zinc-600">No results yet</p> : null}
            <ul className="space-y-2">
              {visible.map((result) => (
                <li key={result.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
                  {result.status === 'invalidated' ? <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Invalidated</p> : null}
                  <Link to={`/lab/benchmark-results/${result.id}`} className="font-medium hover:underline">
                    {result.resultDate}
                  </Link>
                  <ul>
                    {result.values.map((value) => (
                      <li key={value.requirementId}>
                        {value.label} {value.value} {value.unit}
                      </li>
                    ))}
                  </ul>
                  {result.deltas?.map((delta) => (
                    <p key={delta.requirementId} className="text-zinc-600">
                      {delta.label} {delta.absolute > 0 ? '+' : ''}
                      {delta.absolute}
                      {delta.percent == null ? '' : ` (${delta.percent > 0 ? '+' : ''}${delta.percent.toFixed(1)}%)`}
                    </p>
                  ))}
                  {result.invalidationReason ? <p className="text-zinc-600">{result.invalidationReason}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
