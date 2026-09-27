import { demoDueSuggestion, demoEmptySuggestionCopy, DEMO_SUGGESTION_LABEL } from '@/demo/experiment-suggestions'
import { SuggestionList } from '@/features/lab/SuggestionPages'

export function DemoLabPage() {
  const suggestion = demoDueSuggestion()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Personal Lab</h1>
        <p className="mt-1 text-sm text-zinc-600">Fictional suggestions. Nothing here creates an experiment.</p>
      </div>
      <SuggestionList suggestions={[suggestion]} empty={null} toSuggestion={() => '/demo/lab'} />
      <section className="space-y-2 rounded-lg border border-zinc-200 bg-white px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Why this was suggested</h2>
        <p className="text-sm text-zinc-800">{suggestion.why}</p>
        <p className="text-sm text-zinc-800">{suggestion.evidence.find((item) => item.ref.startsWith('result:'))?.label}</p>
        <p className="text-sm text-zinc-800">{suggestion.linkedBenchmarkLabel}</p>
        <p className="text-sm text-zinc-600">{suggestion.limitations}</p>
        <p className="text-sm font-medium text-zinc-700">{DEMO_SUGGESTION_LABEL}</p>
        <p className="text-sm text-zinc-800">Your Push-up Capacity retest is due under the existing protocol.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">When nothing qualifies</h2>
        <SuggestionList suggestions={[]} empty={demoEmptySuggestionCopy()} toSuggestion={() => '/demo/lab'} />
      </section>
    </div>
  )
}
