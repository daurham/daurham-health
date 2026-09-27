import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { dailyContextTagLabel, isDailyContextTagKey } from '@/domain/context'
import { formatBodyCanonical } from '@/features/progress/format'
import { LoadErrorNotice, primaryButtonClass, quietButtonClass, secondaryButtonClass } from '@/lib'
import {
  commitBenchmarkResult,
  fetchBenchmark,
  fetchBenchmarkResult,
  fetchLabProtocolVersion,
  invalidateBenchmarkResult,
  previewBenchmarkResult,
  type ResultDetail,
  type ResultPreview,
} from './api'
import { fieldClass } from './protocol-form'

export function RecordBenchmarkResultPage() {
  const { benchmarkId = '' } = useParams()
  const [search] = useSearchParams()
  const [title, setTitle] = useState('Benchmark')
  const [versions, setVersions] = useState<Array<{ id: string; version: number; isCurrent: boolean }>>([])
  const [protocolVersionId, setProtocolVersionId] = useState(search.get('protocolVersionId') ?? '')
  const [date, setDate] = useState(search.get('date') ?? '')
  const [workoutSessionId, setWorkoutSessionId] = useState(search.get('workoutSessionId') ?? '')
  const [measurementId, setMeasurementId] = useState('')
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [ownerAttested, setOwnerAttested] = useState(false)
  const [preview, setPreview] = useState<ResultPreview | null>(null)
  const [saved, setSaved] = useState<ResultDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void fetchBenchmark(benchmarkId)
      .then((benchmark) => {
        setTitle(benchmark.title)
        setVersions(benchmark.versions.map((version) => ({ id: version.id, version: version.version, isCurrent: version.isCurrent })))
        setProtocolVersionId((current) => current || benchmark.currentVersion?.id || benchmark.versions[benchmark.versions.length - 1]?.id || '')
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the benchmark'))
  }, [benchmarkId])

  async function runPreview() {
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      setPreview(await previewBenchmarkResult(benchmarkId, requestBody()))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not preview the result')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      setSaved(await commitBenchmarkResult(benchmarkId, requestBody()))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the result')
    } finally {
      setBusy(false)
    }
  }

  function requestBody() {
    return {
      protocolVersionId,
      date: date || null,
      workoutSessionId: workoutSessionId || null,
      measurementId: measurementId || null,
      evidenceSelections: selections,
      ownerAttested,
    }
  }

  return (
    <section className="space-y-5">
      <p className="text-sm text-zinc-500">
        <Link to={`/lab/benchmarks/${benchmarkId}`} className="hover:underline">
          {title}
        </Link>
        {' / Record result'}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Record result from existing data</h1>
      <p className="text-sm text-zinc-600">Health calculates the result from canonical observations. The result date comes from that evidence.</p>
      {error ? <LoadErrorNotice message={error} /> : null}
      {saved ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-700">Result saved for {saved.resultDate}.</p>
          <Link to={`/lab/benchmark-results/${saved.id}`} className={primaryButtonClass}>
            Open result
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block text-sm">
            Protocol version
            <select className={fieldClass} value={protocolVersionId} onChange={(event) => setProtocolVersionId(event.target.value)}>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version}
                  {version.isCurrent ? ' · current' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Date
            <input className={fieldClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="block text-sm">
            Workout id
            <input className={fieldClass} value={workoutSessionId} onChange={(event) => setWorkoutSessionId(event.target.value)} />
          </label>
          <label className="block text-sm">
            Measurement id
            <input className={fieldClass} value={measurementId} onChange={(event) => setMeasurementId(event.target.value)} />
          </label>
          <button type="button" className={secondaryButtonClass} disabled={busy || !protocolVersionId} onClick={() => void runPreview()}>
            Preview result
          </button>
          {preview ? (
            <PreviewPanel
              preview={preview}
              ownerAttested={ownerAttested}
              onAttest={setOwnerAttested}
              onSelect={(requirementId, sourceId) => setSelections((current) => ({ ...current, [requirementId]: sourceId }))}
            />
          ) : null}
          {preview?.canCommit ? (
            <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void save()}>
              Save result
            </button>
          ) : null}
        </div>
      )}
    </section>
  )
}

export function ReviewBenchmarkResultPage() {
  const [search] = useSearchParams()
  const protocolVersionId = search.get('protocolVersionId') ?? ''
  const workoutSessionId = search.get('workoutSessionId') ?? ''
  const [benchmarkId, setBenchmarkId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!protocolVersionId) {
      return
    }
    void fetchLabProtocolVersion(protocolVersionId)
      .then((version) => setBenchmarkId(version.benchmarkDefinitionId))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not open the benchmark protocol'))
  }, [protocolVersionId])

  if (!protocolVersionId || !workoutSessionId) {
    return <p className="text-sm text-zinc-600">Choose a benchmark workout to review.</p>
  }
  if (error) {
    return <LoadErrorNotice message={error} />
  }
  if (!benchmarkId) {
    return <p className="text-sm text-zinc-600">Loading benchmark…</p>
  }
  return <LinkedReview benchmarkId={benchmarkId} protocolVersionId={protocolVersionId} workoutSessionId={workoutSessionId} />
}

