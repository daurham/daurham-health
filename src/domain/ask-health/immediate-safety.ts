import type { AskHealthAnswer } from './types.js'

/**
 * PIQ-3.2 deliberately narrow immediate-risk floor, not symptom diagnosis.
 * Only explicit first-person, present-tense statements are caught. Complex,
 * historical, negated, and hypothetical phrasing stays in the owner path for
 * later evidence-aware/clinically reviewed routing.
 */
export type ImmediateSafetyKind = 'emergency' | 'self_harm'

export function detectImmediateSafety(question: string): ImmediateSafetyKind | null {
  const normalized = question.replace(/\u2019/g, "'").trim()
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
  if (chest.test(normalized) || breath.test(normalized) || bleed.test(normalized) ||
      stroke.test(normalized) || severeDigestive.test(normalized)) {
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
