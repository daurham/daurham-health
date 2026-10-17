import { ASK_HEALTH_PACKET_VERSION, type AskLens } from './config.js'
import type { AskHealthAnswer, AskHealthPacket } from './types.js'
import type { ProgressRange } from '../progress/types.js'

export const ASK_HEALTH_GENERAL_PROMPT_VERSION = 'ask-health-general-v2'

/** No canonical queries and no borrowed owner data. This is NOT fabricated
 * evidence: the evidence array is genuinely empty.
 */
export function blankGeneralAskPacket(input: {
  lens: AskLens
  range: ProgressRange
  asOf: string
  generatedAt: string
}): AskHealthPacket {
  return {
    packetVersion: ASK_HEALTH_PACKET_VERSION,
    lens: input.lens,
    range: input.range,
    rangeStart: input.asOf,
    rangeEnd: input.asOf,
    asOf: input.asOf,
    generatedAt: input.generatedAt,
    evidence: [],
    limitations: [],
    contextSummary: { knows: [], missing: [] },
    clarification: null,
    evidenceSelectionAudit: null,
    sourceCoverageAudit: null,
  }
}

export const GENERAL_ASK_SYSTEM_PROMPT = [
  'Answer a standalone general health education question, not a request about a specific owner.',
  'No owner health records have been retrieved. Never claim to have seen or analyzed their measurements, profile, symptoms, diagnoses, medications, food or training logs.',
  'Use established general physiology and health knowledge with cautious wording and clear limits.',
  'Answer the question in the first one or two sentences. Be concise, accurate and practical.',
  'Do not give an individualized diagnosis, infer medical history, prescribe medicines or supplements, or state personal dosages.',
  'When warning signs are relevant, recommend appropriate urgent professional help without falsely reassuring.',
  'Never invent a citation, study, source, personal reading, clinical exam or current scientific consensus.',
  'Do not repeat a generic lack-of-personal-data disclaimer unless the question actually asks about personal measurements.',
  'The conversation and owner database are not supplied. Do not refer to either.',
  'Return JSON with exactly blocks, limitations, follow_ups. Each block and limitation uses text and evidence_refs.',
  'There are no personal evidence ids: evidence_refs must always be an empty array.',
  'An established general fact is not a fact about the user.',
  'Prompt version ' + ASK_HEALTH_GENERAL_PROMPT_VERSION + '.',
].join('\n')

export function generalAskUserPrompt(question: string): string {
  return [
    'MODE: standalone general education; no private records retrieved and no prior conversation supplied.',
    'PERSONAL EVIDENCE: []',
    'QUESTION:',
    question,
  ].join('\n')
}

/** A second protection against turning uncited general prose into a claimed
 * private Health record. Not a medical correctness validator.
 */
