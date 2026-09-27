export const EXPERIMENT_SUGGESTION_CALCULATION_VERSION = 'experiment-suggestions-v1' as const
export const EXPERIMENT_SUGGESTION_PACKET_VERSION = 'experiment-suggestion-evidence-v1' as const
export const EXPERIMENT_SUGGESTION_PROMPT_VERSION = 'experiment-suggestion-v1' as const
export const EXPERIMENT_SUGGESTION_REQUEST_TYPE = 'experiment_suggestion' as const

export const SUGGESTION_LIST_LIMIT = 3

export const SUGGESTION_EMPTY_COPY = 'No evidence-grounded experiment suggestions right now.'

export const SUGGESTION_STALE_COPY =
  'Health data changed since this proposal was created. Review a fresh suggestion before creating the Experiment.'

export const SUGGESTION_AI_FALLBACK_COPY =
  'AI wording unavailable. You can still review the evidence-grounded experiment template.'

export const SUGGESTION_SYSTEM_PROMPT = [
  'You phrase an experiment proposal that Health has already judged eligible.',
  'Return JSON with candidate_ref, title, rationale, and evidence_refs.',
  'Do not add protocol, duration, threshold, target, unit, dose, supplement, medication, or citation fields.',
  'Do not invent measurements, causes, diagnoses, or literature.',
  'Do not use digits. The page shows the measurements separately.',
].join(' ')
