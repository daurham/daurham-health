export {
  LITERATURE_LIMITATION,
  LITERATURE_NO_RESULTS,
  LITERATURE_PRIVACY,
  LITERATURE_PROMPT_VERSION,
  LITERATURE_PROVIDER,
  LITERATURE_PROVIDER_FAILURE,
  LITERATURE_REQUEST_TYPE,
  LITERATURE_RETRIEVAL_VERSION,
  LITERATURE_SYNTHESIS_FALLBACK,
} from './config.js'
export { buildLiteratureQueryPrefill, parseLiteratureQuery } from './query.js'
export { authorLine, classifyStudyType, doiLink, pubmedLink, retainLiteratureSources, STUDY_TYPE_LABELS, toSourceCard } from './sources.js'
export { literatureSystemPrompt, literatureUserPrompt, synthesisEvidence, validateLiteratureSynthesis } from './synthesis.js'
export type { LiteratureRecord, LiteratureSearchResponse, LiteratureSourceCard, LiteratureStudyType, LiteratureSynthesisBlock } from './types.js'
