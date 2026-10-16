export const ASK_HEALTH_PACKET_VERSION = 'ask-health-evidence-v2'
export const ASK_HEALTH_PROMPT_VERSION = 'ask-health-v11'
export const ASK_HEALTH_REQUEST_TYPE = 'ask_health'

export const ASK_LENSES = ['general', 'training', 'nutrition', 'recovery', 'experiments'] as const
export type AskLens = (typeof ASK_LENSES)[number]

/** Owner controls private-context access explicitly; labels are public UI metadata. */
export const ASK_CONTEXT_MODES = ['smart', 'personalized', 'deep', 'general_only'] as const
export type AskContextMode = (typeof ASK_CONTEXT_MODES)[number]
export const DEFAULT_ASK_CONTEXT_MODE: AskContextMode = 'personalized'
export const ASK_CONTEXT_MODE_LABELS: Record<AskContextMode, string> = {
  smart: 'Smart', personalized: 'Personalized', deep: 'Deep Dive', general_only: 'General Only',
}

export const ASK_QUESTION_MAX = 1000
export const ASK_TURN_MAX = 2000
export const ASK_CONVERSATION_KEEP = 6
export const ASK_CONVERSATION_REJECT = 12
export const ASK_CONVERSATION_CHARS = 6000
export const ASK_PACKET_MAX_CHARS = 24_000
export const ASK_ANSWER_MAX_CHARS = 8000
export const ASK_BLOCK_MAX = 8
export const ASK_BLOCK_TEXT_MAX = 800

export const ASK_LENS_LABELS: Record<AskLens, string> = {
  general: 'General',
  training: 'Training',
  nutrition: 'Nutrition',
  recovery: 'Recovery',
  experiments: 'Experiments',
}
