import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { parseAppleHealthFile, previewAppleHealth } from '@/domain/apple-health'
import { formatCalendarRange } from '@/domain/calendar-format'
import { healthCalendarDateFromNow } from '@/domain/time'
import { progressionState } from '@/domain/progression'
import { XpAmount } from '@/components/XpAmount'
import { DEFAULT_TREND_PREFERENCES, type TrendPreferenceDirection, type TrendPreferences } from '@/domain/trend-intent'
import { clearTrendPreferences, readTrendPreferences, writeTrendPreferences } from '@/trend-intent'
import { useRewardSummary } from '@/features/rewards/useRewardSummary'
import {
  MODE_LABELS,
  THEME_PACKS,
  PALETTE_STORAGE_KEY,
  THEME_MODE_PREFERENCES,
  THEME_STORAGE_KEY,
  applyStoredAppearance,
  readPalettePreference,
  readThemePreference,
  resolveTheme,
  writePalettePreference,
  writeThemePreference,
  themePackUnlocked,
  type HealthPalette,
  type ThemeModePreference,
} from '@/theme'
import {
  healthFetch,
  primaryButtonClass,
  quietButtonClass,
  readApiError,
  themeChoiceClass,
  themeChoiceSelectedClass,
} from '@/lib'
import type { AppleHealthPreview } from '@/domain/apple-health/preview'
import {
  commitAppleHealthRecords,
  fetchAppleHealthStatus,
  lookupAppleHealthDuplicates,
  type AppleHealthStatus,
} from './api'

function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

function storedMode(): ThemeModePreference {
  return typeof localStorage === 'undefined' ? 'system' : readThemePreference(localStorage)
}

function storedPalette(): HealthPalette {
  return typeof localStorage === 'undefined' ? 'classic' : readPalettePreference(localStorage)
}

function prefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
}