function LinkedReview({
  benchmarkId,
  protocolVersionId,
  workoutSessionId,
}: {
  benchmarkId: string
  protocolVersionId: string
  workoutSessionId: string
}) {
  const [preview, setPreview] = useState<ResultPreview | null>(null)
  const [saved, setSaved] = useState<ResultDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ownerAttested, setOwnerAttested] = useState(false)

  useEffect(() => {
    void previewBenchmarkResult(benchmarkId, { protocolVersionId, workoutSessionId, ownerAttested })
      .then(setPreview)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not preview the result'))
  }, [benchmarkId, protocolVersionId, workoutSessionId, ownerAttested])

  async function save() {
    setError(null)
    try {
      setSaved(await commitBenchmarkResult(benchmarkId, { protocolVersionId, workoutSessionId, ownerAttested }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the result')
    }
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-zinc-500">
        <Link to={`/training/${workoutSessionId}`} className="hover:underline">
          Workout
        </Link>
        {' / Review benchmark result'}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Review benchmark result</h1>
      {error ? <LoadErrorNotice message={error} /> : null}
      {saved ? (
        <Link to={`/lab/benchmark-results/${saved.id}`} className={primaryButtonClass}>
          Open result
        </Link>
      ) : preview ? (
        <>
          <PreviewPanel preview={preview} ownerAttested={ownerAttested} onAttest={setOwnerAttested} onSelect={() => undefined} />
          {preview.canCommit ? (
            <button type="button" className={primaryButtonClass} onClick={() => void save()}>
              Save result
            </button>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-zinc-600">Calculating the result from this workout…</p>
      )}
    </section>
  )
}

export function BenchmarkResultDetailPage() {
  const { resultId = '' } = useParams()
  const [result, setResult] = useState<ResultDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    void fetchBenchmarkResult(resultId)
      .then(setResult)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the result'))
  }, [resultId])

  async function invalidate() {
    setError(null)
    try {
      setResult(await invalidateBenchmarkResult(resultId, reason))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not invalidate the result')
    }
  }

  if (error && !result) {
    return <LoadErrorNotice message={error} />
  }
  if (!result) {
    return <p className="text-sm text-zinc-600">Loading result…</p>
  }
  const primary = result.values.filter((value) => value.role === 'primary_outcome')
  const secondary = result.values.filter((value) => value.role === 'secondary_outcome')
  return (
    <section className="space-y-5">
      <p className="text-sm text-zinc-500">
        <Link to={`/lab/benchmarks/${result.benchmarkDefinitionId}`} className="hover:underline">
          {result.benchmarkTitle}
        </Link>
        {' / Result'}
      </p>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{result.benchmarkTitle}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {result.resultDate} · Protocol v{result.protocolVersion} · {result.status === 'valid' ? 'Valid' : 'Invalidated'}
        </p>
      </div>
      {error ? <LoadErrorNotice message={error} /> : null}
      {result.status === 'invalidated' ? (
        <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-4 text-sm">
          <p className="font-semibold">Invalidated</p>
          <p className="mt-1">{result.invalidationReason || 'No reason was recorded.'}</p>
        </div>
      ) : null}
      <ResultValues title="Primary results" values={primary} />
      <ResultValues title="Secondary results" values={secondary} empty="Secondary value unavailable" />
      <section className="space-y-2 text-sm">
        <h2 className="font-semibold">Evidence</h2>
        {result.values.flatMap((value) => value.evidence).map((item, index) => (
          <EvidenceBlock key={`${item.evidenceKind}-${index}`} evidence={item} />
        ))}
      </section>
      {result.experiment ? (
        <p className="text-sm">
          Experiment{' '}
          <Link to={`/lab/experiments/${result.experiment.id}`} className="hover:underline">
            {result.experiment.title}
          </Link>
          . This result does not complete the experiment.
        </p>
      ) : null}
      <section className="text-sm">
        <h2 className="font-semibold">Context recorded that day</h2>
        {result.context.recorded ? (
          <div className="mt-1 space-y-1">
            <p>{result.context.tags.length > 0 ? result.context.tags.map(tagLabel).join(' · ') : 'Context was recorded.'}</p>
            {result.context.note ? <p className="text-zinc-600">{result.context.note}</p> : null}
            {result.context.controls.map((control) => (
              <p key={control.tagKey}>
                {tagLabel(control.tagKey)} — {control.recorded ? 'recorded' : 'not recorded'}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-1">No context was recorded.</p>
        )}
      </section>
      <p className="text-sm text-zinc-600">
        Protocol confirmation: {result.protocolConfirmationKind === 'linked_protocol' ? 'Linked protocol' : 'Owner attested'}
      </p>
      {result.deltas && result.deltas.length > 0 ? (
        <ul className="text-sm text-zinc-700">
          {result.deltas.map((delta) => (
            <li key={delta.requirementId}>
              {delta.label} {formatDelta(delta.absolute, delta.percent)}
            </li>
          ))}
        </ul>
      ) : null}
      {result.status === 'valid' ? (
        <div className="space-y-2">
          <label className="block text-sm">
            Invalidation reason
            <input className={fieldClass} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button type="button" className={quietButtonClass} onClick={() => void invalidate()}>
            Invalidate result
          </button>
        </div>
      ) : null}
    </section>
  )
}

function PreviewPanel({
  preview,
  ownerAttested,
  onAttest,
  onSelect,
}: {
  preview: ResultPreview
  ownerAttested: boolean
  onAttest: (value: boolean) => void
  onSelect: (requirementId: string, sourceId: string) => void
}) {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-4 text-sm">
      <p>
        {preview.resultDate ? preview.resultDate : 'Result date pending'} · Protocol v{preview.protocolVersion} · {preview.state}
      </p>
      {preview.message ? <p>{preview.message}</p> : null}
      <ul className="space-y-2">
        {preview.outcomes.map((outcome) => (
          <li key={outcome.requirementId}>
            <span className="font-medium">{outcome.label}</span>
            {outcome.status === 'available' && outcome.value != null && outcome.unit
              ? ` ${formatLabResult(outcome.value, outcome.unit)}`
              : outcome.role === 'secondary_outcome'
                ? ' — Secondary value unavailable'
                : ` — ${outcome.reason ?? outcome.status}`}
            {outcome.candidates.length > 1 ? (
              <span className="mt-1 flex flex-wrap gap-2">
                {outcome.candidates.map((candidate) => (
                  <button key={candidate.id} type="button" className={quietButtonClass} onClick={() => onSelect(outcome.requirementId, candidate.id)}>
                    {candidate.label}
                  </button>
                ))}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {preview.attestationRequired ? (
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={ownerAttested} onChange={(event) => onAttest(event.target.checked)} />
          <span>I performed this observation according to Benchmark protocol v{preview.protocolVersion}.</span>
        </label>
      ) : preview.confirmation === 'linked_protocol' ? (
        <p>Protocol confirmation: linked protocol</p>
      ) : null}
      {preview.context ? (
        <p>{preview.context.recorded ? preview.context.tags.map(tagLabel).join(' · ') || 'Context was recorded.' : 'No context was recorded.'}</p>
      ) : null}
      {preview.existingResultId ? (
        <Link to={`/lab/benchmark-results/${preview.existingResultId}`} className="hover:underline">
          Open existing result
        </Link>
      ) : null}
    </div>
  )
}

function ResultValues({
  title,
  values,
  empty,
}: {
  title: string
  values: ResultDetail['values']
  empty?: string
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      {values.length === 0 ? <p className="mt-1 text-sm text-zinc-600">{empty ?? 'None'}</p> : (
        <ul className="mt-1 text-sm">
          {values.map((value) => (
            <li key={value.requirementId}>
              {value.label} {formatLabResult(value.value, value.unit)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EvidenceBlock({ evidence }: { evidence: ResultDetail['values'][number]['evidence'][number] }) {
  const ref = evidence.evidenceRef
  const snapshot = evidence.evidenceSnapshot
  if (evidence.evidenceKind === 'training_session' && typeof ref.sessionId === 'string') {
    const sets = Array.isArray(snapshot.sets) ? snapshot.sets : []
    return (
      <p>
        Training evidence · {String(snapshot.sessionDate ?? evidence.observationDate)} · {String(snapshot.exerciseName ?? 'Exercise')} · {sets.length} sets
        {' '}
        <Link to={`/training/${ref.sessionId}`} className="hover:underline">
          Open workout
        </Link>
      </p>
    )
  }
  if (evidence.evidenceKind === 'body_metric') {
    return (
      <p>
        Body evidence · {evidence.observationDate} · {String(snapshot.metricKey ?? 'Measurement')} {String(snapshot.value ?? '')} {String(snapshot.unit ?? '')}
        {' '}
        <Link to="/body" className="hover:underline">
          Open Body
        </Link>
      </p>
    )
  }
  return (
    <p>
      {evidence.evidenceKind} · {evidence.observationDate}
    </p>
  )
}

function formatLabResult(value: number, unit: string): string {
  if (unit === 'kg' || unit === 'cm' || unit === 'percent') {
    return formatBodyCanonical(unit, value)
  }
  return `${value} ${unit}`
}

function formatDelta(absolute: number, percent: number | null): string {
  const signed = `${absolute > 0 ? '+' : ''}${absolute}`
  if (percent == null) {
    return signed
  }
  return `${signed} (${percent > 0 ? '+' : ''}${percent.toFixed(1)}%)`
}

function tagLabel(tag: string): string {
  return isDailyContextTagKey(tag) ? dailyContextTagLabel(tag) : tag
}
