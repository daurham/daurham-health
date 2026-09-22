import { useEffect, useMemo, useState } from 'react'
import {
  NUTRITION_CONFIG,
  draftFromCandidate,
  emptyLabelCandidate,
  isLabelRetryCode,
  labelFailureMessage,
  snapshotFromDefinition,
  validateLabelReview,
  type LabelBasis,
  type NutritionEntry,
  type NutritionFood,
  type NutritionLabelCandidate,
  type NutritionLabelJobResponse,
} from '@/domain/nutrition'
import type { ReviewFieldError } from '@/domain/paper-load'
import { cn } from '@/lib'
import {
  BarcodeLookupClientError,
  commitNutritionLabelReview,
  MealClientError,
  createNutritionLabelJob,
  fetchNutritionLabelJob,
  nutritionLabelImageUrl,
  reanalyzeNutritionLabelJob,
} from './api'
import { LabelPhotoPrepareError, prepareLabelPhoto } from './prepare-label-photo'
import { formatKcal, formatGrams } from './format'
import { NutritionSheet } from './Sheet'

const POLL_MS = 4000
const inputClass =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus:border-zinc-500 md:text-sm'
const labelClass = 'mb-1 block text-sm font-medium text-zinc-700'
const primaryClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50'
const secondaryClass =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900'

type LabelCaptureProps = {
  date: string
  jobId?: string | null
  onClose: () => void
  onBack: () => void
  onLogged: (entry: NutritionEntry, food: NutritionFood) => void
}

