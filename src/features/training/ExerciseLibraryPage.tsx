import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  MEASUREMENT_KINDS,
  OWNER_EXERCISE_LOAD_TYPES,
  SIDE_TRACKING_MODES,
  ownerExerciseRequestSchema,
  type ExerciseDefinition,
  type ExerciseLibraryItem,
  type MeasurementKind,
  type OwnerExerciseLoadType,
  type OwnerExerciseRequest,
  type SideTrackingMode,
} from '@/domain/training'
import { primaryButtonClass, quietButtonClass, secondaryButtonClass } from '@/lib'
import {
  archiveExercise,
  createOwnerExercise,
  fetchExerciseLibrary,
  restoreExercise,
  updateOwnerExercise,
} from './api'
import { ExerciseGuideButton, ExerciseGuideSheet } from './ExerciseGuideSheet'

type StateFilter = 'active' | 'archived' | 'all'
type FamilyFilter = 'all' | 'reps' | 'duration' | 'distance' | 'skill'
type EquipmentFilter = 'all' | 'bodyweight' | 'free_weight' | 'cable_machine' | 'other'
type SortKind = 'recent' | 'used' | 'alpha'

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function classification(exercise: ExerciseDefinition) {
  const meta = exercise.metadata
  return {
    primaryMuscleGroup: typeof meta.primary_muscle_group === 'string' ? meta.primary_muscle_group : null,
    secondaryMuscleGroups: Array.isArray(meta.secondary_muscle_groups)
      ? meta.secondary_muscle_groups.filter((value): value is string => typeof value === 'string')
      : [],
    movementPattern: typeof meta.movement_pattern === 'string' ? meta.movement_pattern : null,
    aliases: Array.isArray(meta.aliases) ? meta.aliases.filter((value): value is string => typeof value === 'string') : [],
  }
}

function family(kind: MeasurementKind): FamilyFilter {
  if (kind === 'reps' || kind === 'reps_per_side') return 'reps'
  if (kind === 'duration' || kind === 'duration_per_side') return 'duration'
  if (kind === 'distance' || kind === 'distance_duration') return 'distance'
  return 'skill'
}

