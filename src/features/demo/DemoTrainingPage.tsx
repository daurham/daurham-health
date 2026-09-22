import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { demoSessions, demoWorkout } from '@/demo/repository'
import { formatCalendarDate } from '@/features/progress/format'

export function DemoTrainingPage() {
  const sessions = demoSessions().slice(0, 18)
  const total = demoSessions().length
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Training</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {total} sessions across Lower A, Lower B, and Upper.
        </p>
      </div>
      <ul className="space-y-2">
        {sessions.map((session) => (
          <li key={session.sessionId}>
            <Link
              to={`/demo/training/${session.sessionId}`}
              className="block rounded-lg border border-zinc-200 bg-white px-3 py-3 hover:border-zinc-400"
            >
              <p className="font-medium">{session.templateName}</p>
              <p className="text-sm text-zinc-600">
                {formatCalendarDate(session.sessionDate)}
                {session.routineCode ? ` · ${session.routineCode}` : ''}
                {session.durationMin != null ? ` · ${session.durationMin} min` : ''}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-zinc-600">Showing the latest {sessions.length} sessions. Earlier work is in Progress.</p>
      <SampleSheet />
    </section>
  )
}

export function DemoWorkoutPage() {
  const { sessionId } = useParams()
  const workout = sessionId ? demoWorkout(sessionId) : null
  if (!workout) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Workout</h1>
        <p className="text-sm text-zinc-600">That session is not in the demo dataset.</p>
        <Link to="/demo/training" className="text-sm font-medium underline">
          Back to Training
        </Link>
      </section>
    )
  }
  return (
    <section className="space-y-4">
      <div>
        <Link to="/demo/training" className="text-sm text-zinc-600 hover:text-zinc-900">
          Training
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{workout.name}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {formatCalendarDate(workout.date)}
          {workout.routineCode ? ` · ${workout.routineCode}` : ''}
        </p>
      </div>
      <ul className="space-y-3">
        {workout.exercises.map((exercise) => (
          <li key={exercise.id} className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold">{exercise.name}</h2>
            <ol className="mt-2 space-y-1 text-sm text-zinc-700">
              {exercise.sets.map((set, index) => (
                <li key={set.id}>
                  {index + 1}. {set.label}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SampleSheet() {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold tracking-tight">Workout sheet</h2>
      <p className="mt-1 text-sm text-zinc-600">Photo transcription stays in the private app. This sample is already prepared.</p>
      <button type="button" className="mt-3 text-sm font-medium underline" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide sample workout sheet' : 'See workout sheet review'}
      </button>
      {open ? (
        <ul className="mt-3 space-y-1 text-sm text-zinc-800">
          <li>Box Squat · 80 kg × 5, 5, 5</li>
          <li>Bench Press · 60 kg × 8, 8, 8</li>
          <li>Farmer Carry · 28 kg · 40s, 40s</li>
        </ul>
      ) : null}
    </section>
  )
}
