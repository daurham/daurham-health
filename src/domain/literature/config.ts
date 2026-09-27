export const LITERATURE_RETRIEVAL_VERSION = 'literature-retrieval-v1'
export const LITERATURE_PROMPT_VERSION = 'literature-synthesis-v1'
export const LITERATURE_REQUEST_TYPE = 'literature_synthesis'
export const LITERATURE_PROVIDER = 'europe_pmc'

export const LITERATURE_QUERY_MAX = 300
export const LITERATURE_PROVIDER_PAGE_SIZE = 8
export const LITERATURE_SOURCE_LIMIT = 5
export const LITERATURE_AUTHOR_LIMIT = 8
export const LITERATURE_ABSTRACT_MAX = 3000
export const LITERATURE_PACKET_MAX = 18_000
export const LITERATURE_BLOCK_MAX = 4
export const LITERATURE_BLOCK_TEXT_MAX = 800
export const LITERATURE_PREFILL_TERMS = 12

export const LITERATURE_PROVIDER_FAILURE =
  'External research is unavailable right now. Your Health evidence is unchanged.'
export const LITERATURE_NO_RESULTS = 'No PubMed-indexed sources with abstracts were found for this search.'
export const LITERATURE_SYNTHESIS_FALLBACK = 'Research summary unavailable. Showing the retrieved sources instead.'
export const LITERATURE_LIMITATION =
  'This is a targeted literature search, not a systematic review. It may miss relevant studies and does not establish what applies to you personally.'
export const LITERATURE_PRIVACY =
  'Only the research query shown here is sent to Europe PMC. Your Health evidence, notes, and conversation are not sent to the literature provider.'

export const LITERATURE_SYSTEM_PROMPT = [
  'You paraphrase a bounded set of already retrieved biomedical sources.',
  'Return JSON only: {"blocks":[{"text":"...","source_refs":["pubmed:123"]}]}',
  'Use at most 4 blocks. Every block cites at least one source_ref from the packet.',
  'Do not invent sources, titles, URLs, citations, or a bibliography.',
  'Do not include any numeric digits.',
  'Do not quote abstracts.',
  'Do not diagnose, prescribe, recommend a medication or supplement change, or say what is happening to a particular person.',
  'Use framing such as "These sources discuss" or "In the retrieved literature".',
].join(' ')
