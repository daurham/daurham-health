/** Keep hash-only scrolls usable; guard route/date changes while a draft exists. */
export type DailyLogLocation = { pathname: string; search: string }

export function shouldBlockDailyLogNavigation(
  hasUnsavedChanges: boolean,
  current: DailyLogLocation,
  next: DailyLogLocation,
): boolean {
  return hasUnsavedChanges &&
    (current.pathname !== next.pathname || current.search !== next.search)
}