function equipmentFamily(loadType: string): EquipmentFilter {
  if (loadType === 'bodyweight' || loadType === 'none') return 'bodyweight'
  if (['barbell', 'dumbbell', 'kettlebell', 'dumbbell_or_kettlebell'].includes(loadType)) return 'free_weight'
  if (loadType === 'cable' || loadType === 'machine') return 'cable_machine'
  return 'other'
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`))
}

export function ExerciseLibraryPage() {
  const [items, setItems] = useState<ExerciseLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState<StateFilter>('active')
  const [familyFilter, setFamilyFilter] = useState<FamilyFilter>('all')
  const [equipmentFilter, setEquipmentFilter] = useState<EquipmentFilter>('all')
  const [muscleFilter, setMuscleFilter] = useState('all')
  const [movementFilter, setMovementFilter] = useState('all')
  const [sort, setSort] = useState<SortKind>('recent')
  const [editing, setEditing] = useState<ExerciseLibraryItem | 'new' | null>(null)
  const [guide, setGuide] = useState<ExerciseDefinition | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function reload() {
    setError(null)
    try {
      setItems(await fetchExerciseLibrary())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load exercises')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  const muscles = useMemo(() => {
    const values = new Set<string>()
    for (const item of items) {
      const primary = classification(item.exercise).primaryMuscleGroup
      if (primary) values.add(primary)
    }
    return [...values].sort()
  }, [items])

  const movements = useMemo(() => {
    const values = new Set<string>()
    for (const item of items) {
      const movement = classification(item.exercise).movementPattern
      if (movement) values.add(movement)
    }
    return [...values].sort()
  }, [items])

  const visible = useMemo(() => {
    const needle = normalized(query)
    const next = items.filter((item) => {
      if (stateFilter === 'active' && !item.exercise.isActive) return false
      if (stateFilter === 'archived' && item.exercise.isActive) return false
      if (familyFilter !== 'all' && family(item.exercise.measurementKind) !== familyFilter) return false
      if (equipmentFilter !== 'all' && equipmentFamily(item.exercise.loadType) !== equipmentFilter) return false
      const info = classification(item.exercise)
      if (muscleFilter !== 'all' && info.primaryMuscleGroup !== muscleFilter) return false
      if (movementFilter !== 'all' && info.movementPattern !== movementFilter) return false
      if (!needle) return true
      return normalized([
        item.exercise.name,
        item.exercise.loadType,
        info.primaryMuscleGroup ?? '',
        info.movementPattern ?? '',
        ...info.aliases,
      ].join(' ')).includes(needle)
    })
    return next.sort((left, right) => {
      if (sort === 'used') return right.usageCount - left.usageCount || left.exercise.name.localeCompare(right.exercise.name)
      if (sort === 'recent') return (right.lastPerformedDate ?? '').localeCompare(left.lastPerformedDate ?? '') || left.exercise.name.localeCompare(right.exercise.name)
      return left.exercise.name.localeCompare(right.exercise.name)
    })
  }, [equipmentFilter, familyFilter, items, movementFilter, muscleFilter, query, sort, stateFilter])

  async function archive(item: ExerciseLibraryItem) {
    setBusyId(item.exercise.id)
    setError(null)
    try {
      await archiveExercise(item.exercise.id)
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not archive exercise')
    } finally {
      setBusyId(null)
    }
  }

  async function restore(item: ExerciseLibraryItem) {
    setBusyId(item.exercise.id)
    setError(null)
    try {
      await restoreExercise(item.exercise.id)
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not restore exercise')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/training" className="text-sm text-zinc-500 hover:text-zinc-900">← Training</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Exercise Library</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Manage exercise definitions, form cues, media, and workout availability without rewriting Training history.
          </p>
        </div>
        <button type="button" className={primaryButtonClass} onClick={() => setEditing('new')}>Add exercise</button>
      </div>

      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p> : null}

      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_repeat(6,auto)]">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, alias, muscle…" className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-base xl:text-sm" />
        <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as StateFilter)} className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm"><option value="active">Active</option><option value="archived">Archived</option><option value="all">All states</option></select>
        <select value={familyFilter} onChange={(event) => setFamilyFilter(event.target.value as FamilyFilter)} className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm"><option value="all">All measurements</option><option value="reps">Reps</option><option value="duration">Duration</option><option value="distance">Distance</option><option value="skill">Skill</option></select>
        <select value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value as EquipmentFilter)} className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm"><option value="all">All equipment</option><option value="bodyweight">Bodyweight / none</option><option value="free_weight">Free weights</option><option value="cable_machine">Cable / machine</option><option value="other">Other</option></select>
        <select value={muscleFilter} onChange={(event) => setMuscleFilter(event.target.value)} className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm"><option value="all">All muscles</option>{muscles.map((muscle) => <option key={muscle} value={muscle}>{muscle.replace(/_/g, ' ')}</option>)}</select>
        <select value={movementFilter} onChange={(event) => setMovementFilter(event.target.value)} className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm"><option value="all">All patterns</option>{movements.map((movement) => <option key={movement} value={movement}>{movement.replace(/_/g, ' ')}</option>)}</select>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortKind)} className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm"><option value="recent">Recently used</option><option value="used">Most used</option><option value="alpha">A–Z</option></select>
      </div>

      {loading ? (
        <div className="space-y-2" aria-label="Loading Exercise Library">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-lg bg-zinc-100" />)}</div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">No exercises match these filters.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {visible.map((item) => {
            const info = classification(item.exercise)
            const blocked = item.activeRoutines.length > 0
            return (
              <li key={item.exercise.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{item.exercise.name}</h2>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{item.builtIn ? 'Built-in' : 'Owner'}</span>
                      {!item.exercise.isActive ? <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600">Archived</span> : null}
                      <ExerciseGuideButton exercise={item.exercise} onOpen={() => setGuide(item.exercise)} />
                    </div>
                    <p className="mt-1 text-sm text-zinc-700">
                      {item.exercise.measurementKind.replace(/_/g, ' ')} · {item.exercise.loadType.replace(/_/g, ' ')}
                      {item.exercise.unilateral ? ' · unilateral' : ''}
                      {item.exercise.sideTrackingMode !== 'shared' ? ` · ${item.exercise.sideTrackingMode} sides` : ''}
                      {info.movementPattern ? ` · ${info.movementPattern.replace(/_/g, ' ')}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.usageCount === 0 ? 'Never performed' : `Used in ${item.usageCount} workout${item.usageCount === 1 ? '' : 's'}`}
                      {item.lastPerformedDate ? ` · Last ${dateLabel(item.lastPerformedDate)}` : ''}
                      {info.primaryMuscleGroup ? ` · ${info.primaryMuscleGroup.replace(/_/g, ' ')}` : ''}
                    </p>
                    {item.activeRoutines.length > 0 ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        Archive blocked by active routine{item.activeRoutines.length === 1 ? '' : 's'} · {item.activeRoutines.map((routine) => routine.name).join(', ')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" className={secondaryButtonClass} onClick={() => setEditing(item)}>Edit</button>
                    {item.exercise.isActive ? (
                      <button
                        type="button"
                        className={quietButtonClass}
                        disabled={busyId === item.exercise.id || blocked}
                        title={blocked ? 'Remove or replace this exercise in active routines first.' : undefined}
                        onClick={() => {
                          if (globalThis.confirm(`Archive “${item.exercise.name}”? Workout history will be preserved.`)) void archive(item)
                        }}
                      >
                        Archive
                      </button>
                    ) : (
                      <button type="button" className={quietButtonClass} disabled={busyId === item.exercise.id} onClick={() => void restore(item)}>Restore</button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editing ? (
        <ExerciseEditorSheet
          item={editing === 'new' ? null : editing}
          allItems={items}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void reload() }}
        />
      ) : null}
      {guide ? <ExerciseGuideSheet exercise={guide} onClose={() => setGuide(null)} /> : null}
    </section>
  )
}

