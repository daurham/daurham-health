import { formatWeekdayCalendarDate } from '@/domain/calendar-format'
import { TodayBoard } from '@/features/today/TodayPage'
import { DEMO_DATA_VERSION } from '@/demo/constants'
import { demoToday } from '@/demo/repository'

export function DemoTodayPage() {
  const view = demoToday()
  return (
    <section className="min-w-0">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {formatWeekdayCalendarDate(view.date)} · dataset {DEMO_DATA_VERSION}
        </p>
      </div>
      <div className="mt-4">
        <TodayBoard view={view} />
      </div>
    </section>
  )
}
