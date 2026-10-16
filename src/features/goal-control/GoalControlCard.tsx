import { Link } from 'react-router-dom'
import { relationshipDirectionContrast, type GoalControlState } from '@/domain/goal-control'
import { progressionSeriesForOpportunity } from '@/domain/training-progression'
import { quietButtonClass } from '@/lib'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'

/** Display a measured rank statistic, not a probability or p-value. */
function spearmanLabel(rho: number | null): string {
  if (rho == null || !Number.isFinite(rho) || Math.abs(rho) > 1) return 'unavailable'
  const rounded = Math.round(rho * 100) / 100
  return (rounded > 0 ? '+' : '') + rounded.toFixed(2)
}

/** Descriptive sign comparison, never a statistical hypothesis test. */
function relationshipContrastText(
  raw: number | null,
  change: { adjacentTransitions: number; rho: number | null } | null,
): string {
  const contrast = relationshipDirectionContrast(raw, change)
  if (contrast === 'opposite_signs') {
    return 'opposite signed directions: the recorded adjacent-day pattern runs against the overall association'
  }
  if (contrast === 'same_signs') {
    return 'matching signed directions in the overall and adjacent-day associations'
  }
  return 'unavailable because one coefficient, its direction, or sufficient consecutive-day evidence is missing'
}

