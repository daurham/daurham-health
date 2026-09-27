import { INSIGHT_RESULT_CAP, PROACTIVE_INSIGHTS_VERSION } from './config.js'
import {
  detectActivityChange,
  detectBodyWeightTrend,
  detectCrossDomainInsights,
  detectNutritionChange,
  detectSleepDurationChange,
  detectStrengthTrend,
  detectTrainingFrequencyChange,
} from './detectors.js'
import type { InsightDetectorInput, InsightDetectorResult, ProactiveInsights } from './types.js'

export const insightDetectors = [
  detectCrossDomainInsights,
  detectBodyWeightTrend,
  detectStrengthTrend,
  detectSleepDurationChange,
  detectActivityChange,
  detectNutritionChange,
  detectTrainingFrequencyChange,
] as const

export function deriveProactiveInsights(input: InsightDetectorInput): ProactiveInsights {
  const ranked = insightDetectors.flatMap((detect) => rankable(detect(input)))
  ranked.sort(compareInsights)
  return {
    calculationVersion: PROACTIVE_INSIGHTS_VERSION,
    range: input.range,
    asOf: input.asOf,
    insights: ranked.slice(0, INSIGHT_RESULT_CAP).map((item) => item.insight),
  }
}

function rankable(results: readonly InsightDetectorResult[]) {
  return results.flatMap((result) => {
    if (result.status !== 'eligible' || !result.insight) {
      return []
    }
    return [
      {
        insight: result.insight,
        magnitude: result.magnitude ?? 0,
        associationRank: result.associationRank ?? 0,
        recency: result.recency ?? result.insight.period.end,
      },
    ]
  })
}

function compareInsights(
  left: { insight: { id: string; kind: string; ranking: { tier: number } }; magnitude: number; associationRank: number; recency: string },
  right: { insight: { id: string; kind: string; ranking: { tier: number } }; magnitude: number; associationRank: number; recency: string },
): number {
  if (left.insight.ranking.tier !== right.insight.ranking.tier) {
    return left.insight.ranking.tier - right.insight.ranking.tier
  }
  if (left.associationRank !== right.associationRank) {
    return right.associationRank - left.associationRank
  }
  if (left.insight.kind === right.insight.kind && left.magnitude !== right.magnitude) {
    return right.magnitude - left.magnitude
  }
  if (left.recency !== right.recency) {
    return right.recency < left.recency ? -1 : 1
  }
  return left.insight.id < right.insight.id ? -1 : left.insight.id > right.insight.id ? 1 : 0
}
