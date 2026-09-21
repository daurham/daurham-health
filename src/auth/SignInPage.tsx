import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './context'
import { authClient } from './client'

export function SignInPage() {
  const { status, refresh } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'owner') {
    return <Navigate to="/" replace />
  }

  async function onSubmit(event: FormEvent) {
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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Owner Sign In</h1>
        <p className="mt-2 text-zinc-600">Sign in once on this device. The session stays with the browser.</p>
      </div>
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <label className="block text-sm font-medium text-zinc-800">
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
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
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
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
    </section>
  )
}
