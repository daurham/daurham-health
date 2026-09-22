import { useEffect, useState } from 'react'
import { parseAppleHealthFile, previewAppleHealth } from '@/domain/apple-health'
import type { AppleHealthPreview } from '@/domain/apple-health/preview'
import {
  commitAppleHealthRecords,
  fetchAppleHealthStatus,
  lookupAppleHealthDuplicates,
  type AppleHealthStatus,
} from './api'

function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

function PreviewReport({ preview }: { preview: AppleHealthPreview }) {
  const counts = preview.counts
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <dt className="text-zinc-500">Records encountered</dt>
      <dd>{formatCount(counts.encountered)}</dd>
      <dt className="text-zinc-500">Date range</dt>
      <dd className="break-all">{preview.dateRange ? `${preview.dateRange.start} → ${preview.dateRange.end}` : '—'}</dd>
      <dt className="text-zinc-500">Steps</dt>
      <dd>{formatCount(counts.steps)}</dd>
      <dt className="text-zinc-500">Active energy</dt>
      <dd>{formatCount(counts.activeEnergy)}</dd>
      <dt className="text-zinc-500">Exercise time</dt>
      <dd>{formatCount(counts.exerciseTime)}</dd>
      <dt className="text-zinc-500">Walking/running distance</dt>
      <dd>{formatCount(counts.walkingRunningDistance)}</dd>
      <dt className="text-zinc-500">Resting HR</dt>
      <dd>{formatCount(counts.restingHeartRate)}</dd>
      <dt className="text-zinc-500">Sleep samples</dt>
      <dd>{formatCount(counts.sleep)}</dd>
      <dt className="text-zinc-500">Workouts</dt>
      <dd>{formatCount(counts.workouts)}</dd>
      <dt className="text-zinc-500">Body skipped</dt>
      <dd>{formatCount(counts.bodyOwned)}</dd>
      <dt className="text-zinc-500">Nutrition skipped</dt>
      <dd>{formatCount(counts.nutritionOwned)}</dd>
      <dt className="text-zinc-500">Unsupported</dt>
      <dd>{formatCount(counts.unsupported)}</dd>
      <dt className="text-zinc-500">Validation failures</dt>
      <dd>{formatCount(counts.malformed)}</dd>
      <dt className="text-zinc-500">Duplicate fingerprints</dt>
      <dd>{formatCount(counts.duplicateFingerprints)}</dd>
      <dt className="text-zinc-500">Estimated commit rows</dt>
      <dd>{formatCount(counts.estimatedCommitRows)}</dd>
      <dt className="text-zinc-500">Overlapping activity sources</dt>
      <dd>{formatCount(preview.overlappingActivityGroups)}</dd>
      <dt className="text-zinc-500">Sources</dt>
      <dd>{preview.sources.join(', ') || '—'}</dd>
      <dt className="text-zinc-500">Devices</dt>
      <dd className="break-all">{preview.devices.join(', ') || '—'}</dd>
      <dt className="text-zinc-500">Unknown sleep categories</dt>
      <dd>{preview.unknownSleepCategories.join(', ') || '—'}</dd>
    </dl>
  )
}

export function SettingsPage() {
  const [status, setStatus] = useState<AppleHealthStatus | null>(null)
  const [preview, setPreview] = useState<AppleHealthPreview | null>(null)
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reloadStatus() {
    setStatus(await fetchAppleHealthStatus())
  }

  useEffect(() => {
    let cancelled = false
    fetchAppleHealthStatus()
      .then((next) => {
        if (!cancelled) {
          setStatus(next)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load import status')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onFile(file: File) {
    setError(null)
    setPreview(null)
    setBusy('preview')
    setProgress('Parsing export locally…')
    try {
      const parsed = parseAppleHealthFile(new Uint8Array(await file.arrayBuffer()), file.name)
      const local = previewAppleHealth(parsed)
      setProgress('Checking existing fingerprints…')
      const existing = await lookupAppleHealthDuplicates(local.records.map((record) => record.fingerprint))
      const merged = previewAppleHealth(parsed, new Set(existing))
      setPreview(merged)
      setProgress(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preview failed')
      setProgress(null)
    } finally {
      setBusy(null)
    }
  }

  async function onCommit() {
    if (!preview) {
      return
    }
    setError(null)
    setBusy('commit')
    try {
      const result = await commitAppleHealthRecords(preview, preview.records, (done, total) => {
        setProgress(`Committing ${done.toLocaleString('en-US')} / ${total.toLocaleString('en-US')}`)
      })
      setProgress(
        `Imported ${result.insertedCount.toLocaleString('en-US')} new rows (${result.matchedCount.toLocaleString('en-US')} already present).`,
      )
      setPreview(null)
      await reloadStatus()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Commit failed')
    } finally {
      setBusy(null)
    }
  }

  const job = status?.job

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600">Owner data sources. Apple Health is not a primary Health destination.</p>
      </div>

      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <h2 className="text-base font-semibold">Data sources</h2>
          <h3 className="mt-1 text-sm font-medium text-zinc-800">Apple Health</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Parse an Apple export.zip or export.xml in the browser, then upload only supported Activity and Sleep
            records. Body weight and Nutrition types are skipped. Training sessions are never overwritten.
          </p>
        </div>

        {job ? (
          <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <p>
              Last import: {new Date(job.importedAt).toLocaleString()} · {job.status}
            </p>
            <p>
              {formatCount(job.insertedCount)} imported · {formatCount(job.activityCount)} activity ·{' '}
              {formatCount(job.sleepCount)} sleep · {formatCount(job.workoutCount)} workouts
            </p>
            <p>Date range in file metadata is stored with the import job, not as a Progress chart.</p>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No Apple Health import yet.</p>
        )}

        <label className="block text-sm">
          <span className="font-medium">Apple Health export</span>
          <input
            type="file"
            accept=".zip,.xml,application/zip,text/xml"
            disabled={busy !== null}
            className="mt-1 block w-full text-base"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                void onFile(file)
              }
              event.target.value = ''
            }}
          />
        </label>

        {progress ? <p className="text-sm text-zinc-600">{progress}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        {preview ? (
          <div className="space-y-3">
            <PreviewReport preview={preview} />
            <button
              type="button"
              disabled={busy !== null || preview.counts.estimatedCommitRows === 0}
              onClick={() => {
                void onCommit()
              }}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Commit import
            </button>
          </div>
        ) : null}
      </section>
    </section>
  )
}