function inventedGeneralOwnerRecord(text: string): boolean {
  const claimsSavedData = /\b(?:your|the user's|the owner's)\s+(?:logged|recorded|saved|tracked|measured|health records?|food logs?|nutrition logs?|workout logs?|medical history|medications|weight history|bloodwork|health profile)\b|\baccording to your\b|\bbased on your (?:data|logs?|records?|history|measurements?)\b|\bi (?:can )?(?:see|found|reviewed) (?:in )?your (?:data|logs?|records?|history|measurements?)\b/i
  const inventedMeasurement = /\b(?:your|the user's|the owner's)\s+(?:(?:recorded|current|daily|average|latest)\s+)?(?:weight|height|steps?|step count|sleep(?: duration)?|water intake|calor(?:ie|ic) intake|protein intake|body fat)\s+(?:is|was|averaged|total(?:ed|led)?|equal(?:s|ed)?)\s*-?\d[\d,.]*\s*(?:kg|lbs?|pounds?|cm|inches?|steps?|minutes?|hours?|g|grams?|ml|kcal|calories?|%)(?=\W|$)|\byou\s+(?:logged|recorded|weighed|slept|lifted|consumed|averaged)\s+(?:a\s+(?:total|daily average)\s+of\s+)?-?\d[\d,.]*\s*(?:kg|lbs?|pounds?|cm|inches?|steps?|minutes?|hours?|g|grams?|ml|kcal|calories?|%)(?=\W|$)/i
  // Only affirmative owner-status claims at sentence starts. Conditional
  // education ("If your intake is low ...") and generic second-person
  // physiology ("Your muscles use ATP") should not be treated as observations.
  const inventedQualitativeState = /(?:^|[.!?]\s+)(?:your|the user's|the owner's)\s+(?:(?:recorded|current|recent|average)\s+)?(?:weight|body fat|sleep|hydration|water intake|protein intake|fiber intake|calorie intake|strength|training (?:progress|performance)|blood pressure|symptoms?)\s+(?:(?:(?:is|was|has been|looks|seems)\s+(?:(?:too|very)\s+)?(?:low|high|poor|good|stable|improving|worsening|increasing|decreasing|abnormal))|(?:(?:has|have)\s+)?(?:improved|worsened|increased|decreased|declined|plateaued))\b|(?:^|[.!?]\s+)you\s+(?:are|have been|have)\s+(?:dehydrated|dehydration|constipated|constipation|high blood pressure)\b/i
  // An answer with no owner evidence must not assert a concrete habit or
  // routine just because the claim lacks a measurement or "according to logs".
  // Sentence-anchored factual verbs + frequency/current-status indicators
  // distinguish owner assertions from conditional education ("If you ...")
  // and permission ("You can ..."). This remains a narrow lexical safeguard.
  const inventedOwnerHabit = /(?:^|[.!?]\s+)you\s+(?:(?:(?:currently|already|regularly|usually|often)\s+)?(?:take|use|consume|drink|eat|train|exercise|lift)\b[^.!?]{0,80}?\b(?:daily|every\s+day|each\s+day|every\s+(?:morning|evening|night)|(?:\d+|once|twice|three|four)\s+times?\s+(?:per|a)\s+(?:day|week)|regularly|most\s+days)\b|(?:currently|already|regularly|usually|often)\s+(?:take|use|consume|drink|eat|train|exercise|lift)\b|(?:(?:are|'re)\s+|(?:have|'ve)\s+been\s+)(?:taking|using|consuming|drinking|eating)\s+(?:creatine|protein|supplements?|medications?|medicine|water)\b)/i
  // General Only has no diagnosis, clinician encounter, lab result or symptom
  // history. Reject affirmative owner-specific clinical conclusions, even when
  // they lack numeric measurements or an explicit "according to your records".
  // Keep conditional education ("If you have anemia ...") unaffected.
  const inventedClinicalAssessment = /(?:^|[.!?]\s+)(?:you\s+(?:(?:likely|probably|definitely|certainly)\s+)?(?:have|are experiencing|were diagnosed with)\s+(?:an?\s+)?(?:diabetes|prediabetes|anemia|hypertension|high blood pressure|hypothyroidism|dehydration|constipation|heart attack|stroke|infection|vitamin deficiency)\b|your\s+(?:(?:reported|recent|current)\s+)?(?:symptoms?|bloodwork|lab results?|test results?|medical history)\s+(?:suggests?|indicates?|shows?|confirms?|proves?|points?\s+to)\b|your\s+(?:doctor|clinician|provider)\s+(?:diagnosed|prescribed|confirmed|told)\b|(?:the\s+)?symptoms?\s+you\s+(?:reported|described)\s+(?:suggest|indicate|point to)\b)/i
  return claimsSavedData.test(text) || inventedMeasurement.test(text) ||
    inventedQualitativeState.test(text) || inventedOwnerHabit.test(text) ||
    inventedClinicalAssessment.test(text)
}

export function generalAnswerInventsPersonalRecord(answer: AskHealthAnswer): boolean {
  return [...answer.blocks, ...answer.limitations].some((block) =>
    inventedGeneralOwnerRecord(block.text)) ||
    answer.followUps.some((question) => inventedGeneralOwnerRecord(question))
}

/** Old cached general answers do not receive the current provider validation
 * pass. Redact invented owner claims from blocks, limitations and follow-ups
 * at read time without a new paid call.
 * Independent general education can survive; personal evidence references must
 * always be stripped, even when every cached text block appears harmless.
 */
export function sanitizeCachedGeneralAnswer(answer: AskHealthAnswer): AskHealthAnswer {
  const invented = generalAnswerInventsPersonalRecord(answer)
  // General Only never returns personal evidence IDs, including in legacy
  // cache entries whose educational wording happens to be innocuous.
  const blocks = answer.blocks.filter((item) => !inventedGeneralOwnerRecord(item.text))
    .map((item) => ({ ...item, evidenceRefs: [] }))
  const limitations = answer.limitations.filter((item) => !inventedGeneralOwnerRecord(item.text))
    .map((item) => ({ ...item, evidenceRefs: [] }))
  if (!invented) {
    return { blocks, limitations, followUps: [...answer.followUps] }
  }
  return {
    blocks: blocks.length > 0 ? blocks :
      [{ text: 'That cached response claimed personal measurements I cannot verify in General Only. Ask again using an appropriate mode for your saved Health records.', evidenceRefs: [] }],
    limitations: [...limitations, {
      text: 'An unsupported personal-record claim was withheld from a cached general answer.',
      evidenceRefs: [],
    }],
    followUps: [],
  }
}
