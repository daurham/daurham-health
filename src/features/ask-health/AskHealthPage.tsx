import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { ASK_LENS_LABELS, ASK_SUGGESTIONS, ASK_CONTEXT_MODES, ASK_CONTEXT_MODE_LABELS, DEFAULT_ASK_CONTEXT_MODE, type AskLens, type AskTurn, type AskContextMode } from '@/domain/ask-health'
import type { ProgressRange } from '@/domain/progress'
import { primaryButtonClass, quietButtonClass, useHealthCalendarDate } from '@/lib'
import { ProgressRangeControl } from '@/features/progress/ProgressRangeControl'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'
import { MAX_OWNER_NOTE_DRAFT, makeOwnerNoteReviewState } from '@/domain/ask-health/owner-note-review'
import { askHealth } from './api'
import { AskHealthAnswerView } from './AnswerView'
import { ExternalResearch } from './ExternalResearch'
import { KnownProfilePanel } from './KnownProfilePanel'
import { readAskCorrectionState } from '@/domain/ask-health/corrections'
import { OptionalClarification } from './OptionalClarification'
import { deepDiveRangeHint } from '@/domain/ask-health/context-range'
import { subscribeHealthDataChanges } from '@/lib/health-changes'
import { askResponseDependsOnOwnerData, shouldWithholdChangedAskResponse } from '@/domain/ask-health/stale-response'

const LENSES = ['general', 'training', 'nutrition', 'recovery', 'experiments'] as const

function initialLens(value: string | null): AskLens {
  return value != null && LENSES.includes(value as AskLens) ? (value as AskLens) : 'general'
}

function initialRange(value: string | null): ProgressRange {
  if (value === '30d' || value === '90d' || value === '6m' || value === '1y' || value === 'all') {
    return value
  }
  return '30d'
}

