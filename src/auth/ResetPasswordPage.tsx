import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authClient } from './client'
import {
  INVALID_RESET_LINK_MESSAGE,
  MIN_PASSWORD_LENGTH,
  PASSWORD_SET_MESSAGE,
  parseResetTokenFromSearch,
  setPasswordPath,
  SIGN_IN_PATH,
  submitOwnerPasswordReset,
  validateNewPasswords,
} from './password'

const fieldClass = 'mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const parsed = useMemo(() => parseResetTokenFromSearch(searchParams.toString()), [searchParams])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const invalid = 'error' in parsed

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if ('error' in parsed) {
      return
    }
    const validation = validateNewPasswords(password, confirm)
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const result = await submitOwnerPasswordReset(password, parsed.token, authClient)
      if (!result.ok) {
        setError(result.reason === 'invalid' ? INVALID_RESET_LINK_MESSAGE : 'Could not set the password. Try again.')
        return
      }
      setDone(true)
      navigate(SIGN_IN_PATH, { replace: true, state: { passwordSet: true } })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto max-w-lg space-y-6">
      <div>
        <p className="text-sm text-zinc-500">
          <Link to="/" className="hover:underline">
            Health
          </Link>
          {' / '}
          Set Password
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Set Password</h1>
      </div>
      {invalid || error === INVALID_RESET_LINK_MESSAGE ? (
        <div className="space-y-4">
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {INVALID_RESET_LINK_MESSAGE}
          </p>
          <Link to={setPasswordPath()} className="text-sm text-zinc-500 hover:underline">
            Request a new one
          </Link>
        </div>
      ) : done ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          {PASSWORD_SET_MESSAGE}
        </p>
      ) : (
        <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
          <label className="block text-sm font-medium text-zinc-800">
            New password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block text-sm font-medium text-zinc-800">
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={fieldClass}
            />
          </label>
          <p className="text-sm text-zinc-500">At least {MIN_PASSWORD_LENGTH} characters.</p>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:bg-zinc-300"
          >
            {submitting ? 'Saving…' : 'Set Password'}
          </button>
        </form>
      )}
    </section>
  )
}
