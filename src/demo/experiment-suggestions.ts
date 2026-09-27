import { buildExperimentSuggestions, SUGGESTION_EMPTY_COPY, type ExperimentCandidate, type SuggestionInput } from '@/domain/experiment-suggestions'

const BENCHMARK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const VERSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const RESULT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'

export const DEMO_SUGGESTION_LABEL = 'Example proposal — not generated live'

export function demoSuggestionInput(): SuggestionInput {
  return {
    protocols: [
      {
        benchmarkDefinitionId: BENCHMARK,
        title: 'Push-up Capacity',
        active: true,
        protocolVersionId: VERSION,
        protocolVersion: 2,
        isCurrent: true,
        instructions: 'Perform as many strict push-ups as possible in 10 minutes.',
        minimumRetestDays: 28,
        suggestedRetestDays: 56,
        retestStatus: 'due',
        anchorResultId: RESULT,
        anchorResultDate: '2026-06-18',
        anchorValueLabel: '67 reps',
      },
    ],
    covers: [],
    goals: [],
  }
}

export function demoDueSuggestion(): ExperimentCandidate {
  const candidate = buildExperimentSuggestions(demoSuggestionInput())[0]
  if (!candidate) {
    throw new Error('Demo suggestion did not qualify')
  }
  return candidate
}

export function demoEmptySuggestionCopy(): string {
  return buildExperimentSuggestions({ protocols: [], covers: [], goals: [] }).length === 0 ? SUGGESTION_EMPTY_COPY : ''
}
