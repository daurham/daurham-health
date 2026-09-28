import { useEffect, useId, useRef } from 'react'
import { cn } from '@/lib'

type NutritionSheetProps = {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  stickyHeader?: React.ReactNode
  /** Mobile-only: lock sheet height so inner results scroll instead of resizing the dialog. */
  mobileLayout?: 'hug' | 'stable'
}

export function NutritionSheet({
  title,
  onClose,
  children,
  footer,
  stickyHeader,
  mobileLayout = 'hug',
}: NutritionSheetProps) {
  const headingId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement
    const root = panelRef.current
    root?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previous instanceof HTMLElement) {
        previous.focus()
      }
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center md:p-6">
      <button
        type="button"
        aria-label="Close"
        className="theme-scrim motion-scrim-enter absolute inset-0"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className={cn(
          'motion-panel-enter relative z-10 flex w-full flex-col overflow-hidden bg-white shadow-xl',
          'rounded-t-2xl md:max-h-[90dvh] md:max-w-lg md:rounded-xl',
          mobileLayout === 'stable' ? 'max-md:h-[90%] max-md:max-h-[90%]' : 'max-h-[90dvh]',
        )}
        data-nutrition-sheet-layout={mobileLayout}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <h2 id={headingId} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          >
            Close
          </button>
        </div>
        {stickyHeader ? <div className="shrink-0 border-b border-zinc-200 px-4 py-3">{stickyHeader}</div> : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" data-nutrition-sheet-body="">
          {children}
        </div>
        {footer ? (
          <div className="border-t border-zinc-200 px-4 pt-3 pb-[calc(0.75rem+var(--shell-safe-bottom))]">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
