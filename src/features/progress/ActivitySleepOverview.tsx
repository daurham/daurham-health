import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { ActivityProgressView } from '@/domain/activity'
import type { ProgressRange } from '@/domain/progress'
import type { SleepProgressView } from '@/domain/sleep'
import { PendingLoadRegion, useAtomicKeyedResource } from '@/lib'
import { activityCardCopy, sleepCardCopy } from './activity-sleep-copy'
import { fetchProgressActivity, fetchProgressSleep } from './api'
import { progressSearch } from './range'

export function ActivitySleepCards({
  range,
  activity,
  sleep,
}: {
  range: ProgressRange
  activity: ActivityProgressView | null
  sleep: SleepProgressView | null
}) {
  const activityCopy = activity && activity.range === range ? activityCardCopy(activity) : null
  const sleepCopy = sleep && sleep.range === range ? sleepCardCopy(sleep) : null
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-2 sm:gap-3">
      <article className="h-full rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Activity</h3>
        {activityCopy ? (
          <>
            <p className="mt-1.5 text-lg font-semibold tracking-tight">{activityCopy.primary}</p>
            <p className="mt-1 text-sm text-zinc-600">{activityCopy.secondary}</p>
            {activityCopy.today ? <p className="mt-1 text-sm text-zinc-700">{activityCopy.today}</p> : null}
            {activityCopy.change ? <p className="mt-1 text-sm text-zinc-700">{activityCopy.change}</p> : null}
          </>
        ) : (
          <p className="mt-1.5 text-sm text-zinc-600">Loading activity</p>
        )}
        <Link to={`/progress/activity${progressSearch(range)}`} className="mt-3 inline-block text-sm font-medium underline">
          View activity
        </Link>
      </article>
      <article className="h-full rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Sleep</h3>
        {sleepCopy ? (
          <>
            <p className="mt-1.5 text-lg font-semibold tracking-tight">{sleepCopy.primary}</p>
            <p className="mt-1 text-sm text-zinc-600">{sleepCopy.secondary}</p>
            {sleepCopy.change ? <p className="mt-1 text-sm text-zinc-700">{sleepCopy.change}</p> : null}
          </>
        ) : (
          <p className="mt-1.5 text-sm text-zinc-600">Loading sleep</p>
        )}
        <Link to={`/progress/sleep${progressSearch(range)}`} className="mt-3 inline-block text-sm font-medium underline">
          View sleep
        </Link>
      </article>
    </div>
  )
}

export function ActivitySleepOverview({ range }: { range: ProgressRange }) {
  const loadActivity = useCallback((key: ProgressRange, signal: AbortSignal) => fetchProgressActivity(key, signal), [])
  const loadSleep = useCallback((key: ProgressRange, signal: AbortSignal) => fetchProgressSleep(key, signal), [])
  const activityResource = useAtomicKeyedResource({ requestedKey: range, load: loadActivity })
  const sleepResource = useAtomicKeyedResource({ requestedKey: range, load: loadSleep })
  const activity = activityResource.data?.range === range ? activityResource.data : null
  const sleep = sleepResource.data?.range === range ? sleepResource.data : null
  return (
    <PendingLoadRegion
      pending={activityResource.isPending || sleepResource.isPending}
      pendingVisible={activityResource.pendingVisible || sleepResource.pendingVisible}
    >
      <ActivitySleepCards range={range} activity={activity} sleep={sleep} />
    </PendingLoadRegion>
  )
}
