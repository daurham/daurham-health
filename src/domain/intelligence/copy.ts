import type { CrossDomainFinding, GroupMetric } from './types.js'

const CAUSAL_LANGUAGE = /\b(caused|improved|hurt|led to|resulted in|because of)\b/i

const METRIC_LABELS: Record<string, string> = {
  sleep_minutes: 'sleep duration',
  steps: 'step counts',
  active_energy_kcal: 'active energy',
  exercise_minutes: 'exercise minutes',
  resting_heart_rate_bpm: 'resting heart rate',
  effort: 'session effort',
  pain_level: 'session pain',
  calories: 'calorie intake',
  protein: 'protein intake',
  carbs: 'carbohydrate intake',
  fat: 'fat intake',
  preceding_14d_avg_calories: 'average calories over the preceding 14 days',
  preceding_14d_avg_protein: 'average protein over the preceding 14 days',
  bodyweight: 'bodyweight',
}

function label(metric: string): string {
  return METRIC_LABELS[metric] ?? metric
}

function quantity(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function associationSentence(xMetric: string, yMetric: string, direction: 'positive' | 'negative', n: number): string {
  const relation = direction === 'positive' ? 'higher' : 'lower'
  return `Higher ${label(xMetric)} tended to occur with ${relation} ${label(yMetric)} across ${n} paired observations.`
}

function groupSentence(metric: GroupMetric, leftLabel: string, rightLabel: string, leftDays: number, rightDays: number): string | null {
  if (metric.delta == null || metric.leftAverage == null || metric.rightAverage == null) {
    return null
  }
  if (metric.delta === 0) {
    return `On ${leftLabel}, ${label(metric.metric)} averaged the same as on ${rightLabel} (${leftDays} and ${rightDays} days).`
  }
  const relation = metric.delta > 0 ? 'higher' : 'lower'
  return `On ${leftLabel}, ${label(metric.metric)} averaged ${quantity(Math.abs(metric.delta))} ${metric.unit} ${relation} than on ${rightLabel} (${leftDays} and ${rightDays} days).`
}

export function findingCopy(finding: CrossDomainFinding): string | null {
  if (!finding.surfaced || finding.state !== 'available') {
    return null
  }
  if (finding.kind === 'spearman_association' || finding.kind === 'windowed_association') {
    if (finding.direction !== 'positive' && finding.direction !== 'negative') {
      return null
    }
    return associationSentence(finding.metrics.xMetric, finding.metrics.yMetric, finding.direction, finding.metrics.n)
  }
  if (finding.kind === 'group_comparison') {
    const sentences = finding.metrics.metrics
      .map((metric) => groupSentence(metric, finding.metrics.leftLabel, finding.metrics.rightLabel, finding.metrics.leftDays, finding.metrics.rightDays))
      .filter((sentence): sentence is string => sentence != null)
    return sentences.length === 0 ? null : sentences.join(' ')
  }
  const metrics = finding.metrics
  if (metrics.slopePer30Days == null || metrics.averageCalories == null || metrics.unit == null) {
    return null
  }
  const trend =
    metrics.slopePer30Days === 0
      ? `bodyweight trend was flat across ${metrics.measurementCount} measurements`
      : `bodyweight trend was ${quantity(metrics.slopePer30Days)} ${metrics.unit} per 30 days across ${metrics.measurementCount} measurements`
  return `During this period, ${trend}. Logged calorie intake averaged ${quantity(metrics.averageCalories)} kcal on ${Math.round(metrics.coveragePct)}% of days (${metrics.loggedDays} logged days).`
}

export function containsCausalLanguage(text: string): boolean {
  return CAUSAL_LANGUAGE.test(text)
}
