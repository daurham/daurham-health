import type { AskHealthAnswer } from './types.js'

/**
 * PIQ-3.2 deliberately narrow immediate-risk floor, not symptom diagnosis.
 * Only explicit first-person, present-tense statements are caught. Complex,
 * historical, negated, and hypothetical phrasing stays in the owner path for
 * later evidence-aware/clinically reviewed routing.
 */
export type ImmediateSafetyKind = 'emergency' | 'self_harm'

/** Exclude quoted speech from the narrow *current owner's* emergency detector.
 * Quoted first-person sentences can belong to a family member, a historical
 * recounting or an educational example. Avoid treating the quotation as the
 * owner's own statement. More complex cases still use normal Ask Health
 * routing; this is not a medical/safety adjudication of the quote.
 */
export function excludeQuotedSpeech(value: string): string {
  return value
    .replace(/“[^”]*”/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    // Only quotation marks at word boundaries; don't break I'm / can't.
    .replace(/(?<!\w)'(?:[^']|'(?=\w))*'(?!\w)/g, ' ')
    .replace(/(?<!\w)‘(?:[^’]|’(?=\w))*’(?!\w)/g, ' ')
}

export function detectImmediateSafety(question: string): ImmediateSafetyKind | null {
  const normalized = excludeQuotedSpeech(question.trim()).replace(/\u2019/g, "'")
  // Distinct from educational "What causes chest pain?" and owner statements
  // such as "I do not have chest pain" or "I had chest pain last year".
  const crisis = /\b(?:i (?:want|plan|intend|am going|feel ready) to (?:kill|hurt) myself|i(?:'m| am) suicidal|i(?:'m| am) about to (?:kill|hurt) myself)\b/i
  if (crisis.test(normalized)) return 'self_harm'

  const chest = /\b(?:i(?:'m| am)?|we(?:'re| are)?)\s+(?:have|having|feel|feeling|experiencing)\s+(?:(?:new|sudden|severe|crushing|sharp)\s+)?chest pain\b|\bmy chest (?:hurts|is hurting|feels (?:tight|painful))\b/i
  const breath = /\b(?:i|we)\s+(?:can(?:not|'t)|could(?: not|n't))\s+breathe\b|\b(?:i(?:'m| am)?|we(?:'re| are)?)\s+(?:have|having|feel|feeling|experiencing)\s+(?:severe\s+)?(?:trouble|difficulty)\s+breathing\b/i
  const bleed = /\b(?:i(?:'m| am)?|we(?:'re| are)?)\s+(?:am\s+)?(?:bleeding heavily|bleeding uncontrollably|experiencing severe bleeding|have uncontrolled bleeding)\b/i
  const stroke = /\b(?:i(?:'m| am)?|we(?:'re| are)?)\s+(?:am\s+)?(?:having|experiencing)\s+(?:a\s+)?stroke\b/i
  // Narrow PIQ-4.1 digestive red flags: current, explicitly reported
  // first-person symptoms only. No diagnosis is inferred from saved stool
  // types, food logs, historical events, or speculative questions.
  const severeDigestive = /\b(?:i(?:'m| am)\s+(?:vomiting|throwing up)\s+blood|i\s+(?:have|am having|am experiencing)\s+severe\s+(?:abdominal|stomach|belly)\s+pain|i(?:'m| am)\s+(?:passing|having)\s+(?:(?:black(?:\s+and)?\s+)?tarry)\s+stools?)\b/i
  // Common first-person, present-tense tarry-stool descriptions name an
  // observation instead of "passing" stool. Sentence-start anchoring keeps
  // "What if my stool is black and tarry?" out of this immediate-risk floor.
  const currentTarryStool = /(?:^|[.!?]\s+)(?:i\s+have\s+(?:black(?:\s+and)?\s+)?tarry\s+stools?\b|my\s+(?:stools?|poop)\s+(?:is|are)\s+(?:black(?:\s+and)?\s+)?tarry\b)/i
  if (chest.test(normalized) || breath.test(normalized) || bleed.test(normalized) ||
      stroke.test(normalized) || severeDigestive.test(normalized) ||
      currentTarryStool.test(normalized)) {
    return 'emergency'
  }
  return null
}

