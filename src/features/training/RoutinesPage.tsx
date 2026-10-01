import { useEffect, useMemo, useState } from 'react'
import type { ExerciseDefinition, MeasurementKind, TemplatePrescription, WorkoutTemplate } from '@/domain/training'
import { milesToMeters, metersToMiles } from '@/domain/units'
import { dangerButtonClass, primaryButtonClass, quietButtonClass, secondaryButtonClass } from '@/lib'
import { archiveRoutine, createRoutine, fetchExercises, fetchTemplates, reviseRoutine } from './api'
import { ExerciseGuideButton, ExerciseGuideSheet } from './ExerciseGuideSheet'

type SlotDraft = {
  exerciseDefinitionId: string
  plannedSets: number
  min: string
  max: string
  minSec: string
  maxSec: string
  minDistanceMi: string
  maxDistanceMi: string
}

function emptySlot(exerciseId = ''): SlotDraft {
  return { exerciseDefinitionId: exerciseId, plannedSets: 3, min: '', max: '', minSec: '', maxSec: '', minDistanceMi: '', maxDistanceMi: '' }
}

function slotFromTemplate(slot: WorkoutTemplate['exercises'][number]): SlotDraft {
  return {
    exerciseDefinitionId: slot.exercise.id,
    plannedSets: slot.plannedSets ?? 1,
    min: slot.prescription.min == null ? '' : String(slot.prescription.min),
    max: slot.prescription.max == null ? '' : String(slot.prescription.max),
    minSec: slot.prescription.min_sec == null ? '' : String(slot.prescription.min_sec),
    maxSec: slot.prescription.max_sec == null ? '' : String(slot.prescription.max_sec),
    minDistanceMi: slot.prescription.min_distance_m == null ? '' : String(Math.round(metersToMiles(slot.prescription.min_distance_m) * 100) / 100),
    maxDistanceMi: slot.prescription.max_distance_m == null ? '' : String(Math.round(metersToMiles(slot.prescription.max_distance_m) * 100) / 100),
  }
}

