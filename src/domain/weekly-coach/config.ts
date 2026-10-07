export const WEEKLY_COACH_PACKET_VERSION = 'weekly-coach-evidence-v1' as const
export const WEEKLY_COACH_PROMPT_VERSION = 'weekly-coach-v2' as const
export const WEEKLY_COACH_REQUEST_TYPE = 'weekly_coach' as const

export const WEEKLY_COACH_MIN_SUBSTANTIVE_DOMAINS = 2
export const WEEKLY_COACH_ACTIVITY_MIN_OBSERVED = 4
export const WEEKLY_COACH_SLEEP_MIN_NIGHTS = 4
export const WEEKLY_COACH_NUTRITION_MIN_LOGGED = 4
export const WEEKLY_COACH_SUPPLEMENT_MIN_SCHEDULED_DAYS = 4
export const WEEKLY_COACH_PROTEIN_MIN_LOGGED = 4
export const WEEKLY_COACH_PROTEIN_TARGET_RATIO = 0.8
export const WEEKLY_COACH_PACKET_CHAR_LIMIT = 16_000

export const WEEKLY_COACH_WENT_WELL_CAP = 3
export const WEEKLY_COACH_WATCH_CAP = 2
export const WEEKLY_COACH_PR_CAP = 2

export const WEEKLY_COACH_INSUFFICIENT_COPY = 'Not enough completed weekly evidence for a coach brief yet.'
export const WEEKLY_COACH_FALLBACK_COPY = 'Coach wording unavailable. Showing your weekly evidence instead.'

export const CANONICAL_TRAINING_SESSION_TYPES = ['programmed', 'ad_hoc', 'experiment'] as const
