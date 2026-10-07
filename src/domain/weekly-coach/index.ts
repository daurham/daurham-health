export {
  WEEKLY_COACH_FALLBACK_COPY,
  WEEKLY_COACH_INSUFFICIENT_COPY,
  WEEKLY_COACH_PACKET_VERSION,
  WEEKLY_COACH_PROMPT_VERSION,
  WEEKLY_COACH_REQUEST_TYPE,
} from './config.js'
export { buildWeeklyCoachBrief as buildWeeklyCoachEvidence, buildWeeklyCoachBrief, weeklyCoachPeriods } from './build.js'
export { WEEKLY_COACH_SYSTEM_PROMPT, weeklyCoachUserPrompt } from './prompt.js'
export { coachPacketText, validateWeeklyCoachModel } from './validate.js'
export type {
  WeeklyCoachBrief,
  WeeklyCoachCommentary,
  WeeklyCoachInput,
  WeeklyCandidate,
  WeeklyTrainingPlanSnapshot,
} from './types.js'
