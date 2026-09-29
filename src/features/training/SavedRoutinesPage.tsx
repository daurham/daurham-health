import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ExerciseDefinition, MeasurementKind, OwnerRoutineInput, TemplatePrescription, WorkoutTemplate } from '@/domain/training'
import { formatPrescription } from '@/domain/training'
import { dangerButtonClass, primaryButtonClass, quietButtonClass, secondaryButtonClass } from '@/lib'
import { archiveOwnerRoutine, createOwnerRoutine, fetchExercises, fetchTemplates, reviseOwnerRoutine } from './api'

type RoutineExerciseDraft = {
  exerciseDefinitionId: string
  plannedSets: number
  prescription: TemplatePrescription
}

function defaultPrescription(exercise: ExerciseDefinition): TemplatePrescription {
  const measurement = exercise.measurementKind
  if (measurement === 'reps' || measurement === 'reps_per_side') return { measurement, min: 8, max: 12 }
  if (measurement === 'duration' || measurement === 'duration_per_side') return { measurement, min_sec: 30, max_sec: 45 }
  if (measurement === 'distance' || measurement === 'distance_duration') return { measurement, min_distance: 1, distance_unit: 'mi' }
  return { measurement }
}

function fromTemplate(template: WorkoutTemplate): RoutineExerciseDraft[] {
  return template.exercises.map((slot) => ({
    exerciseDefinitionId: slot.exercise.id,
    plannedSets: slot.plannedSets ?? 1,
    prescription: slot.prescription,
  }))
}

