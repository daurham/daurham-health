export function LoadErrorNotice({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
      {message}
      {onRetry ? (
        <button type="button" className="ml-3 font-medium underline" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </p>
  )
}