export function immediateSafetyAnswer(kind: ImmediateSafetyKind): AskHealthAnswer {
  if (kind === 'self_harm') {
    return {
      blocks: [{
        text: 'If you might hurt yourself now, please call your local emergency number or go to the nearest emergency department. Get a trusted person to stay with you, and move away from anything you could use to harm yourself.',
        evidenceRefs: [],
      }],
      limitations: [{
        text: 'I cannot evaluate your immediate safety here. This guidance is based on your message, not on a diagnosis or your saved Health records.',
        evidenceRefs: [],
      }],
      followUps: [],
    }
  }
  return {
    blocks: [{
      text: 'If this is happening right now, call your local emergency number for immediate medical help. Do not drive yourself. Serious symptoms need prompt in-person assessment.',
      evidenceRefs: [],
    }],
    limitations: [{
      text: 'I cannot determine the cause or severity in chat. This is immediate safety guidance based on your message, not a diagnosis or a reading of saved Health records.',
      evidenceRefs: [],
    }],
    followUps: [],
  }
}


/**
 * Third-party current-symptom floor. A reported emergency in another person
 * must receive basic safety guidance, never the account owner's stored facts.
 * This is deliberately not a diagnosis or general medical triage classifier.
 *
 * Quoted, hypothetical and clearly historical language is withheld rather
 * than assumed to describe a live event. Follow-up or ambiguous cases still
 * need appropriately reviewed human-facing clinical routing.
 */
export function detectThirdPartyImmediateSafety(question: string): ImmediateSafetyKind | null {
  const normalized = excludeQuotedSpeech(question.trim()).replace(/\u2019/g, "'")
  // A model should not infer an ongoing emergency from examples, conditional
  // questions or hypothetical scenarios.
  // A leading "if/when" clause describes a possibility, not a verified
  // present-tense report. Current first-person emergencies are checked first
  // by the service, regardless of other conditional clauses.
  if (/^\s*(?:if|when)\s+(?:my|our|his|her|their|the|he|she|they)\b/i.test(normalized) ||
      /\b(?:what if|suppose|imagine|hypothetical(?:ly)?|fictional|scenario|for example|in a story|would|used to)\b/i.test(normalized)) {
    return null
  }
  const person = String.raw`(?:(?:(?:my|our|your|the|his|her|their)\s+(?:(?:young|older|elderly|little|adult|newborn)\s+)?(?:wife|husband|spouse|partner|mother|father|mom|dad|son|daughter|child|baby|kid|brother|sister|friend|roommate|coworker|patient))|(?:he|she|they))`
  const present = String.raw`\b${person}\s+(?:is\s+|are\s+|['’]s\s+)?`
  const patterns = [
    new RegExp(present + String.raw`(?:having|experiencing|feeling|has|have)\s+(?:(?:new|sudden|severe|crushing|sharp)\s+)?chest pain\b`, 'i'),
    new RegExp(present + String.raw`(?:can(?:not|['’]t))\s+breathe\b`, 'i'),
    new RegExp(present + String.raw`(?:having|experiencing|has|have)\s+(?:severe\s+)?(?:trouble|difficulty)\s+breathing\b`, 'i'),
    new RegExp(present + String.raw`(?:bleeding heavily|bleeding uncontrollably|experiencing severe bleeding|having uncontrolled bleeding)\b`, 'i'),
    new RegExp(present + String.raw`(?:having|experiencing)\s+(?:a\s+)?stroke\b`, 'i'),
    new RegExp(present + String.raw`(?:vomiting|throwing up)\s+blood\b`, 'i'),
    new RegExp(String.raw`\b${person}['’]s\s+chest\s+(?:hurts|is hurting|feels (?:tight|painful))\b`, 'i'),
    /\b(?:his|her|their)\s+chest\s+(?:hurts|is hurting|feels (?:tight|painful))\b/i,
  ]
  const selfHarm = [
    new RegExp(present + String.raw`suicidal\b`, 'i'),
    new RegExp(String.raw`\b${person}\s+(?:wants|plans|intends)\s+to\s+(?:kill|hurt)\s+(?:himself|herself|themself|themselves)\b`, 'i'),
  ]
  if (selfHarm.some((pattern) => pattern.test(normalized))) return 'self_harm'
  return patterns.some((pattern) => pattern.test(normalized)) ? 'emergency' : null
}

export function thirdPartyImmediateSafetyAnswer(kind: ImmediateSafetyKind): AskHealthAnswer {
  return {
    blocks: [{
      text: kind === 'self_harm'
        ? 'If this person may hurt themselves now, contact local emergency services or a crisis service immediately. Stay with them if it is safe and get nearby help. Do not leave them alone if there is an immediate danger.'
        : 'If this is happening to the other person now, call your local emergency number for immediate medical help. Stay with them, do not let them drive, and follow the emergency dispatcher’s instructions.',
      evidenceRefs: [],
    }],
    limitations: [{
      text: 'This is urgent guidance based only on the question. No saved Health records or previous conversation were used. I cannot confirm another person’s condition or diagnose the cause.',
      evidenceRefs: [],
    }],
    followUps: [],
  }
}
