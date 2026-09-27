export const ASK_HEALTH_PACKET_VERSION = 'ask-health-evidence-v1'
export const ASK_HEALTH_PROMPT_VERSION = 'ask-health-v1'
export const ASK_HEALTH_REQUEST_TYPE = 'ask_health'

export const ASK_LENSES = ['general', 'training', 'nutrition', 'recovery', 'experiments'] as const
export type AskLens = (typeof ASK_LENSES)[number]

export const ASK_QUESTION_MAX = 1000
export const ASK_TURN_MAX = 2000
export const ASK_CONVERSATION_KEEP = 6
export const ASK_CONVERSATION_REJECT = 12
export const ASK_CONVERSATION_CHARS = 6000
export const ASK_PACKET_MAX_CHARS = 24_000
export const ASK_ANSWER_MAX_CHARS = 4000
export const ASK_BLOCK_MAX = 8
export const ASK_BLOCK_TEXT_MAX = 800

export const ASK_LENS_LABELS: Record<AskLens, string> = {
  general: 'General',
  training: 'Training',
  nutrition: 'Nutrition',
  recovery: 'Recovery',
  experiments: 'Experiments',
}