export function AskHealthPage() {
  const today = useHealthCalendarDate()
  const navigate = useNavigate()
  const location = useLocation()
  const returningCorrection = readAskCorrectionState(location.state)
  const prefix = useAppPathPrefix()
  const [params] = useSearchParams()
  const [lens, setLens] = useState<AskLens>(() => returningCorrection?.lens ?? initialLens(params.get('lens')))
  const [range, setRange] = useState<ProgressRange>(() => returningCorrection?.range ?? initialRange(params.get('range')))
  const [draft, setDraft] = useState(() => returningCorrection?.question ?? params.get('question') ?? '')
  const [contextMode, setContextMode] = useState<AskContextMode>(() => returningCorrection?.contextMode ?? DEFAULT_ASK_CONTEXT_MODE)
  const [turns, setTurns] = useState<AskTurn[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latest, setLatest] = useState<Awaited<ReturnType<typeof askHealth>> | null>(null)
  const [returnNotice, setReturnNotice] = useState(Boolean(returningCorrection))
  const [asked, setAsked] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [ownerNote, setOwnerNote] = useState('')
  const [answerRevision, setAnswerRevision] = useState(0)
  const deepRangeHint = deepDiveRangeHint(contextMode, range)
  const dataRevisionRef = useRef(0)
  const lastPersonalQuestionRef = useRef<string | null>(null)

  useEffect(() => {
    // The shared healthFetch invalidation channel broadcasts only a constant,
    // never owner records or the changed workout ID. Invalidation must be
    // synchronous: a response may resolve before a coalesced refresh timer.
    return subscribeHealthDataChanges(() => {
      dataRevisionRef.current += 1
      if (lastPersonalQuestionRef.current !== null) {
        const previousQuestion = lastPersonalQuestionRef.current
        lastPersonalQuestionRef.current = null
        setLatest(null)
        setAsked(null)
        setTurns([])
        setOwnerNote('')
        setNoteOpen(false)
        setError('Your Health records changed. Ask again to get current personalized advice.')
        setDraft((current) => current.trim() ? current : previousQuestion)
      }
    }, { immediate: true })
  }, [])

  function changeRange(next: ProgressRange) {
    if (pending || next === range) return
    setRange(next)
    lastPersonalQuestionRef.current = null
    setTurns([])
    setLatest(null)
    setAsked(null)
    setError(null)
  }

  async function submit(question: string) {
    const trimmed = question.trim()
    if (!trimmed || pending) {
      return
    }
    const startedDataRevision = dataRevisionRef.current
    setPending(true)
    setError(null)
    setReturnNotice(false)
    try {
      const response = await askHealth({
        question: trimmed,
        lens,
        contextMode,
        range,
        asOf: today,
        conversation: turns.slice(-6),
      })
      if (shouldWithholdChangedAskResponse(
        response.meta.answerScope, startedDataRevision, dataRevisionRef.current,
      )) {
        lastPersonalQuestionRef.current = null
        setLatest(null)
        setAsked(null)
        setTurns([])
        setOwnerNote('')
        setError('Your Health records changed while this answer was being prepared. Ask again for current advice.')
        return
      }
      lastPersonalQuestionRef.current = askResponseDependsOnOwnerData(response.meta.answerScope) ? trimmed : null
      const assistant = response.answer.blocks.map((block) => block.text).join('\n')
      setTurns((current) =>
        [...current, { role: 'user' as const, text: trimmed }, { role: 'assistant' as const, text: assistant }].slice(-6),
      )
      setLatest(response)
      setAnswerRevision((value) => value + 1)
      setAsked(trimmed)
      setDraft('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ask Health couldn't generate an explanation. Your Health data is unchanged.")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ask Health</h1>
          <p className="mt-1 text-sm text-zinc-600">Answers use your Health evidence first, with general health context when useful.</p>
        </div>
        <button
          type="button"
          className={quietButtonClass}
          disabled={pending}
          onClick={() => {
            lastPersonalQuestionRef.current = null
            setTurns([])
            setLatest(null)
            setReturnNotice(false)
            setAsked(null)
            setError(null)
            setDraft('')
            setOwnerNote('')
            setNoteOpen(false)
          }}
        >
          New chat
        </button>
      </div>
      {returnNotice ? (
        <p role="status" className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          Review your original question below and press Ask to reassess it using the current saved records.
          No AI request was made; Health does not assume you changed a source.
        </p>
      ) : null}
      <KnownProfilePanel today={today} />
      <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Ask Health lens">
        {LENSES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={item === lens}
            disabled={pending}
            className={`min-h-10 shrink-0 rounded-md px-3 text-sm font-medium ${item === lens ? 'bg-zinc-900 text-white' : 'text-zinc-600'}`}
            onClick={() => {
              setLens(item)
              lastPersonalQuestionRef.current = null
              setTurns([])
              setLatest(null)
              setError(null)
            }}
          >
            {ASK_LENS_LABELS[item]}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <label htmlFor="ask-context-mode" className="block text-sm font-medium text-zinc-800">Context mode</label>
        <select id="ask-context-mode" value={contextMode} disabled={pending}
          onChange={(event) => {
            setContextMode(event.target.value as AskContextMode)
            lastPersonalQuestionRef.current = null
            setTurns([])
            setLatest(null)
            setError(null)
          }}
          className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm">
          {ASK_CONTEXT_MODES.map((mode) => (
            <option key={mode} value={mode}>{ASK_CONTEXT_MODE_LABELS[mode]}</option>
          ))}
        </select>
        <p className="text-xs leading-5 text-zinc-600">
          {contextMode === 'smart'
            ? 'Automatically uses records when the question calls for them. May omit personal data for general questions.'
            : contextMode === 'personalized'
              ? 'Always consider relevant saved Health evidence—even for general-looking questions.'
              : contextMode === 'deep'
                ? 'Broader cross-domain review using the selected date range. Still bounded; omitted evidence is disclosed. May use more AI tokens.'
                : 'Educational answer only; saved Health records and prior private conversation are not sent.'}
        </p>
      </div>
      <fieldset disabled={pending}>
        <ProgressRangeControl range={range} onChange={changeRange} />
      </fieldset>
      {deepRangeHint ? (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
          <p className="text-xs leading-5 text-zinc-700">{deepRangeHint.message}</p>
          {deepRangeHint.canExpand ? (
            <button type="button" disabled={pending}
              className="min-h-11 text-left text-sm font-medium text-zinc-900 underline"
              onClick={() => changeRange('all')}>
              Use all available history for Deep Dive
            </button>
          ) : null}
        </div>
      ) : null}
      {turns.length === 0 && !latest ? (
        <div className="space-y-2">
          {ASK_SUGGESTIONS[lens].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="block min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-left text-sm text-zinc-800"
              disabled={pending}
              onClick={() => setDraft(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <div className="space-y-3">
        {turns
          .filter((turn) => turn.role === 'user')
          .map((turn, index) => (
            <p key={`${turn.text}-${index}`} className="text-sm font-medium text-zinc-900">
              {turn.text}
            </p>
          ))}
        {latest?.meta.answerScope === 'urgent_safety' ? (
          <p className="text-sm font-semibold text-rose-800" role="status">
            Immediate safety guidance · based on your message, not stored records or an AI diagnosis
          </p>
        ) : null}
        {latest?.meta.answerScope === 'general' ? (
          <p className="text-xs text-zinc-600" role="status">General health education · no personal Health records used{latest.meta.cached ? ' · reused answer' : ''}</p>
        ) : null}
        {latest?.meta.evidenceOverview ? (
          <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-zinc-800">
              {latest.meta.provider === 'gemini' ? 'What Health AI considered' : 'Health handled this without an AI request'} · {latest.meta.evidenceOverview.availableCount} available facts
            </summary>
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              {latest.meta.answerScope === 'general' || latest.meta.answerScope === 'urgent_safety'
                ? 'No personal Health records were included.'
                : 'Evidence domains: ' + (latest.meta.evidenceOverview.domains.join(', ') || 'none available') + '.'}
              {latest.meta.evidenceOverview.limited
                ? ' Some candidate facts were excluded by the packet size limit; this is not the full history.' : ''}
              {latest.meta.evidenceOverview.omittedCount > 0
                ? ' Omitted candidate facts: ' + latest.meta.evidenceOverview.omittedCount + '.' : ''}
            </p>
            {latest.meta.provider !== 'gemini' ? (
              <p className="mt-2 text-xs text-zinc-600">No records were transmitted to a model for this deterministic response.</p>
            ) : null}
            {latest.meta.provider === 'gemini' && latest.meta.evidenceOverview.items.length > 0 ? (
              <ul className="mt-3 space-y-2" aria-label="Facts supplied to the AI">
                {latest.meta.evidenceOverview.items.map((item) => (
                  <li key={item.id} className="rounded-md border border-zinc-200 bg-white p-2 text-xs text-zinc-700">
                    <span className="font-medium text-zinc-900">{item.label}</span>
                    <span className="text-zinc-500"> · {item.domain}</span>
                    {item.dates.length ? <p className="mt-1">Recorded dates: {item.dates.slice(0, 4).join(', ')}{item.dates.length > 4 ? ' and others' : ''}</p> : null}
                    {item.provenance ? <p className="mt-1">Source: {item.provenance}</p> : null}
                    <p className="mt-1">
                      {latest.evidence.some((cited) => cited.id === item.id)
                        ? 'Referenced in this answer' : 'Supplied as context; not cited in the answer'}
                    </p>
                    {item.detailPath?.startsWith('/') && !item.detailPath.startsWith('//') ? (
                      <a href={prefixedPath(prefix, item.detailPath)} className="mt-1 inline-block min-h-8 font-medium underline">
                        View source
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {latest.meta.provider === 'gemini' && latest.meta.evidenceOverview.unlistedCount > 0 ? (
              <p className="mt-2 text-xs text-zinc-600">
                {latest.meta.evidenceOverview.unlistedCount} additional supplied facts are not individually listed here.
              </p>
            ) : null}
            <p className="mt-1 text-xs text-zinc-600">The answer cites specific facts it used; supplying context does not mean every supplied record influenced the answer.</p>
          </details>
        ) : null}
        {latest ? <AskHealthContextSummary context={latest.meta.context} /> : null}
        {latest && asked ? (
          <AskHealthAnswerView key={answerRevision} answer={latest.answer} evidence={latest.evidence}
            correctionContext={{ question: asked, lens: latest.meta.lens, range: latest.meta.range, contextMode: latest.meta.contextMode }}
            onDraftFollowUp={setDraft} />
        ) : null}
        {latest && asked ? <ExternalResearch question={asked} /> : null}
      </div>
      {latest && asked ? (
        <OptionalClarification
          key={answerRevision}
          question={asked}
          missing={latest.meta.context.missing}
          today={today}
        />
      ) : null}
      {latest ? (
        <section className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
          <button type="button" aria-expanded={noteOpen}
            className="min-h-11 text-left text-sm font-medium text-zinc-800 underline"
            onClick={() => setNoteOpen((open) => !open)}>
            Record a lasting fact in my Health Profile
          </button>
          {noteOpen ? (
            <div className="space-y-2">
              <p className="text-xs leading-5 text-zinc-600">
                Write a fact you personally affirm. We never copy an AI answer,
                treat a question as a fact, or save this automatically.
                Temporary symptoms belong in Daily Context.
              </p>
              <label htmlFor="ask-owner-note" className="block text-sm font-medium text-zinc-800">My statement</label>
              <textarea id="ask-owner-note" rows={3} maxLength={MAX_OWNER_NOTE_DRAFT}
                value={ownerNote} onChange={(event) => setOwnerNote(event.target.value)}
                className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <button type="button" className={quietButtonClass}
                disabled={!makeOwnerNoteReviewState(ownerNote)}
                onClick={() => {
                  const state = makeOwnerNoteReviewState(ownerNote)
                  if (state) navigate(prefixedPath(prefix, '/settings#health-profile'), { state })
                }}>Review in Health Profile</button>
            </div>
          ) : null}
        </section>
      ) : null}
      {latest && latest.answer.followUps.length > 0 ? (
        <div className="flex flex-col gap-2">
          {latest.answer.followUps.map((followUp) => (
            <button key={followUp} type="button" className="min-h-11 text-left text-sm font-medium underline" onClick={() => setDraft(followUp)}>
              {followUp}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="text-sm text-zinc-700">{error}</p> : null}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          void submit(draft)
        }}
      >
        <label className="block text-sm font-medium text-zinc-800" htmlFor="ask-health-question">
          Question
        </label>
        <textarea
          id="ask-health-question"
          disabled={pending}
          value={draft}
          maxLength={1000}
          rows={3}
          onChange={(event) => setDraft(event.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button type="submit" className={primaryButtonClass} disabled={pending || draft.trim().length === 0}>
          {pending ? 'Asking' : 'Ask'}
        </button>
      </form>
    </section>
  )
}


function AskHealthContextSummary({
  context,
}: {
  context: Awaited<ReturnType<typeof askHealth>>['meta']['context']
}) {
  if (context.knows.length === 0 && context.missing.length === 0) return null
  return (
    <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-zinc-800">
        Health context · {context.knows.length} known · {context.missing.length} missing
      </summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What Health knows</h2>
          {context.knows.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">No mature evidence is available for this question yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {context.knows.map((item) => (
                <li key={item.key} className="text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">{item.label}</span>
                  <span className="text-zinc-500"> · {item.confidence} confidence</span>
                  <p className="mt-0.5">{item.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Missing context that matters</h2>
          {context.missing.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">No major missing signal was identified for this question.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {context.missing.map((item) => (
                <li key={item.key} className="text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">{item.label}</span>
                  <p className="mt-0.5">{item.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  )
}
