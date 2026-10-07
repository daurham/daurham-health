export {
  BODY_NUTRITION_MIN_LOGGED_DAYS,
  BODY_NUTRITION_MIN_MEASUREMENTS,
  BODY_NUTRITION_WINDOW_DAYS,
  GROUP_MIN_DAYS,
  INTELLIGENCE_TIMEZONE,
  RELATIONSHIP_IDS,
  RHO_MODERATE,
  RHO_STRONG,
  RHO_WEAK,
  SPEARMAN_MIN_PAIRS,
  type RelationshipId,
} from './config.js'
export {
  analyzeCrossDomain,
  compareCrossDomainFindings,
  provisionalActivityDate,
  type CrossDomainInput,
  type IntelligenceTrainingSession,
} from './analyze.js'
export { containsCausalLanguage, findingCopy } from './copy.js'
export { associationStrength, averageRanks, sampleTierFor, spearmanRho } from './spearman.js'
export type {
  AssociationDirection,
  AssociationStrength,
  CrossDomainFinding,
  CrossDomainState,
  IntelligenceState,
  SampleTier,
  SurfacingResult,
} from './types.js'
export {
  HEALTH_INTELLIGENCE_VERSION,
  INTELLIGENCE_SIGNAL_KEYS,
  INTELLIGENCE_SIGNAL_REGISTRY,
  buildHealthIntelligenceSnapshot,
  routeHealthIntelligence,
  type BuildHealthIntelligenceInput,
  type HealthIntelligenceSnapshot,
  type IntelligenceBaseline,
  type IntelligenceConfidence,
  type IntelligenceContextItem,
  type IntelligenceCoverage,
  type IntelligenceFrameDay,
  type IntelligenceInterventionComparison,
  type IntelligenceObservation,
  type IntelligenceProvenance,
  type IntelligenceRelationship,
  type IntelligenceSignalDefinition,
  type IntelligenceSignalKey,
  type RoutedHealthIntelligence,
} from './shared.js'