function ExerciseEditorSheet({
  item,
  allItems,
  onClose,
  onSaved,
}: {
  item: ExerciseLibraryItem | null
  allItems: ExerciseLibraryItem[]
  onClose: () => void
  onSaved: () => void
}) {
  const exercise = item?.exercise ?? null
  const info = exercise ? classification(exercise) : { primaryMuscleGroup: null, secondaryMuscleGroups: [], movementPattern: null, aliases: [] }
  const [name, setName] = useState(exercise?.name ?? '')
  const [measurementKind, setMeasurementKind] = useState<MeasurementKind>(exercise?.measurementKind ?? 'reps')
  const [loadType, setLoadType] = useState<OwnerExerciseLoadType>((exercise?.loadType as OwnerExerciseLoadType | undefined) ?? 'bodyweight')
  const [sideTrackingMode, setSideTrackingMode] = useState<SideTrackingMode>(exercise?.sideTrackingMode ?? 'shared')
  const [gifUrl, setGifUrl] = useState(exercise?.gifUrl ?? '')
  const [youtubeUrl, setYoutubeUrl] = useState(exercise?.youtubeUrl ?? '')
  const [formInstructions, setFormInstructions] = useState(exercise?.formInstructions ?? '')
  const [notes, setNotes] = useState(exercise?.notes ?? '')
  const [primaryMuscleGroup, setPrimaryMuscleGroup] = useState(info.primaryMuscleGroup ?? '')
  const [secondaryMuscleGroups, setSecondaryMuscleGroups] = useState(info.secondaryMuscleGroups.join(', '))
  const [movementPattern, setMovementPattern] = useState(info.movementPattern ?? '')
  const [aliases, setAliases] = useState(info.aliases.join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const semanticEditable = item == null || item.semanticEditable
  const duplicate = useMemo(() => {
    const needle = normalized(name)
    if (needle.length < 3) return null
    return allItems.find((candidate) => candidate.exercise.id !== exercise?.id && normalized(candidate.exercise.name) === needle) ?? null
  }, [allItems, exercise?.id, name])

  const inputClass = 'mt-1 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base disabled:bg-zinc-100 disabled:text-zinc-500 md:text-sm'

  function commaList(value: string): string[] | null {
    const items = [...new Set(value.split(',').map((part) => part.trim()).filter(Boolean))]
    return items.length > 0 ? items : null
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const unilateral = measurementKind === 'reps_per_side' || measurementKind === 'duration_per_side'
    const request: OwnerExerciseRequest = {
      name,
      measurementKind,
      loadType,
      unilateral,
      sideTrackingMode,
      gifUrl: gifUrl.trim() || null,
      youtubeUrl: youtubeUrl.trim() || null,
      formInstructions: formInstructions.trim() || null,
      notes: notes.trim() || null,
      primaryMuscleGroup: primaryMuscleGroup.trim() || null,
      secondaryMuscleGroups: commaList(secondaryMuscleGroups),
      movementPattern: movementPattern.trim() || null,
      aliases: commaList(aliases),
    }
    const parsed = ownerExerciseRequestSchema.safeParse(request)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid exercise')
      setBusy(false)
      return
    }
    try {
      if (exercise) await updateOwnerExercise(exercise.id, parsed.data)
      else await createOwnerExercise(parsed.data)
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save exercise')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-4 shadow-xl sm:max-w-2xl sm:rounded-2xl sm:p-5" role="dialog" aria-modal="true" aria-label={exercise ? `Edit ${exercise.name}` : 'Add exercise'}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Exercise Library</p><h2 className="mt-1 text-xl font-semibold">{exercise ? 'Edit exercise' : 'Add exercise'}</h2></div><button type="button" className={secondaryButtonClass} onClick={onClose}>Close</button></div>
        <form className="mt-5 space-y-4" onSubmit={save}>
          <label className="block text-sm font-medium">Name<input autoFocus className={inputClass} value={name} onChange={(event) => setName(event.target.value)} /></label>
          {duplicate ? <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">An exercise named “{duplicate.exercise.name}” already exists.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">Measurement<select className={inputClass} value={measurementKind} disabled={!semanticEditable} onChange={(event) => {
              const next = event.target.value as MeasurementKind
              setMeasurementKind(next)
              if ((next === 'reps_per_side' || next === 'duration_per_side') && sideTrackingMode === 'shared') setSideTrackingMode('paired')
            }}>{MEASUREMENT_KINDS.map((kind) => <option key={kind} value={kind}>{kind.replace(/_/g, ' ')}</option>)}</select></label>
            <label className="block text-sm font-medium">Load / equipment<select className={inputClass} value={loadType} disabled={!semanticEditable} onChange={(event) => setLoadType(event.target.value as OwnerExerciseLoadType)}>{OWNER_EXERCISE_LOAD_TYPES.map((kind) => <option key={kind} value={kind}>{kind.replace(/_/g, ' ')}</option>)}</select></label>
          </div>
          <label className="block text-sm font-medium">
            Side tracking
            <select className={inputClass} value={sideTrackingMode} disabled={!semanticEditable} onChange={(event) => setSideTrackingMode(event.target.value as SideTrackingMode)}>
              {SIDE_TRACKING_MODES.map((mode) => <option key={mode} value={mode}>{mode === 'shared' ? 'Shared result' : mode === 'paired' ? 'Record both sides together' : 'Sides can continue / fail independently'}</option>)}
            </select>
            <span className="mt-1 block text-xs font-normal text-zinc-500">Independent is for movements where one limb can stop before the other.</span>
          </label>
          {!semanticEditable ? <p className="text-xs text-zinc-500">Measurement semantics are locked because this is built-in or already has workout history. Presentation fields can still be edited.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">Primary muscle<input className={inputClass} value={primaryMuscleGroup} onChange={(event) => setPrimaryMuscleGroup(event.target.value)} placeholder="back" /></label>
            <label className="block text-sm font-medium">Movement pattern<input className={inputClass} value={movementPattern} onChange={(event) => setMovementPattern(event.target.value)} placeholder="horizontal_pull" /></label>
          </div>
          <label className="block text-sm font-medium">Secondary muscles<input className={inputClass} value={secondaryMuscleGroups} onChange={(event) => setSecondaryMuscleGroups(event.target.value)} placeholder="biceps, core" /><span className="mt-1 block text-xs font-normal text-zinc-500">Comma separated</span></label>
          <label className="block text-sm font-medium">Aliases<input className={inputClass} value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="OHP, overhead press" /><span className="mt-1 block text-xs font-normal text-zinc-500">Comma separated; aliases participate in Library search.</span></label>
          <label className="block text-sm font-medium">GIF URL<input className={inputClass} value={gifUrl} onChange={(event) => setGifUrl(event.target.value)} placeholder="https://…" /></label>
          <label className="block text-sm font-medium">YouTube URL<input className={inputClass} value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://…" /></label>
          <label className="block text-sm font-medium">Form instructions<textarea className={inputClass + ' py-2'} rows={5} value={formInstructions} onChange={(event) => setFormInstructions(event.target.value)} /></label>
          <label className="block text-sm font-medium">My notes<textarea className={inputClass + ' py-2'} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Bench notch 3, use blue band…" /></label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button type="submit" className={primaryButtonClass} disabled={busy}>{busy ? 'Saving…' : exercise ? 'Save exercise' : 'Add exercise'}</button>
        </form>
      </section>
    </div>
  )
}
