export function ListPlaceholder({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="page-enter mt-4 space-y-2" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-lg bg-zinc-200" />
      ))}
    </div>
  )
}

export function NutritionPlaceholder() {
  return (
    <div
      className="page-enter grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_22rem] md:items-start"
      aria-busy="true"
      aria-label="Loading nutrition"
    >
      <aside className="min-w-0 space-y-4 md:order-2">
        <div className="h-48 animate-pulse rounded-xl bg-zinc-200" />
        <div className="hidden h-40 animate-pulse rounded-xl bg-zinc-200 md:block" />
      </aside>
      <div className="min-w-0 space-y-3 md:order-1">
        <div className="h-14 animate-pulse rounded-xl bg-zinc-200" />
        <div className="h-14 animate-pulse rounded-xl bg-zinc-200" />
        <div className="h-14 animate-pulse rounded-xl bg-zinc-200" />
      </div>
    </div>
  )
}
