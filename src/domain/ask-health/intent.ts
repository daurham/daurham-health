import type { AskTurn } from './types.js'

/**
 * Cheap first-pass PIQ-3 intent router. General-only is intentionally strict:
 * false negatives use the existing owner-grounded route, while false positives
 * could hide needed records. No model call or user-specific profile lookup.
 */
export type AskIntent =
  | 'general_explanation'
  | 'personal_metric'
  | 'personal_trend'
  | 'personal_why'
  | 'symptom_context'
  | 'compare_options'
  | 'plan_decision'
  | 'exercise_coaching'
  | 'experiment_design'
  | 'research_request'
  | 'historical_reference'
  | 'urgent_safety'
  | 'ambiguous'

export type AskIntentRoute = {
  intent: AskIntent
  route: 'general' | 'owner'
  confidence: 'high' | 'conservative'
}

const SELF = /\b(i|i'm|im|i've|ive|i'd|my|mine|me|myself|we|our|ours|us)\b/i
const OWNER_REFERENT = /\b(?:the|this|that)\s+(?:(?:training|workout|nutrition|weekly|fitness|health)\s+)?(?:goal|target|plan|routine|workout|session|measurement|log|trend|experiment|result|record|entry)\b/i
const PERSONAL_DIRECTIVE = /\b(for me|should i|can i|do i|am i|have i|would i|help me|tell me about myself|based on (my|our)|according to (my|our))\b/i
const SYMPTOM = /\b(symptoms?|pain|dizzy|nausea|constipation|diarrhea|headaches?|sick|fatigue|fainting|bleeding|vomit|heart racing|short(ness)? of breath)\b/i
const URGENT = /\b(chest pain|can't breathe|cannot breathe|difficulty breathing|severe bleeding|stroke|suicid(al|e)|overdose|unconscious|passing out)\b/i
const RESEARCH = /\b(research|studies|papers|clinical trials|meta.analysis|systematic review|published evidence|recent guidelines)\b/i
const HISTORICAL = /\b(last|previous|past|earlier|before|yesterday|ago|since)\b.{0,26}\b(days?|weeks?|months?|years?)\b|\byesterday\b|\blast (year|month|week)\b/i
const TREND = /\b(trend|progress|improv(ed|ing|ement)?|chang(ed|ing|es)?|plateau|average|compare|over time|up or down|increase|decrease)\b/i
const PERSONAL_WHY = /\b(why|cause|because|reason|explain|how come)\b/i
const EXERCISE_COACH = /\b(how (should|can|do) i (squat|deadlift|bench|lift|train|run|exercise)|form (for|on) my)\b/i
const EXPERIMENT = /\b(experiment|protocol|test whether|trial period|a.b test|n.of.1)\b/i
const DECISION = /\b(should|recommend|plan|safe for me|change my|adjust my|what do i do|which should i)\b/i
const METRIC = /\b(weight|height|calories|protein|fiber|sodium|sleep|steps|heart rate|blood pressure|bench|squat|hydration|water intake|goal|measurement|body fat|macros)\b/i
const EDUCATIONAL = /^(?:what (?:is|are|does|do|causes?|happens?|can)|how (?:does|do|is|are|can|much|many)|why (?:does|do|is|are)|explain|define|describe|tell me about|benefits? of|risks? of|differences? between|is there evidence (?:that|for)|does\b|can\b|are\b|is\b)/i

export function routeAskHealthIntent(question: string, conversation: readonly AskTurn[] = []): AskIntentRoute {
  const q = question.trim()
  const personal = SELF.test(q) || PERSONAL_DIRECTIVE.test(q)
  if (OWNER_REFERENT.test(q)) return { intent: 'ambiguous', route: 'owner', confidence: 'conservative' }
  if (personal && URGENT.test(q)) return { intent: 'urgent_safety', route: 'owner', confidence: 'high' }
  if (personal && SYMPTOM.test(q)) return { intent: 'symptom_context', route: 'owner', confidence: 'high' }
  if (RESEARCH.test(q)) return { intent: 'research_request', route: 'owner', confidence: 'conservative' }
  if (personal && EXERCISE_COACH.test(q)) return { intent: 'exercise_coaching', route: 'owner', confidence: 'high' }
  if (personal && EXPERIMENT.test(q)) return { intent: 'experiment_design', route: 'owner', confidence: 'high' }
  if (personal && DECISION.test(q)) return { intent: 'plan_decision', route: 'owner', confidence: 'high' }
  if (personal && PERSONAL_WHY.test(q)) return { intent: 'personal_why', route: 'owner', confidence: 'high' }
  if (personal && (TREND.test(q) || HISTORICAL.test(q))) return { intent: 'personal_trend', route: 'owner', confidence: 'high' }
  if (personal && METRIC.test(q)) return { intent: 'personal_metric', route: 'owner', confidence: 'high' }
  if (personal) return { intent: 'ambiguous', route: 'owner', confidence: 'conservative' }

  // A standalone educational prompt may safely have no private context.
  // A short dependent follow-up must not silently lose its previous meaning.
  if (conversation.length > 0 && !EDUCATIONAL.test(q)) {
    return { intent: 'ambiguous', route: 'owner', confidence: 'conservative' }
  }
  if (HISTORICAL.test(q)) return { intent: 'historical_reference', route: 'owner', confidence: 'conservative' }
  if (EXPERIMENT.test(q)) return { intent: 'experiment_design', route: 'owner', confidence: 'conservative' }
  if (EDUCATIONAL.test(q) && q.length >= 10) {
    return { intent: 'general_explanation', route: 'general', confidence: 'high' }
  }
  if (/\b(?:versus|vs\.?|compare|difference between)\b/i.test(q)) {
    return { intent: 'compare_options', route: 'owner', confidence: 'conservative' }
  }
  return { intent: 'ambiguous', route: 'owner', confidence: 'conservative' }
}
