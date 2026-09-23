import type { ReactNode } from 'react'
import { primaryButtonClass, secondaryButtonClass } from '@/lib'
import { addToDateLabel, catalogActionHelp } from './catalog-actions'

export function CatalogCommitFooter({
  date,
  busy,
  onBack,
  extra,
  onSaveForLater,
  onAddToDate,
}: {
  date: string
  busy: boolean
  onBack?: () => void
  extra?: ReactNode
  onSaveForLater: () => void
  onAddToDate: () => void
}) {
  const addLabel = addToDateLabel(date)
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">{catalogActionHelp(date)}</p>
      <div className="flex flex-wrap gap-2">
        {onBack ? (
          <button type="button" className={secondaryButtonClass} onClick={onBack} disabled={busy}>
            Back
          </button>
        ) : null}
        {extra}
        <button type="button" className={secondaryButtonClass} onClick={onSaveForLater} disabled={busy}>
          {busy ? 'Saving…' : 'Save for later'}
        </button>
        <button type="button" className={primaryButtonClass} onClick={onAddToDate} disabled={busy}>
          {busy ? 'Saving…' : addLabel}
        </button>
      </div>
    </div>
  )
}
