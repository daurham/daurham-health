export function ListPlaceholder({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="page-enter mt-4 space-y-2" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-lg bg-zinc-200" />
      ))}
    </div>
  )
}