export function SavedRoutinesPage() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [exercises, setExercises] = useState<ExerciseDefinition[]>([])
  const [editing, setEditing] = useState<WorkoutTemplate | null>(null)
  const [name, setName] = useState('')
  const [draftExercises, setDraftExercises] = useState<RoutineExerciseDraft[]>([])
  const [selectedExercise, setSelectedExercise] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    const [nextTemplates, nextExercises] = await Promise.all([fetchTemplates(), fetchExercises()])
    setTemplates(nextTemplates)
    setExercises(nextExercises)
    if (!selectedExercise) setSelectedExercise(nextExercises[0]?.id ?? '')
  }

  useEffect(() => { void reload().catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load routines')) }, [])

  const owner = useMemo(() => templates.filter((item) => item.originKind === 'owner' && item.isActive), [templates])

  function reset() {
    setEditing(null)
    setName('')
    setDraftExercises([])
    setError(null)
  }

  function startEdit(template: WorkoutTemplate) {
    setEditing(template)
    setName(template.name)
    setDraftExercises(fromTemplate(template))
    setError(null)
  }

  async function save() {
    if (!name.trim() || draftExercises.length === 0) {
      setError('Give the routine a name and add at least one exercise.')
      return
    }
    setBusy(true); setError(null)
    try {
      const input: OwnerRoutineInput = { name: name.trim(), exercises: draftExercises }
      if (editing) await reviseOwnerRoutine(editing.id, input)
      else await createOwnerRoutine(input)
      await reload()
      reset()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save routine')
    } finally { setBusy(false) }
  }

  async function archive(template: WorkoutTemplate) {
    if (!confirm(`Archive "${template.name}"? Existing workouts keep their saved version.`)) return
    setBusy(true); setError(null)
    try { await archiveOwnerRoutine(template.id); await reload(); if (editing?.id === template.id) reset() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not archive routine') }
    finally { setBusy(false) }
  }

  function addExercise() {
    const exercise = exercises.find((item) => item.id === selectedExercise)
    if (!exercise) return
    setDraftExercises((current) => [...current, {
      exerciseDefinitionId: exercise.id,
      plannedSets: 3,
      prescription: defaultPrescription(exercise),
    }])
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/training" className="text-sm text-zinc-500 hover:underline">Training</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Saved routines</h1>
          <p className="mt-1 text-sm text-zinc-600">Your reusable programmed workouts. Editing creates a new immutable version.</p>
        </div>
        <button type="button" className={primaryButtonClass} onClick={reset}>New routine</button>
      </div>

      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p> : null}

      {owner.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold text-zinc-700">Current routines</h2>
          <ul className="mt-3 space-y-2">
            {owner.map((template) => (
              <li key={template.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3">
                <div className="min-w-0">
                  <p className="font-medium">{template.name}</p>
                  <p className="text-sm text-zinc-500">{template.exercises.length} exercises · v{template.version}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" className={secondaryButtonClass} onClick={() => startEdit(template)}>Edit</button>
                  <button type="button" className={dangerButtonClass} onClick={() => void archive(template)} disabled={busy}>Archive</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : <p className="text-sm text-zinc-500">No saved routines yet.</p>}

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-lg font-semibold">{editing ? `Edit ${editing.name}` : 'New routine'}</h2>
        {editing ? <p className="mt-1 text-sm text-zinc-500">Saving creates version {Number(editing.version) + 1}; prior workouts stay on v{editing.version}.</p> : null}
        <label className="mt-4 block text-sm font-medium text-zinc-700">
          Name
          <input className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3 text-base" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        </label>

        <div className="mt-4 space-y-3">
          {draftExercises.map((item, index) => {
            const exercise = exercises.find((row) => row.id === item.exerciseDefinitionId)
            if (!exercise) return null
            return (
              <article key={`${item.exerciseDefinitionId}:${index}`} className="rounded-md border border-zinc-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-medium">{exercise.name}</p><p className="text-xs text-zinc-500">{formatPrescription(item.plannedSets, item.prescription)}</p></div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={quietButtonClass} disabled={index === 0} onClick={() => setDraftExercises((rows) => {
                      const next=[...rows]; const [moved]=next.splice(index,1); if(moved) next.splice(index-1,0,moved); return next
                    })}>Up</button>
                    <button type="button" className={quietButtonClass} disabled={index === draftExercises.length-1} onClick={() => setDraftExercises((rows) => {
                      const next=[...rows]; const [moved]=next.splice(index,1); if(moved) next.splice(index+1,0,moved); return next
                    })}>Down</button>
                    <button type="button" className={dangerButtonClass} onClick={() => setDraftExercises((rows) => rows.filter((_, i) => i !== index))}>Remove</button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">Sets
                    <input type="number" min={1} max={20} className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3" value={item.plannedSets}
                      onChange={(event) => setDraftExercises((rows) => rows.map((row,i) => i===index ? {...row,plannedSets: Math.max(1,Number(event.target.value)||1)} : row))} />
                  </label>
                  <PrescriptionEditor exercise={exercise} value={item.prescription} onChange={(prescription) => setDraftExercises((rows) => rows.map((row,i)=>i===index?{...row,prescription}:row))} />
                </div>
              </article>
            )
          })}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select className="min-h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-base" value={selectedExercise} onChange={(event) => setSelectedExercise(event.target.value)}>
            {exercises.filter((item)=>item.isActive).map((exercise)=><option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
          </select>
          <button type="button" className={secondaryButtonClass} onClick={addExercise}>Add exercise</button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : editing ? 'Save new version' : 'Save routine'}</button>
          {(editing || name || draftExercises.length) ? <button type="button" className={quietButtonClass} disabled={busy} onClick={reset}>Cancel</button> : null}
        </div>
      </section>
    </section>
  )
}

function PrescriptionEditor({ exercise, value, onChange }: { exercise: ExerciseDefinition; value: TemplatePrescription; onChange: (value: TemplatePrescription)=>void }) {
  const kind: MeasurementKind = exercise.measurementKind
  if (kind === 'completion') return <div className="text-sm text-zinc-500">One skill attempt per set</div>
  if (kind === 'reps' || kind === 'reps_per_side') return <RangeFields label="Reps" min={value.min} max={value.max} onChange={(min,max)=>onChange({...value,measurement:kind,min,max})} />
  if (kind === 'duration' || kind === 'duration_per_side') return <RangeFields label="Seconds" min={value.min_sec} max={value.max_sec} onChange={(min,max)=>onChange({...value,measurement:kind,min_sec:min,max_sec:max})} />
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <label className="text-sm">Target distance
        <input type="number" min={0} step="0.05" className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3" value={value.min_distance ?? ''}
          onChange={(event)=>onChange({...value,measurement:kind,min_distance:event.target.value===''?undefined:Number(event.target.value)})} />
      </label>
      <label className="text-sm">Unit
        <select className="mt-1 min-h-11 rounded-md border border-zinc-300 px-3" value={value.distance_unit ?? 'mi'} onChange={(event)=>onChange({...value,measurement:kind,distance_unit:event.target.value as 'mi'|'km'})}>
          <option value="mi">mi</option><option value="km">km</option>
        </select>
      </label>
    </div>
  )
}

function RangeFields({ label, min, max, onChange }: { label:string; min?:number; max?:number; onChange:(min:number|undefined,max:number|undefined)=>void }) {
  return <div className="grid grid-cols-2 gap-2">
    <label className="text-sm">{label} min<input type="number" min={0} className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3" value={min ?? ''} onChange={(e)=>onChange(e.target.value===''?undefined:Number(e.target.value),max)} /></label>
    <label className="text-sm">{label} max<input type="number" min={0} className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3" value={max ?? ''} onChange={(e)=>onChange(min,e.target.value===''?undefined:Number(e.target.value))} /></label>
  </div>
}
