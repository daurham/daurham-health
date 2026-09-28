import { useEffect, useState } from 'react'
import {
  MEAL_PORTION_SCALES,
  NUTRITION_CONFIG,
  NUTRITION_MEALS,
  emptyMealEstimate,
  isMealRetryCode,
  mealEstimateNutrients,
  mealFailureMessage,
  scaleMealEstimate,
  validateMealEstimateReview,
  type MealEstimateCandidate,
  type MealEstimateNutrients,
  type MealPortionScale,
  type NutritionEntry,
  type NutritionFood,
  type NutritionMealJobResponse,
} from '@/domain/nutrition'
import {
  MealClientError,
  commitNutritionMealReview,
  createNutritionMealJob,
  dismissNutritionMealJob,
  fetchNutritionMealJob,
  reanalyzeNutritionMealJob,
  nutritionMealImageUrl,
} from './api'
import { MEAL_PHOTO_SET_CLIENT_MAX_BYTES, MEAL_PHOTO_SET_MAX_COUNT, MealPhotoPrepareError, prepareMealPhotoSet } from './prepare-meal-photo'
import { mealLabel } from './format'
import { NutritionSheet } from './Sheet'

const POLL_MS = 4000
const inputClass =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus:border-zinc-500 md:text-sm'
const labelClass = 'mb-1 block text-sm font-medium text-zinc-700'
const primaryClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50'
const secondaryClass =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900'

const PORTION_LABELS: Record<MealPortionScale, string> = {
  0.75: '-25%',
  0.9: '-10%',
  1: 'As estimated',
  1.1: '+10%',
  1.25: '+25%',
}

type MealView = {
  key: string
  original: File
  prepared: File
  previewUrl: string
}

type MealCaptureProps = {
  date: string
  jobId?: string | null
  recents?: NutritionFood[]
  recipes?: NutritionFood[]
  onClose: () => void
  onBack: () => void
  onLogged: (entries: NutritionEntry[]) => void
  onDiscarded?: () => void
}

