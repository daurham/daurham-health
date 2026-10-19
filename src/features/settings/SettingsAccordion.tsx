import { useEffect, useState, type ReactNode } from 'react'

export type SettingsAccordionProps = {
  id: string
  title: string
  summary: string
  hash: string
  hashTargets?: readonly string[]
  forceOpen?: boolean
  children: ReactNode
}

/** A native, keyboard-accessible Settings disclosure.
 * Sections are collapsed by default and are only mounted when opened.
 * Deliberate deep links and Ask Health owner-note correction handoffs
 * can expand their destination without changing other sections.
 */
export function matchesSettingsSectionHash(
  hash: string,
  id: string,
  hashTargets: readonly string[] = [],
): boolean {
  const target = hash.replace(/^#/, '')
  if (!target) return false
  return target === id || hashTargets.includes(target)
}

export function SettingsAccordion({
  id, title, summary, hash, hashTargets = [], forceOpen = false, children,
}: SettingsAccordionProps) {
  const targeted = matchesSettingsSectionHash(hash, id, hashTargets)
  const [open, setOpen] = useState(() => forceOpen || targeted)

  useEffect(() => {
    if (targeted || forceOpen) setOpen(true)
  }, [targeted, forceOpen])

  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group min-w-0 rounded-xl border border-zinc-200 bg-white"
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-base font-semibold text-zinc-900">{title}</span>
          <span className="mt-1 block text-sm leading-5 text-zinc-600">{summary}</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-xl text-zinc-500 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      {open ? <div className="min-w-0 border-t border-zinc-100 p-3 sm:p-4">{children}</div> : null}
    </details>
  )
}
