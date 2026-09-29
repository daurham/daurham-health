import { useEffect, useId, useRef, type ReactNode } from 'react'
import { quietButtonClass } from '@/lib'

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function CoachDialog({ title, onClose, returnFocusTo, children, initialFocus = 'panel' }: {
  title: string
  onClose: () => void
  returnFocusTo?: HTMLElement | null
  children: ReactNode
  initialFocus?: 'panel' | 'control'
}) {
  const headingId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const previous = returnFocusTo ?? document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const control = panel.querySelector<HTMLElement>('[data-coach-initial-focus]')
      ?? (initialFocus === 'control' ? panel.querySelector<HTMLElement>(FOCUSABLE) : null)
    ;(control ?? panel).focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
      }
      if (event.key !== 'Tab') return
      const controls = [...panel!.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element => element.getClientRects().length > 0)
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first || !last) { event.preventDefault(); panel!.focus(); return }
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panel)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (active === last || active === panel)) { event.preventDefault(); first.focus() }
    }
    function onFocus(event: FocusEvent) {
      if (event.target instanceof Node && !panel!.contains(event.target)) panel!.focus()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocus)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [returnFocusTo, initialFocus])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" tabIndex={-1} aria-label={`Close ${title}`} className="motion-scrim-enter absolute inset-0 bg-black/30" onClick={onClose} />
      <section ref={panelRef} tabIndex={-1} className="motion-panel-enter relative z-10 max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl outline-none sm:max-w-md sm:rounded-2xl" role="dialog" aria-modal="true" aria-labelledby={headingId} aria-label={title}>
        <div className="flex items-start justify-between gap-3">
          <h2 id={headingId} className="min-w-0 text-lg font-semibold tracking-tight">{title}</h2>
          <button type="button" className={quietButtonClass} onClick={onClose}>Close</button>
        </div>
        {children}
      </section>
    </div>
  )
}
