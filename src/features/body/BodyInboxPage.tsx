import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  measuredAtFromPhoenixLocal,
  phoenixDateTimeLocal,
  stagedFormValue,
} from '@/domain/body-capture'
import { dangerButtonClass, quietButtonClass } from '@/lib'
import { commitBodyInbox, discardBodyInbox, fetchBodyInboxItem, type BodyInboxDetail } from './api'
import { MeasureForm } from './MeasureForm'
import { reviewMeasurePreset } from './measure-preset'

const fieldClass =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900'

export function BodyInboxPage() {
  const { captureId = '' } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState<BodyInboxDetail | null>(null)
  const [measuredAt, setMeasuredAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'save' | 'discard' | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchBodyInboxItem(captureId)
      .then((next) => {
        if (!cancelled) {
          setItem(next)
          setMeasuredAt(phoenixDateTimeLocal(next.capturedAt))
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load this capture')
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
  }, [captureId])

  if (loading) {
    return <p className="text-sm text-zinc-600">Loading capture…</p>
  }
  if (!item) {
    return <p className="text-sm text-red-800">{error ?? 'Capture not found'}</p>
  }

  const preset = reviewMeasurePreset(item.metrics.map((metric) => metric.key))
  const initialValues: Record<string, string> = { notes: item.notes ?? '' }
  for (const metric of item.metrics) {
    initialValues[metric.key] = stagedFormValue({ key: metric.key, value: metric.value, unit: metric.unit })
  }

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <div>
        <Link to="/body" className={quietButtonClass}>
          Body
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Review capture</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {item.status === 'pending'
            ? 'This capture has not been added to Body yet.'
            : item.status === 'committed'
              ? 'This capture is already in Body.'
              : 'This capture was discarded and was not added to Body.'}
        </p>
      </div>

      {item.status === 'committed' ? (
        <p className="text-sm text-zinc-700">
          <Link to="/body" className={quietButtonClass}>
            Open Body
          </Link>
        </p>
      ) : null}

      {item.status === 'pending' ? (
        <>
          <label className="block text-sm">
            <span className="text-zinc-600">Measured at</span>
            <input
              className={`${fieldClass} mt-1`}
              type="datetime-local"
              value={measuredAt}
              onChange={(event) => setMeasuredAt(event.target.value)}
            />
          </label>
          <MeasureForm
            key={item.id}
            preset={preset.preset}
            focusKey={item.metrics[0]?.key ?? null}
            initialValues={initialValues}
            initialCustomKeys={preset.customKeys}
            editing={false}
            busy={busy === 'save'}
            onCancel={() => navigate('/body')}
            onSubmit={async (body) => {
              setBusy('save')
              setError(null)
              try {
                await commitBodyInbox(item.id, {
                  measuredAt: measuredAtFromPhoenixLocal(measuredAt),
                  notes: body.notes,
                  metrics: body.metrics,
                })
                navigate('/body')
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'Could not save this capture')
              } finally {
                setBusy(null)
              }
            }}
          />
          {error ? <p className="text-sm text-red-800">{error}</p> : null}
          <button
            type="button"
            className={dangerButtonClass}
            disabled={busy != null}
            onClick={() => {
              setBusy('discard')
              setError(null)
              discardBodyInbox(item.id)
                .then(() => {
                  setItem({ ...item, status: 'discarded', canCommit: false, canDiscard: false })
                })
                .catch((caught: unknown) => {
                  setError(caught instanceof Error ? caught.message : 'Could not discard this capture')
                })
                .finally(() => setBusy(null))
            }}
          >
            Discard capture
          </button>
        </>
      ) : null}
    </section>
  )
}
