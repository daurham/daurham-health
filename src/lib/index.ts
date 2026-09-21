export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export { healthFetch, readApiError } from './health-api'
export { SHELL_MAX_WIDTH_CLASS } from './shell'
export {
  useAtomicKeyedResource,
  startAtomicRequest,
  commitAtomicRequest,
  failAtomicRequest,
  replaceAtomicData,
  emptyAtomicTransition,
  KeyedResourceCache,
} from './atomic-resource'
export type { AtomicTransitionState } from './atomic-resource'
export { PendingLoadRegion } from './PendingLoad'
