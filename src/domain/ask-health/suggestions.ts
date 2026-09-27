import type { AskLens } from './config.js'

export const ASK_SUGGESTIONS: Record<AskLens, readonly string[]> = {
  general: [
    'What changed most over the last 30 days?',
    'Where is my data too sparse to draw conclusions?',
    'How are my active goals doing?',
  ],
  training: ['How has my bench performance changed?', 'How often have I been training recently?'],
  nutrition: ['How consistent has my protein been?', 'Is nutrition coverage too sparse to explain a change?'],
  recovery: ['How has my sleep compared with my recent baseline?', 'Has my sleep source changed recently?'],
  experiments: ['What did my latest experiment result conclude?', 'Which benchmarks have a valid result in this range?'],
}
