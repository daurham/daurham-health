import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { ReviewFieldError } from '@/domain/paper-load'
import type { TranscriptionGuidance, TranscriptionJobResponse } from '@/domain/training-transcription'
import { isHomeAiJobId } from '@/domain/training-transcription'
import { commitImportedSession, createTranscriptionJob, fetchTranscriptionJob } from './api'
import { WorkoutEditor } from './WorkoutEditor'
import {
  DraftValidationError,
  buildManualWorkoutPayload,
  draftFromTranscription,
  validateWorkoutDraft,
  type WorkoutDraft,
} from './draft'
import {
  WorkoutPhotoPrepareError,
  prepareWorkoutPhoto,
} from './prepare-workout-photo'

const POLL_MS = 4000

export function ImportWorkoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const jobParam = searchParams.get('job')
  const jobId = jobParam && isHomeAiJobId(jobParam) ? jobParam : null
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'queued' | 'processing' | 'completed' | 'failed' | null>(null)
  const [draft, setDraft] = useState<WorkoutDraft | null>(null)
  const [guidance, setGuidance] = useState<TranscriptionGuidance[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<ReviewFieldError[]>([])
  const [errorFocusKey, setErrorFocusKey] = useState(0)
  const [pollError, setPollError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const incomingFile = (location.state as { file?: File } | null)?.file

  useEffect(() => {
    setDraft(null)
    setStatus(null)
    setGuidance([])
    setFailure(null)
    setFieldErrors([])
    setPollError(null)
  }, [jobId])

  const startJob = useCallback(async (file: File) => {
    setError(null)
    setFailure(null)
    setPreparing(true)
    let preparedFile: File
    try {
      preparedFile = (await prepareWorkoutPhoto(file)).file
    } catch (caught) {
      setPreparing(false)
      setError(
        caught instanceof WorkoutPhotoPrepareError
          ? caught.message
          : 'Could not prepare that photo. Try another JPEG or PNG.',
      )
      return
    }
    setPreparing(false)
    setUploading(true)
    try {
      const created = await createTranscriptionJob(preparedFile)
      navigate(`/training/import?job=${created.id}`, { replace: true })
      setStatus(created.status)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start analysis')
    } finally {
      setUploading(false)
    }
  }, [navigate])

  useEffect(() => {
    if (!incomingFile || jobId) {
      return
    }
    void startJob(incomingFile)
    navigate('.', { replace: true, state: {} })
  }, [incomingFile, jobId, navigate, startJob])

  useEffect(() => {
    if (!jobId || draft || status === 'failed' || failure) {
      return
    }
    const pollJobId = jobId
    let cancelled = false
    let timer: number | undefined

    async function poll() {
      try {
        const result = await fetchTranscriptionJob(pollJobId)
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
  }, [jobId, draft, status, failure])

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

  async function onCommit() {
    if (!draft || !jobId) {
      return
    }
    const nextErrors = validateWorkoutDraft(draft)
    if (nextErrors.length > 0) {
      setFieldErrors(nextErrors)
      setErrorFocusKey((current) => current + 1)
      setError(null)
      return
    }
    setFieldErrors([])
    setError(null)
    setSaving(true)
    try {
      const payload = buildManualWorkoutPayload(draft)
      const session = await commitImportedSession(jobId, payload)
      navigate(`/training/${session.id}`, { replace: true })
    } catch (caught) {
      if (caught instanceof DraftValidationError) {
        setFieldErrors(caught.fields)
        setErrorFocusKey((current) => current + 1)
        setError(null)
        return
      }
      setError(caught instanceof Error ? caught.message : 'Could not save workout')
    } finally {
      setSaving(false)
    }
  }

  function resetFlow() {
    navigate('/training/import', { replace: true })
  }

  const analyzing = jobId != null && draft == null && failure == null
  const heading = analyzing
    ? 'Analyzing workout'
    : preparing
      ? 'Preparing photo…'
      : uploading
        ? 'Uploading…'
        : 'Import Workout Photo'
  const blurb = analyzing
    ? 'Your home AI is reading the workout sheet. This usually takes a few minutes.'
    : preparing
      ? 'Getting the photo ready to send.'
      : uploading
        ? 'Sending the photo to your home AI.'
        : 'Take a photo of a completed A/B/C sheet. Health will send it to your home AI for review — nothing is saved until you confirm.'

  return (
    <section className="space-y-6">
      <p className="text-sm text-zinc-500">
        <Link to="/training" className="hover:underline">
          Training
        </Link>
        {' / '}
        Import Workout Photo
      </p>

      {jobParam && !jobId ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          That analysis job id is invalid.
        </p>
      ) : null}

      {draft ? (
        <WorkoutEditor
          title="Review Workout"
          subtitle={
            draft.template
              ? `Routine ${draft.template.routineCode} · Template ${draft.template.version}`
              : 'Imported from photo'
          }
          draft={draft}
          onChange={(next) => {
            setDraft(next)
            setFieldErrors((current) => (current.length > 0 ? validateWorkoutDraft(next) : current))
          }}
          onCommit={() => {
            void onCommit()
          }}
          onCancel={resetFlow}
          cancelLabel="Cancel import"
          commitLabel="Save Workout"
          saving={saving}
          error={error}
          fieldErrors={fieldErrors}
          errorFocusKey={errorFocusKey}
          guidance={guidance}
          disclaimer="Review every field. Home AI can still be wrong, even when there is no warning."
        />
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
            <p className="mt-2 text-zinc-600">{blurb}</p>
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
                You can leave this page and come back from Training on this device or another. Analysis will keep
                running on your home server. Completed sheets still need a human review before they are saved.
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
                disabled={preparing || uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {preparing ? 'Preparing photo…' : uploading ? 'Uploading…' : 'Choose photo'}
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