function number(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function prescription(kind: MeasurementKind, slot: SlotDraft): TemplatePrescription {
  if (kind === 'reps' || kind === 'reps_per_side') {
    return { measurement: kind, ...(number(slot.min) == null ? {} : { min: number(slot.min) }), ...(number(slot.max) == null ? {} : { max: number(slot.max) }) }
  }
  if (kind === 'duration' || kind === 'duration_per_side') {
    return { measurement: kind, ...(number(slot.minSec) == null ? {} : { min_sec: number(slot.minSec) }), ...(number(slot.maxSec) == null ? {} : { max_sec: number(slot.maxSec) }) }
  }
  if (kind === 'distance' || kind === 'distance_duration') {
    const minDistance = number(slot.minDistanceMi)
    const maxDistance = number(slot.maxDistanceMi)
    return {
      measurement: kind,
      ...(minDistance == null ? {} : { min_distance_m: milesToMeters(minDistance) }),
      ...(maxDistance == null ? {} : { max_distance_m: milesToMeters(maxDistance) }),
      ...(kind === 'distance_duration' && number(slot.minSec) != null ? { min_sec: number(slot.minSec) } : {}),
      ...(kind === 'distance_duration' && number(slot.maxSec) != null ? { max_sec: number(slot.maxSec) } : {}),
    }
  }
  return { measurement: 'completion', completion: true }
}

function RoutineExercisePicker({
  exercises,
  value,
  onChange,
}: {
  exercises: ExerciseDefinition[]
  value: string
  onChange: (exerciseId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = exercises.find((exercise) => exercise.id === value) ?? exercises[0] ?? null
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? exercises.filter((exercise) => {
        const metadata = exercise.metadata
        const aliases = Array.isArray(metadata.aliases)
          ? metadata.aliases.filter((alias): alias is string => typeof alias === 'string')
          : []
        return [exercise.name, ...aliases].some((label) => label.toLowerCase().includes(needle))
      })
    : exercises

  return (
    <div className="relative mt-1">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-zinc-300 bg-white px-3 text-left text-base"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current)
          if (open) setQuery('')
        }}
      >
        <span className="truncate">{selected?.name ?? 'Choose exercise'}</span>
        <span aria-hidden="true" className="text-zinc-500">⌄</span>
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-zinc-300 bg-white shadow-xl">
          <div className="border-b border-zinc-200 p-2">
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search exercises"
              className="min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-base"
            />
          </div>
          <div role="listbox" aria-label="Exercises" className="max-h-64 overflow-y-auto p-1">
            {matches.length === 0 ? (
              <p className="px-3 py-3 text-sm text-zinc-500">No matching exercises.</p>
            ) : (
              matches.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  role="option"
                  aria-selected={exercise.id === selected?.id}
                  className="flex min-h-10 w-full items-center rounded-md px-3 text-left text-sm hover:bg-zinc-100 aria-selected:bg-zinc-100 aria-selected:font-medium"
                  onClick={() => {
                    onChange(exercise.id)
                    setOpen(false)
                    setQuery('')
                  }}
                >
                  {exercise.name}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PrescriptionFields({ exercise, slot, onChange }: {
  exercise: ExerciseDefinition
  slot: SlotDraft
  onChange: (slot: SlotDraft) => void
}) {
  const input = 'min-h-11 w-full rounded-md border border-zinc-300 px-3 py-2 text-base'
  const kind = exercise.measurementKind
  if (kind === 'completion') return <p className="text-sm text-zinc-500">Skill attempt · achieved/not yet is logged during the workout.</p>
  if (kind === 'reps' || kind === 'reps_per_side') {
    return <div className="grid grid-cols-2 gap-2">
      <label className="text-sm">Min reps<input className={input} type="number" min="1" value={slot.min} onChange={e => onChange({ ...slot, min: e.target.value })} /></label>
      <label className="text-sm">Max reps<input className={input} type="number" min="1" value={slot.max} onChange={e => onChange({ ...slot, max: e.target.value })} /></label>
    </div>
  }
  if (kind === 'duration' || kind === 'duration_per_side') {
    return <div className="grid grid-cols-2 gap-2">
      <label className="text-sm">Min seconds<input className={input} type="number" min="1" value={slot.minSec} onChange={e => onChange({ ...slot, minSec: e.target.value })} /></label>
      <label className="text-sm">Max seconds<input className={input} type="number" min="1" value={slot.maxSec} onChange={e => onChange({ ...slot, maxSec: e.target.value })} /></label>
    </div>
  }
  return <div className="space-y-2">
    <div className="grid grid-cols-2 gap-2">
      <label className="text-sm">Min miles<input className={input} type="number" min="0" step="0.05" value={slot.minDistanceMi} onChange={e => onChange({ ...slot, minDistanceMi: e.target.value })} /></label>
      <label className="text-sm">Max miles<input className={input} type="number" min="0" step="0.05" value={slot.maxDistanceMi} onChange={e => onChange({ ...slot, maxDistanceMi: e.target.value })} /></label>
    </div>
    {kind === 'distance_duration' ? <div className="grid grid-cols-2 gap-2">
      <label className="text-sm">Min seconds<input className={input} type="number" min="1" value={slot.minSec} onChange={e => onChange({ ...slot, minSec: e.target.value })} /></label>
      <label className="text-sm">Max seconds<input className={input} type="number" min="1" value={slot.maxSec} onChange={e => onChange({ ...slot, maxSec: e.target.value })} /></label>
    </div> : null}
  </div>
}

export function RoutinesPage() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [exercises, setExercises] = useState<ExerciseDefinition[]>([])
  const [editing, setEditing] = useState<WorkoutTemplate | null>(null)
  const [name, setName] = useState('')
  const [slots, setSlots] = useState<SlotDraft[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guide, setGuide] = useState<ExerciseDefinition | null>(null)

  async function reload() {
    try {
      const [nextTemplates, nextExercises] = await Promise.all([fetchTemplates(), fetchExercises()])
      setTemplates(nextTemplates)
      setExercises(nextExercises)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load Saved Routines')
    }
  }

  useEffect(() => { void reload() }, [])

  const owner = useMemo(() => templates.filter(template => template.originKind === 'owner'), [templates])

  function begin(template?: WorkoutTemplate) {
    setEditing(template ?? null)
    setName(template?.name ?? '')
    setSlots(template ? template.exercises.map(slotFromTemplate) : [emptySlot(exercises[0]?.id ?? '')])
    setError(null)
  }

  function updateSlot(index: number, next: SlotDraft) {
    setSlots(current => current.map((slot, i) => i === index ? next : slot))
  }

  async function save() {
    setBusy(true); setError(null)
    try {
      const payload = {
        name,
        slots: slots.map(slot => {
          const exercise = exercises.find(item => item.id === slot.exerciseDefinitionId)
          if (!exercise) throw new Error('Choose an exercise for every slot.')
          return {
            exerciseDefinitionId: exercise.id,
            plannedSets: slot.plannedSets,
            prescription: prescription(exercise.measurementKind, slot),
          }
        }),
      }
      if (editing) await reviseRoutine(editing.id, payload)
      else await createRoutine(payload)
      setEditing(null); setName(''); setSlots([])
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save Saved Routine')
    } finally { setBusy(false) }
  }

  async function archive(template: WorkoutTemplate) {
    setBusy(true); setError(null)
    try { await archiveRoutine(template.id); if (editing?.id === template.id) setEditing(null); await reload() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not archive Saved Routine') }
    finally { setBusy(false) }
  }

  const formOpen = editing != null || slots.length > 0
  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight">Saved Routines</h1><p className="mt-1 text-sm text-zinc-600">Simple reusable programmed workouts. Edits create a new version.</p></div>
      {!formOpen ? <button type="button" className={primaryButtonClass} onClick={() => begin()}>New routine</button> : null}
    </div>
    {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {!formOpen ? <div className="space-y-3">
      {owner.length === 0 ? <p className="text-sm text-zinc-600">No Saved Routines yet.</p> : owner.map(template => <article key={template.id} className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{template.name}</h2><p className="text-sm text-zinc-500">v{template.version} · {template.exercises.length} exercises</p></div><div className="flex gap-2"><button type="button" className={secondaryButtonClass} onClick={() => begin(template)}>Edit</button><button type="button" className={dangerButtonClass} disabled={busy} onClick={() => void archive(template)}>Archive</button></div></div>
      </article>)}
    </div> : <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
      <label className="block text-sm font-medium">Name<input className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3 text-base" value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label>
      {slots.map((slot, index) => {
        const exercise = exercises.find(item => item.id === slot.exerciseDefinitionId) ?? exercises[0]
        return <article key={index} className="space-y-3 rounded-md border border-zinc-200 p-3">
          <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><p className="text-sm font-semibold">Exercise {index + 1}</p>{exercise ? <ExerciseGuideButton exercise={exercise} onOpen={() => setGuide(exercise)} /> : null}</div><div className="flex gap-1">
            <button type="button" className={quietButtonClass} disabled={index === 0} onClick={() => setSlots(current => { const next=[...current]; const [item]=next.splice(index,1); if(item) next.splice(index-1,0,item); return next })}>↑</button>
            <button type="button" className={quietButtonClass} disabled={index === slots.length-1} onClick={() => setSlots(current => { const next=[...current]; const [item]=next.splice(index,1); if(item) next.splice(index+1,0,item); return next })}>↓</button>
            <button type="button" className={quietButtonClass} disabled={slots.length === 1} onClick={() => setSlots(current => current.filter((_,i)=>i!==index))}>Remove</button>
          </div></div>
          <label className="block text-sm">
            Exercise
            <RoutineExercisePicker
              exercises={exercises}
              value={slot.exerciseDefinitionId}
              onChange={(exerciseId) => updateSlot(index, { ...emptySlot(exerciseId), plannedSets: slot.plannedSets })}
            />
          </label>
          <label className="block text-sm">Planned sets<input className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3 text-base" type="number" min="1" max="20" value={slot.plannedSets} onChange={e=>updateSlot(index,{...slot,plannedSets:Number(e.target.value)})} /></label>
          {exercise ? <PrescriptionFields exercise={exercise} slot={slot} onChange={next=>updateSlot(index,next)} /> : null}
        </article>
      })}
      <button type="button" className={secondaryButtonClass} onClick={() => setSlots(current=>[...current,emptySlot(exercises[0]?.id ?? '')])}>Add exercise</button>
      <div className="flex flex-wrap gap-2"><button type="button" className={primaryButtonClass} disabled={busy || name.trim()==='' || slots.length===0} onClick={()=>void save()}>{busy?'Saving…':editing?'Save new version':'Save routine'}</button><button type="button" className={quietButtonClass} disabled={busy} onClick={()=>{setEditing(null);setSlots([]);setName('');setError(null)}}>Cancel</button></div>
    </div>}
    {guide ? <ExerciseGuideSheet exercise={guide} onClose={() => setGuide(null)} /> : null}
  </section>
}
