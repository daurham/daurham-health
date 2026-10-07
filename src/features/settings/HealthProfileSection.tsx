import { useEffect, useState } from 'react'
import {
  ageYearsOnDate,
  centimetersToInches,
  healthProfileSchema,
  inchesToCentimeters,
  type HealthProfile,
} from '@/domain/health-profile'
import { primaryButtonClass, quietButtonClass, useHealthCalendarDate } from '@/lib'
import { fetchHealthProfile, saveHealthProfile } from './api'

function splitHeight(heightCm: number | null): { feet: string; inches: string } {
  if (heightCm == null) return { feet: '', inches: '' }
  const totalTenths = Math.round(centimetersToInches(heightCm) * 10)
  const feet = Math.floor(totalTenths / 120)
  const inchesTenths = totalTenths - feet * 120
  return { feet: String(feet), inches: String(inchesTenths / 10) }
}

function profileSummary(profile: HealthProfile, today: string): string {
  const parts: string[] = []
  if (profile.dateOfBirth) {
    try {
      parts.push(`Age ${ageYearsOnDate(profile.dateOfBirth, today)}`)
    } catch {
      // The server already validates this; omit a bad legacy value rather than inventing age.
    }
  }
  if (profile.heightCm != null) {
    const totalInches = Math.round(centimetersToInches(profile.heightCm))
    const feet = Math.floor(totalInches / 12)
    const inches = totalInches - feet * 12
    parts.push(`${feet}'${inches}"`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'Add stable context Health can use later.'
}

export function HealthProfileSection() {
  const today = useHealthCalendarDate()
  const [profile, setProfile] = useState<HealthProfile | null>(null)
  const [editing, setEditing] = useState(false)
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [feet, setFeet] = useState('')
  const [inches, setInches] = useState('')
  const [persistentHealthContext, setPersistentHealthContext] = useState('')
  const [trainingLimitations, setTrainingLimitations] = useState('')
  const [dietaryContext, setDietaryContext] = useState('')
  const [bodyMeasurementProtocol, setBodyMeasurementProtocol] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function loadDraft(next: HealthProfile) {
    const height = splitHeight(next.heightCm)
    setDateOfBirth(next.dateOfBirth ?? '')
    setFeet(height.feet)
    setInches(height.inches)
    setPersistentHealthContext(next.persistentHealthContext ?? '')
    setTrainingLimitations(next.trainingLimitations ?? '')
    setDietaryContext(next.dietaryContext ?? '')
    setBodyMeasurementProtocol(next.bodyMeasurementProtocol ?? '')
  }

  useEffect(() => {
    let cancelled = false
    fetchHealthProfile()
      .then((next) => {
        if (!cancelled) {
          setProfile(next)
          loadDraft(next)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load Health Profile')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const feetValue = feet.trim() === '' ? null : Number(feet)
      const inchesValue = inches.trim() === '' ? null : Number(inches)
      if (
        (feetValue != null && (!Number.isFinite(feetValue) || feetValue < 0)) ||
        (inchesValue != null && (!Number.isFinite(inchesValue) || inchesValue < 0 || inchesValue >= 12))
      ) {
        throw new Error('Height must use valid feet and inches.')
      }
      const totalInches =
        feetValue == null && inchesValue == null
          ? null
          : (feetValue ?? 0) * 12 + (inchesValue ?? 0)
      const next = await saveHealthProfile({
        dateOfBirth: dateOfBirth || null,
        heightCm: totalInches == null ? null : Math.round(inchesToCentimeters(totalInches) * 10) / 10,
        persistentHealthContext,
        trainingLimitations,
        dietaryContext,
        bodyMeasurementProtocol,
      })
      setProfile(healthProfileSchema.parse(next))
      loadDraft(next)
      setEditing(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save Health Profile')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="health-profile" className="min-w-0 scroll-mt-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Health Profile</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Stable owner context for calculations and future Health intelligence. Temporary symptoms belong in Daily Context.
          </p>
          <p className="mt-2 text-sm font-medium text-zinc-800">
            {profile ? profileSummary(profile, today) : 'Loading profile…'}
          </p>
        </div>
        {profile && !editing ? (
          <button type="button" className={quietButtonClass} onClick={() => setEditing(true)}>
            Edit
          </button>
        ) : null}
      </div>

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

      {editing ? (
        <div className="space-y-4 border-t border-zinc-100 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-zinc-700">
              Date of birth
              <input
                type="date"
                max={today}
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3 text-base"
              />
            </label>
            <fieldset>
              <legend className="text-sm font-medium text-zinc-700">Height</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <label className="sr-only" htmlFor="profile-height-feet">Height feet</label>
                <input
                  id="profile-height-feet"
                  type="number"
                  min="0"
                  max="8"
                  inputMode="numeric"
                  placeholder="ft"
                  value={feet}
                  onChange={(event) => setFeet(event.target.value)}
                  className="min-h-11 w-full rounded-md border border-zinc-300 px-3 text-base"
                />
                <label className="sr-only" htmlFor="profile-height-inches">Height inches</label>
                <input
                  id="profile-height-inches"
                  type="number"
                  min="0"
                  max="11.9"
                  step="0.1"
                  inputMode="decimal"
                  placeholder="in"
                  value={inches}
                  onChange={(event) => setInches(event.target.value)}
                  className="min-h-11 w-full rounded-md border border-zinc-300 px-3 text-base"
                />
              </div>
            </fieldset>
          </div>

          <label className="block text-sm font-medium text-zinc-700">
            Persistent health context
            <textarea
              value={persistentHealthContext}
              maxLength={2000}
              onChange={(event) => setPersistentHealthContext(event.target.value)}
              placeholder="Only durable context you want Health to remember."
              className="mt-1 min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-base"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-700">
            Training limitations
            <textarea
              value={trainingLimitations}
              maxLength={2000}
              onChange={(event) => setTrainingLimitations(event.target.value)}
              placeholder="Persistent injuries, movement limitations, or constraints."
              className="mt-1 min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2 text-base"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-700">
            Dietary context
            <textarea
              value={dietaryContext}
              maxLength={2000}
              onChange={(event) => setDietaryContext(event.target.value)}
              placeholder="Durable dietary restrictions or preferences that should affect recommendations."
              className="mt-1 min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2 text-base"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-700">
            Usual body-measurement conditions
            <textarea
              value={bodyMeasurementProtocol}
              maxLength={1000}
              onChange={(event) => setBodyMeasurementProtocol(event.target.value)}
              placeholder="Example: morning, after bathroom, before food/drink, same scale and tape positions."
              className="mt-1 min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2 text-base"
            />
            <span className="mt-1 block text-xs font-normal text-zinc-500">Used only to interpret comparability; different conditions are still valid measurements.</span>
          </label>

          <p className="text-xs leading-5 text-zinc-500">
            These are owner-reported facts, not diagnoses or measurements. Biological sex is intentionally not collected until a supported calculation actually needs it.
          </p>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save profile'}
            </button>
            <button
              type="button"
              className={quietButtonClass}
              disabled={busy}
              onClick={() => {
                if (profile) loadDraft(profile)
                setEditing(false)
                setError(null)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
