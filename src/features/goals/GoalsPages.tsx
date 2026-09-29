import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { coverageLabel } from '@/domain/goal-status'
import { formatGoalQuantity, formatGoalTarget, goalKindDefinition, GOAL_KINDS, type GoalKind } from '@/domain/goals'
import type { GoalProjection } from '@/domain/goal-projection'
import { healthCalendarDateFromNow } from '@/domain/time'
import { milesToMeters, metersToMiles } from '@/domain/units'
import { dangerButtonClass, LoadErrorNotice, primaryButtonClass, quietButtonClass, secondaryButtonClass } from '@/lib'
import { changeGoalStatus, createGoal, fetchGoal, fetchGoals, removeGoal, reviseGoal, type GoalCatalog, type GoalView } from './api'

const fieldClass = 'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm'

const KIND_LABELS: Record<GoalKind, string> = {
  body_metric: 'Body metric',
  strength_e1rm: 'Strength e1RM',
  benchmark_result: 'Benchmark result',
  training_frequency: 'Training frequency',
  activity_steps: 'Daily steps',
  nutrition_protein: 'Protein',
  sleep_duration: 'Sleep duration',
  supplement_adherence: 'Supplement adherence',
  training_reps: 'Exercise reps',
  training_duration: 'Exercise duration',
  training_distance: 'Distance',
  training_pace: 'Pace',
  training_skill: 'Skill / milestone',
}

function projectionDateLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) {
    return iso
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
}

function formatWeeklyTrend(perWeek: number, unit: string): string {
  const rounded = Math.round(perWeek * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  const signed = rounded > 0 ? `+${text}` : text
  return `${signed} ${unit}/week`
}

function ProjectionPanel({ projection }: { projection: GoalProjection }) {
  if (projection.state === 'not_applicable_lifecycle') {
    return null
  }
  let body = 'Not applicable for this goal type.'
  if (projection.state === 'insufficient_data') {
    body = 'Not enough history yet'
  } else if (projection.state === 'trend_not_toward_target') {
    body = 'Recent trend is not moving toward this target'
  } else if (projection.state === 'unstable_trend') {
    body = 'Trend is too inconsistent for a reliable projection'
  } else if (projection.state === 'beyond_projection_horizon') {
    body = 'Projected crossing is too far beyond the observed evidence window'
  } else if (projection.state === 'target_currently_satisfied') {
    body = 'Current value meets this target.'
  }
  const evidenceNoun = projection.goalKind === 'strength_e1rm' ? 'appearances' : 'measurements'
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Projection</h2>
      {projection.state === 'available' && projection.estimatedWindowStart && projection.estimatedWindowEnd ? (
        <div className="mt-2 space-y-1 text-sm">
          <p>Estimated target window</p>
          <p>
            {projection.estimatedWindowStart === projection.estimatedWindowEnd
              ? projectionDateLabel(projection.estimatedWindowStart)
              : `${projectionDateLabel(projection.estimatedWindowStart)} – ${projectionDateLabel(projection.estimatedWindowEnd)}`}
          </p>
          {projection.estimatedCrossingDate ? <p className="text-zinc-600">Central estimate: {projectionDateLabel(projection.estimatedCrossingDate)}</p> : null}
          {projection.trendPerWeek != null ? <p>Observed trend {formatWeeklyTrend(projection.trendPerWeek, projection.unit)}</p> : null}
          {projection.sampleCount != null && projection.spanDays != null ? (
            <p className="text-zinc-600">
              Evidence {projection.sampleCount} {evidenceNoun} over {projection.spanDays} days
            </p>
          ) : null}
          <p className="text-zinc-500">Projection assumes the recent observed trend continues.</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-zinc-600">{body}</p>
      )}
    </section>
  )
}

