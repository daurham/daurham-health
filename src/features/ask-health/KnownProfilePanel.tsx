import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ageYearsOnDate, type HealthProfile } from '@/domain/health-profile'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'
import { fetchHealthProfile } from '@/features/settings/api'

export type KnownProfileRow = { label: string; value: string }

export function knownProfileRows(profile: HealthProfile, today: string): KnownProfileRow[] {
  let age = 'Not set'
  if (profile.dateOfBirth && profile.dateOfBirth <= today) {
    try { age = String(ageYearsOnDate(profile.dateOfBirth, today)) + ' years (derived)' }
    catch { age = 'Unavailable' }
  }
  const count = (size: number) => size === 0 ? 'Not recorded' : size + ' recorded'
  return [
    { label: 'Birth date', value: profile.dateOfBirth ?? 'Not set' },
    { label: 'Age today', value: age },
    { label: 'Current height', value: profile.heightCm == null ? 'Not set' : profile.heightCm + ' cm' },
    { label: 'Physiological reference selection', value: profile.sexForPhysiology === 'other'
      ? 'Individual review' : profile.sexForPhysiology ?? 'Not set' },
    { label: 'Persistent health context', value: profile.persistentHealthContext || 'Not set' },
    { label: 'Training limitations', value: profile.trainingLimitations || 'Not set' },
    { label: 'Dietary context', value: profile.dietaryContext || 'Not set' },
    { label: 'Body measurement protocol', value: profile.bodyMeasurementProtocol || 'Not set' },
    { label: 'Conditions', value: count(profile.clinicalConditions.length) },
    { label: 'Allergies', value: count(profile.clinicalAllergies.length) },
    { label: 'Medications', value: count(profile.clinicalMedications.length) },
  ]
}

/** A read-only, on-demand profile inventory: no medical details are loaded
 * into the Ask Health page merely by opening the tab.
 */
export function KnownProfilePanel({ today }: { today: string }) {
  const prefix = useAppPathPrefix()
  const [open, setOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const [profile, setProfile] = useState<HealthProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchHealthProfile().then((next) => {
      if (!cancelled) setProfile(next)
    }).catch(() => {
      if (!cancelled) {
        setProfile(null)
        setError('Could not load the saved Health Profile.')
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [open, revision])

  return (
    <section className="rounded-lg border border-zinc-200 bg-white" aria-label="Known Health Profile">
      <button type="button" aria-expanded={open} aria-controls="ask-health-known-profile"
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-zinc-900"
        onClick={() => {
          if (!open) setProfile(null)
          setOpen(!open)
        }}>
        What Health knows about me
        <span aria-hidden="true" className="text-zinc-500">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <div id="ask-health-known-profile" className="space-y-3 border-t border-zinc-100 px-3 py-3 text-xs text-zinc-700">
          <p>This is your current saved Health Profile, not a historical medical record. Other logs and goals are stored separately.</p>
          {loading ? <p role="status">Loading saved profile…</p> : null}
          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-2">
              {error}
              <button type="button" className="underline" onClick={() => setRevision((n) => n + 1)}>Retry</button>
            </div>
          ) : null}
          {profile && !loading ? (
            <>
              <p className="text-zinc-500">
                Source: saved owner-controlled Health Profile · Last updated: {profile.updatedAt
                  ? profile.updatedAt.replace('T', ' ').slice(0, 16) + ' UTC'
                  : 'Not available'}
              </p>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {knownProfileRows(profile, today).map((fact) => (
                  <div key={fact.label} className="min-w-0 rounded-md bg-zinc-50 p-2">
                    <dt className="font-medium text-zinc-600">{fact.label}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words text-zinc-900">{fact.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-zinc-500">The displayed age is calculated from your birth date. Unset values are not inferred. Current conditions and medications are not proof of their historical status.</p>
            </>
          ) : null}
          <Link className="inline-block font-semibold text-zinc-800 underline" to={prefixedPath(prefix, '/settings#health-profile')}>
            Edit Health Profile
          </Link>
        </div>
      ) : null}
    </section>
  )
}
