import type { AskEvidence, AskHealthAnswer } from '@/domain/ask-health'

export const DEMO_ASK_NOTE = 'This example was compiled with the demo. It was not generated live.'

export type DemoAskExample = {
  question: string
  lens: 'general' | 'recovery'
  answer: AskHealthAnswer
  evidence: AskEvidence[]
}

const sleepEvidence: AskEvidence = {
  id: 'sleep.duration',
  domain: 'sleep',
  label: 'Average sleep duration',
  value: 414,
  unit: 'minutes',
  text: 'Average of analysis-eligible nights. Partial nights are excluded.',
  period: { start: '2026-08-17', end: '2026-09-15' },
  coverage: { analysisEligibleNights: 26, calendarNights: 30 },
  detailPath: '/progress/sleep',
  userEntered: false,
  substantive: true,
}

const sourceEvidence: AskEvidence = {
  id: 'sleep.source',
  domain: 'sleep',
  label: 'Sleep source continuity',
  value: 'mixed_sources',
  unit: null,
  text: 'Mixed sleep sources in this range.',
  period: { start: '2026-08-17', end: '2026-09-15' },
  coverage: { comparability: 'mixed_sources', canonicalNights: 29, transitions: 1 },
  detailPath: '/progress/sleep',
  userEntered: false,
  substantive: true,
}

const coverageEvidence: AskEvidence = {
  id: 'nutrition.coverage',
  domain: 'nutrition',
  label: 'Nutrition coverage',
  value: 40,
  unit: 'percent',
  text: 'Nutrition was logged on 12 of 30 days. Averages are logged days only.',
  period: { start: '2026-08-17', end: '2026-09-15' },
  coverage: { loggedDays: 12, calendarDays: 30, coveragePct: 40 },
  detailPath: '/nutrition',
  userEntered: false,
  substantive: true,
}

export const DEMO_ASK_EXAMPLES: readonly DemoAskExample[] = [
  {
    lens: 'general',
    question: 'How has my sleep been recently?',
    answer: {
      blocks: [
        {
          text: 'Complete nights in this 30-day demo range averaged 6h 54m.',
          evidenceRefs: ['sleep.duration'],
        },
      ],
      limitations: [
        {
          text: 'Nutrition was logged on 12 of 30 days, so intake is too sparse to explain the sleep average. Wrist tracker and Bedside sensor both contributed nights, and the selected source changed.',
          evidenceRefs: ['nutrition.coverage', 'sleep.source'],
        },
      ],
      followUps: [],
    },
    evidence: [sleepEvidence, sourceEvidence, coverageEvidence],
  },
  {
    lens: 'recovery',
    question: 'Has my sleep source changed recently?',
    answer: {
      blocks: [
        {
          text: 'The selected Sleep source changed in this period, so direct comparisons may reflect measurement differences. Wrist tracker and Bedside sensor both contributed canonical nights.',
          evidenceRefs: ['sleep.source'],
        },
      ],
      limitations: [],
      followUps: [],
    },
    evidence: [sourceEvidence],
  },
]

export const DEMO_ASK_EMPTY: AskHealthAnswer = {
  blocks: [
    {
      text: 'The demo only includes compiled examples. This question was not sent to a model.',
      evidenceRefs: ['ask.range'],
    },
  ],
  limitations: [],
  followUps: [],
}

export const DEMO_ASK_RANGE: AskEvidence = {
  id: 'ask.range',
  domain: 'ask',
  label: 'Selected range',
  value: '30d',
  unit: null,
  text: 'This compiled demo covers 30 days.',
  period: { start: '2026-08-17', end: '2026-09-15' },
  coverage: null,
  detailPath: '/progress',
  userEntered: false,
  substantive: false,
}