function GoalStatusSection({ goal }: { goal: GoalView }) {
  const status = goal.goalStatus
  if (!status) {
    return null
  }
  if (goal.status !== 'active') {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Status</h2>
        <p className="mt-2 text-sm">{status.targetLabel}</p>
      </section>
    )
  }
  const projection = goal.projection
  const window =
    projection?.state === 'available' && projection.estimatedWindowStart && projection.estimatedWindowEnd
      ? projection.estimatedWindowStart === projection.estimatedWindowEnd
        ? projectionDateLabel(projection.estimatedWindowStart)
        : `${projectionDateLabel(projection.estimatedWindowStart)} – ${projectionDateLabel(projection.estimatedWindowEnd)}`
      : null
  const coverage = coverageLabel(goal.goalKind as GoalKind, goal.evidence, goal.currentVersion.targetMin)
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Status</h2>
      <dl className="mt-2 space-y-2 text-sm">
        <div>
          <dt className="text-zinc-500">Current</dt>
          <dd>{evidenceText(goal)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Target</dt>
          <dd>
            {formatGoalTarget(goal.currentVersion)}
            {goal.currentVersion.targetDate ? ` by ${goal.currentVersion.targetDate}` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Target state</dt>
          <dd>{status.targetLabel}</dd>
        </div>
        {status.deadlineLabel ? (
          <div>
            <dt className="text-zinc-500">Deadline</dt>
            <dd>{status.deadlineLabel}</dd>
          </div>
        ) : null}
        {window ? (
          <div>
            <dt className="text-zinc-500">Projection</dt>
            <dd>Estimated {window}</dd>
          </div>
        ) : null}
        {coverage ? (
          <div>
            <dt className="text-zinc-500">Coverage</dt>
            <dd>{coverage}</dd>
          </div>
        ) : null}
        {goal.selector.trainingMinDistanceM != null ? (
          <div>
            <dt className="text-zinc-500">Minimum continuous distance</dt>
            <dd>{metersToMiles(goal.selector.trainingMinDistanceM).toLocaleString('en-US', { maximumFractionDigits: 2 })} mi</dd>
          </div>
        ) : null}
        {goal.evidence.trainingSource ? (
          <div>
            <dt className="text-zinc-500">Evidence</dt>
            <dd><Link to={`/training/${goal.evidence.trainingSource.sessionId}`} className="underline">Open source workout</Link></dd>
          </div>
        ) : null}
      </dl>
      {status.targetState === 'satisfied' ? (
        <p className="mt-3 text-sm text-zinc-600">This goal stays active until you mark it complete.</p>
      ) : null}
    </section>
  )
}

function evidenceText(goal: GoalView): string {
  if (goal.evidence.label) {
    return goal.evidence.label
  }
  if (goal.evidence.current == null) {
    return 'No observation yet'
  }
  return formatGoalQuantity(goal.evidence.current, goal.evidence.unit)
}

function relationText(goal: GoalView): string | null {
  if (goal.evidence.relation === 'above_range') {
    return 'Current above range'
  }
  if (goal.evidence.relation === 'below_range') {
    return 'Current below range'
  }
  if (goal.evidence.relation === 'inside_range') {
    return 'Current inside range'
  }
  if (goal.evidence.difference == null || goal.evidence.current == null) {
    return null
  }
  return `Difference ${formatGoalQuantity(Math.abs(goal.evidence.difference), goal.evidence.unit)}`
}

function GoalCard({ goal }: { goal: GoalView }) {
  return (
    <Link to={`/goals/${goal.id}`} className="block rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{goal.displayName}</h2>
        <span className="text-sm text-zinc-500">v{goal.currentVersion.version}</span>
      </div>
      <p className="mt-1 text-sm text-zinc-800">{formatGoalTarget(goal.currentVersion)}</p>
      {goal.currentVersion.targetDate ? <p className="text-sm text-zinc-600">Target date {goal.currentVersion.targetDate}</p> : null}
      {goal.goalStatus ? <p className="mt-2 text-sm text-zinc-800">{goal.goalStatus.targetLabel}</p> : null}
      {goal.status === 'active' && goal.goalStatus?.deadlineLabel ? <p className="text-sm text-zinc-600">{goal.goalStatus.deadlineLabel}</p> : null}
      <p className="mt-2 text-sm text-zinc-600">Current {evidenceText(goal)}</p>
      {goal.evidence.provisional ? (
        <p className="text-sm text-zinc-500">Today so far {formatGoalQuantity(goal.evidence.provisional.value, goal.evidence.provisional.unit)}</p>
      ) : null}
    </Link>
  )
}