export function MealCaptureSheet({ date, jobId, onClose, onBack, onLogged, onDiscarded }: MealCaptureProps) {
  const [phase, setPhase] = useState<'pick' | 'preview' | 'working' | 'review' | 'failed'>(jobId ? 'working' : 'pick')
  const [activeJobId, setActiveJobId] = useState<string | null>(jobId ?? null)
  const [payload, setPayload] = useState<NutritionMealJobResponse | null>(null)
  const [views, setViews] = useState<MealView[]>([])
  const [context, setContext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [manual, setManual] = useState(false)

  useEffect(() => {
    return () => {
      for (const view of views) {
        URL.revokeObjectURL(view.previewUrl)
      }
    }
  }, [views])

  useEffect(() => {
    if (phase !== 'working' || !activeJobId) {
      return
    }
    let cancelled = false
    let timer: number | undefined

    async function poll() {
      try {
        const next = await fetchNutritionMealJob(activeJobId!)
        if (cancelled) {
          return
        }
        setPayload(next)
        if (next.job.status === 'completed' && next.candidate) {
          setPhase('review')
          return
        }
        if (next.job.status === 'failed') {
          setError(next.failure?.message ?? 'Meal photo analysis failed.')
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
          setError(mealFailureMessage(caught.code))
          setErrorCode(caught.code)
        } else {
          setError('Meal analysis is temporarily unavailable.')
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

  async function stageViews(originals: File[]) {
    setError(null)
    setErrorCode(null)
    try {
      const prepared = await prepareMealPhotoSet(originals)
      const total = prepared.reduce((sum, item) => sum + item.preparedBytes, 0)
      if (total > MEAL_PHOTO_SET_CLIENT_MAX_BYTES) {
        throw new MealPhotoPrepareError('TOO_LARGE', 'These photos are too large to upload together. Try fewer or smaller photos.')
      }
      const next = prepared.map((item, index) => ({
        key: `${index}-${item.file.size}-${item.preparedWidth}`,
        original: originals[index] as File,
        prepared: item.file,
        previewUrl: URL.createObjectURL(item.file),
      }))
      setViews(next)
      setActiveJobId(null)
      setPhase('preview')
    } catch (caught) {
      if (caught instanceof MealPhotoPrepareError) {
        setError(caught.message)
        setErrorCode(caught.code)
        setPhase('failed')
        return
      }
      if (caught instanceof MealClientError) {
        setError(mealFailureMessage(caught.code))
        setErrorCode(caught.code)
      } else {
        setError('Meal analysis is temporarily unavailable.')
        setErrorCode('HOME_AI_UNAVAILABLE')
      }
      setPhase('failed')
    }
  }

  async function onFile(file: File | undefined, replaceIndex?: number) {
    if (!file || activeJobId) {
      return
    }
    const originals = views.map((view) => view.original)
    if (replaceIndex == null) {
      if (originals.length >= MEAL_PHOTO_SET_MAX_COUNT) {
        setError('A meal capture can include up to three photos.')
        setErrorCode('TOO_MANY')
        return
      }
      originals.push(file)
    } else {
      originals[replaceIndex] = file
    }
    await stageViews(originals)
  }

  function removeView(index: number) {
    if (activeJobId) {
      return
    }
    const originals = views.filter((_, viewIndex) => viewIndex !== index).map((view) => view.original)
    if (originals.length === 0) {
      setViews([])
      setPhase('pick')
      return
    }
    void stageViews(originals)
  }

  const photoCount = views.length || payload?.job.imageCount || 0
  const multiPhoto = photoCount > 1

  async function analyze(provider: 'gemini' | 'home_ai') {
    if (provider === 'home_ai' && multiPhoto) {
      setError(mealFailureMessage('MULTI_PHOTO_UNSUPPORTED'))
      setErrorCode('MULTI_PHOTO_UNSUPPORTED')
      setPhase('failed')
      return
    }
    if (!activeJobId && views.length === 0) {
      setPhase('pick')
      return
    }
    const total = views.reduce((sum, view) => sum + view.prepared.size, 0)
    if (!activeJobId && total > MEAL_PHOTO_SET_CLIENT_MAX_BYTES) {
      setError('These photos are too large to upload together. Try fewer or smaller photos.')
      setErrorCode('TOO_LARGE')
      setPhase('failed')
      return
    }
    setError(null)
    setErrorCode(null)
    const previousId = activeJobId
    const files = views.map((view) => view.prepared)
    setPhase('working')
    setActiveJobId(null)
    try {
      const note = context.trim()
      const job = previousId
        ? await reanalyzeNutritionMealJob(previousId, { userContext: note, provider })
        : await createNutritionMealJob(files, { userContext: note, provider })
      setActiveJobId(job.id)
    } catch (caught) {
      if (previousId) {
        setActiveJobId(previousId)
      }
      if (caught instanceof MealClientError) {
        setError(mealFailureMessage(caught.code))
        setErrorCode(caught.code)
      } else {
        setError('Meal analysis is temporarily unavailable.')
        setErrorCode('GEMINI_UNAVAILABLE')
      }
      setPhase('failed')
    }
  }

  function editContext() {
    setContext(payload?.userContext ?? context)
    setPhase('preview')
  }

  async function discardCapture() {
    if (!activeJobId) {
      onDiscarded?.()
      onClose()
      return
    }
    setError(null)
    try {
      await dismissNutritionMealJob(activeJobId)
      onDiscarded?.()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not dismiss this capture.')
    }
  }

  if (phase === 'review' || manual) {
    return (
      <MealEstimateSheet
        date={date}
        jobId={activeJobId}
        candidate={payload?.candidate ?? emptyMealEstimate()}
        imageUrls={reviewImageUrls(activeJobId, payload?.job.imageCount, payload?.job.imageAvailable, views)}
        userContext={payload?.userContext ?? (context.trim() || null)}
        onEditContext={activeJobId || views.length > 0 ? editContext : undefined}
        onClose={onClose}
        onBack={() => {
          setManual(false)
          setPhase(jobId ? 'working' : 'pick')
        }}
        onDiscard={activeJobId ? () => void discardCapture() : undefined}
        onLogged={onLogged}
      />
    )
  }

  if (phase === 'failed') {
    return (
      <NutritionSheet title="Meal photo" onClose={onClose}>
        <p className="text-sm text-zinc-800">{error}</p>
        <MealViewStrip views={views} imageCount={photoCount} />
        <div className="mt-4 space-y-2">
          {errorCode && isMealRetryCode(errorCode) ? (
            <>
              <button type="button" className={primaryClass} onClick={() => void analyze('gemini')}>
                Retry Gemini
              </button>
              <button type="button" className={secondaryClass + ' w-full'} onClick={editContext}>
                Edit context
              </button>
              {multiPhoto ? null : (
                <button type="button" className={secondaryClass + ' w-full'} onClick={() => void analyze('home_ai')}>
                  Try local AI
                </button>
              )}
            </>
          ) : errorCode !== 'UNSUPPORTED' ? (
            <button type="button" className={primaryClass} onClick={() => setPhase('pick')}>
              Use another photo
            </button>
          ) : null}
          <button type="button" className={secondaryClass + ' w-full'} onClick={() => setManual(true)}>
            Build meal manually
          </button>
          {activeJobId ? (
            <button type="button" className={secondaryClass + ' w-full'} onClick={() => void discardCapture()}>
              Discard capture
            </button>
          ) : null}
          <button type="button" className="text-sm text-zinc-600 underline" onClick={onBack}>
            Back
          </button>
        </div>
      </NutritionSheet>
    )
  }

  if (phase === 'working') {
    return (
      <NutritionSheet title="Estimating meal" onClose={onClose}>
        <MealViewStrip views={views} imageCount={photoCount} />
        <p className="text-sm text-zinc-600">
          Estimating nutrition from {Math.max(photoCount, 1)} {Math.max(photoCount, 1) === 1 ? 'photo' : 'photos'}… You can leave and come back from Pending captures.
        </p>
        <div className="mt-4 space-y-2">
          <button type="button" className={secondaryClass + ' w-full'} onClick={onBack}>
            Back
          </button>
          {activeJobId ? (
            <button type="button" className="text-sm text-zinc-600 underline" onClick={() => void discardCapture()}>
              Discard capture
            </button>
          ) : null}
        </div>
      </NutritionSheet>
    )
  }

  if (phase === 'preview') {
    return (
      <NutritionSheet title="Meal photo" onClose={onClose}>
        <MealViewEditor views={views} locked={Boolean(activeJobId)} onRemove={removeView} onReplace={(index, file) => void onFile(file, index)} onAdd={(file) => void onFile(file)} />
        <label className="mt-4 block">
          <span className={labelClass}>Add context (optional)</span>
          <textarea
            className={inputClass + ' min-h-28 py-2'}
            maxLength={2000}
            value={context}
            placeholder="Tell AI anything useful — what the meal is, ingredients, portions, sauces, substitutions, etc."
            onChange={(event) => setContext(event.target.value)}
          />
        </label>
        <div className="mt-4 space-y-2">
          <button type="button" className={primaryClass} disabled={views.length === 0 && !activeJobId} onClick={() => void analyze('gemini')}>
            Analyze meal
          </button>
          <button type="button" className="text-sm text-zinc-600 underline" onClick={() => setPhase('pick')}>
            Back
          </button>
        </div>
      </NutritionSheet>
    )
  }

  return (
    <NutritionSheet title="Meal photo" onClose={onClose}>
      <p className="text-sm text-zinc-600">Photograph the plate. Review the estimate before saving.</p>
      <div className="mt-4 space-y-3">
        <label className={primaryClass}>
          Take photo
          <input type="file" accept="image/jpeg,image/png,image/*" capture="environment" className="sr-only" onChange={(event) => void onFile(event.target.files?.[0])} />
        </label>
        <label className={secondaryClass + ' w-full'}>
          Choose photo
          <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(event) => void onFile(event.target.files?.[0])} />
        </label>
        <button type="button" className="text-sm text-zinc-600 underline" onClick={onBack}>
          Back
        </button>
      </div>
    </NutritionSheet>
  )
}

function reviewImageUrls(
  jobId: string | null,
  imageCount: number | undefined,
  imageAvailable: boolean | undefined,
  views: MealView[],
): string[] {
  const count = imageCount && imageCount > 0 ? imageCount : imageAvailable ? 1 : views.length
  if (jobId && count > 0 && (imageAvailable || (imageCount ?? 0) > 0)) {
    return Array.from({ length: count }, (_, index) => nutritionMealImageUrl(jobId, index))
  }
  return views.map((view) => view.previewUrl)
}

function MealViewStrip({ views, imageCount }: { views: MealView[]; imageCount: number }) {
  if (views.length === 0) {
    return imageCount > 1 ? <p className="text-sm text-zinc-600">{imageCount} photos of this meal</p> : null
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {views.map((view, index) => (
        <img key={view.key} src={view.previewUrl} alt={`View ${index + 1}`} className="h-20 w-full rounded-lg object-cover bg-zinc-100" />
      ))}
    </div>
  )
}

function MealViewEditor({
  views,
  locked,
  onRemove,
  onReplace,
  onAdd,
}: {
  views: MealView[]
  locked: boolean
  onRemove: (index: number) => void
  onReplace: (index: number, file: File) => void
  onAdd: (file: File) => void
}) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {views.map((view, index) => (
          <div key={view.key} className="min-w-0">
            <img src={view.previewUrl} alt={`View ${index + 1}`} className="h-24 w-full rounded-lg object-cover bg-zinc-100" />
            <p className="mt-1 text-xs text-zinc-500">View {index + 1}</p>
            {locked ? null : (
              <div className="mt-1 flex gap-2">
                <label className="inline-flex min-h-11 items-center text-sm text-zinc-700 underline">
                  Replace
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        onReplace(index, file)
                      }
                    }}
                  />
                </label>
                <button type="button" className="min-h-11 min-w-11 text-sm text-zinc-700 underline" onClick={() => onRemove(index)}>
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {locked || views.length >= MEAL_PHOTO_SET_MAX_COUNT ? null : (
        <label className={secondaryClass + ' mt-3 w-full'}>
          Add another angle
          <input
            type="file"
            accept="image/jpeg,image/png,image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                onAdd(file)
              }
            }}
          />
        </label>
      )}
      {views.length > 0 && views.length < MEAL_PHOTO_SET_MAX_COUNT && !locked ? (
        <p className="mt-2 text-sm text-zinc-500">Add another angle to give the estimate more visual context.</p>
      ) : null}
    </div>
  )
}

function MealReviewViews({ urls }: { urls: string[] }) {
  const [selected, setSelected] = useState(0)
  if (urls.length === 0) {
    return null
  }
  if (urls.length === 1) {
    return <img src={urls[0]} alt="Meal" className="mb-3 max-h-48 w-full rounded-lg object-contain bg-zinc-100" />
  }
  const current = urls[selected] ?? urls[0]
  return (
    <div className="mb-3">
      <img src={current} alt={`View ${selected + 1}`} className="max-h-40 w-full rounded-lg object-contain bg-zinc-100" />
      <div className="mt-2 grid grid-cols-3 gap-2">
        {urls.map((url, index) => (
          <button
            key={url}
            type="button"
            aria-pressed={selected === index}
            className={`min-h-11 overflow-hidden rounded-md border ${selected === index ? 'border-zinc-900' : 'border-zinc-200'}`}
            onClick={() => setSelected(index)}
          >
            <img src={url} alt={`View ${index + 1}`} className="h-16 w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  )
}

function MealEstimateSheet({
  date,
  jobId,
  candidate,
  imageUrls,
  userContext,
  onEditContext,
  onClose,
  onBack,
  onDiscard,
  onLogged,
}: {
  date: string
  jobId: string | null
  candidate: MealEstimateCandidate
  imageUrls: string[]
  userContext?: string | null
  onEditContext?: () => void
  onClose: () => void
  onBack: () => void
  onDiscard?: () => void
  onLogged: (entries: NutritionEntry[]) => void
}) {
  const [name, setName] = useState(candidate.name)
  const [meal, setMeal] = useState<(typeof NUTRITION_MEALS)[number] | ''>('')
  const [baseline] = useState<MealEstimateNutrients>(() => mealEstimateNutrients(candidate))
  const [scale, setScale] = useState<MealPortionScale>(1)
  const [values, setValues] = useState<MealEstimateNutrients>(baseline)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function applyScale(next: MealPortionScale) {
    setScale(next)
    setValues(scaleMealEstimate(baseline, next))
  }

  async function saveMeal() {
    const nextErrors = validateMealEstimateReview({ name, calories: values.calories })
    if (nextErrors.length > 0) {
      setError(nextErrors[0]?.message ?? 'Review the estimate before saving.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = await commitNutritionMealReview({
        jobId: jobId ?? undefined,
        logDate: date,
        timezone: NUTRITION_CONFIG.calendarTimeZone,
        meal: meal === '' ? null : meal,
        name: name.trim(),
        calories: values.calories,
        proteinGrams: values.proteinGrams,
        carbsGrams: values.carbsGrams,
        fatGrams: values.fatGrams,
        fiberGrams: values.fiberGrams,
        portionScale: scale,
      })
      onLogged(saved.entries)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save meal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <NutritionSheet title="Review estimate" onClose={onClose}>
      <MealReviewViews urls={imageUrls} />
      {userContext ? (
        <div className="mb-3 rounded-md bg-zinc-50 px-3 py-2">
          <p className="text-xs font-medium text-zinc-500">Your context</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{userContext}</p>
        </div>
      ) : null}
      <label className="block">
        <span className={labelClass}>Meal name</span>
        <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {candidate.foodsSeen.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-zinc-700">What AI saw</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {candidate.foodsSeen.map((item) => (
              <span key={item} className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700">
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {candidate.assumptions.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-zinc-700">Assumptions</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-500">
            {candidate.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-4">
        <p className="text-sm font-medium text-zinc-700">Portion estimate</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MEAL_PORTION_SCALES.map((option) => (
            <button
              key={option}
              type="button"
              className={`min-h-11 rounded-md px-3 text-sm ${scale === option ? 'bg-zinc-900 text-white' : 'border border-zinc-300 bg-white text-zinc-900'}`}
              onClick={() => applyScale(option)}
            >
              {PORTION_LABELS[option]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <p className="text-sm font-medium text-zinc-700">Estimated nutrition</p>
        <EstimateField label="Calories" suffix="kcal" value={values.calories} onChange={(calories) => setValues((current) => ({ ...current, calories: calories ?? 0 }))} />
        <EstimateField label="Protein" suffix="g" value={values.proteinGrams} onChange={(proteinGrams) => setValues((current) => ({ ...current, proteinGrams: proteinGrams ?? 0 }))} />
        <EstimateField label="Carbs" suffix="g" value={values.carbsGrams} onChange={(carbsGrams) => setValues((current) => ({ ...current, carbsGrams: carbsGrams ?? 0 }))} />
        <EstimateField label="Fat" suffix="g" value={values.fatGrams} onChange={(fatGrams) => setValues((current) => ({ ...current, fatGrams: fatGrams ?? 0 }))} />
        <EstimateField
          label="Fiber"
          suffix="g"
          value={values.fiberGrams}
          onChange={(fiberGrams) => setValues((current) => ({ ...current, fiberGrams }))}
        />
      </div>
      <label className="mt-4 block">
        <span className={labelClass}>Meal</span>
        <select className={inputClass} value={meal} onChange={(event) => setMeal(event.target.value as typeof meal)}>
          <option value="">Unset</option>
          {NUTRITION_MEALS.map((item) => (
            <option key={item} value={item}>
              {mealLabel(item)}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 space-y-2">
        <button type="button" className={primaryClass} disabled={busy} onClick={() => void saveMeal()}>
          {busy ? 'Saving…' : 'Save meal'}
        </button>
        {onEditContext ? (
          <button type="button" className={secondaryClass + ' w-full'} onClick={onEditContext}>
            Edit context
          </button>
        ) : null}
        {onDiscard ? (
          <button type="button" className={secondaryClass + ' w-full'} onClick={onDiscard}>
            Discard capture
          </button>
        ) : null}
        <button type="button" className="text-sm text-zinc-600 underline" onClick={onBack}>
          Back
        </button>
      </div>
    </NutritionSheet>
  )
}

function EstimateField({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string
  suffix: string
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <div className="flex items-center gap-2">
        <input
          className={inputClass}
          inputMode="decimal"
          type="text"
          value={value ?? ''}
          onChange={(event) => {
            const next = event.target.value.trim()
            if (!next) {
              onChange(label === 'Fiber' ? null : 0)
              return
            }
            const parsed = Number(next)
            onChange(Number.isFinite(parsed) ? parsed : value)
          }}
        />
        <span className="text-sm text-zinc-500">{suffix}</span>
      </div>
    </label>
  )
}
