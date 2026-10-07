import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { formatCalendarRange } from '@/domain/calendar-format'
import { labExperimentHandoffLabel, readLabExperimentHandoff } from '@/domain/lab-handoff'
import { dangerButtonClass, LoadErrorNotice, primaryButtonClass, quietButtonClass, secondaryButtonClass } from '@/lib'
import {
  abandonExperiment,
  acceptExperiment,
  addExperimentProtocolVersion,
  createExperiment,
  deleteExperiment,
  fetchExperiment,
  scheduleExperiment,
  startExperiment,
  supersedeExperiment,
  updateExperiment,
  type ExperimentDetail,
} from './api'
import { useLabCatalogs } from './catalogs'
import { ProtocolFields } from './ProtocolFields'
import { draftsFromVersion, fieldClass, newRequirementDraft, requirementPayload, describeRequirement, type RequirementDraft } from './protocol-form'

export function NewExperimentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const handoff = readLabExperimentHandoff(searchParams)
  const catalogs = useLabCatalogs()
  const [title, setTitle] = useState(() => handoff?.title ?? '')
  const [question, setQuestion] = useState('')
  const [hypothesis, setHypothesis] = useState('')
  const [rationale, setRationale] = useState(() => handoff?.rationale ?? '')
  const [instructions, setInstructions] = useState('')
  const [requirements, setRequirements] = useState<RequirementDraft[]>(() => [newRequirementDraft()])
  const [contextTags, setContextTags] = useState<string[]>([])
  const [supplementId, setSupplementId] = useState('')
  const [supplementRole, setSupplementRole] = useState<'intervention' | 'tracked'>('intervention')
  const [supplements, setSupplements] = useState<Array<{ supplementId: string; role: 'intervention' | 'tracked' }>>([])
  const [benchmarkId, setBenchmarkId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const created = await createExperiment({
        title,
        question,
        hypothesis: hypothesis.trim() || null,
        rationale: rationale.trim() || null,
        instructions,
        requirements: requirementPayload(requirements, catalogs),
        contextTags,
        supplements,
        benchmarks: benchmarkId ? [{ benchmarkDefinitionId: benchmarkId, role: 'primary' }] : [],
      })
      navigate(`/lab/experiments/${created.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the experiment')
      setSaving(false)
    }
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void onSubmit(event)}>
      <p className="text-sm text-zinc-500">
        <Link to="/lab" className="hover:underline">
          Personal Lab
        </Link>
        {' / New experiment'}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">New experiment</h1>
      <p className="text-sm text-zinc-600">Saving records an accepted experiment. Schedule it when the observation window is known.</p>
      {handoff ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          Prefilled from {labExperimentHandoffLabel(handoff.source)}. Review the rationale, write the experiment question, and define the protocol before saving.
        </p>
      ) : null}
      {error ? <LoadErrorNotice message={error} /> : null}
      <label className="block text-sm font-medium text-zinc-800">
        Title
        <input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label className="block text-sm font-medium text-zinc-800">
        Question
        <textarea className={`${fieldClass} min-h-20 py-2`} value={question} onChange={(event) => setQuestion(event.target.value)} required />
      </label>
      <label className="block text-sm font-medium text-zinc-800">
        Hypothesis
        <textarea className={`${fieldClass} min-h-16 py-2`} value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} />
      </label>
      <label className="block text-sm font-medium text-zinc-800">
        Rationale
        <textarea className={`${fieldClass} min-h-16 py-2`} value={rationale} onChange={(event) => setRationale(event.target.value)} />
      </label>
      <ProtocolFields
        instructions={instructions}
        onInstructions={setInstructions}
        requirements={requirements}
        onRequirements={setRequirements}
        contextTags={contextTags}
        onContextTags={setContextTags}
        catalogs={catalogs}
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-zinc-900">Related supplements</legend>
        <div className="flex flex-wrap gap-2">
          <select className={fieldClass} value={supplementId} onChange={(event) => setSupplementId(event.target.value)}>
            <option value="">Choose a supplement</option>
            {catalogs.supplements.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <select className={fieldClass} value={supplementRole} onChange={(event) => setSupplementRole(event.target.value as 'intervention' | 'tracked')}>
            <option value="intervention">Intervention</option>
            <option value="tracked">Tracked</option>
          </select>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => {
              if (!supplementId || supplements.some((item) => item.supplementId === supplementId)) {
                return
              }
              setSupplements([...supplements, { supplementId, role: supplementRole }])
            }}
          >
            Link
          </button>
        </div>
        <ul className="text-sm text-zinc-700">
          {supplements.map((item) => (
            <li key={item.supplementId}>
              {catalogs.supplements.find((option) => option.id === item.supplementId)?.label ?? item.supplementId} · {item.role}
            </li>
          ))}
        </ul>
      </fieldset>
      <label className="block text-sm font-medium text-zinc-800">
        Outcome benchmark
        <select className={fieldClass} value={benchmarkId} onChange={(event) => setBenchmarkId(event.target.value)}>
          <option value="">None</option>
          {catalogs.benchmarks.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-zinc-600">Schedule later. Dates are not required to save.</p>
      <button type="submit" className={primaryButtonClass} disabled={saving}>
        {saving ? 'Saving…' : 'Save experiment'}
      </button>
    </form>
  )
}

export function ExperimentDetailPage() {
  const { experimentId } = useParams()
  const navigate = useNavigate()
  const catalogs = useLabCatalogs()
  const [experiment, setExperiment] = useState<ExperimentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd] = useState('')
  const [editingProtocol, setEditingProtocol] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [requirements, setRequirements] = useState<RequirementDraft[]>([])
  const [contextTags, setContextTags] = useState<string[]>([])

  useEffect(() => {
    if (!experimentId) {
      return
    }
    let cancelled = false
    fetchExperiment(experimentId)
      .then((next) => {
        if (!cancelled) {
          setExperiment(next)
          setWindowStart(next.windowStart ?? '')
          setWindowEnd(next.windowEnd ?? '')
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load the experiment')
        }
      })
    return () => {
      cancelled = true
    }
  }, [experimentId])

  async function run(action: () => Promise<ExperimentDetail>) {
    setError(null)
    try {
      setExperiment(await action())
      setEditingProtocol(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the experiment')
    }
  }

  if (!experimentId) {
    return null
  }
  if (!experiment) {
    return error ? <LoadErrorNotice message={error} /> : <p className="text-sm text-zinc-600">Loading experiment…</p>
  }

  const version = experiment.versions.find((item) => item.id === experiment.protocolVersionId) ?? experiment.currentVersion
  const editable = experiment.status === 'accepted' || experiment.status === 'scheduled' || experiment.status === 'proposed'
  const active = experiment.status === 'active'

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        <Link to="/lab" className="hover:underline">
          Personal Lab
        </Link>
        {' / '}
        {experiment.title}
      </p>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{experiment.status}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{experiment.title}</h1>
        {experiment.reviewReady ? (
          <Link to={`/lab/experiments/${experiment.id}/result`} className="mt-2 inline-flex text-sm text-zinc-700 hover:underline">
            Review result
          </Link>
        ) : null}
        {experiment.currentResultId ? (
          <Link to={`/lab/experiment-results/${experiment.currentResultId}`} className="mt-2 inline-flex text-sm text-zinc-700 hover:underline">
            Open result
          </Link>
        ) : null}
      </div>
      {error ? <LoadErrorNotice message={error} /> : null}
      <section className="space-y-2 text-sm text-zinc-800">
        <p>
          <span className="font-medium">Question. </span>
          {experiment.question}
        </p>
        {experiment.hypothesis ? (
          <p>
            <span className="font-medium">Hypothesis. </span>
            {experiment.hypothesis}
          </p>
        ) : null}
        {experiment.rationale ? (
          <p>
            <span className="font-medium">Rationale. </span>
            {experiment.rationale}
          </p>
        ) : null}
        <p>
          <span className="font-medium">Window. </span>
          {experiment.windowStart && experiment.windowEnd
            ? formatCalendarRange(experiment.windowStart, experiment.windowEnd)
            : 'Not scheduled'}
        </p>
        <p>
          <span className="font-medium">Protocol. </span>
          {version ? `v${version.version}` : 'Missing'}
        </p>
      </section>
      {version ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">Instructions</h2>
          <p className="whitespace-pre-wrap text-sm text-zinc-700">{version.instructions}</p>
          <h2 className="text-sm font-semibold text-zinc-900">Required evidence</h2>
          <ul className="space-y-1 text-sm text-zinc-700">
            {version.requirements.map((item) => (
              <li key={item.id}>{describeRequirement(item)}</li>
            ))}
          </ul>
          <h2 className="text-sm font-semibold text-zinc-900">Context controls</h2>
          <p className="text-sm text-zinc-700">
            {version.contextControls.length === 0
              ? 'None'
              : version.contextControls.map((item) => `${item.tagKey} · observe`).join(', ')}
          </p>
        </section>
      ) : null}
      <section>
        <h2 className="text-sm font-semibold text-zinc-900">Linked supplements</h2>
        <ul className="mt-1 text-sm text-zinc-700">
          {experiment.supplements.length === 0 ? <li>None</li> : experiment.supplements.map((item) => <li key={item.supplementId}>{item.name} · {item.role}</li>)}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-semibold text-zinc-900">Linked benchmarks</h2>
        <ul className="mt-1 text-sm text-zinc-700">
          {experiment.benchmarks.length === 0 ? (
            <li>None</li>
          ) : (
            experiment.benchmarks.map((item) => (
              <li key={item.benchmarkDefinitionId}>
                <Link to={`/lab/benchmarks/${item.benchmarkDefinitionId}`} className="hover:underline">
                  {item.title}
                </Link>{' '}
                · {item.role}
              </li>
            ))
          )}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-semibold text-zinc-900">Experiment workouts</h2>
        <ul className="mt-1 text-sm text-zinc-700">
          {experiment.sessions.length === 0 ? (
            <li>None</li>
          ) : (
            experiment.sessions.map((session) => (
              <li key={session.id}>
                <Link to={`/training/${session.id}`} className="hover:underline">
                  {session.sessionName || 'Experiment workout'}
                </Link>{' '}
                · {session.workoutDate}
              </li>
            ))
          )}
        </ul>
      </section>
      <div className="flex flex-wrap gap-2">
        {editable ? (
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => {
              setInstructions(version?.instructions ?? '')
              setRequirements(draftsFromVersion(version))
              setContextTags(version?.contextControls.map((item) => item.tagKey) ?? [])
              setEditingProtocol(true)
            }}
          >
            {experiment.status === 'scheduled' ? 'Edit before start' : 'Edit protocol'}
          </button>
        ) : null}
        {experiment.status === 'accepted' || experiment.status === 'scheduled' ? (
          <>
            <label className="text-sm text-zinc-700">
              Start
              <input className={fieldClass} type="date" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} />
            </label>
            <label className="text-sm text-zinc-700">
              End
              <input className={fieldClass} type="date" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} />
            </label>
            <button type="button" className={secondaryButtonClass} onClick={() => void run(() => scheduleExperiment(experiment.id, windowStart, windowEnd))}>
              Schedule
            </button>
          </>
        ) : null}
        {experiment.status === 'scheduled' ? (
          <>
            <button type="button" className={primaryButtonClass} onClick={() => void run(() => startExperiment(experiment.id))}>
              Start
            </button>
            <button type="button" className={quietButtonClass} onClick={() => void run(() => acceptExperiment(experiment.id))}>
              Return to accepted
            </button>
          </>
        ) : null}
        {active ? (
          <Link to={`/training/new?type=experiment&experimentId=${experiment.id}`} className={primaryButtonClass}>
            Log experiment workout
          </Link>
        ) : null}
        {experiment.status !== 'abandoned' && experiment.status !== 'superseded' && experiment.status !== 'completed' && experiment.status !== 'inconclusive' ? (
          <button type="button" className={dangerButtonClass} onClick={() => void run(() => abandonExperiment(experiment.id))}>
            Abandon
          </button>
        ) : null}
        {experiment.status === 'accepted' || experiment.status === 'scheduled' || experiment.status === 'proposed' ? (
          <button type="button" className={quietButtonClass} onClick={() => void run(() => supersedeExperiment(experiment.id))}>
            Supersede
          </button>
        ) : null}
        {experiment.status === 'accepted' && experiment.sessions.length === 0 ? (
          <button
            type="button"
            className={quietButtonClass}
            onClick={() => {
              void deleteExperiment(experiment.id)
                .then(() => navigate('/lab'))
                .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not delete the experiment'))
            }}
          >
            Delete
          </button>
        ) : null}
      </div>
      {editingProtocol && editable ? (
        <form
          className="space-y-4 rounded-lg border border-zinc-200 p-4"
          onSubmit={(event) => {
            event.preventDefault()
            void run(() =>
              addExperimentProtocolVersion(experiment.id, {
                instructions,
                requirements: requirementPayload(requirements, catalogs),
                contextTags,
              }),
            )
          }}
        >
          <h2 className="text-sm font-semibold text-zinc-900">New protocol version</h2>
          <ProtocolFields
            instructions={instructions}
            onInstructions={setInstructions}
            requirements={requirements}
            onRequirements={setRequirements}
            contextTags={contextTags}
            onContextTags={setContextTags}
            catalogs={catalogs}
          />
          <button type="submit" className={primaryButtonClass}>
            Save protocol version
          </button>
        </form>
      ) : null}
      {editable ? (
        <IdentityEditor
          experiment={experiment}
          onSave={(body) => run(() => updateExperiment(experiment.id, body))}
        />
      ) : null}
      {active ? <p className="text-sm text-zinc-600">The protocol and date window are frozen while this experiment is active.</p> : null}
    </div>
  )
}

function IdentityEditor({
  experiment,
  onSave,
}: {
  experiment: ExperimentDetail
  onSave: (body: { title: string; question: string; hypothesis: string | null; rationale: string | null }) => void
}) {
  const [title, setTitle] = useState(experiment.title)
  const [question, setQuestion] = useState(experiment.question)
  const [hypothesis, setHypothesis] = useState(experiment.hypothesis ?? '')
  const [rationale, setRationale] = useState(experiment.rationale ?? '')
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSave({ title, question, hypothesis: hypothesis.trim() || null, rationale: rationale.trim() || null })
      }}
    >
      <h2 className="text-sm font-semibold text-zinc-900">Question</h2>
      <input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} />
      <textarea className={`${fieldClass} min-h-16 py-2`} value={question} onChange={(event) => setQuestion(event.target.value)} />
      <textarea className={`${fieldClass} min-h-16 py-2`} value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} placeholder="Hypothesis" />
      <textarea className={`${fieldClass} min-h-16 py-2`} value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Rationale" />
      <button type="submit" className={secondaryButtonClass}>
        Save question
      </button>
    </form>
  )
}
