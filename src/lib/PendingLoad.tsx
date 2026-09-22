export function PendingLoadRegion({
  pending,
  pendingVisible,
  children,
}: {
  pending: boolean
  pendingVisible: boolean
  children: React.ReactNode
}) {
  return (
    <div className="relative min-w-0" aria-busy={pending || undefined}>
      {pendingVisible ? (
        <div
          className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-zinc-200"
          role="progressbar"
          aria-label="Loading"
        >
          <div className="h-full w-1/3 animate-pulse bg-zinc-700" />
        </div>
      ) : null}
      <div className={pending ? 'opacity-60 transition-opacity duration-150' : 'transition-opacity duration-150'}>
        {children}
      </div>
    </div>
  )
}
