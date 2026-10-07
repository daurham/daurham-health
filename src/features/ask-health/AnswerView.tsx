import { Link } from 'react-router-dom'
import type { AskEvidence, AskHealthAnswer } from '@/domain/ask-health'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'

export function AskHealthAnswerView({
  answer,
  evidence,
}: {
  answer: AskHealthAnswer
  evidence: readonly AskEvidence[]
}) {
  const prefix = useAppPathPrefix()
  const ordered = orderedEvidence(answer, evidence)
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {answer.blocks.map((block, index) => (
          <p key={`${block.text}-${index}`} className="text-sm leading-6 text-zinc-800">
            {block.text} {markerList(block.evidenceRefs, ordered)}
          </p>
        ))}
        {answer.limitations.map((block, index) => (
          <p key={`${block.text}-${index}`} className="text-sm leading-6 text-zinc-600">
            {block.text} {markerList(block.evidenceRefs, ordered)}
          </p>
        ))}
      </div>
      {ordered.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4" aria-label="Your Health evidence">
          <h2 className="text-sm font-semibold text-zinc-900">Your Health evidence</h2>
          <ol className="mt-3 space-y-3">
            {ordered.map((item, index) => (
              <li key={item.id} className="text-sm text-zinc-700">
                <p className="font-medium text-zinc-900">
                  {index + 1}. {item.label}
                </p>
                <p>{evidenceSummary(item)}</p>
                {item.detailPath ? (
                  <Link to={prefixedPath(prefix, item.detailPath)} className="mt-1 inline-flex min-h-11 items-center font-medium underline">
                    View
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}

function orderedEvidence(answer: AskHealthAnswer, evidence: readonly AskEvidence[]): AskEvidence[] {
  const byId = new Map(evidence.map((item) => [item.id, item]))
  const ordered: AskEvidence[] = []
  const seen = new Set<string>()
  for (const block of [...answer.blocks, ...answer.limitations]) {
    for (const id of block.evidenceRefs) {
      if (seen.has(id)) {
        continue
      }
      const item = byId.get(id)
      if (!item) {
        continue
      }
      seen.add(id)
      ordered.push(item)
    }
  }
  return ordered
}

function markerList(refs: readonly string[], ordered: readonly AskEvidence[]): string {
  const numbers = refs
    .map((id) => ordered.findIndex((item) => item.id === id) + 1)
    .filter((number) => number > 0)
  return numbers.map((number) => `[${number}]`).join(' ')
}

function evidenceSummary(item: AskEvidence): string {
  const parts: string[] = []
  if (item.coverage) {
    const logged = item.coverage.loggedDays
    const calendar = item.coverage.calendarDays
    if (typeof logged === 'number' && typeof calendar === 'number') {
      parts.push(`${logged} logged days / ${calendar}`)
    }
    const observations = item.coverage.observations
    if (typeof observations === 'number') {
      parts.push(`${observations} observations`)
    }
    const nights = item.coverage.analysisEligibleNights
    if (typeof nights === 'number') {
      parts.push(`${nights} complete nights`)
    }
  }
  if (typeof item.value === 'number') {
    parts.push(`${trimNumber(item.value)}${item.unit ? ` ${item.unit}` : ''}`)
  } else if (typeof item.value === 'string' && item.value.length > 0) {
    parts.push(item.value)
  }
  if (item.confidence) {
    parts.push(`${item.confidence} confidence`)
  }
  if (item.provenance) {
    parts.push(`source: ${item.provenance}`)
  }
  if (item.text && parts.length === 0) {
    parts.push(item.text)
  }
  return parts.join(' · ') || item.label
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
