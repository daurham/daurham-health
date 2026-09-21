import type { ProgressOverview } from '@/domain/progress'
import { findingDate, findingHeadline, findingTitle } from './copy'

export function TimelineSection({ overview }: { overview: ProgressOverview }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
        <p className="mt-1 text-sm text-zinc-600">
          A unified cross-domain timeline is next. Dated findings from this period are listed for orientation only.
        </p>
      </div>
      {overview.findings.length === 0 ? (
        <p className="text-sm text-zinc-600">No dated progress findings in this range yet.</p>
      ) : (
        <ol className="space-y-2">
          {overview.findings.map((finding, index) => (
            <li
              key={`${finding.kind}-${index}`}
              className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-3"
            >
              <p className="text-xs uppercase tracking-wide text-zinc-500">{findingDate(finding) ?? 'Date pending'}</p>
              <p className="mt-1 font-medium">{findingTitle(finding.kind)}</p>
              <p className="mt-1 text-sm text-zinc-600">{findingHeadline(finding, overview)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
