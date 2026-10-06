import { useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { ASK_LENS_LABELS, ASK_SUGGESTIONS, type AskLens, type AskTurn } from '@/domain/ask-health'
import type { ProgressRange } from '@/domain/progress'
import { primaryButtonClass, quietButtonClass, useHealthCalendarDate } from '@/lib'
import { ProgressRangeControl } from '@/features/progress/ProgressRangeControl'
import { askHealth } from './api'
import { AskHealthAnswerView } from './AnswerView'
import { ExternalResearch } from './ExternalResearch'

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
  const [params] = useSearchParams()
  const [lens, setLens] = useState<AskLens>(() => initialLens(params.get('lens')))
  const [range, setRange] = useState<ProgressRange>(() => initialRange(params.get('range')))
  const [draft, setDraft] = useState(() => params.get('question') ?? '')
  const [turns, setTurns] = useState<AskTurn[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latest, setLatest] = useState<Awaited<ReturnType<typeof askHealth>> | null>(null)
  const [asked, setAsked] = useState<string | null>(null)

  async function submit(question: string) {
    const trimmed = question.trim()
    if (!trimmed || pending) {
      return
    }
    setPending(true)
    setError(null)
    try {
      const response = await askHealth({
        question: trimmed,
        lens,
        range,
        asOf: today,
        conversation: turns.slice(-6),
      })
      const assistant = response.answer.blocks.map((block) => block.text).join('\n')
      setTurns((current) =>
        [...current, { role: 'user' as const, text: trimmed }, { role: 'assistant' as const, text: assistant }].slice(-6),
      )
      setLatest(response)
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
          onClick={() => {
            setTurns([])
            setLatest(null)
            setAsked(null)
            setError(null)
            setDraft('')
          }}
        >
          New chat
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Ask Health lens">
        {LENSES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={item === lens}
            className={`min-h-10 shrink-0 rounded-md px-3 text-sm font-medium ${item === lens ? 'bg-zinc-900 text-white' : 'text-zinc-600'}`}
            onClick={() => {
              setLens(item)
              setTurns([])
              setLatest(null)
              setError(null)
            }}
          >
            {ASK_LENS_LABELS[item]}
          </button>
        ))}
      </div>
      <ProgressRangeControl range={range} onChange={setRange} />
      {turns.length === 0 && !latest ? (
        <div className="space-y-2">
          {ASK_SUGGESTIONS[lens].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="block min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-left text-sm text-zinc-800"
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
        {latest ? <AskHealthAnswerView answer={latest.answer} evidence={latest.evidence} /> : null}
        {latest && asked ? <ExternalResearch question={asked} /> : null}
      </div>
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
