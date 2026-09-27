import { authorLine, doiLink, pubmedLink, STUDY_TYPE_LABELS, type LiteratureSearchResponse } from '@/domain/literature'

export function ResearchSources({
  result,
  exampleLabel,
}: {
  result: LiteratureSearchResponse
  exampleLabel?: string
}) {
  return (
    <div className="space-y-3">
      {exampleLabel ? <p className="text-sm font-medium text-zinc-700">{exampleLabel}</p> : null}
      {result.notice ? <p className="text-sm text-zinc-700">{result.notice}</p> : null}
      {result.synthesis ? (
        <div className="space-y-3">
          {result.synthesis.blocks.map((block, index) => (
            <p key={`${block.text}-${index}`} className="text-sm leading-6 text-zinc-800">
              {block.text} {researchMarkers(block.sourceRefs, result.sources)}
            </p>
          ))}
        </div>
      ) : null}
      {result.sources.length > 0 ? (
        <ol className="space-y-3">
          {result.sources.map((source) => {
            const pubmed = pubmedLink(source.pmid)
            const doi = doiLink(source.doi)
            return (
              <li key={source.sourceRef} className="rounded-md border border-zinc-200 p-3 text-sm text-zinc-700">
                <p className="font-medium text-zinc-900">
                  [{source.marker}] {STUDY_TYPE_LABELS[source.studyType]}
                </p>
                <p className="mt-1 text-zinc-900">{source.title}</p>
                <p>{[source.journal, source.publicationYear, authorLine(source.authors)].filter((part) => part).join(' · ')}</p>
                <p className="mt-2 flex flex-wrap gap-x-4">
                  {pubmed && source.pubmedUrl === pubmed ? (
                    <a className="inline-flex min-h-11 items-center font-medium underline" href={pubmed}>
                      PubMed
                    </a>
                  ) : null}
                  {doi && source.doiUrl === doi ? (
                    <a className="inline-flex min-h-11 items-center font-medium underline" href={doi}>
                      DOI
                    </a>
                  ) : null}
                </p>
              </li>
            )
          })}
        </ol>
      ) : null}
      <p className="text-sm leading-6 text-zinc-600">{result.limitation}</p>
    </div>
  )
}

function researchMarkers(
  refs: readonly string[],
  sources: LiteratureSearchResponse['sources'],
): string {
  return refs
    .map((ref) => sources.find((source) => source.sourceRef === ref)?.marker)
    .filter((marker): marker is string => Boolean(marker))
    .map((marker) => `[${marker}]`)
    .join(' ')
}