export function GoalControlCard({
  state,
  pending,
  error,
}: {
  state: GoalControlState | null
  pending?: boolean
  error?: string | null
}) {
  const prefix = useAppPathPrefix()
  if (!state && !error) {
    return pending ? (
      <section className="rounded-lg border border-zinc-200 bg-white px-3 py-3" aria-label="Loading goal overview" aria-busy="true">
        <div className="h-3 w-24 animate-pulse rounded bg-zinc-200" />
        <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
      </section>
    ) : null
  }
  if (!state) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Goal overview</h2>
        <p className="mt-1 text-sm text-zinc-600">{error ?? 'Goal control is unavailable.'}</p>
      </section>
    )
  }

  const opportunity = state.primaryOpportunity
  const trainingTrend = opportunity?.kind === 'training_progression'
    ? progressionSeriesForOpportunity(state.trainingProgression, opportunity.id) : null
  return (
    <section className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Goal overview</h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
              Goal evidence · {state.confidence} confidence
            </span>
          </div>
          <p className="mt-1 font-semibold tracking-tight text-zinc-900">{state.headline}</p>
          <p className="mt-1 text-sm text-zinc-600">{state.summary}</p>
        </div>
        {opportunity ? (
          <Link to={prefixedPath(prefix, opportunity.detailPath)} className={quietButtonClass}>
            Open
          </Link>
        ) : (
          <Link to={prefixedPath(prefix, '/progress/weekly')} className={quietButtonClass}>
            Weekly detail
          </Link>
        )}
      </div>
      {state.maintenance?.estimate.state === 'available' && state.maintenance.estimate.observedMaintenanceKcal != null ? (
        <div className="mt-2 text-xs text-zinc-500">
          <p>
            Observed maintenance estimate ≈ {Math.round(state.maintenance.estimate.observedMaintenanceKcal).toLocaleString('en-US')} kcal/day
            {' '}· Maintenance estimate confidence: {state.maintenance.estimate.confidence}
            {state.maintenance.estimate.rangeLowKcal != null && state.maintenance.estimate.rangeHighKcal != null ? (
              <> · Estimated range {Math.round(state.maintenance.estimate.rangeLowKcal).toLocaleString('en-US')}–{Math.round(state.maintenance.estimate.rangeHighKcal).toLocaleString('en-US')} kcal/day</>
            ) : null}
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer">Maintenance estimate evidence</summary>
            <p className="mt-1">
              {state.maintenance.estimate.period?.days ?? 'Unknown'} calendar days examined
              {' '}· {state.maintenance.estimate.quality.nutrition.reliableDays} reliable nutrition days
              {' '}· {state.maintenance.estimate.quality.body.usedMeasurements} comparable weight measurements.
              {' '}These are evidence counts, not proof of complete intake.
            </p>
            <p className="mt-1">{state.maintenance.estimate.explanation}</p>
          </details>
        </div>
      ) : null}
      {opportunity?.kind === 'training_progression' ? (
        <div className="mt-2 text-xs text-zinc-500">
          <p>Exact-exercise Training trend confidence: {trainingTrend?.confidence ?? 'unknown'}</p>
          {trainingTrend ? (
            <details className="mt-1">
              <summary className="cursor-pointer">Training trend evidence</summary>
              <p className="mt-1">{trainingTrend.exerciseName} · {trainingTrend.exposureCount} comparable recorded exposures
                {' '}· latest {trainingTrend.latestDate ?? 'date unavailable'}.</p>
              <p className="mt-1">{trainingTrend.explanation}</p>
            </details>
          ) : (
            <p>Matching exercise evidence is unavailable; Goal evidence confidence does not validate this trend.</p>
          )}
        </div>
      ) : null}
      {state.relationships.length > 0 ? (
        <details className="mt-3 border-t border-zinc-100 pt-2 text-xs text-zinc-600">
          <summary className="cursor-pointer font-medium text-zinc-700">
            Observed relationships ({state.relationships.length}) · not causal
          </summary>
          <p className="mt-1">
            These are associations in recorded data, not evidence that changing one factor will change another.
            Other factors, missing records, and day-to-day variation may explain the patterns.
          </p>
          {state.relationships[0]?.evidence?.screening ? (
            <p className="mt-1">
              Selection context: {state.relationships[0].evidence.screening.evaluatedPairs} candidate relationship definitions examined;
              {' '}{state.relationships[0].evidence.screening.evidenceQualifiedPairs} met the configured observation and association display rules;
              {' '}{state.relationships[0].evidence.screening.goalRelevantPairs} also matched active goals;
              {' '}{state.relationships[0].evidence.screening.shownPairs} displayed (maximum three).
              Cards are ranked by matched-pair count grade and sample size, not by effect magnitude.
              Looking at multiple possible relationships and displaying a selected subset can exaggerate apparent patterns.
              This is not a multiple-comparisons adjustment, significance test, independent replication, or predictive validation.
            </p>
          ) : (
            <p className="mt-1">Relationship screening counts are unavailable; selected patterns are not independently verified.</p>
          )}
          <ol className="mt-2 space-y-3">
            {state.relationships.map((item) => (
              <li key={item.id} className="rounded-md border border-zinc-100 p-2">
                <p className="font-medium text-zinc-800">{item.summary}</p>
                <p className="mt-1">Matched-pair count grade: {item.confidence} · {item.sampleSize} {item.evidence?.coefficientVerified ? 'matched' : 'previously reported'} date pairs
                  {item.evidence ? ` · screening minimum ${item.evidence.requiredPairs} pairs` : ''}.
                  This grade describes sample availability, not statistical certainty.
                </p>
                {item.evidence ? (
                  <>
                    {!item.evidence.coefficientVerified ? (
                      <p className="mt-1 font-medium text-amber-800">
                        {!item.evidence.snapshotCurrent
                          ? 'The relationship source snapshot is from another Health date or has an invalid or inconsistent observation window.'
                          : 'This association could not be reproduced from its cited paired readings, or its reported strength/direction did not agree with the verified coefficient, or a cited nutrition day is not both confirmed complete and source-reliable.'}
                        {' '}Its reported coefficient, strength and precise date diagnostics are withheld
                        until the source evidence is refreshed; no change to a health target is justified.
                      </p>
                    ) : null}
                    {item.evidence.pairCoverage ? (
                      <p className="mt-1">
                        Pairing opportunity: {item.evidence.pairCoverage.matchedPairs} of
                        {' '}{item.evidence.pairCoverage.calendarSlots} calendar-alignable date slots
                        {' '}had eligible paired observations;
                        {' '}{item.evidence.pairCoverage.unmatchedSlots} slots did not yield a pair.
                        Unmatched dates are not automatically missed logs, zero values or confirmed incomplete days.
                        The paired subset may differ systematically from unpaired dates, so these
                        associations can reflect observation-selection bias.
                      </p>
                    ) : (
                      <p className="mt-1">
                        Pairing opportunity is unavailable because the source pair dates or
                        counts could not be verified; do not infer logging completeness from this relationship.
                      </p>
                    )}
                    <p className="mt-1">
                      Spearman rank correlation (ρ): {spearmanLabel(item.evidence.rho)}
                      {' '}· reported strength: {item.evidence.strength ?? 'unavailable'}.
                      The coefficient describes recorded rank co-movement; statistical significance,
                      adjustment for confounders, and a causal effect have not been established.
                    </p>
                    {item.evidence.dateClustering ? (
                      <p className="mt-1">
                        Matched-date clustering: {item.evidence.dateClustering.distinctDates} distinct tracked dates
                        {' '}across {item.evidence.dateClustering.contiguousRuns} consecutive-day
                        {' '}{item.evidence.dateClustering.contiguousRuns === 1 ? 'run' : 'runs'}
                        {' '}(longest run {item.evidence.dateClustering.longestRunDays} days).
                        Consecutive measurements may be serially related; these matched pairs are not
                        independent trials, and the count does not establish statistical significance.
                      </p>
                    ) : (
                      <p className="mt-1">Matched-date clustering is unavailable; independence cannot be inferred.</p>
                    )}
                    <p className="mt-1">
                      Day-to-day sensitivity: {item.evidence.changeSensitivity
                        ? `${item.evidence.changeSensitivity.adjacentTransitions} consecutive matched-day transitions`
                        : 'source comparison unavailable'}
                      {' '}· first-difference Spearman ρ: {spearmanLabel(item.evidence.changeSensitivity?.rho ?? null)}.
                      Comparing changes between consecutive matched days can reveal a pattern that differs from
                      the raw rank association; gaps are never treated as adjacent observations.
                      Fewer than six eligible transitions or no variation leaves the coefficient unavailable.
                      This is a descriptive sensitivity check, not a test of significance,
                      removal of time trends or autocorrelation, proof of independence, or a causal effect.
                    </p>
                    <p className="mt-1">
                      Single-pair influence: {item.evidence.singlePairSensitivity?.minRho != null &&
                        item.evidence.singlePairSensitivity.maxRho != null
                        ? `omitting each of ${item.evidence.singlePairSensitivity.testedRemovals} matched pairs in turn gives ρ between ${spearmanLabel(item.evidence.singlePairSensitivity.minRho)} and ${spearmanLabel(item.evidence.singlePairSensitivity.maxRho)}. ${item.evidence.singlePairSensitivity.directionSensitive
                          ? 'At least one single-pair deletion changes the descriptive direction or crosses the neutral boundary.'
                          : 'No single-pair deletion changes the descriptive direction category.'}`
                        : 'unavailable: there may be too few pairs, an undefined coefficient after deletion, or unverified source evidence.'}
                      {' '}This is an influence check, not a confidence interval, significance test, proof of independent observations, or causal evidence.
                    </p>
                    <p className="mt-1">
                      Direction comparison: {relationshipContrastText(
                        item.evidence.rho, item.evidence.changeSensitivity,
                      )}.
                      Signs can flip near zero or with noisy or missing records; agreement or disagreement
                      does not validate an effect or justify changing a health target.
                    </p>
                    <p className="mt-1">Source observation window: {item.evidence.sourceWindow.start} to {item.evidence.sourceWindow.end}.
                      {' '}Matched dates: {item.evidence.pairedWindow
                        ? `${item.evidence.pairedWindow.start} to ${item.evidence.pairedWindow.end}`
                        : 'unavailable'}.
                      {' '}Timing: {item.evidence.lagDays === 0 ? 'same tracked day' : `${item.evidence.lagDays}-day lag`}.
                    </p>
                    {item.evidence.sources.length ? (
                      <ul className="mt-1 space-y-1">
                        {item.evidence.sources.map((source) => (
                          <li key={source.key}>
                            {source.label}: {source.observedDays}/{source.eligibleDays} observed dates
                            {' '}· {source.excludedObservations} excluded observations
                            {' '}· source coverage confidence {source.confidence}
                            {' '}· provenance {Object.entries(source.provenance).filter(([, count]) => count > 0)
                              .map(([kind, count]) => `${kind} ${count}`).join(', ') || 'unavailable'}.
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-1">Source observation counts are unavailable; do not infer complete or zero tracking.</p>}
                  </>
                ) : <p className="mt-1">Matched-date window and source provenance are unavailable.</p>}
                <div className="mt-1 flex flex-wrap gap-2">
                  {item.detailPaths.map((path, index) => (
                    <Link key={path} to={prefixedPath(prefix, path)} className="underline underline-offset-2">
                      Review source {index + 1}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {state.trainingAdherence.configured ? (
        <p className="mt-2 text-xs text-zinc-500">
          <span className="font-medium">
            {state.trainingAdherence.todayIntent === 'rest' ? 'Rest-aware Training:' : 'Training:'}
          </span>{' '}
          {state.trainingAdherence.qualifiedTrainingDays == null
            ? 'Qualified-day count unavailable; programmed sessions are not target credit.'
            : `${state.trainingAdherence.qualifiedTrainingDays}/${state.trainingAdherence.weeklyFrequencyTarget} qualified strength days · ${state.trainingAdherence.remainingQualifiedDays} to target.`}
          <span className="block">{state.trainingAdherence.detail}</span>
        </p>
      ) : null}
      {state.limitations.length > 0 ? (
        <details className="mt-2 text-xs text-zinc-500">
          <summary className="cursor-pointer">Why?</summary>
          <ul className="mt-1 space-y-1">
            {state.limitations.slice(0, 3).map((item) => <li key={item.code}>{item.text}</li>)}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