export function GoalsPage() {
  const [goals, setGoals] = useState<GoalView[]>([])
  const [catalog, setCatalog] = useState<GoalCatalog | null>(null)
  const [asOf, setAsOf] = useState(healthCalendarDateFromNow())
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  function reload() {
    setStatus('loading')
    fetchGoals()
      .then((payload) => {
        setGoals(payload.goals)
        setCatalog(payload.catalog)
        setAsOf(payload.asOf)
        setStatus('ready')
        setError(null)
      })
      .catch((caught: unknown) => {
        setStatus('error')
        setError(caught instanceof Error ? caught.message : 'Could not load goals')
      })
  }

  useEffect(() => {
    reload()
  }, [])

  const groups = [
    ['Active', goals.filter((goal) => goal.status === 'active')],
    ['Paused', goals.filter((goal) => goal.status === 'paused')],
    ['Completed', goals.filter((goal) => goal.status === 'completed')],
  ] as const

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Goals</h1>
        <p className="mt-1 text-sm text-zinc-600">The target you chose, and how current evidence sits against it.</p>
      </div>
      {status === 'error' && error ? <LoadErrorNotice message={error} onRetry={reload} /> : null}
      {groups.map(([label, items]) => (
        <section key={label} className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-700">{label}</h2>
          {items.length === 0 ? <p className="text-sm text-zinc-500">None</p> : items.map((goal) => <GoalCard key={goal.id} goal={goal} />)}
        </section>
      ))}
      {catalog ? <CreateGoalForm catalog={catalog} asOf={asOf} onCreated={reload} /> : null}
    </section>
  )
}

function compatibleExercise(kind: GoalKind, exercise: GoalCatalog['exercises'][number]): boolean {
  if (kind === 'strength_e1rm') {
    return exercise.performance_type === 'loaded_reps' && exercise.analytics_load_type === 'external'
  }
  if (kind === 'training_reps') {
    return (exercise.measurement_kind === 'reps' || exercise.measurement_kind === 'reps_per_side') &&
      !(exercise.performance_type === 'loaded_reps' && exercise.analytics_load_type === 'external')
  }
  if (kind === 'training_duration') {
    return ['duration', 'duration_per_side', 'distance_duration'].includes(exercise.measurement_kind)
  }
  if (kind === 'training_distance') {
    return ['distance', 'distance_duration'].includes(exercise.measurement_kind)
  }
  if (kind === 'training_pace') {
    return exercise.measurement_kind === 'distance_duration'
  }
  if (kind === 'training_skill') {
    return exercise.measurement_kind === 'completion'
  }
  return true
}

function trainingGoalKind(kind: GoalKind): boolean {
  return kind === 'strength_e1rm' ||
    kind === 'training_reps' ||
    kind === 'training_duration' ||
    kind === 'training_distance' ||
    kind === 'training_pace' ||
    kind === 'training_skill'
}