function AppearanceSection() {
  const [mode, setMode] = useState<ThemeModePreference>(storedMode)
  const [palette, setPalette] = useState<HealthPalette>(storedPalette)
  const [systemDark, setSystemDark] = useState(prefersDark)
  const { summary } = useRewardSummary(true)
  const progression = progressionState(summary?.lifetimeXp ?? 0)
  const resolvedMode = resolveTheme(mode, systemDark)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY && event.key !== PALETTE_STORAGE_KEY && event.key !== null) {
        return
      }
      setMode(storedMode())
      setPalette(storedPalette())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function paint() {
    applyStoredAppearance(localStorage, prefersDark(), document.documentElement)
  }

  function animateThemeChange() {
    const root = document.documentElement
    root.classList.add('theme-changing')
    window.setTimeout(() => root.classList.remove('theme-changing'), 260)
  }

  return (
    <section id="theme-studio" className="min-w-0 scroll-mt-6 space-y-5 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Theme Studio</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Mode controls light and dark. Theme packs change the app's surfaces, charts, reward energy, and overall personality.
          </p>
        </div>
        {summary ? (
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Level {progression.level}</p>
            <XpAmount amount={summary.lifetimeXp} badge={false} className="mt-1 text-sm" label={String(summary.lifetimeXp) + ' lifetime XP'} />
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-zinc-700">Color mode</p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_MODE_PREFERENCES.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={mode === choice}
              aria-label={choice === 'light' ? 'Switch to light mode' : choice === 'dark' ? 'Switch to dark mode' : 'Use system appearance'}
              onClick={() => {
                writeThemePreference(localStorage, choice)
                animateThemeChange()
                paint()
                setMode(choice)
              }}
              className={mode === choice ? themeChoiceSelectedClass : themeChoiceClass}
            >
              {MODE_LABELS[choice]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-zinc-700">Theme packs</p>
            <p className="mt-0.5 text-xs text-zinc-500">Lifetime XP unlocks new packs. Unlocking never spends XP.</p>
          </div>
          {progression.nextThemeUnlock ? (
            <p className="text-xs text-zinc-500">
              Next pack at Level {progression.nextThemeUnlock.level} · {progression.nextThemeUnlock.thresholdXp.toLocaleString('en-US')} lifetime XP
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {THEME_PACKS.map((pack) => {
            const unlocked = pack.unlockLevel == null || pack.id === palette || (summary != null && themePackUnlocked(pack.id, summary.lifetimeXp))
            const selected = palette === pack.id
            return (
              <button
                key={pack.id}
                type="button"
                aria-pressed={selected}
                aria-label={unlocked ? 'Use ' + pack.label + ' theme' : pack.label + ' theme unlocks at level ' + pack.unlockLevel}
                disabled={!unlocked}
                onClick={() => {
                  writePalettePreference(localStorage, pack.id)
                  animateThemeChange()
                  paint()
                  setPalette(pack.id)
                }}
                className={[
                  'motion-pressable min-w-0 overflow-hidden rounded-xl border p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  selected ? 'border-accent ring-1 ring-accent' : unlocked ? 'border-zinc-200 hover:border-zinc-400' : 'border-zinc-200',
                ].join(' ')}
              >
                <div
                  className="h-20 border-b border-black/5 p-3"
                  style={{
                    background:
                      resolvedMode === 'dark'
                        ? 'radial-gradient(circle at 82% 12%, ' + pack.preview.secondary + '38, transparent 46%), linear-gradient(135deg, #11151b, ' + pack.preview.accent + '45)'
                        : 'radial-gradient(circle at 82% 12%, ' + pack.preview.secondary + '22, transparent 46%), linear-gradient(135deg, ' + pack.preview.canvas + ', ' + pack.preview.surface + ')',
                    boxShadow: pack.unlockLevel == null ? undefined : 'inset 0 0 28px ' + pack.preview.accent + (resolvedMode === 'dark' ? '20' : '12'),
                  }}
                  aria-hidden="true"
                >
                  <div className="flex h-full items-end gap-2">
                    <span className="h-9 w-9 rounded-lg shadow-sm" style={{ background: pack.preview.accent }} />
                    <span className="h-7 w-7 rounded-full" style={{ background: pack.preview.secondary }} />
                    <span className="ml-auto h-5 w-12 rounded-full" style={{ background: pack.preview.reward }} />
                  </div>
                </div>
                <div className="bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-900">{pack.label}</span>
                    <span className={selected ? 'text-xs font-semibold text-accent' : unlocked ? 'text-xs text-zinc-500' : 'text-xs font-semibold text-zinc-500'}>
                      {selected ? 'Selected' : unlocked ? 'Unlocked' : 'Level ' + pack.unlockLevel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-zinc-600">{pack.flavor}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function storedTrendPreferences(): TrendPreferences {
  return typeof localStorage === 'undefined' ? { ...DEFAULT_TREND_PREFERENCES } : readTrendPreferences(localStorage)
}

const BODY_TREND_OPTIONS: Array<{ value: TrendPreferenceDirection; label: string }> = [
  { value: 'lower', label: 'Lower' },
  { value: 'maintain', label: 'Maintain / neutral' },
  { value: 'higher', label: 'Higher' },
  { value: 'none', label: 'No preference' },
]

const UP_TREND_OPTIONS: Array<{ value: 'higher' | 'none'; label: string }> = [
  { value: 'higher', label: 'Higher' },
  { value: 'none', label: 'No preference' },
]

function TrendColorsSection() {
  const [preferences, setPreferences] = useState<TrendPreferences>(storedTrendPreferences)

  function update<K extends keyof Omit<TrendPreferences, 'version'>>(key: K, value: TrendPreferences[K]) {
    const next = { ...preferences, [key]: value }
    setPreferences(next)
    writeTrendPreferences(localStorage, next)
  }

  function reset() {
    clearTrendPreferences(localStorage)
    setPreferences({ ...DEFAULT_TREND_PREFERENCES })
  }

  return (
    <section id="trend-colors" className="min-w-0 scroll-mt-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Personalize trend colors</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Tell Progress what direction you generally want when there is no active Goal. An active formal Goal always takes priority over these visual preferences.
          </p>
        </div>
        <button type="button" className={quietButtonClass} onClick={reset}>Reset</button>
      </div>

      <TrendPreferenceRow label="Bodyweight" value={preferences.bodyweight} options={BODY_TREND_OPTIONS} onChange={(value) => update('bodyweight', value)} />
      <TrendPreferenceRow label="Body fat" value={preferences.bodyFat} options={BODY_TREND_OPTIONS} onChange={(value) => update('bodyFat', value)} />
      <TrendPreferenceRow label="Waist" value={preferences.waist} options={BODY_TREND_OPTIONS} onChange={(value) => update('waist', value)} />
      <TrendPreferenceRow label="Strength" value={preferences.strength} options={UP_TREND_OPTIONS} onChange={(value) => update('strength', value)} />
      <TrendPreferenceRow label="Activity steps" value={preferences.activitySteps} options={UP_TREND_OPTIONS} onChange={(value) => update('activitySteps', value)} />

      <p className="text-xs leading-5 text-zinc-500">
        These choices only color trend direction. They do not create Health Goals, change Coach, or alter any stored Health measurement.
      </p>
    </section>
  )
}

function TrendPreferenceRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="grid gap-2 border-t border-zinc-100 pt-3 sm:grid-cols-[10rem_1fr] sm:items-center">
      <legend className="sr-only">{label}</legend>
      <p className="text-sm font-medium text-zinc-800">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            className={`${value === option.value ? themeChoiceSelectedClass : themeChoiceClass} !w-auto px-3`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function PreviewReport({ preview }: { preview: AppleHealthPreview }) {
  const counts = preview.counts
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <dt className="text-zinc-500">Records encountered</dt>
      <dd>{formatCount(counts.encountered)}</dd>
      <dt className="text-zinc-500">Date range</dt>
      <dd>{preview.dateRange ? formatCalendarRange(preview.dateRange.start, preview.dateRange.end) : '—'}</dd>
      <dt className="text-zinc-500">Steps</dt>
      <dd>{formatCount(counts.steps)}</dd>
      <dt className="text-zinc-500">Active energy</dt>
      <dd>{formatCount(counts.activeEnergy)}</dd>
      <dt className="text-zinc-500">Exercise time</dt>
      <dd>{formatCount(counts.exerciseTime)}</dd>
      <dt className="text-zinc-500">Walking/running distance</dt>
      <dd>{formatCount(counts.walkingRunningDistance)}</dd>
      <dt className="text-zinc-500">Resting HR</dt>
      <dd>{formatCount(counts.restingHeartRate)}</dd>
      <dt className="text-zinc-500">Sleep samples</dt>
      <dd>{formatCount(counts.sleep)}</dd>
      <dt className="text-zinc-500">Workouts</dt>
      <dd>{formatCount(counts.workouts)}</dd>
      <dt className="text-zinc-500">Body skipped</dt>
      <dd>{formatCount(counts.bodyOwned)}</dd>
      <dt className="text-zinc-500">Nutrition skipped</dt>
      <dd>{formatCount(counts.nutritionOwned)}</dd>
      <dt className="text-zinc-500">Unsupported</dt>
      <dd>{formatCount(counts.unsupported)}</dd>
      <dt className="text-zinc-500">Validation failures</dt>
      <dd>{formatCount(counts.malformed)}</dd>
      <dt className="text-zinc-500">Duplicate fingerprints</dt>
      <dd>{formatCount(counts.duplicateFingerprints)}</dd>
      <dt className="text-zinc-500">Estimated commit rows</dt>
      <dd>{formatCount(counts.estimatedCommitRows)}</dd>
      <dt className="text-zinc-500">Overlapping activity sources</dt>
      <dd>{formatCount(preview.overlappingActivityGroups)}</dd>
      <dt className="text-zinc-500">Sources</dt>
      <dd>{preview.sources.join(', ') || '—'}</dd>
      <dt className="text-zinc-500">Devices</dt>
      <dd className="break-all">{preview.devices.join(', ') || '—'}</dd>
      <dt className="text-zinc-500">Unknown sleep categories</dt>
      <dd>{preview.unknownSleepCategories.join(', ') || '—'}</dd>
    </dl>
  )
}

export function SettingsPage() {
  const location = useLocation()

  useEffect(() => {
    if (location.hash !== '#theme-studio' && location.hash !== '#trend-colors') return
    const id = location.hash.slice(1)
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
    })
  }, [location.hash])
  const [status, setStatus] = useState<AppleHealthStatus | null>(null)
  const [preview, setPreview] = useState<AppleHealthPreview | null>(null)
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  async function reloadStatus() {
    setStatus(await fetchAppleHealthStatus())
  }

  useEffect(() => {
    let cancelled = false
    fetchAppleHealthStatus()
      .then((next) => {
        if (!cancelled) {
          setStatus(next)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load import status')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onFile(file: File) {
    setError(null)
    setPreview(null)
    setBusy('preview')
    setProgress('Parsing export locally…')
    try {
      const parsed = parseAppleHealthFile(new Uint8Array(await file.arrayBuffer()), file.name)
      const local = previewAppleHealth(parsed)
      setProgress('Checking existing fingerprints…')
      const existing = await lookupAppleHealthDuplicates(local.records.map((record) => record.fingerprint))
      const merged = previewAppleHealth(parsed, new Set(existing))
      setPreview(merged)
      setProgress(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preview failed')
      setProgress(null)
    } finally {
      setBusy(null)
    }
  }

  async function onCommit() {
    if (!preview) {
      return
    }
    setError(null)
    setBusy('commit')
    try {
      const result = await commitAppleHealthRecords(preview, preview.records, (done, total) => {
        setProgress(`Committing ${done.toLocaleString('en-US')} / ${total.toLocaleString('en-US')}`)
      })
      setProgress(
        `Imported ${result.insertedCount.toLocaleString('en-US')} new rows (${result.matchedCount.toLocaleString('en-US')} already present).`,
      )
      setPreview(null)
      await reloadStatus()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Commit failed')
    } finally {
      setBusy(null)
    }
  }

  async function onExport() {
    setError(null)
    setExporting(true)
    try {
      const response = await healthFetch('/api/backup/export')
      if (!response.ok) {
        throw new Error(await readApiError(response))
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const profile = response.headers.get('X-Health-Backup-Profile') === 'portable' ? 'portable' : 'full'
      link.download = `health-${profile}-${healthCalendarDateFromNow()}.health-backup.zip`
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not export Health data')
    } finally {
      setExporting(false)
    }
  }

  const job = status?.job

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600">Owner data sources. Apple Health is not a primary Health destination.</p>
      </div>

      <AppearanceSection />
      <TrendColorsSection />

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold">Supplements</h2>
        <p className="text-sm text-zinc-600">
          Definitions, schedules, and recorded doses. An unchecked dose stays unknown until you mark it taken or skipped.
        </p>
        <Link to="/supplements" className={primaryButtonClass}>
          Manage supplements
        </Link>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold">Goals</h2>
        <p className="text-sm text-zinc-600">Targets you chose to pursue. Progress estimates and reminders are not part of this page.</p>
        <Link to="/goals" className={primaryButtonClass}>
          Open goals
        </Link>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold">Data & Backup</h2>
        <p className="text-sm text-zinc-600">This export contains private health information.</p>
        <p className="text-sm text-zinc-600">
          The download stays on this device. Passwords and API keys are not included. A very large archive downloads
          as a portable copy; the command-line backup remains the full recovery file.
        </p>
        <button
          type="button"
          onClick={() => {
            void onExport()
          }}
          disabled={exporting}
          className={primaryButtonClass}
        >
          {exporting ? 'Preparing export…' : 'Export my Health data'}
        </button>
      </section>

      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <h2 className="text-base font-semibold">Data sources</h2>
          <h3 className="mt-1 text-sm font-medium text-zinc-800">Apple Health</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Daily steps, active energy, exercise time, and resting heart rate sync from Health Auto Export. Sleep
            analysis syncs from Health Auto Export when it sends individual intervals. Historical workout summaries
            come from the Apple archive. Ongoing workout summaries sync from a separate Health Auto Export Workouts
            automation. Both stay in Activity and never become Training sessions.
          </p>
        </div>

        <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          <p>
            Historical archive:{' '}
            {job ? `${new Date(job.importedAt).toLocaleString()} · ${job.status}` : 'Not imported'}
          </p>
          <p>
            Health Auto Export activity:{' '}
            {status?.autoExport?.activity
              ? `${status.autoExport.activity.status} · last sync ${new Date(status.autoExport.activity.importedAt).toLocaleString()} · latest day ${status.autoExport.activity.latestDay ?? '—'}`
              : 'No sync yet'}
          </p>
          <p>
            Health Auto Export sleep:{' '}
            {status?.autoExport?.sleep
              ? `${status.autoExport.sleep.status} · last sync ${new Date(status.autoExport.sleep.importedAt).toLocaleString()} · latest night ${status.autoExport.sleep.latestNight ?? '—'}`
              : 'No sync yet'}
          </p>
          <p>
            Health Auto Export workouts:{' '}
            {status?.autoExport?.workouts
              ? `${status.autoExport.workouts.status} · last sync ${new Date(status.autoExport.workouts.importedAt).toLocaleString()} · latest workout ${status.autoExport.workouts.latestWorkoutAt ? new Date(status.autoExport.workouts.latestWorkoutAt).toLocaleString() : '—'}`
              : 'No sync yet'}
          </p>
        </div>

        {job ? (
          <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <p>
              Last import: {new Date(job.importedAt).toLocaleString()} · {job.status}
            </p>
            <p>
              {formatCount(job.insertedCount)} imported · {formatCount(job.activityCount)} activity ·{' '}
              {formatCount(job.sleepCount)} sleep · {formatCount(job.workoutCount)} workouts
            </p>
            <p>Date range in file metadata is stored with the import job, not as a Progress chart.</p>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No Apple Health import yet.</p>
        )}

        <label className="block text-sm">
          <span className="font-medium">Apple Health export</span>
          <input
            type="file"
            accept=".zip,.xml,application/zip,text/xml"
            disabled={busy !== null}
            className="mt-1 block w-full cursor-pointer text-base"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                void onFile(file)
              }
              event.target.value = ''
            }}
          />
        </label>

        {progress ? <p className="text-sm text-zinc-600">{progress}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        {preview ? (
          <div className="space-y-3">
            <PreviewReport preview={preview} />
            <button
              type="button"
              disabled={busy !== null || preview.counts.estimatedCommitRows === 0}
              onClick={() => {
                void onCommit()
              }}
              className={primaryButtonClass}
            >
              Commit import
            </button>
          </div>
        ) : null}
      </section>
    </section>
  )
}
