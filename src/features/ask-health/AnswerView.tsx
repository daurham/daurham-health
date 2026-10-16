import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AskLens } from '@/domain/ask-health'
import type { ProgressRange } from '@/domain/progress'
import { canonicalCorrectionForEvidence, correctionFollowUpDraft, makeAskCorrectionState } from '@/domain/ask-health/corrections'
import type { AskEvidence, AskHealthAnswer } from '@/domain/ask-health'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'

export function AskHealthAnswerView({
  answer,
  evidence,
  correctionContext,
  onDraftFollowUp,
}: {
  answer: AskHealthAnswer
  evidence: readonly AskEvidence[]
  correctionContext?: { question: string; lens: AskLens; range: ProgressRange }
  onDraftFollowUp?: (draft: string) => void
}) {
  const prefix = useAppPathPrefix()
  const [flaggedId, setFlaggedId] = useState<string | null>(null)
  const returnState = correctionContext
    ? makeAskCorrectionState(correctionContext.question, correctionContext.lens, correctionContext.range)
    : null
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
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {item.detailPath ? (
                    <Link to={prefixedPath(prefix, item.detailPath)} className="mt-1 inline-flex min-h-11 items-center font-medium underline">
                      View source
                    </Link>
                  ) : null}
                  {onDraftFollowUp ? (
                    <button type="button" className="min-h-11 text-sm font-medium underline"
                      aria-expanded={flaggedId === item.id}
                      onClick={() => setFlaggedId((current) => current === item.id ? null : item.id)}>
                      Something wrong?
                    </button>
                  ) : null}
                </div>
                {flaggedId === item.id && onDraftFollowUp ? (
                  <div className="mt-2 space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                    {canonicalCorrectionForEvidence(item) && returnState ? (
                      <>
                        <p className="font-semibold">{canonicalCorrectionForEvidence(item)?.title}</p>
                        <p className="text-xs leading-5 text-zinc-600">{canonicalCorrectionForEvidence(item)?.instructions}</p>
                        <Link className="inline-flex min-h-10 items-center font-medium underline"
                          to={prefixedPath(prefix, canonicalCorrectionForEvidence(item)!.destination)}
                          state={returnState}>
                          Open canonical source for review
                        </Link>
                      </>
                    ) : (
                      <p className="text-xs leading-5 text-zinc-600">
                        This is a calculated result, imported observation, or other source
                        without a verified direct-edit route here. Inspect the source where
                        available; a chat reply cannot change the underlying record.
                      </p>
                    )}
                    <button type="button" className="block min-h-10 font-medium underline"
                      onClick={() => {
                        onDraftFollowUp(correctionFollowUpDraft(item.label))
                        setFlaggedId(null)
                      }}>
                      Draft a follow-up about the interpretation
                    </button>
                  </div>
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
