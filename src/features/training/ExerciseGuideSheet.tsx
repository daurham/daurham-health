import type { ExerciseDefinition } from '@/domain/training'
import { secondaryButtonClass } from '@/lib'

export function ExerciseGuideSheet({
  exercise,
  onClose,
}: {
  exercise: ExerciseDefinition
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-4 shadow-xl sm:max-w-xl sm:rounded-2xl sm:p-5" role="dialog" aria-modal="true" aria-label={`${exercise.name} form guide`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Exercise guide</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{exercise.name}</h2>
          </div>
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Close</button>
        </div>

        {exercise.gifUrl ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
            <img src={exercise.gifUrl} alt={`${exercise.name} movement demonstration`} className="max-h-80 w-full object-contain" loading="lazy" />
          </div>
        ) : null}

        {exercise.formInstructions ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Form</h3>
            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-zinc-700">{exercise.formInstructions}</p>
          </div>
        ) : null}

        {exercise.notes ? (
          <div className="mt-4 rounded-lg bg-zinc-50 p-3">
            <h3 className="text-sm font-semibold">My notes</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-zinc-700">{exercise.notes}</p>
          </div>
        ) : null}

        {exercise.youtubeUrl ? (
          <a href={exercise.youtubeUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium underline">
            Watch video
          </a>
        ) : null}

        {!exercise.gifUrl && !exercise.formInstructions && !exercise.notes && !exercise.youtubeUrl ? (
          <p className="mt-4 text-sm text-zinc-600">No guide has been added yet.</p>
        ) : null}
      </section>
    </div>
  )
}

export function ExerciseGuideButton({
  exercise,
  onOpen,
}: {
  exercise: ExerciseDefinition
  onOpen: () => void
}) {
  const available = Boolean(exercise.gifUrl || exercise.formInstructions || exercise.notes || exercise.youtubeUrl)
  if (!available) return null
  const hasGif = Boolean(exercise.gifUrl)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex min-h-8 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
      aria-label={`Open ${exercise.name} form guide`}
      title={hasGif ? 'GIF and form guide' : 'Form guide'}
    >
      {hasGif ? 'GIF' : 'Form'}
    </button>
  )
}
