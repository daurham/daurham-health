import { Link } from 'react-router-dom'

export function LockedScreen({
  title,
  body,
  action,
  secondary,
}: {
  title: string
  body: string
  action?: { to: string; label: string; state?: unknown } | { onClick: () => void; label: string }
  secondary?: { to: string; label: string }
}) {
  return (
    <section className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-zinc-600">{body}</p>
      {action && 'to' in action ? (
        <Link
          to={action.to}
          state={action.state}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          {action.label}
        </Link>
      ) : null}
      {action && 'onClick' in action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900"
        >
          {action.label}
        </button>
      ) : null}
      {secondary ? (
        <p>
          <Link to={secondary.to} className="text-sm font-medium text-zinc-700 underline">
            {secondary.label}
          </Link>
        </p>
      ) : null}
    </section>
  )
}