export function LabelCaptureSheet({ date, jobId, onClose, onBack, onLogged }: LabelCaptureProps) {
  const [phase, setPhase] = useState<'pick' | 'preview' | 'working' | 'review' | 'failed'>(jobId ? 'working' : 'pick')
  const [activeJobId, setActiveJobId] = useState<string | null>(jobId ?? null)
  const [payload, setPayload] = useState<NutritionLabelJobResponse | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [preparedFile, setPreparedFile] = useState<File | null>(null)
  const [context, setContext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [manual, setManual] = useState(false)

  useEffect(() => {
    return () => {
      if (localPreview) {
        URL.revokeObjectURL(localPreview)
      }
    }
  }, [localPreview])

  useEffect(() => {
    if (phase !== 'working' || !activeJobId) {
      return
    }
    let cancelled = false
    let timer: number | undefined

    async function poll() {
      try {
        const next = await fetchNutritionLabelJob(activeJobId!)
        if (cancelled) {
          return
        }
        setPayload(next)
        if (next.job.status === 'completed' && next.candidate) {
          setPhase('review')
          return
        }
        if (next.job.status === 'failed') {
          setError(next.failure?.message ?? 'Label analysis failed.')
          setErrorCode(next.failure?.code ?? 'PIPELINE_FAILED')
          setPhase('failed')
          return
        }
        timer = window.setTimeout(() => {
          void poll()
        }, POLL_MS)
      } catch (caught) {
        if (cancelled) {
          return
        }
        if (caught instanceof MealClientError) {
          setError(labelFailureMessage(caught.code))
          setErrorCode(caught.code)
        } else {
          setError('Label analysis is temporarily unavailable.')
          setErrorCode('HOME_AI_UNAVAILABLE')
        }
        setPhase('failed')
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) {
        window.clearTimeout(timer)
      }
    }
  }, [phase, activeJobId])

  async function onFile(file: File | undefined) {
    if (!file) {
      return
    }
    setError(null)
    setErrorCode(null)
    try {
      const prepared = await prepareLabelPhoto(file)
      const preview = URL.createObjectURL(prepared.file)
      setPreparedFile(prepared.file)
      setActiveJobId(null)
      setLocalPreview((current) => {
        if (current) {
          URL.revokeObjectURL(current)
        }
        return preview
      })
      setPhase('preview')
    } catch (caught) {
      if (caught instanceof LabelPhotoPrepareError) {
        setError(caught.message)
        setErrorCode(caught.code)
        setPhase('failed')
        return
      }
      if (caught instanceof MealClientError) {
        setError(labelFailureMessage(caught.code))
        setErrorCode(caught.code)
      } else {
        setError('Label analysis is temporarily unavailable.')
        setErrorCode('HOME_AI_UNAVAILABLE')
      }
      setPhase('failed')
    }
  }

  async function analyze(provider: 'gemini' | 'home_ai') {
    if (!activeJobId && !preparedFile) {
      setPhase('pick')
      return
    }
    setError(null)
    setErrorCode(null)
    const previousId = activeJobId
    const file = preparedFile
    setPhase('working')
    setActiveJobId(null)
    try {
      const note = context.trim()
      const job = previousId
        ? await reanalyzeNutritionLabelJob(previousId, { userContext: note, provider })
        : await createNutritionLabelJob(file as File, { userContext: note, provider })
      setActiveJobId(job.id)
    } catch (caught) {
      if (previousId) {
        setActiveJobId(previousId)
      }
      if (caught instanceof MealClientError) {
        setError(labelFailureMessage(caught.code))
        setErrorCode(caught.code)
      } else {
        setError('Label analysis is temporarily unavailable.')
        setErrorCode('HOME_AI_UNAVAILABLE')
      }
      setPhase('failed')
    }
  }

  function editContext() {
    setContext(payload?.userContext ?? context)
    setPhase('preview')
  }

  if (phase === 'review' || manual) {
    const candidate = payload?.candidate ?? emptyLabelCandidate({ warnings: ['Enter the label values manually.'] })
    return (
      <LabelReviewSheet
        date={date}
        jobId={activeJobId}
        candidate={candidate}
        comparison={payload?.comparison ?? null}
        imageUrl={activeJobId && payload?.job.imageAvailable ? nutritionLabelImageUrl(activeJobId) : localPreview}
        userContext={payload?.userContext ?? (context.trim() || null)}
        onEditContext={activeJobId || preparedFile ? editContext : undefined}
        onClose={onClose}
        onBack={() => {
          setManual(false)
          setPhase(jobId ? 'working' : 'pick')
        }}
        onLogged={onLogged}
      />
    )
  }

  if (phase === 'failed') {
    return (
      <NutritionSheet title="Nutrition label" onClose={onClose}>
        <p className="text-sm text-zinc-800">{error}</p>
        {localPreview ? <img src={localPreview} alt="Nutrition label" className="mt-3 max-h-48 w-full rounded-lg object-contain bg-zinc-100" /> : null}
        <div className="mt-4 space-y-2">
          {errorCode && isLabelRetryCode(errorCode) ? (
            <>
              <button type="button" className={primaryClass} onClick={() => void analyze('gemini')}>
                Retry Gemini
              </button>
              <button type="button" className={secondaryClass + ' w-full'} onClick={editContext}>
                Edit context
              </button>
              <button type="button" className={secondaryClass + ' w-full'} onClick={() => void analyze('home_ai')}>
                Try local AI
              </button>
            </>
          ) : errorCode !== 'UNSUPPORTED' ? (
            <button type="button" className={primaryClass} onClick={() => setPhase('pick')}>
              Use another photo
            </button>
          ) : null}
          <button
            type="button"
            className={secondaryClass + ' w-full'}
            onClick={() => {
              setManual(true)
            }}
          >
            Enter label manually
          </button>
          <button type="button" className="text-sm text-zinc-600 underline" onClick={onBack}>
            Back
          </button>
        </div>
      </NutritionSheet>
    )
  }

  if (phase === 'working') {
    return (
      <NutritionSheet title="Analyzing label" onClose={onClose}>
        {localPreview ? <img src={localPreview} alt="Nutrition label" className="mb-3 max-h-48 w-full rounded-lg object-contain bg-zinc-100" /> : null}
        <p className="text-sm text-zinc-600">Analyzing Nutrition Facts… You can leave and come back from Pending captures.</p>
        <button type="button" className={secondaryClass + ' mt-4 w-full'} onClick={onBack}>
          Back
        </button>
      </NutritionSheet>
    )
  }

  if (phase === 'preview') {
    const previewSrc = localPreview ?? (activeJobId ? nutritionLabelImageUrl(activeJobId) : null)
    return (
      <NutritionSheet title="Scan nutrition label" onClose={onClose}>
        {previewSrc ? <img src={previewSrc} alt="Nutrition label" className="max-h-64 w-full rounded-lg object-contain bg-zinc-100" /> : null}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-zinc-700">Add context (optional)</summary>
          <textarea
            className={inputClass + ' mt-2 min-h-24 py-2'}
            maxLength={2000}
            value={context}
            placeholder="This is the 12 oz package. The serving is 4 pieces."
            onChange={(event) => setContext(event.target.value)}
          />
        </details>
        <div className="mt-4 space-y-2">
          <button type="button" className={primaryClass} disabled={!preparedFile && !activeJobId} onClick={() => void analyze('gemini')}>
            Analyze label
          </button>
          <button type="button" className="text-sm text-zinc-600 underline" onClick={() => setPhase('pick')}>
            Back
          </button>
        </div>
      </NutritionSheet>
    )
  }

  return (
    <NutritionSheet title="Scan nutrition label" onClose={onClose}>
      <p className="text-sm text-zinc-600">Photograph the Nutrition Facts panel. Rear camera is preferred.</p>
      <div className="mt-4 space-y-3">
        <label className={primaryClass}>
          Take photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
        </label>
        <label className={secondaryClass + ' w-full'}>
          Choose photo
          <input
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
        </label>
        <button type="button" className="text-sm text-zinc-600 underline" onClick={onBack}>
          Back
        </button>
      </div>
    </NutritionSheet>
  )
}

function LabelReviewSheet({
  date,
  jobId,
  candidate,
  comparison,
  imageUrl,
  userContext,
  onEditContext,
  onClose,
  onBack,
  onLogged,
}: {
  date: string
  jobId: string | null
  candidate: NutritionLabelCandidate
  comparison: NutritionLabelJobResponse['comparison']
  imageUrl: string | null
  userContext?: string | null
  onEditContext?: () => void
  onClose: () => void
  onBack: () => void
  onLogged: (entry: NutritionEntry, food: NutritionFood) => void
}) {
  const [draft, setDraft] = useState(() => draftFromCandidate(candidate))
  const [errors, setErrors] = useState<ReviewFieldError[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingAction, setExistingAction] = useState<'create' | 'log_existing' | 'update_and_log'>(
    comparison?.existingFood ? 'log_existing' : 'create',
  )

  useEffect(() => {
    const first = errors[0]?.path
    if (!first) {
      return
    }
    document.getElementById(`label-${first}`)?.focus()
  }, [errors])

  const preview = useMemo(() => {
    if (draft.calories == null || !(draft.logQuantity > 0)) {
      return null
    }
    return snapshotFromDefinition(
      {
        calories: draft.calories,
        protein: draft.proteinGrams,
        carbs: draft.carbsGrams,
        fat: draft.fatGrams,
        fiber: draft.fiberGrams,
        servingGrams: draft.servingGrams,
      },
      { quantity: draft.logQuantity },
    )
  }, [draft])

  function errorFor(path: string) {
    return errors.find((item) => item.path === path)?.message
  }

  function setField<K extends keyof typeof draft>(path: K, value: (typeof draft)[K]) {
    setDraft((current) => ({ ...current, [path]: value }))
    setErrors((current) => current.filter((item) => item.path !== path))
  }

  async function saveAndLog() {
    const nextErrors = validateLabelReview(draft)
    if (nextErrors.length > 0) {
      setErrors(nextErrors)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = await commitNutritionLabelReview({
        jobId: jobId ?? undefined,
        existingFoodId: comparison?.existingFood?.id ?? null,
        existingAction: comparison?.existingFood ? existingAction : 'create',
        productName: draft.productName,
        brand: draft.brand.trim() || null,
        servingQuantity: draft.servingQuantity ?? 1,
        servingUnit: draft.servingUnit,
        servingGrams: draft.servingGrams,
        servingsPerContainer: draft.servingsPerContainer,
        calories: draft.calories ?? 0,
        proteinGrams: draft.proteinGrams,
        carbsGrams: draft.carbsGrams,
        fatGrams: draft.fatGrams,
        fiberGrams: draft.fiberGrams,
        basis: draft.basis === '' ? 'unknown' : draft.basis,
        barcode: draft.barcode.trim() || null,
        logQuantity: draft.logQuantity,
        logDate: date,
        timezone: NUTRITION_CONFIG.calendarTimeZone,
        catalogKind: draft.barcode.trim() ? 'packaged' : 'custom',
      })
      onLogged(saved.entry, saved.food)
    } catch (caught) {
      if (caught instanceof BarcodeLookupClientError && caught.fields.length > 0) {
        setErrors(caught.fields)
        return
      }
      setError(caught instanceof Error ? caught.message : 'Could not save food')
    } finally {
      setBusy(false)
    }
  }

  const existing = comparison?.existingFood ?? null
  const provider = comparison?.provider ?? null

  return (
    <NutritionSheet
      title="Review nutrition label"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" className={secondaryClass} onClick={onBack}>
            Back
          </button>
          <button type="button" className={primaryClass} onClick={() => void saveAndLog()} disabled={busy}>
            {busy ? 'Saving…' : 'Save & Log'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {errors.length > 0 ? (
          <p className="text-sm text-red-700">{errors.length} {errors.length === 1 ? 'field needs' : 'fields need'} attention.</p>
        ) : null}
        {imageUrl ? (
          <img src={imageUrl} alt="Source nutrition label" className="max-h-40 w-full rounded-lg object-contain bg-zinc-100" />
        ) : null}
        {userContext ? <p className="text-sm text-zinc-600">Context: {userContext}</p> : null}
        {onEditContext ? (
          <button type="button" className="text-sm text-zinc-600 underline" onClick={onEditContext}>
            Edit context
          </button>
        ) : null}
        {candidate.ambiguities.map((ambiguity) => (
          <p key={ambiguity} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {ambiguity}
          </p>
        ))}
        {candidate.warnings.map((warning) => (
          <p key={warning} className="text-sm text-zinc-600">
            {warning}
          </p>
        ))}
        {existing ? (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
            <p className="font-medium">Existing Health food found: {existing.name}</p>
            <div className="mt-2 space-y-1">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={existingAction === 'log_existing'}
                  onChange={() => setExistingAction('log_existing')}
                />
                Log using existing food
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={existingAction === 'update_and_log'}
                  onChange={() => setExistingAction('update_and_log')}
                />
                Update food from label & log
              </label>
            </div>
          </div>
        ) : null}
        {provider ? (
          <div className="overflow-x-auto text-sm">
            <table className="w-full">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="pr-3"> </th>
                  <th className="pr-3">Label</th>
                  <th>OFF</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="pr-3">Calories</td>
                  <td className="pr-3">{draft.calories ?? '—'}</td>
                  <td>{provider.calories ?? '—'}</td>
                </tr>
                <tr>
                  <td className="pr-3">Protein</td>
                  <td className="pr-3">{draft.proteinGrams ?? '—'}</td>
                  <td>{provider.protein ?? '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        <Field id="label-productName" label="Name" value={draft.productName} error={errorFor('productName')} onChange={(value) => setField('productName', value)} />
        <Field id="label-brand" label="Brand" value={draft.brand} onChange={(value) => setField('brand', value)} />
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="label-servingQuantity"
            label="Serving quantity"
            value={draft.servingQuantity == null ? '' : String(draft.servingQuantity)}
            error={errorFor('servingQuantity')}
            inputMode="decimal"
            onChange={(value) => setField('servingQuantity', value.trim() === '' ? null : Number(value))}
          />
          <Field id="label-servingUnit" label="Serving unit" value={draft.servingUnit} error={errorFor('servingUnit')} onChange={(value) => setField('servingUnit', value)} />
        </div>
        <Field
          id="label-servingGrams"
          label="Serving weight g"
          value={draft.servingGrams == null ? '' : String(draft.servingGrams)}
          error={errorFor('servingGrams')}
          inputMode="decimal"
          onChange={(value) => setField('servingGrams', value.trim() === '' ? null : Number(value))}
        />
        <Field
          id="label-servingsPerContainer"
          label="Servings / container"
          value={draft.servingsPerContainer == null ? '' : String(draft.servingsPerContainer)}
          inputMode="decimal"
          onChange={(value) => setField('servingsPerContainer', value.trim() === '' ? null : Number(value))}
        />
        <div>
          <label className={labelClass} htmlFor="label-basis">
            Nutrition basis
          </label>
          <select
            id="label-basis"
            className={cn(inputClass, errorFor('basis') && 'border-red-500')}
            value={draft.basis}
            onChange={(event) => setField('basis', event.target.value as LabelBasis)}
          >
            <option value="per_serving">Per serving</option>
            <option value="per_100g">Per 100 g</option>
            <option value="per_container">Per container</option>
            <option value="unknown">Unknown</option>
          </select>
          {errorFor('basis') ? <p className="mt-1 text-sm text-red-700">{errorFor('basis')}</p> : null}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Nutrition per serving</p>
        <Field
          id="label-calories"
          label="Calories"
          value={draft.calories == null ? '' : String(draft.calories)}
          error={errorFor('calories')}
          inputMode="decimal"
          onChange={(value) => setField('calories', value.trim() === '' ? null : Number(value))}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field id="label-proteinGrams" label="Protein g" value={draft.proteinGrams == null ? '' : String(draft.proteinGrams)} inputMode="decimal" onChange={(value) => setField('proteinGrams', value.trim() === '' ? null : Number(value))} />
          <Field id="label-carbsGrams" label="Carbs g" value={draft.carbsGrams == null ? '' : String(draft.carbsGrams)} inputMode="decimal" onChange={(value) => setField('carbsGrams', value.trim() === '' ? null : Number(value))} />
          <Field id="label-fatGrams" label="Fat g" value={draft.fatGrams == null ? '' : String(draft.fatGrams)} inputMode="decimal" onChange={(value) => setField('fatGrams', value.trim() === '' ? null : Number(value))} />
          <Field id="label-fiberGrams" label="Fiber g" value={draft.fiberGrams == null ? '' : String(draft.fiberGrams)} inputMode="decimal" onChange={(value) => setField('fiberGrams', value.trim() === '' ? null : Number(value))} />
        </div>
        <Field id="label-barcode" label="Barcode" value={draft.barcode} error={errorFor('barcode')} inputMode="numeric" onChange={(value) => setField('barcode', value)} />

        <div>
          <p className={labelClass}>Quantity to log</p>
          <div className="flex items-center gap-2">
            <button type="button" className={secondaryClass} onClick={() => setField('logQuantity', Math.max(0.5, Math.round((draft.logQuantity - 0.5) * 10) / 10))}>
              −
            </button>
            <span className="min-w-16 text-center text-sm">{draft.logQuantity} serving</span>
            <button type="button" className={secondaryClass} onClick={() => setField('logQuantity', Math.round((draft.logQuantity + 0.5) * 10) / 10)}>
              +
            </button>
          </div>
          {preview ? (
            <p className="mt-2 text-sm text-zinc-600">
              {formatKcal(preview.calories)}
              {formatGrams(preview.protein) ? ` · ${formatGrams(preview.protein)} protein` : ''}
            </p>
          ) : null}
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    </NutritionSheet>
  )
}

function Field({
  id,
  label,
  value,
  error,
  onChange,
  inputMode,
}: {
  id: string
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
  inputMode?: 'decimal' | 'numeric'
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={cn(inputClass, error && 'border-red-500')}
        value={value}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
    </div>
  )
}
