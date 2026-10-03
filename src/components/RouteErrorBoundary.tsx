import { useEffect } from 'react'
import { useRouteError } from 'react-router-dom'
import { isStaleChunkError, reloadForStaleChunkOnce } from '@/lib/stale-chunk-recovery'

export function RouteErrorBoundary() {
  const error = useRouteError()
  const staleChunk = isStaleChunkError(error)

  useEffect(() => {
    reloadForStaleChunkOnce(error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-zinc-500">Daurham Health</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
          {staleChunk ? 'Updating Health…' : 'Health hit an unexpected error'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          {staleChunk
            ? 'This tab was using files from an older deployment. Health will refresh once automatically to load the current app.'
            : 'This screen could not finish loading. Reload the app to try again.'}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
            onClick={() => window.location.reload()}
          >
            Reload app
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900"
            onClick={() => window.location.assign('/')}
          >
            Go to Today
          </button>
        </div>
      </section>
    </main>
  )
}