function CreateGoalForm({ catalog, asOf, onCreated }: { catalog: GoalCatalog; asOf: string; onCreated: () => void }) {
  const [kind, setKind] = useState<GoalKind>('body_metric')
  const definition = goalKindDefinition(kind)
  const [bodyMetricKey, setBodyMetricKey] = useState(catalog.bodyMetrics[0]?.key ?? 'weight')
  const [exerciseId, setExerciseId] = useState(catalog.exercises[0]?.id ?? '')
  const [supplementId, setSupplementId] = useState(catalog.supplements[0]?.id ?? '')
  const [benchmarkKey, setBenchmarkKey] = useState('')
  const [startedOn, setStartedOn] = useState(asOf)
  const [targetMode, setTargetMode] = useState(definition?.modes[0] ?? 'at_least')
  const [targetMin, setTargetMin] = useState('')
  const [targetMax, setTargetMax] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [windowDays, setWindowDays] = useState(String(definition?.defaultWindow ?? ''))
  const [notes, setNotes] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [durationSeconds, setDurationSeconds] = useState('')
  const [paceDistanceMi, setPaceDistanceMi] = useState('')
  const [paceMinutes, setPaceMinutes] = useState('')
  const [paceSeconds, setPaceSeconds] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const compatible = catalog.exercises.filter((exercise) => compatibleExercise(kind, exercise))

  function onKind(next: GoalKind) {
    const nextDefinition = goalKindDefinition(next)
    setKind(next)
    setTargetMode(nextDefinition?.modes[0] ?? 'at_least')
    setWindowDays(nextDefinition?.defaultWindow == null ? '' : String(nextDefinition.defaultWindow))
    const first = catalog.exercises.find((exercise) => compatibleExercise(next, exercise))
    if (first) setExerciseId(first.id)
    if (next === 'training_skill') {
      setTargetMin('1')
      setTargetMax('')
    } else {
      setTargetMin('')
      setTargetMax('')
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setWarning(null)
    const benchmark = catalog.benchmarkOutcomes.find(
      (item) => `${item.definition_id}|${item.version_id}|${item.requirement_id}` === benchmarkKey,
    )
    const selectedExercise = trainingGoalKind(kind) ? exerciseId : null
    const durationTarget = Number(durationMinutes || 0) * 60 + Number(durationSeconds || 0)
    const paceTarget = Number(paceMinutes || 0) * 60 + Number(paceSeconds || 0)
    const minValue =
      kind === 'training_skill'
        ? 1
        : kind === 'training_duration'
          ? durationTarget
          : targetMode === 'at_most'
            ? null
            : Number(targetMin)
    const maxValue =
      kind === 'training_pace'
        ? paceTarget
        : targetMode === 'at_least'
          ? null
          : Number(targetMax)
    const body = {
      goalKind: kind,
      startedOn,
      bodyMetricKey: kind === 'body_metric' ? bodyMetricKey : null,
      exerciseDefinitionId: selectedExercise,
      supplementId: kind === 'supplement_adherence' ? supplementId : null,
      benchmarkDefinitionId: benchmark?.definition_id ?? null,
      benchmarkProtocolVersionId: benchmark?.version_id ?? null,
      benchmarkRequirementId: benchmark?.requirement_id ?? null,
      trainingMinDistanceM: kind === 'training_pace' ? milesToMeters(Number(paceDistanceMi)) : null,
      targetMode: kind === 'training_skill' ? 'at_least' : targetMode,
      targetMin: minValue,
      targetMax: maxValue,
      targetDate: targetDate || null,
      evaluationWindowDays: definition?.pointMetric ? null : Number(windowDays),
      notes: notes || null,
    }
    try {
      const created = await createGoal(body)
      setWarning(created.overlapWarning)
      setNotes('')
      onCreated()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the goal')
    } finally {
      setBusy(false)
    }
  }

  const ordinaryTarget = kind !== 'training_duration' && kind !== 'training_pace' && kind !== 'training_skill'
  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-semibold">New goal</h2>
      <label className="block text-sm">
        Kind
        <select className={fieldClass} value={kind} onChange={(event) => onKind(event.target.value as GoalKind)}>
          {GOAL_KINDS.map((item) => <option key={item} value={item}>{KIND_LABELS[item]}</option>)}
        </select>
      </label>
      {kind === 'body_metric' ? (
        <label className="block text-sm">Metric
          <select className={fieldClass} value={bodyMetricKey} onChange={(event) => setBodyMetricKey(event.target.value)}>
            {catalog.bodyMetrics.map((item) => <option key={item.key} value={item.key}>{item.label} ({item.unit})</option>)}
          </select>
        </label>
      ) : null}
      {trainingGoalKind(kind) ? (
        <label className="block text-sm">Exercise
          <select className={fieldClass} value={exerciseId} onChange={(event) => setExerciseId(event.target.value)} required>
            {compatible.length === 0 ? <option value="">No compatible exercises</option> : compatible.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      ) : null}
      {kind === 'benchmark_result' ? (
        <label className="block text-sm">Outcome
          <select className={fieldClass} value={benchmarkKey} onChange={(event) => setBenchmarkKey(event.target.value)}>
            <option value="">Choose an outcome</option>
            {catalog.benchmarkOutcomes.map((item) => {
              const value = `${item.definition_id}|${item.version_id}|${item.requirement_id}`
              return <option key={value} value={value}>{item.title} v{item.version} · {item.label}</option>
            })}
          </select>
        </label>
      ) : null}
      {kind === 'supplement_adherence' ? (
        <label className="block text-sm">Supplement
          <select className={fieldClass} value={supplementId} onChange={(event) => setSupplementId(event.target.value)}>
            {catalog.supplements.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      ) : null}
      <label className="block text-sm">Started
        <input className={fieldClass} type="date" value={startedOn} onChange={(event) => setStartedOn(event.target.value)} required />
      </label>

      {kind === 'training_duration' ? (
        <fieldset className="space-y-1">
          <legend className="text-sm">Target duration</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">Minutes<input className={fieldClass} type="number" min="0" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} /></label>
            <label className="text-sm">Seconds<input className={fieldClass} type="number" min="0" max="59" value={durationSeconds} onChange={e => setDurationSeconds(e.target.value)} /></label>
          </div>
        </fieldset>
      ) : null}

      {kind === 'training_pace' ? (
        <div className="space-y-3">
          <label className="block text-sm">Minimum continuous distance (mi)
            <input className={fieldClass} type="number" min="0.01" step="0.01" value={paceDistanceMi} onChange={e => setPaceDistanceMi(e.target.value)} required />
          </label>
          <fieldset>
            <legend className="text-sm">Target pace per mile</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">Minutes<input className={fieldClass} type="number" min="0" value={paceMinutes} onChange={e => setPaceMinutes(e.target.value)} required /></label>
              <label className="text-sm">Seconds<input className={fieldClass} type="number" min="0" max="59" value={paceSeconds} onChange={e => setPaceSeconds(e.target.value)} required /></label>
            </div>
          </fieldset>
        </div>
      ) : null}

      {kind === 'training_skill' ? <p className="text-sm text-zinc-600">Target: achieve this skill at least once in canonical Training.</p> : null}

      {ordinaryTarget ? (
        <>
          <label className="block text-sm">Target
            <select className={fieldClass} value={targetMode} onChange={(event) => setTargetMode(event.target.value as 'at_least' | 'at_most' | 'range')}>
              {definition?.modes.map((mode) => <option key={mode} value={mode}>{mode === 'at_least' ? 'At least' : mode === 'at_most' ? 'At most' : 'Range'}</option>)}
            </select>
          </label>
          {targetMode !== 'at_most' ? (
            <label className="block text-sm">{kind === 'training_distance' ? 'Minimum miles' : kind === 'training_reps' ? 'Minimum reps' : 'Minimum'}
              <input className={fieldClass} type="number" min="0" step={kind === 'training_reps' ? '1' : 'any'} inputMode="decimal" value={targetMin} onChange={(event) => setTargetMin(event.target.value)} required />
            </label>
          ) : null}
          {targetMode !== 'at_least' ? (
            <label className="block text-sm">Maximum
              <input className={fieldClass} type="number" min="0" inputMode="decimal" value={targetMax} onChange={(event) => setTargetMax(event.target.value)} required />
            </label>
          ) : null}
        </>
      ) : null}

      {definition && !definition.pointMetric ? (
        <label className="block text-sm">Window (days)
          <select className={fieldClass} value={windowDays} onChange={(event) => setWindowDays(event.target.value)}>
            {definition.windows?.map((days) => <option key={days} value={days}>{days}</option>)}
          </select>
        </label>
      ) : null}
      <label className="block text-sm">Target date (optional)
        <input className={fieldClass} type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
      </label>
      <label className="block text-sm">Notes
        <textarea className={fieldClass} value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {warning ? <p className="text-sm text-zinc-700">{warning}</p> : null}
      <button type="submit" className={primaryButtonClass} disabled={busy || (trainingGoalKind(kind) && !exerciseId)}>
        {busy ? 'Saving…' : 'Save goal'}
      </button>
    </form>
  )
}

export function GoalDetailPage() {
  const { goalId = '' } = useParams()
  const navigate = useNavigate()
  const [goal, setGoal] = useState<GoalView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [targetMode, setTargetMode] = useState<'at_least' | 'at_most' | 'range'>('at_least')
  const [targetMin, setTargetMin] = useState('')
  const [targetMax, setTargetMax] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [windowDays, setWindowDays] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  function apply(next: GoalView) {
    setGoal(next)
    setTargetMode(next.currentVersion.targetMode)
    setTargetMin(next.currentVersion.targetMin == null ? '' : String(next.currentVersion.targetMin))
    setTargetMax(next.currentVersion.targetMax == null ? '' : String(next.currentVersion.targetMax))
    setTargetDate(next.currentVersion.targetDate ?? '')
    setWindowDays(next.currentVersion.evaluationWindowDays == null ? '' : String(next.currentVersion.evaluationWindowDays))
    setNotes(next.currentVersion.notes ?? '')
  }

  useEffect(() => {
    let active = true
    fetchGoal(goalId)
      .then((next) => {
        if (active) {
          apply(next)
          setError(null)
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Could not load this goal')
        }
      })
    return () => {
      active = false
    }
  }, [goalId])

  if (!goal) {
    return error ? <LoadErrorNotice message={error} onRetry={() => navigate(0)} /> : <p className="text-sm text-zinc-600">Loading goal…</p>
  }

  const definition = goalKindDefinition(goal.goalKind)
  const relation = relationText(goal)

  async function onRevise(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const next = await reviseGoal(goalId, {
        sourceVersionId: goal?.currentVersion.id,
        targetMode,
        targetMin: targetMode === 'at_most' ? null : Number(targetMin),
        targetMax: targetMode === 'at_least' ? null : Number(targetMax),
        targetDate: targetDate || null,
        evaluationWindowDays: windowDays === '' ? null : Number(windowDays),
        notes: notes || null,
      })
      apply(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revise this goal')
    } finally {
      setBusy(false)
    }
  }

  async function onLifecycle(action: 'pause' | 'resume' | 'complete' | 'reopen') {
    setBusy(true)
    setError(null)
    try {
      apply(await changeGoalStatus(goalId, action))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this goal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-6">
      <Link to="/goals" className="text-sm underline">
        All goals
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{goal.displayName}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {goal.status} · started {goal.startedOn}
        </p>
        {goal.selectorContext.message ? <p className="mt-1 text-sm text-zinc-600">{goal.selectorContext.message}</p> : null}
      </div>
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Current target · v{goal.currentVersion.version}</h2>
        <p className="mt-1 text-sm">{formatGoalTarget(goal.currentVersion)}</p>
        {goal.currentVersion.targetDate ? <p className="text-sm text-zinc-600">Target date {goal.currentVersion.targetDate}</p> : <p className="text-sm text-zinc-600">No target date</p>}
        {goal.currentVersion.evaluationWindowDays ? <p className="text-sm text-zinc-600">{goal.currentVersion.evaluationWindowDays}-day window</p> : null}
        {goal.currentVersion.notes ? <p className="mt-2 text-sm text-zinc-700">{goal.currentVersion.notes}</p> : null}
        <p className="mt-3 text-sm">Current {evidenceText(goal)}</p>
        {goal.evidence.strengthSource ? (
          <p className="mt-1 text-sm text-zinc-600">
            e1RM is derived from {formatGoalQuantity(goal.evidence.strengthSource.loadLb, 'lb')} × {goal.evidence.strengthSource.reps} reps
            {' '}using the Epley formula; it is not a literal set at the displayed e1RM.
          </p>
        ) : null}
        {relation ? <p className="text-sm text-zinc-600">{relation}</p> : null}
        {goal.evidence.provisional ? (
          <p className="text-sm text-zinc-500">Today so far {formatGoalQuantity(goal.evidence.provisional.value, goal.evidence.provisional.unit)}. This is not the closed window.</p>
        ) : null}
      </section>
      <GoalStatusSection goal={goal} />
      {goal.projection ? <ProjectionPanel projection={goal.projection} /> : null}
      <div className="flex flex-wrap gap-2">
        {goal.status === 'active' ? (
          <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void onLifecycle('pause')}>
            Pause
          </button>
        ) : null}
        {goal.status === 'paused' ? (
          <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void onLifecycle('resume')}>
            Resume
          </button>
        ) : null}
        {goal.status !== 'completed' ? (
          <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void onLifecycle('complete')}>
            Mark complete
          </button>
        ) : (
          <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void onLifecycle('reopen')}>
            Reopen
          </button>
        )}
      </div>
      <form onSubmit={(event) => void onRevise(event)} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold">Revise target</h2>
        <p className="text-sm text-zinc-600">
          Save revised goal. This creates Goal v{goal.currentVersion.version + 1}. v{goal.currentVersion.version} remains in history. The metric stays the same.
        </p>
        <label className="block text-sm">
          Target
          <select className={fieldClass} value={targetMode} onChange={(event) => setTargetMode(event.target.value as 'at_least' | 'at_most' | 'range')}>
            {definition?.modes.map((mode) => (
              <option key={mode} value={mode}>
                {mode === 'at_least' ? 'At least' : mode === 'at_most' ? 'At most' : 'Range'}
              </option>
            ))}
          </select>
        </label>
        {targetMode !== 'at_most' ? (
          <label className="block text-sm">
            Minimum
            <input className={fieldClass} inputMode="decimal" value={targetMin} onChange={(event) => setTargetMin(event.target.value)} />
          </label>
        ) : null}
        {targetMode !== 'at_least' ? (
          <label className="block text-sm">
            Maximum
            <input className={fieldClass} inputMode="decimal" value={targetMax} onChange={(event) => setTargetMax(event.target.value)} />
          </label>
        ) : null}
        {definition && !definition.pointMetric ? (
          <label className="block text-sm">
            Window (days)
            <select className={fieldClass} value={windowDays} onChange={(event) => setWindowDays(event.target.value)}>
              {definition.windows?.map((days) => (
                <option key={days} value={days}>
                  {days}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block text-sm">
          Target date
          <input className={fieldClass} type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
        </label>
        <label className="block text-sm">
          Notes
          <textarea className={fieldClass} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button type="submit" className={primaryButtonClass} disabled={busy}>
          Save revised goal
        </button>
      </form>
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Remove goal</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Unreferenced mistaken goals are removed. Goals used by Experiment history are retired from default views so their historical references stay valid.
        </p>
        <button
          type="button"
          className={`${dangerButtonClass} mt-3`}
          disabled={busy}
          onClick={() => {
            if (!window.confirm('Remove this goal? A goal used by Experiment history will be retired instead of removed.')) return
            setBusy(true)
            setError(null)
            void removeGoal(goalId)
              .then(() => navigate('/goals'))
              .catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : 'Could not remove this goal')
                setBusy(false)
              })
          }}
        >
          Remove goal
        </button>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Target history</h2>
        {goal.versions.map((version) => (
          <article key={version.id} className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
            <p className="font-medium">
              v{version.version} · {version.isCurrent ? 'current' : 'historical'}
            </p>
            <p>{formatGoalTarget(version)}</p>
            {version.targetDate ? <p className="text-zinc-600">Target date {version.targetDate}</p> : null}
            {version.notes ? <p className="text-zinc-700">{version.notes}</p> : null}
          </article>
        ))}
      </section>
      <button type="button" className={quietButtonClass} onClick={() => navigate('/goals')}>
        Back
      </button>
    </section>
  )
}
