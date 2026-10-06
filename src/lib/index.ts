export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export { OWNER_AUTH_REQUIRED, healthFetch, publicErrorMessage, readApiError } from './health-api'
export { SHELL_MAX_WIDTH_CLASS } from './shell'
export {
  useAtomicKeyedResource,
  startAtomicRequest,
  refreshAtomicRequest,
  commitAtomicRequest,
  failAtomicRequest,
  replaceAtomicData,
  emptyAtomicTransition,
  KeyedResourceCache,
} from './atomic-resource'
export type { AtomicTransitionState } from './atomic-resource'
export { PendingLoadRegion } from './PendingLoad'
export { LoadErrorNotice } from './LoadErrorNotice'
export { ListPlaceholder, NutritionPlaceholder, RouteFallback } from './PagePlaceholder'
export { usePrefersReducedMotion } from './reduced-motion'
export {
  dangerButtonClass,
  interactiveCardClass,
  interactiveRowClass,
  primaryButtonClass,
  quietButtonClass,
  secondaryButtonClass,
  selectedCardClass,
  selectedTabClass,
  tabClass,
  themeChoiceClass,
  themeChoiceSelectedClass,
} from './interactive'

export { fetchPublicInstanceConfig, clearInstanceConfigCacheForTests } from './instance-config'

export { InstanceConfigContext, useInstanceConfig } from './instance-config-context'
