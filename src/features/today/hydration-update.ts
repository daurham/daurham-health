import type { HydrationEvent } from '@/domain/daily-signals'
import { todayDailySignalsFromDay } from '@/domain/daily-signals'
import type { TodayViewModel } from '@/domain/today'

/** Commit only the saved hydration delta while Today, Coach and goals quietly revalidate. */
export function applyTodayHydrationEvent(view: TodayViewModel, event: HydrationEvent): TodayViewModel {
  if (event.date !== view.date) return view
  const previous = view.dailySignals ?? todayDailySignalsFromDay(null)
  const oldHydration = previous.hydration
  return {
    ...view,
    dailySignals: {
      ...previous,
      hydration: {
        ...oldHydration,
        tracked: true,
        totalOz: (oldHydration.totalOz ?? 0) + event.amountOz,
        eventCount: oldHydration.eventCount + 1,
      },
    },
  }
}
