import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { TranscriptionGuidance, TranscriptionJobResponse } from '@/domain/training-transcription'
import { commitImportedSession, createTranscriptionJob, fetchTranscriptionJob } from './api'
import { WorkoutEditor } from './WorkoutEditor'
import {
  buildManualWorkoutPayload,
  draftFromTranscription,
  type WorkoutDraft,
} from './draft'
import {
  clearStoredTranscriptionJobId,
  readStoredTranscriptionJobId,
  storeTranscriptionJobId,
} from './transcription-state'

const POLL_MS = 4000

export function ImportWorkoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [jobId, setJobId] = useState<string | null>(readStoredTranscriptionJobId())
  const [status, setStatus] = useState<'queued' | 'processing' | 'completed' | 'failed' | null>(null)
  const [draft, setDraft] = useState<WorkoutDraft | null>(null)
  const [guidance, setGuidance] = useState<TranscriptionGuidance[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const incomingFile = (location.state as { file?: File } | null)?.file

  useEffect(() => {
    if (!incomingFile || jobId) {
      return
    }
    void startJob(incomingFile)
    navigate('.', { replace: true, state: {} })
  }, [incomingFile, jobId, navigate])

  useEffect(() => {
    if (!jobId || draft || status === 'failed') {
      return
    }
    let cancelled = false
    let timer: number | undefined

    async function poll() {
      try {
        const result = await fetchTranscriptionJob(jobId!)
        if (cancelled) {
          return
        }
        setPollError(null)
        applyJob(result)
        if (result.job.status === 'queued' || result.job.status === 'processing') {
          timer = window.setTimeout(() => {
            void poll()
          }, POLL_MS)
        }
      } catch (caught) {
        if (cancelled) {
          return
        }
        setPollError(caught instanceof Error ? caught.message : 'Could not check analysis status')
        timer = window.setTimeout(() => {
          void poll()
        }, POLL_MS)
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) {
        window.clearTimeout(timer)
      }
    }
  }, [jobId, draft, status])

  function applyJob(result: TranscriptionJobResponse) {
    setStatus(result.job.status)
    if (result.job.status === 'failed') {
      setFailure(result.failure?.message ?? 'Workout analysis failed. Try the photo again.')
      return
    }
    if (result.job.status === 'completed') {
      if (!result.canAdapt || !result.draft) {
        setFailure(result.failure?.message ?? 'This photo could not be turned into an editable workout.')
        return
      }
      setGuidance(result.analysis?.guidance ?? [])
      setDraft(draftFromTranscription(result.draft, result.template))
    }
  }

  async function startJob(file: File) {
    setError(null)
    setFailure(null)
    setUploading(true)
    try {
      const created = await createTranscriptionJob(file)
      storeTranscriptionJobId(created.id)
      setJobId(created.id)
      setStatus(created.status)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start analysis')
    } finally {
      setUploading(false)
    }
  }

  async function onCommit() {
    if (!draft || !jobId) {
      return
    }
    setError(null)
    setSaving(true)
    try {
      const payload = buildManualWorkoutPayload(draft)
      const session = await commitImportedSession(jobId, payload)
      clearStoredTranscriptionJobId()
      navigate(`/training/${session.id}`, { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save workout')
    } finally {
      setSaving(false)
    }
  }

  function resetFlow() {
    clearStoredTranscriptionJobId()
    setJobId(null)
    setStatus(null)
    setDraft(null)
    setGuidance([])
    setFailure(null)
    setError(null)
    setPollError(null)
  }

  const analyzing = jobId != null && draft == null && failure == null

  return (
    <section className="space-y-6">
      <p className="text-sm text-zinc-500">
        <Link to="/training" className="hover:underline">
          Training
        </Link>
        {' / '}
        Import Workout Photo
      </p>

      {draft ? (
        <WorkoutEditor
          title="Review Workout"
          subtitle={
            draft.template
              ? `Routine ${draft.template.routineCode} · Template ${draft.template.version}`
              : 'Imported from photo'
          }
          draft={draft}
          onChange={setDraft}
          onCommit={() => {
            void onCommit()
          }}
          onCancel={resetFlow}
          cancelLabel="Cancel import"
          commitLabel="Save Workout"
          saving={saving}
          error={error}
          guidance={guidance}
          disclaimer="Review every field. Home AI can still be wrong, even when there is no warning."
        />
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {analyzing ? 'Analyzing workout' : 'Import Workout Photo'}
            </h1>
            <p className="mt-2 text-zinc-600">
              {analyzing
                ? 'Your home AI is reading the workout sheet. This usually takes a few minutes.'
                : 'Take a photo of a completed A/B/C sheet. Health will send it to your home AI for review — nothing is saved until you confirm.'}
            </p>
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}
          {failure ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{failure}</p>
          ) : null}
          {pollError ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {pollError} Retrying…
            </p>
          ) : null}

          {analyzing ? (
            <div className="rounded-lg border border-zinc-200 bg-white px-4 py-6">
              <p className="font-medium">
                {status === 'queued' ? 'Queued…' : 'Processing…'}
              </p>
              <p className="mt-2 text-sm text-zinc-600">
                You can leave this page and come back. Analysis will keep running on your home server.
              </p>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) {
                    void startJob(file)
                  }
                }}
              />
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:bg-zinc-300"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Uploading…' : 'Choose photo'}
              </button>
              {failure ? (
                <button
                  type="button"
                  className="ml-3 text-sm font-medium text-zinc-700 hover:text-zinc-900"
                  onClick={resetFlow}
                >
                  Try another photo
                </button>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  )
}
