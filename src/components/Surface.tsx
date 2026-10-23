import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib'

export type SurfaceRole = 'hero' | 'standard' | 'compact' | 'quiet' | 'attention'

const ROLE_CLASS: Record<SurfaceRole, string> = {
  hero: 'health-hero-surface health-raised-surface rounded-xl border border-zinc-200 p-4 sm:p-5',
  standard: 'health-surface-standard rounded-xl border border-zinc-200 bg-white p-4',
  compact: 'health-surface-compact rounded-lg border border-zinc-200 bg-white px-3 py-2.5',
  quiet: 'health-surface-quiet rounded-lg border border-zinc-200/80 bg-zinc-50 px-3 py-2.5',
  attention: 'rounded-lg border border-warning/40 bg-amber-50 px-3 py-2.5',
}

export function Surface({
  role = 'standard',
  className,
  children,
  ...props
}: {
  role?: SurfaceRole
  children: ReactNode
} & HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn(ROLE_CLASS[role], className)} {...props}>
      {children}
    </section>
  )
}
