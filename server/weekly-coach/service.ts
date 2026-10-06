import { NutritionInterpretError } from '../../src/domain/nutrition/interpret.js'
import { isCalendarDate } from '../../src/domain/training.js'
import { DEFAULT_HEALTH_CALENDAR_TIME_ZONE, healthCalendarDateFromNow } from '../../src/domain/time.js'
import {
  WEEKLY_COACH_FALLBACK_COPY,
  WEEKLY_COACH_PACKET_VERSION,
  WEEKLY_COACH_PROMPT_VERSION,
  WEEKLY_COACH_REQUEST_TYPE,
  WEEKLY_COACH_SYSTEM_PROMPT,
  buildWeeklyCoachBrief,
  coachPacketText,
  validateWeeklyCoachModel,
  weeklyCoachUserPrompt,
  type WeeklyCoachBrief,
  type WeeklyCoachCommentary,
} from '../../src/domain/weekly-coach/index.js'
import { boundedProviderCostUsd } from '../ai-usage/cost.js'
import { readAiUsageConfig } from '../ai-usage/config.js'
import { HttpError } from '../http.js'
import { getWeeklyCoachGate, weeklyCoachCacheKey, type WeeklyCoachGate } from './gate.js'
import { loadWeeklyCoachInput } from './load.js'
import { weeklyCoachGemini, weeklyCoachModel } from './provider.js'

const BUDGET = 'Weekly Coach wording is unavailable because the AI monthly budget is reached. Showing your weekly evidence instead.'
const RATE = 'Weekly Coach wording is unavailable because requests are arriving too quickly. Showing your weekly evidence instead.'

export type WeeklyCoachProvider = (input: { system: string; user: string; model: string }) => Promise<{
  text: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
}>

export type WeeklyCoachResponse = {
  brief: WeeklyCoachBrief
  commentary: WeeklyCoachCommentary | null
  notice: string | null
  meta: {
    packetVersion: typeof WEEKLY_COACH_PACKET_VERSION
    promptVersion: typeof WEEKLY_COACH_PROMPT_VERSION
    requestType: typeof WEEKLY_COACH_REQUEST_TYPE
    model: string | null
    cached: boolean
  }
}

export function parseWeeklyAsOf(
  asOf: string | null,
  now = new Date(),
  timezone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
): string {
  const today = healthCalendarDateFromNow(now, timezone)
  const value = asOf?.trim() || today
  if (!isCalendarDate(value)) {
    throw new HttpError(400, 'asOf must be YYYY-MM-DD')
  }
  if (value > today) {
    throw new HttpError(400, 'asOf cannot be in the future')
  }
  return value
}

export async function readWeeklyCoach(asOf: string): Promise<WeeklyCoachResponse> {
  const brief = buildWeeklyCoachBrief(await loadWeeklyCoachInput(asOf))
  return response(brief, null, null, null, false)
}

export async function generateWeeklyCoach(input: {
  asOf: string
  provider?: WeeklyCoachProvider
  gate?: WeeklyCoachGate
  model?: string
  now?: number
}): Promise<WeeklyCoachResponse> {
  const brief = buildWeeklyCoachBrief(await loadWeeklyCoachInput(input.asOf))
  if (!brief.canGenerate) {
    return response(brief, null, null, null, false)
  }
  const model = input.model ?? weeklyCoachModel()
  const gate = input.gate ?? getWeeklyCoachGate()
  const packet = coachPacketText(brief)
  const key = weeklyCoachCacheKey(packet, WEEKLY_COACH_PROMPT_VERSION, model)
  const now = input.now ?? Date.now()
  const decision = await gate.take(key, now, model)
  if (!decision.ok) {
    return response(brief, null, decision.reason === 'budget' ? BUDGET : RATE, model, false)
  }
  if (decision.cached) {
    return response(brief, decision.cached, null, model, true)
  }
  const usageId = decision.usageId
  if (!usageId) {
    return response(brief, null, WEEKLY_COACH_FALLBACK_COPY, model, false)
  }
  try {
    const generated = await (input.provider ?? weeklyCoachGemini)({
      system: WEEKLY_COACH_SYSTEM_PROMPT,
      user: weeklyCoachUserPrompt(packet),
      model,
    })
    const commentary = validateWeeklyCoachModel(generated.text, brief)
    const reserved = readAiUsageConfig().weeklyCoachMaxRequestCostUsd
    const cost = boundedProviderCostUsd(generated.inputTokens, generated.outputTokens, reserved)
    await gate.complete(usageId, cost, generated.inputTokens, generated.outputTokens, now)
    if (!commentary) {
      return response(brief, null, WEEKLY_COACH_FALLBACK_COPY, generated.model, false)
    }
    gate.store(key, commentary)
    return response(brief, commentary, null, generated.model, false)
  } catch (error) {
    if (error instanceof NutritionInterpretError && error.code === 'GEMINI_NOT_CONFIGURED') {
      await gate.release(usageId, now)
    } else {
      await gate.uncertain(usageId, now)
    }
    return response(brief, null, WEEKLY_COACH_FALLBACK_COPY, model, false)
  }
}

function response(
  brief: WeeklyCoachBrief,
  commentary: WeeklyCoachCommentary | null,
  notice: string | null,
  model: string | null,
  cached: boolean,
): WeeklyCoachResponse {
  return {
    brief,
    commentary,
    notice,
    meta: {
      packetVersion: WEEKLY_COACH_PACKET_VERSION,
      promptVersion: WEEKLY_COACH_PROMPT_VERSION,
      requestType: WEEKLY_COACH_REQUEST_TYPE,
      model,
      cached,
    },
  }
}
