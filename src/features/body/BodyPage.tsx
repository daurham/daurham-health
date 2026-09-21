import { useEffect, useMemo, useState } from 'react'
import { displayValueForMetric } from '@/domain/body-metrics'
import type {
  BodyMeasurementSession,
  FitProfilePreviewCandidate,
  FitProfilePreviewResponse,
} from '@/domain/body'
import { cn } from '@/lib'
import {
  commitFitProfile,
  fetchBodyMeasurements,
  previewFitProfile,
} from './api'

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function formatNumber(value: number, maxFractionDigits: number): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: 0,
  })
}

function formatMetric(session: BodyMeasurementSession, key: string, maxFractionDigits: number) {
  const metric = session.metrics.find((item) => item.key === key)
  if (!metric) {
    return '—'
  }
  const display = displayValueForMetric(metric.unit, metric.value)
  return `${formatNumber(display.value, maxFractionDigits)} ${display.unit}`
}

function formatWhen(measuredAt: Date, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || undefined,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(measuredAt)
  } catch {
    return measuredAt.toISOString()
  }
}

function metricByKey(candidate: FitProfilePreviewCandidate, key: string) {
  return candidate.metrics.find((metric) => metric.key === key)
}

export function BodyPage() {
  const [sessions, setSessions] = useState<BodyMeasurementSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [timezone] = useState(browserTimeZone)
  const [preview, setPreview] = useState<FitProfilePreviewResponse | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null)

  async function reloadHistory() {
    const next = await fetchBodyMeasurements()
    setSessions(next)
  }

  useEffect(() => {
    let cancelled = false
    fetchBodyMeasurements()
      .then((next) => {
        if (!cancelled) {
          setSessions(next)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load measurements')
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

  const selectedFingerprints = useMemo(
    () => Object.entries(selected).filter(([, value]) => value).map(([key]) => key),
    [selected],
  )

  async function onPreview(nextFile: File) {
    setError(null)
    setPreview(null)
    setFile(nextFile)
    setBusy('preview')
    try {
      const result = await previewFitProfile(nextFile, timezone)
      setPreview(result)
      const initial: Record<string, boolean> = {}
      for (const candidate of result.candidates) {
        initial[candidate.fingerprint] = candidate.selectedByDefault
      }
      setSelected(initial)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preview failed')
    } finally {
      setBusy(null)
    }
  }

  async function onCommit() {
    if (!file || selectedFingerprints.length === 0) {
      return
    }
    setError(null)
    setBusy('commit')
    try {
      await commitFitProfile(file, timezone, selectedFingerprints)
      setPreview(null)
      setFile(null)
      setSelected({})
      await reloadHistory()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Body</h1>
        <p className="mt-2 text-zinc-600">Weight, measurements, and composition.</p>
      </div>

      <ImportPanel
        timezone={timezone}
        busy={busy}
        preview={preview}
        selected={selected}
        onSelectFile={(next) => {
          if (next) {
            void onPreview(next)
          }
        }}
        onToggle={(fingerprint, value) => {
          setSelected((current) => ({ ...current, [fingerprint]: value }))
        }}
        onCommit={() => {
          void onCommit()
        }}
        canCommit={selectedFingerprints.length > 0 && busy == null}
      />

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Measurement history</h2>
        {loading ? (
          <p className="mt-3 text-sm text-zinc-600">Loading measurements…</p>
        ) : sessions.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">
            {error ? 'History is unavailable until Body tables are migrated.' : 'No measurements yet.'}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {sessions.map((session) => (
              <HistoryCard key={session.id} session={session} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function ImportPanel({
  timezone,
  busy,
  preview,
  selected,
  onSelectFile,
  onToggle,
  onCommit,
  canCommit,
}: {
  timezone: string
  busy: 'preview' | 'commit' | null
  preview: FitProfilePreviewResponse | null
  selected: Record<string, boolean>
  onSelectFile: (file: File | null) => void
  onToggle: (fingerprint: string, value: boolean) => void
  onCommit: () => void
  canCommit: boolean
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-lg font-semibold tracking-tight">Import Scale Data</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Fit Profile XLSX. Times are interpreted in {timezone}.
      </p>
      <label className="mt-4 block">
        <span className="sr-only">Choose Fit Profile XLSX</span>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          disabled={busy != null}
          onChange={(event) => {
            onSelectFile(event.target.files?.[0] ?? null)
            event.target.value = ''
          }}
        />
      </label>

      {busy === 'preview' ? (
        <p className="mt-4 text-sm text-zinc-600">Reading workbook…</p>
      ) : null}

      {preview ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-medium text-zinc-800">Fit Profile Import</p>
          {preview.candidates.map((candidate) => (
            <PreviewRow
              key={candidate.fingerprint}
              candidate={candidate}
              checked={Boolean(selected[candidate.fingerprint])}
              onToggle={onToggle}
            />
          ))}
          <p className="text-sm text-zinc-600">
            {preview.newCount} new measurement{preview.newCount === 1 ? '' : 's'}
            {' · '}
            {preview.duplicateCount} duplicate{preview.duplicateCount === 1 ? '' : 's'}
          </p>
          <button
            type="button"
            className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300 sm:w-auto"
            disabled={!canCommit}
            onClick={onCommit}
          >
            {busy === 'commit' ? 'Importing…' : 'Import'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function PreviewRow({
  candidate,
  checked,
  onToggle,
}: {
  candidate: FitProfilePreviewCandidate
  checked: boolean
  onToggle: (fingerprint: string, value: boolean) => void
}) {
  const weight = metricByKey(candidate, 'weight')
  const fat = metricByKey(candidate, 'body_fat_percentage')
  const muscle = metricByKey(candidate, 'muscle_mass')
  const water = metricByKey(candidate, 'body_water_percentage')
  return (
    <label className="flex gap-3 rounded-md border border-zinc-200 p-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(event) => onToggle(candidate.fingerprint, event.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium">
            {formatWhen(new Date(candidate.measuredAt), candidate.timezone)}
          </p>
          <p className={cn('text-xs font-medium', candidate.duplicate ? 'text-amber-700' : 'text-emerald-700')}>
            {candidate.duplicate ? 'Already imported' : 'New'}
          </p>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
          <Metric label="Weight" value={weight ? `${formatNumber(weight.displayValue, 1)} lb` : '—'} note="measured" />
          <Metric label="Body Fat" value={fat ? `${formatNumber(fat.displayValue, 1)} %` : '—'} note="BIA" />
          <Metric label="Muscle Mass" value={muscle ? `${formatNumber(muscle.displayValue, 1)} lb` : '—'} note="BIA" />
          <Metric label="Body Water" value={water ? `${formatNumber(water.displayValue, 1)} %` : '—'} note="BIA" />
        </dl>
      </div>
    </label>
  )
}

function HistoryCard({ session }: { session: BodyMeasurementSession }) {
  const extra = session.metrics.filter(
    (metric) =>
      metric.key !== 'weight' &&
      metric.key !== 'body_fat_percentage' &&
      metric.key !== 'muscle_mass' &&
      metric.key !== 'body_water_percentage',
  )
  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="font-medium">{formatWhen(session.measuredAt, session.timezone)}</p>
      {session.deviceName ? (
        <p className="mt-1 text-xs text-zinc-500">{session.deviceName}</p>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
        <Metric label="Weight" value={formatMetric(session, 'weight', 1)} note="measured" />
        <Metric label="Body Fat" value={formatMetric(session, 'body_fat_percentage', 1)} note="BIA" />
        <Metric label="Muscle Mass" value={formatMetric(session, 'muscle_mass', 1)} note="BIA" />
        <Metric label="Body Water" value={formatMetric(session, 'body_water_percentage', 1)} note="BIA" />
      </dl>
      {extra.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-zinc-600">More metrics</summary>
          <dl className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {extra.map((metric) => {
              const display = displayValueForMetric(metric.unit, metric.value)
              return (
                <div key={metric.key} className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{metric.key.replace(/_/g, ' ')}</dt>
                  <dd>
                    {formatNumber(display.value, 2)} {display.unit}
                    {metric.valueKind === 'measured' ? '' : ' · BIA'}
                  </dd>
                </div>
              )
            })}
          </dl>
        </details>
      ) : null}
    </li>
  )
}

function Metric({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: 'measured' | 'BIA'
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
      <p className="text-[11px] text-zinc-400">{note === 'measured' ? 'scale' : 'BIA estimated'}</p>
    </div>
  )
}
