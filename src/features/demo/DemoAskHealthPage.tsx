import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ASK_LENS_LABELS, ASK_SUGGESTIONS, type AskLens } from '@/domain/ask-health'
import type { ProgressRange } from '@/domain/progress'
import { quietButtonClass } from '@/lib'
import { ProgressRangeControl } from '@/features/progress/ProgressRangeControl'
import { AskHealthAnswerView } from '@/features/ask-health/AnswerView'
import { DEMO_ASK_EMPTY, DEMO_ASK_EXAMPLES, DEMO_ASK_NOTE, DEMO_ASK_RANGE } from './ask-health-demo'

export function DemoAskHealthPage() {
  const [params] = useSearchParams()
  const prefilled = params.get('question')
  const [lens, setLens] = useState<AskLens>(() => {
    const value = params.get('lens')
    if (value === 'general' || value === 'training' || value === 'nutrition' || value === 'recovery' || value === 'experiments') {
      return value
    }
    return 'general'
  })
  const [range, setRange] = useState<ProgressRange>(() => {
    const value = params.get('range')
    if (value === '30d' || value === '90d' || value === '6m' || value === '1y' || value === 'all') {
      return value
    }
    return '30d'
  })
  const [shown, setShown] = useState(DEMO_ASK_EXAMPLES[0]!)
  const [empty, setEmpty] = useState(Boolean(prefilled))

  function showQuestion(question: string) {
    const match = DEMO_ASK_EXAMPLES.find((item) => item.question === question)
    if (!match) {
      setEmpty(true)
      setShown(DEMO_ASK_EXAMPLES[0]!)
      return
    }
    setEmpty(false)
    setShown(match)
    setLens(match.lens)
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ask Health</h1>
          <p className="mt-1 text-sm text-zinc-600">{DEMO_ASK_NOTE}</p>
        </div>
        <button
          type="button"
          className={quietButtonClass}
          onClick={() => {
            setEmpty(true)
          }}
        >
          New chat
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Ask Health lens">
        {(['general', 'training', 'nutrition', 'recovery', 'experiments'] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={item === lens}
            className={`min-h-10 shrink-0 rounded-md px-3 text-sm font-medium ${item === lens ? 'bg-zinc-900 text-white' : 'text-zinc-600'}`}
            onClick={() => setLens(item)}
          >
            {ASK_LENS_LABELS[item]}
          </button>
        ))}
      </div>
      <ProgressRangeControl range={range} onChange={setRange} />
      <div className="space-y-2">
        {ASK_SUGGESTIONS[lens].map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="block min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-left text-sm text-zinc-800"
            onClick={() => showQuestion(suggestion)}
          >
            {suggestion}
          </button>
        ))}
        <button
          type="button"
          className="block min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-left text-sm text-zinc-800"
          onClick={() => showQuestion('How has my sleep been recently?')}
        >
          How has my sleep been recently?
        </button>
      </div>
      {prefilled ? <p className="text-sm text-zinc-700">This question was not sent. {prefilled}</p> : null}
      {empty ? (
        <AskHealthAnswerView
          answer={DEMO_ASK_EMPTY}
          evidence={[{ ...DEMO_ASK_RANGE, value: range, text: `The selected range is ${range}. No question was sent.` }]}
        />
      ) : (
        <AskHealthAnswerView answer={shown.answer} evidence={shown.evidence} />
      )}
    </section>
  )
}
