import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './context'
import { authClient } from './client'
import {
  PASSWORD_SET_MESSAGE,
  REQUEST_SENT_MESSAGE,
  requestOwnerPasswordReset,
  SET_PASSWORD_SEARCH,
} from './password'

const fieldClass = 'mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base md:text-sm'

export function SignInPage() {
  const { status, refresh } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [requesting, setRequesting] = useState(searchParams.get('set-password') === '1')
  const [requestSent, setRequestSent] = useState(false)
  const passwordSet =
    typeof location.state === 'object' && location.state !== null && 'passwordSet' in location.state

  if (status === 'owner' && !requesting) {
    return <Navigate to="/" replace />
  }

  async function onSignIn(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        rememberMe: true,
      })
      if (result.error) {
        setError('Could not sign in. Check the email and password.')
        return
      }
      await refresh()
      navigate('/', { replace: true })
    } catch {
      setError('Could not sign in. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function onRequestReset(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await requestOwnerPasswordReset(email, authClient)
      setRequestSent(true)
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
          Owner Sign In
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {requesting ? 'Forgot or set password' : 'Owner Sign In'}
        </h1>
        <p className="mt-2 text-zinc-600">
          {requesting
            ? 'We will send a password link if this email is the Health owner account.'
            : 'Sign in once on this device. The session stays with the browser.'}
        </p>
      </div>
      {passwordSet && !requesting ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          {PASSWORD_SET_MESSAGE}
        </p>
      ) : null}
      {requesting ? (
        requestSent ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
            {REQUEST_SENT_MESSAGE}
          </p>
        ) : (
          <form className="space-y-4" onSubmit={(event) => void onRequestReset(event)}>
            <label className="block text-sm font-medium text-zinc-800">
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={fieldClass}
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:bg-zinc-300"
            >
              {submitting ? 'Sending…' : 'Send password link'}
            </button>
          </form>
        )
      ) : (
        <form className="space-y-4" onSubmit={(event) => void onSignIn(event)}>
          <label className="block text-sm font-medium text-zinc-800">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block text-sm font-medium text-zinc-800">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass}
            />
          </label>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:bg-zinc-300"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
      {requesting ? (
        <button
          type="button"
          className="text-sm text-zinc-500 hover:underline"
          onClick={() => {
            setRequesting(false)
            setRequestSent(false)
            navigate(location.pathname, { replace: true })
          }}
        >
          Back to Owner Sign In
        </button>
      ) : (
        <button
          type="button"
          className="text-sm text-zinc-500 hover:underline"
          onClick={() => {
            setRequesting(true)
            setError(null)
            navigate(`?${SET_PASSWORD_SEARCH}`, { replace: true })
          }}
        >
          Forgot or set password?
        </button>
      )}
    </section>
  )
}
