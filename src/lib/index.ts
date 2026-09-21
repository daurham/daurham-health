export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export { healthFetch, readApiError } from './health-api'
export { SHELL_MAX_WIDTH_CLASS } from './shell'
