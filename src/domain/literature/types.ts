export const LITERATURE_STUDY_TYPES = [
  'meta_analysis',
  'systematic_review',
  'randomized_trial',
  'clinical_trial',
  'observational',
  'review',
  'other',
] as const

export type LiteratureStudyType = (typeof LITERATURE_STUDY_TYPES)[number]

/** Server-side retrieval record. `abstractText` never leaves the server. */
export type LiteratureRecord = {
  sourceRef: string
  provider: 'europe_pmc'
  pmid: string
  doi: string | null
  title: string
  journal: string | null
  publicationYear: number | null
  authors: string[]
  studyType: LiteratureStudyType
  abstractText: string
}

export type LiteratureSourceCard = {
  sourceRef: string
  provider: 'europe_pmc'
  pmid: string
  doi: string | null
  title: string
  journal: string | null
  publicationYear: number | null
  authors: string[]
  studyType: LiteratureStudyType
  marker: string
  pubmedUrl: string
  doiUrl: string | null
}

export type LiteratureSynthesisBlock = {
  text: string
  sourceRefs: string[]
}

export type LiteratureSearchResponse = {
  calculationVersion: 'literature-retrieval-v1'
  provider: 'europe_pmc'
  query: string
  sources: LiteratureSourceCard[]
  synthesis: { blocks: LiteratureSynthesisBlock[] } | null
  notice: string | null
  limitation: string
}
