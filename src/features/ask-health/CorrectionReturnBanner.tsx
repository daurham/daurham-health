import { Link, useLocation } from 'react-router-dom'
import { makeAskCorrectionState, readAskCorrectionState } from '@/domain/ask-health/corrections'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'

/** No automatic save or Ask Health request. */
export function CorrectionReturnBanner() {
  const location = useLocation()
  const prefix = useAppPathPrefix()
  const correction = readAskCorrectionState(location.state)
  if (!correction) return null
  return (
    <section aria-label="Return to Ask Health after correction" className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-sm font-semibold text-zinc-900">Review the source of an Ask Health claim</p>
      <p className="text-xs leading-5 text-zinc-600">
        Verify the original record and save your change here first. Returning does not
        save anything; the previous AI answer does not update itself.
      </p>
      <Link className="inline-flex min-h-10 items-center text-sm font-medium underline"
        to={prefixedPath(prefix, '/ask-health')}
        state={makeAskCorrectionState(correction.question, correction.lens, correction.range)}>
        Return to Ask Health to ask again
      </Link>
    </section>
  )
}
