import type { CompiledExperiment, ExperimentCandidate, SuggestionDraft } from './types.js'

const NUMBER = /\d/
const PROHIBITED =
  /\b(dose|doses|medication|medications|supplement|supplements|mg|fasting|dehydrat\w*|citation|citations|literature|pubmed|doi|study|studies)\b|\bwill fix\b|\bthis will\b/i
const FORBIDDEN_KEYS = [
  'protocol',
  'duration',
  'threshold',
  'target',
  'unit',
  'criteria',
  'requirements',
  'benchmark',
  'goal',
  'dose',
  'supplement',
  'medication',
  'citation',
  'citations',
  'literature',
  'doi',
]

export function suggestionPacket(candidate: ExperimentCandidate): string {
  return JSON.stringify({
    packetVersion: 'experiment-suggestion-evidence-v1',
    candidateRef: candidate.candidateId,
    kind: candidate.kind,
    evidence: candidate.evidence.map((item) => ({ ref: item.ref, label: item.label })),
    limitations: candidate.limitations,
  })
}

export function suggestionUserPrompt(packet: string): string {
  return `Phrase this eligible experiment. JSON only.\n${packet}`
}

export function validateSuggestionModel(text: string, candidate: ExperimentCandidate): SuggestionDraft | null {
  const parsed = parse(text)
  if (!parsed) {
    return null
  }
  if (parsed.candidate_ref !== candidate.candidateId) {
    return null
  }
  if (!cleanProse(parsed.title) || !cleanProse(parsed.rationale)) {
    return null
  }
  const allowed = new Set(candidate.evidence.map((item) => item.ref))
  if (parsed.evidence_refs.length === 0 || parsed.evidence_refs.some((ref) => !allowed.has(ref))) {
    return null
  }
  return {
    candidateRef: parsed.candidate_ref,
    title: parsed.title.trim(),
    rationale: parsed.rationale.trim(),
    evidenceRefs: parsed.evidence_refs,
  }
}

export function compileAcceptedExperiment(
  candidate: ExperimentCandidate,
  approval: { title?: string | null; notes?: string | null; usedAiDraft?: boolean },
): CompiledExperiment {
  const title = cleanOwnerText(approval.title) ?? candidate.title
  const notes = cleanOwnerText(approval.notes)
  const usedAiDraft = approval.usedAiDraft === true
  return {
    title,
    question: candidate.question,
    hypothesis: candidate.hypothesis,
    rationale: notes ?? candidate.rationale,
    instructions: candidate.protocol.instructions,
    requirements: candidate.protocol.requirements,
    contextControls: candidate.protocol.contextControls,
    benchmarkDefinitionId: candidate.protocol.benchmarkDefinitionId,
    goalId: candidate.protocol.goalId,
    goalVersionId: candidate.protocol.goalVersionId,
    legacyOrigin: usedAiDraft ? 'ai_assisted' : legacyTrigger(candidate.kind),
    originKind: usedAiDraft ? 'ai_assisted' : 'deterministic_candidate',
    originTrigger: candidate.kind,
    originFingerprint: candidate.candidateFingerprint,
    originEvidence: {
      calculationVersion: candidate.calculationVersion,
      trigger: candidate.kind,
      candidateId: candidate.candidateId,
      benchmarkDefinitionId: candidate.protocol.benchmarkDefinitionId,
      benchmarkProtocolVersionId: candidate.protocol.benchmarkProtocolVersionId,
      protocolVersionNumber: candidate.protocol.protocolVersionNumber,
      goalId: candidate.protocol.goalId,
      goalVersionId: candidate.protocol.goalVersionId,
      evidenceRefs: candidate.evidence.map((item) => item.ref),
      linkedBenchmarkLabel: candidate.linkedBenchmarkLabel,
      linkedGoalLabel: candidate.linkedGoalLabel,
    },
  }
}

function legacyTrigger(kind: ExperimentCandidate['kind']): 'evidence_gap' | 'stale_benchmark' | 'goal_plateau' {
  if (kind === 'benchmark_missing_baseline') return 'evidence_gap'
  if (kind === 'benchmark_retest_due') return 'stale_benchmark'
  return 'goal_plateau'
}

function cleanOwnerText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > 200) return null
  return text
}

function cleanProse(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 400 && !NUMBER.test(value) && !PROHIBITED.test(value)
}

function parse(text: string): { candidate_ref: string; title: string; rationale: string; evidence_refs: string[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let value: unknown
  try {
    value = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => FORBIDDEN_KEYS.includes(key))) return null
  if (typeof record.candidate_ref !== 'string' || typeof record.title !== 'string' || typeof record.rationale !== 'string') {
    return null
  }
  if (!Array.isArray(record.evidence_refs) || record.evidence_refs.some((item) => typeof item !== 'string')) {
    return null
  }
  return {
    candidate_ref: record.candidate_ref,
    title: record.title,
    rationale: record.rationale,
    evidence_refs: record.evidence_refs as string[],
  }
}
