import { lifecycleStatusOnDate, resolveScheduleRange } from '../supplements/resolve.js'
import { requiresHistoricalGoalBoundary } from './historical-goal-scope.js'
import { formatWeekdayMask } from '../supplements/weekday.js'
import type { OccurrenceState } from '../supplements/types.js'
import { ASK_HEALTH_PACKET_VERSION, ASK_PACKET_MAX_CHARS, type AskLens } from './config.js'
import { MIN_VERIFIED_NUTRITION_TARGET_DAYS } from './nutrition-integrity.js'
import { digestiveQuestionTopics } from './focused-digestive.js'
import { guardInconsistentActivityIntelligence } from './activity-source-reconciliation.js'
import { guardInconsistentSleepIntelligence } from './sleep-source-reconciliation.js'
import { guardInconsistentTrainingIntelligence } from './training-source-reconciliation.js'
import type { FocusedWeightEnergyEvidence } from './focused-weight-energy.js'
import type { HistoricalWeightEnergyDay } from './focused-weight-energy-history.js'
import type { HistoricalWeightEnergyWindow } from './focused-weight-energy-window.js'
import { deriveDigestiveSampleScreen } from './digestive-screen.js'
import { digestivePacketGuard, guardedDigestiveIntelligence, type DigestivePacketGuard } from './digestive-packet-guard.js'
import type {
  AskClinicalProfileInput,
  AskStableProfileInput,
  AskContextInput,
  AskEvidence,
  AskGoalInput,
  AskHealthAnswer,
  AskHealthPacket,
  AskHealthPacketInput,
  AskLimitation,
  AskPatternInput,
} from './types.js'

type PushItem = Omit<AskEvidence, 'period'> & { period?: AskEvidence['period']; priority: number }
type Draft = AskEvidence & { priority: number }

const BODY_TERMS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /\bbody[\s-]?fat\b|\bbodyfat\b|\bfat\s*%|\bbf\s*%/i, key: 'body_fat_percentage' },
  { pattern: /\bwaist\b/i, key: 'waist' },
  { pattern: /\bweight\b|\bweigh\b/i, key: 'weight' },
]

export function buildAskHealthEvidencePacket(input: AskHealthPacketInput): AskHealthPacket {
  const period = { start: input.period.start, end: input.period.end }
  const drafts: Draft[] = []
  const limitations: AskLimitation[] = []
  const push = (item: Omit<AskEvidence, 'period'> & { period?: AskEvidence['period']; priority: number }) => {
    drafts.push({
      ...item,
      period: item.period === undefined ? period : item.period,
    })
  }

  push({
    id: 'ask.range',
    domain: 'ask',
    label: 'Selected range',
    value: input.range,
    unit: null,
    text: `This evidence packet covers ${input.range} from ${period.start} through ${period.end}. It does not include a wider range.`,
    coverage: null,
    detailPath: '/progress',
    userEntered: false,
    substantive: false,
    priority: 0,
  })

  const historicalSourceConflict=input.historicalWeightEnergySourceRecheck==='changed_or_unavailable' &&
    input.contextMode!=='general_only' &&
    (input.focusedWeightEnergyDay?.scope==='in_range'||
      input.focusedWeightEnergyWindow?.scope==='in_range')
  const lens = input.lens
  const wants = lensWants(lens)
  const trainingSourceConflict=input.trainingSnapshotConsistency==='changed_or_unavailable' ||
    input.workingSetSourceRecheck==='changed_or_unavailable' ||
    input.exerciseDefinitionSourceRecheck==='changed_or_unavailable'
  // A failed final current-focused read outranks earlier generic snapshots.
  const focusedSourceConflict=input.focusedWeightEnergy!=null &&
    input.contextMode!=='general_only' && input.asOf===input.healthToday &&
    (input.focusedWeightEnergy.nutritionSourceRecheck==='changed_or_unavailable' ||
      input.focusedWeightEnergy.weightActivitySourceRecheck==='changed_or_unavailable' ||
      input.activitySnapshotConsistency==='changed_or_unavailable' ||
      trainingSourceConflict)
  const digestiveGuard = digestivePacketGuard(input)
  const intelligence = guardInconsistentTrainingIntelligence(
    guardInconsistentSleepIntelligence(
      guardInconsistentActivityIntelligence(
        guardedDigestiveIntelligence(input.intelligence,digestiveGuard),
        input.activitySnapshotConsistency,
      ),
      input.sleepSnapshotConsistency,
    ),
    trainingSourceConflict?'changed_or_unavailable':input.trainingSnapshotConsistency,
  )
  if (wants.body) {
    addBody(input, push, limitations, wants.bodyDetail)
  }
  if (wants.nutrition && !digestiveGuard.crossSourceConflict) {
    addNutrition(input, push, limitations)
  }
  if (wants.activity) {
    if(input.activitySnapshotConsistency==='changed_or_unavailable'){
      push({
        id:'activity.source_consistency',domain:'activity',
        label:'Activity source disagreement',
        value:null,unit:null,period,
        text:'The independently loaded Activity progress and shared Health Intelligence records disagree on saved activity measurements, source identity, or date scope. Steps, energy, exercise minutes and resting-heart-rate claims from these paths are WITHHELD. A missing or corrected log is UNKNOWN, not zero. This does not establish how much activity occurred.',
        coverage:{activitySourceAgreement:'changed_or_unavailable',activityEvidence:'withheld'},
        detailPath:'/progress/activity',userEntered:false,
        substantive:false,priority:0,
      })
    }else addActivity(input,push)
  }
  if (wants.sleep) {
    if(input.sleepSnapshotConsistency==='changed_or_unavailable'){
      push({
        id:'sleep.source_consistency',domain:'sleep',
        label:'Sleep source disagreement',value:null,unit:null,period,
        text:'The independently loaded Sleep progress and Health Intelligence views disagree about eligible sleep observations or their recorded duration. Sleep averages, stage interpretations, baseline and Sleep-linked relationships are WITHHELD. Missing or partial sleep records are UNKNOWN, not zero sleep; no sleep disorder or recovery conclusion is authorized.',
        coverage:{sleepSourceAgreement:'changed_or_unavailable',sleepClaims:'withheld'},
        detailPath:'/progress/sleep',userEntered:false,substantive:false,priority:0,
      })
    }else addSleep(input,push,limitations)
  }
  if (trainingSourceConflict && (wants.training||input.focusedTraining)) {
    push({
      id:'training.source_consistency',domain:'training',
      label:'Training source disagreement',value:null,unit:null,period,
      text:'Independently checked Training sessions, working sets or exercise definitions changed or could not be verified consistently. Training frequency, exercise labels, logged strength performance and Training-linked correlations are WITHHELD; no set, load or rep may be treated as reliable evidence of progress or decline.',
      coverage:{trainingSourceAgreement:input.trainingSnapshotConsistency??'not_checked',
        workingSetSourceAgreement:input.workingSetSourceRecheck??'not_checked',
        exerciseDefinitionAgreement:input.exerciseDefinitionSourceRecheck??'not_checked',
        trainingEvidence:'withheld'},
      detailPath:'/progress/strength',userEntered:false,substantive:false,priority:0,
    })
  }else{
    if(wants.training)addTraining(input,push,wants.exerciseDetail)
    addFocusedTraining(input,push)
  }
  addFocusedDigestive(input, push, digestiveGuard)
  addFocusedWeightEnergy(input.focusedWeightEnergy ?? null, input.contextMode, push,
    input.activitySnapshotConsistency)
  addHistoricalWeightEnergyDay(input.focusedWeightEnergyDay ?? null, input.contextMode, push)
  addHistoricalWeightEnergyWindow(input.focusedWeightEnergyWindow ?? null, input.contextMode, push)
  if(historicalSourceConflict){
    const historicalDay=input.focusedWeightEnergyDay?.scope==='in_range'
    push({
      id:historicalDay?'weight_energy.historical_day.source_consistency':
        'weight_energy.historical_window.source_consistency',
      domain:'intelligence',label:'Selected historical source consistency boundary',
      value:null,unit:null,
      period:historicalDay
        ?{start:input.focusedWeightEnergyDay!.date,end:input.focusedWeightEnergyDay!.date}
        :{start:input.focusedWeightEnergyWindow!.start,end:input.focusedWeightEnergyWindow!.end},
      text:'The saved measurements or verified completed food days for the specifically requested past date(s) changed during retrieval, or an independent final source check was unavailable. Historical weight, calorie, comparison, sampling and trend claims are WITHHELD. The missing or corrected information is UNKNOWN, not zero. Re-ask after the saved records settle; these data do not establish a deficit, plateau, or body-fat change.',
      coverage:{historicalSourceRecheck:'changed_or_unavailable',historicalClaims:'withheld'},
      detailPath:'/progress/body',userEntered:false,substantive:false,priority:0,
    })
  }
  if (wants.supplements || questionMentionsSavedSupplement(input)) {
    addSupplements(input, push)
  }
  if (wants.goals) {
    addGoals(input, push, limitations)
  }
  if (wants.lab) {
    addLab(input, push)
  }
  if (wants.context && !digestiveGuard.crossSourceConflict) {
    if (input.currentContextSourceRecheck === 'changed_or_unavailable') {
      push({
        id:'context.source_consistency',domain:'context',
        label:'Current Daily Context source consistency boundary',
        value:null,unit:null,period,
        text:'Saved Daily Context notes or tags changed during this read or could not be rechecked. Prior notes and tag counts are WITHHELD. Missing context is UNKNOWN, not a normal or symptom-free day.',
        coverage:{contextSourceRecheck:'changed_or_unavailable',contextClaims:'withheld'},
        detailPath:'/context',userEntered:false,substantive:false,priority:0,
      })
    } else addContext(input.context,push)
  }
  if (wants.patterns) {
    addPatterns(input.patterns, push)
  }
  addStableProfile(input.stableProfile ?? null, input.question, input.asOf, push, input.contextMode === 'deep')
  addClinicalProfile(input.profile ?? null, input.question, push, input.contextMode)
  if (intelligence) {
    addSharedIntelligence(intelligence, input.period, push, limitations)
  }

  const maxChars = input.maxChars ?? ASK_PACKET_MAX_CHARS
  // PIQ-4.2: a named one-day question must NEVER inherit unrelated current
  // goals, undated nutrition/body averages, multiweek intelligence or notes.
  // Retain just the request's exact-date evidence and the neutral range label.
  const selectedDrafts = input.focusedWeightEnergyDay
    ? drafts.filter(item => item.id === 'ask.range' ||
        item.id.startsWith('weight_energy.historical_day.') ||
        item.id === 'goals.historical_attestation_boundary')
    : input.focusedWeightEnergyWindow
      ? drafts.filter(item => item.id === 'ask.range' ||
          item.id.startsWith('weight_energy.historical_window.') ||
          item.id === 'goals.historical_attestation_boundary')
      : drafts
  // The historical date filter otherwise lets stale source-specific figures
  // through without a late source read; preserve only its neutral boundary.
  const historicalSafeDrafts=historicalSourceConflict
    ?selectedDrafts.filter(item=>item.id==='ask.range'||
       item.id==='goals.historical_attestation_boundary'||
       item.id==='weight_energy.historical_day.source_consistency'||
       item.id==='weight_energy.historical_window.source_consistency')
    :selectedDrafts
  // Hide ALL relevant generic routes if current focused inputs fail.
  // Historical, General Only and unrelated sleep/supplements are preserved.
  const safeDrafts=focusedSourceConflict
    ? historicalSafeDrafts.filter(item=>item.id==='ask.range'||
        item.id==='weight_energy.source_consistency'||
        !['body.','nutrition.','activity.','goals.','intelligence.']
          .some(prefix=>item.id.startsWith(prefix)))
    : historicalSafeDrafts
  const evidence=trimEvidence(safeDrafts,maxChars)
  const selectedIds = new Set(evidence.map((item) => item.id))
  const clarification = trainingSourceConflict ? null : exerciseClarification(input)
  const selectedSerializedChars = JSON.stringify(evidence).length
  return {
    packetVersion: ASK_HEALTH_PACKET_VERSION,
    lens: input.lens,
    range: input.range,
    rangeStart: period.start,
    rangeEnd: period.end,
    asOf: input.asOf,
    ...(input.healthToday ? { healthToday: input.healthToday } : {}),
    generatedAt: input.generatedAt,
    evidence,
    limitations: limitations.filter((item) => evidence.some((fact) => fact.id === item.evidenceId)),
    contextSummary: {
      knows: input.focusedWeightEnergyDay || input.focusedWeightEnergyWindow || focusedSourceConflict
        ? [] : intelligence?.knows ?? [],
      missing: input.focusedWeightEnergyDay || input.focusedWeightEnergyWindow || focusedSourceConflict
        ? [] : intelligence?.missing ?? [],
    },
    clarification,
    evidenceSelectionAudit: {
      candidateCount: drafts.length,
      selectedCount: evidence.length,
      removedCount: drafts.length - evidence.length,
      removedSubstantiveCount: drafts.filter((item) => item.substantive && !selectedIds.has(item.id)).length,
      maxChars,
      selectedSerializedChars,
      exceedsMaxChars: selectedSerializedChars > maxChars,
    },
    sourceCoverageAudit: input.sourceCoverageAudit ?? null,
  }
}

export function packetHasSubstantiveEvidence(packet: AskHealthPacket): boolean {
  return packet.evidence.some((item) => item.substantive)
}

export function insufficientAskHealthAnswer(packet: AskHealthPacket): AskHealthAnswer {
  const coverage = packet.evidence.filter((item) => item.id.startsWith('coverage.') || item.id === 'ask.range')
  const refs = coverage.slice(0, 2).map((item) => item.id)
  return {
    blocks: [
      {
        text: 'Not enough Health evidence is available for this question yet.',
        evidenceRefs: refs.length > 0 ? refs : ['ask.range'],
      },
    ],
    limitations: packet.limitations.map((item) => ({ text: item.text, evidenceRefs: [item.evidenceId] })),
    followUps: [],
  }
}

export function packetFingerprintMaterial(packet: AskHealthPacket): string {
  return JSON.stringify({
    packetVersion: packet.packetVersion,
    lens: packet.lens,
    range: packet.range,
    rangeStart: packet.rangeStart,
    rangeEnd: packet.rangeEnd,
    asOf: packet.asOf,
    healthToday: packet.healthToday ?? null,
    evidence: packet.evidence.map((item) => ({
      id: item.id,
      value: item.value,
      unit: item.unit,
      text: item.text,
      coverage: item.coverage,
      confidence: item.confidence ?? null,
      provenance: item.provenance ?? null,
      evidenceDates: item.evidenceDates ?? null,
    })),
    limitations: packet.limitations,
    contextSummary: packet.contextSummary,
  })
}

function lensWants(lens: AskLens) {
  const general = lens === 'general'
  return {
    body: general || lens === 'nutrition' || lens === 'training',
    bodyDetail: general || lens === 'nutrition',
    nutrition: general || lens === 'nutrition' || lens === 'training',
    activity: general || lens === 'recovery' || lens === 'training',
    sleep: general || lens === 'recovery' || lens === 'training',
    training: general || lens === 'training' || lens === 'recovery',
    exerciseDetail: lens === 'training' || general,
    supplements: general || lens === 'nutrition',
    goals: general || lens === 'training' || lens === 'nutrition' || lens === 'recovery',
    lab: lens === 'experiments' || lens === 'training' || general,
    context: general || lens === 'recovery' || lens === 'experiments',
    patterns: general || lens === 'recovery',
  }
}

function addBody(
  input: AskHealthPacketInput,
  push: (item: PushItem) => void,
  limitations: AskLimitation[],
  detail: boolean,
) {
  const body = input.overview?.body
  if (!body) {
    return
  }
  const matched = matchedBodyKeys(input.question)
  const keys = new Set(matched)
  if (detail && keys.size === 0) {
    keys.add('weight')
  }
  const trend = body.weight.trend
  if (keys.has('weight')) {
    const observations = body.weight.observations.filter((item) => item.key === 'weight' && item.calendarDate <= input.asOf)
    const latest = body.weight.latest && body.weight.latest.calendarDate <= input.asOf ? body.weight.latest : null
    if (latest) {
      push({
        id: 'body.weight.latest',
        domain: 'body',
        label: 'Latest weight',
        value: latest.value,
        unit: latest.unit,
        text: `Latest weight on ${latest.calendarDate}.`,
        coverage: { observations: observations.length },
        detailPath: '/progress/body',
        userEntered: false,
        substantive: true,
        priority: 2,
      })
    }
    if (trend.status === 'available') {
      push({
        id: 'body.weight.trend',
        domain: 'body',
        label: 'Weight trend',
        value: trend.value.slopePerWeek,
        unit: `${latest?.unit ?? 'kg'}/week`,
        text: 'Theil–Sen weight slope already calculated by Health.',
        coverage: { observations: trend.value.measurementCount, spanDays: trend.value.spanDays },
        detailPath: '/progress/body',
        userEntered: false,
        substantive: true,
        priority: 2,
      })
    } else {
      push({
        id: 'body.weight.trend',
        domain: 'body',
        label: 'Weight trend',
        value: null,
        unit: null,
        text: 'Weight trend is insufficient_data.',
        coverage: { observations: trend.observations ?? 0 },
        detailPath: '/progress/body',
        userEntered: false,
        substantive: observations.length > 0,
        priority: 2,
      })
      limitations.push({
        code: 'body_insufficient_trend_samples',
        text: `Weight trend needs more comparable measurements. Health counted ${trend.observations}.`,
        evidenceId: 'body.weight.trend',
      })
    }
  }
  if (!detail) {
    return
  }
  for (const metric of body.metrics) {
    if (metric.key === 'weight' || (!keys.has(metric.key) && !matchedMetric(metric.key, keys))) {
      continue
    }
    if (!metric.latest || metric.latest.calendarDate > input.asOf) {
      continue
    }
    const label = bodyMetricLabel(metric.key)
    push({
      id: `body.${metric.key}.latest`,
      domain: 'body',
      label,
      value: metric.latest.value,
      unit: metric.latest.unit,
      text: `Latest ${label.toLowerCase()} on ${metric.latest.calendarDate}.`,
      coverage: null,
      detailPath: '/progress/body',
      userEntered: false,
      substantive: true,
      priority: 1,
    })
    const comparison = metric.comparison
    if (comparison.status === 'available') {
      const start = comparison.value.periodStartNearest
      const end = comparison.value.periodEndNearest
      const periodChange = start && end && start.calendarDate !== end.calendarDate ? end.value - start.value : comparison.value.change
      push({
        id: `body.${metric.key}.change`,
        domain: 'body',
        label: `${label} change`,
        value: periodChange,
        unit: comparison.value.unit,
        text:
          start && end && start.calendarDate !== end.calendarDate
            ? `Change from the measurement nearest the selected range start on ${start.calendarDate} to the measurement nearest the range end on ${end.calendarDate}. Positive means the later measurement is higher.`
            : `Change from the previous comparable measurement on ${comparison.value.previous?.calendarDate ?? 'unknown'} to the latest measurement on ${comparison.value.current?.calendarDate ?? metric.latest.calendarDate}. Positive means the latest measurement is higher.`,
        coverage: {
          observations: comparison.observations,
          startDate: start?.calendarDate ?? comparison.value.previous?.calendarDate ?? null,
          startValue: start?.value ?? comparison.value.previous?.value ?? null,
          endDate: end?.calendarDate ?? comparison.value.current?.calendarDate ?? null,
          endValue: end?.value ?? comparison.value.current?.value ?? null,
          valueKind: metric.latest.valueKind,
        },
        detailPath: '/progress/body',
        userEntered: false,
        substantive: true,
        priority: 1,
      })
    } else if (comparison.status === 'insufficient_data') {
      push({
        id: `body.${metric.key}.change`,
        domain: 'body',
        label: `${label} change`,
        value: null,
        unit: metric.latest.unit,
        text: `Health does not have enough comparable ${label.toLowerCase()} measurements to confirm a change.`,
        coverage: {
          observations: comparison.observations,
          required: comparison.required ?? 2,
        },
        detailPath: '/progress/body',
        userEntered: false,
        substantive: comparison.observations > 0,
        priority: 1,
      })
      limitations.push({
        code: `body_${metric.key}_insufficient_comparison`,
        text: `${label} needs at least ${comparison.required ?? 2} comparable measurements to confirm whether it changed.`,
        evidenceId: `body.${metric.key}.change`,
      })
    }
  }
}

/**
 * PIQ-4.2 begins with a bounded descriptive context, not a Coach decision.
 * The read-time owner goal version, actual strength trend, target/experiment
 * safety and calibration outcomes have NOT been attested by this data path.
 * Always keep evidence quality distinct from a recommendation.
 */
/**
 * The named day is the ONLY allowed evidence interval; do not substitute
 * later samples or an unrelated trailing maintenance estimate.
 */
/**
 * PIQ-4.2 named-window evidence: never reuse the latest all-range weight
 * trend, daily food fragment, global calorie target or current profile.
 */
function addHistoricalWeightEnergyWindow(
  window: HistoricalWeightEnergyWindow | null,
  mode: AskHealthPacketInput['contextMode'],
  push: (item: PushItem) => void,
): void {
  if (!window || mode === 'general_only') return
  const period={start:window.start,end:window.end}
  const usable=window.scope==='in_range'
  const outOfRange=window.scope==='out_of_range'
  push({
    id:'weight_energy.historical_window.coverage',
    domain:'body',label:'Requested historical weight and recorded intake interval',
    value:null,unit:null,period,
    text:!usable
      ? outOfRange
        ? 'The named interval is not wholly within the selected evidence range and as-of date. No partial interval or recent substitute was used. Select a wider history range.'
        : 'The requested historical interval is ambiguous or unsupported. No recent or arbitrary interval was substituted; ask about one supported calendar window.'
      : 'Selected '+window.label+' ('+window.start+' through '+window.end+
        '): '+window.completedDays+' completed calendar day(s), '+window.verifiedCalorieDays+
        ' with reliable owner-confirmed whole-day calorie logs, and '+window.recordedWeightDays+
        ' saved weight-observation day(s). Unlogged and unverified days are UNKNOWN, not zero.'+
        (window.intakeCoverage === 'single_verified_day'
          ? ' Only ONE date has verified complete food intake; its recorded amount cannot describe typical intake for this interval.'
          : window.intakeCoverage === 'sparse_or_clustered'
            ? ' Verified food dates are sparse or concentrated in one half of this interval; their average must not be treated as a representative weekly or monthly intake pattern.'
            : window.intakeCoverage === 'distributed_observations'
              ? ' Verified food records occur in both halves of the interval, but even this does not prove every meal was logged.'
              : ' No complete reliable calorie day is available; intake during this interval is unknown.')+
        (window.provisionalTodayExcluded
          ? ' Today was excluded from all completed-day calculations.' : '')+
        ' Recorded intake is not measured expenditure; changes in scale weight are not proven changes in body fat.',
    coverage:{requestedWindowStart:window.start,requestedWindowEnd:window.end,
      requestedWindowScope:window.scope,selectedCalendarDays:window.calendarDays,
      completedCalendarDays:window.completedDays,
      verifiedCompleteCalorieDays:window.verifiedCalorieDays,
      verifiedEarlyHalfDays:window.verifiedEarlyHalfDays,
      verifiedLateHalfDays:window.verifiedLateHalfDays,
      intakeCoverage:window.intakeCoverage,
      savedWeightDays:window.recordedWeightDays,
      comparableWeightDays:window.comparableWeightDays,
      provisionalTodayExcluded:window.provisionalTodayExcluded ? 'yes' : 'no'},
    detailPath:'/progress/body',userEntered:false,substantive:false,priority:0,
  })
  if(!usable)return
  if(window.verifiedCalorieMeanKcal!=null)push({
    id:'weight_energy.historical_window.calories',domain:'nutrition',
    label:'Recorded calorie mean on verified complete dates in requested interval',
    value:window.verifiedCalorieMeanKcal,unit:'kcal/verified date',period,
    text:'Across '+window.verifiedCalorieDays+' source-reliable owner-confirmed completed food day(s) '+
      'inside the requested interval, recorded calories averaged '+
      Math.round(window.verifiedCalorieMeanKcal)+' kcal per verified date; this is NOT '+
      'a calendar-day average, an intake deficit, total expenditure or a reason to change a calorie target.'+
      (window.intakeCoverage==='distributed_observations'
        ? ' These records span both halves, but completeness of every meal is not independently proven.'
        : ' This is a limited sample of logged dates, NOT a representative estimate of all days in the interval.'),
    coverage:{verifiedCompleteCalorieDays:window.verifiedCalorieDays,
      intakeCoverage:window.intakeCoverage,
      verifiedEarlyHalfDays:window.verifiedEarlyHalfDays,
      verifiedLateHalfDays:window.verifiedLateHalfDays,
      selectedCalendarDays:window.calendarDays},
    detailPath:'/nutrition',userEntered:false,substantive:true,priority:1,
  })
  if(window.observedWeightChangeKg!=null)push({
    id:'weight_energy.historical_window.weight_change',domain:'body',
    label:'Observed scale-weight change between comparable sampled endpoints',
    value:window.observedWeightChangeKg,unit:'kg',period,
    text:'Saved usual-condition weigh-ins cover both ends of this requested interval '+
      'with '+window.comparableWeightDays+' comparable observation day(s) spanning '+
      window.observedWeightSpanDays+' days. The difference between the earliest and '+
      'latest qualifying weights is '+Math.round(window.observedWeightChangeKg*1000)/1000+
      ' kg. It is not fat loss/gain, a biological plateau, a daily slope, or a validated calorie-adjustment trigger.'+
      (window.internalWeightVariability === 'large_internal_excursion'
        ? ' Caution: at least one other usual-condition weigh-in diverged substantially from a straight line between the endpoints. The eligible measurements span '+
          Math.round(window.observedWeightRangeKg!*1000)/1000+
          ' kg within this interval; the endpoint difference must NOT be described as a representative weekly trend or proof of a plateau.'
        : ' A modest internal deviation in the recorded sample does NOT prove consistent scale conditions or exclude unrecorded fluctuations.'),
    coverage:{comparableWeightDays:window.comparableWeightDays,
      comparableSpanDays:window.observedWeightSpanDays,
      observedWeightRangeKg:window.observedWeightRangeKg,
      internalWeightVariability:window.internalWeightVariability,
      boundaryCoverage:window.boundaryCoverage},
    detailPath:'/progress/body',userEntered:false,substantive:true,priority:1,
  })
  if(window.observedWeightChangeKg==null)push({
    id:'weight_energy.historical_window.weight_unavailable',domain:'body',
    label:'Comparable interval weight change unavailable',
    value:null,unit:null,period,
    text:'A weight change was withheld. At least three usual-condition weigh-ins, '+
      'at least six days apart in total and within two days of each window end are needed '+
      'for a bounded observation comparison. Missing or differently recorded weigh-ins '+
      'cannot be treated as stable scale weight.',
    coverage:{comparableWeightDays:window.comparableWeightDays,
      boundaryCoverage:window.boundaryCoverage},
    detailPath:'/progress/body',userEntered:false,substantive:false,priority:1,
  })
}

function addHistoricalWeightEnergyDay(
  day: HistoricalWeightEnergyDay | null,
  mode: AskHealthPacketInput['contextMode'],
  push: (item: PushItem) => void,
): void {
  if (!day || mode === 'general_only') return
  const period={start:day.date,end:day.date}
  push({
    id:'weight_energy.historical_day.coverage',
    domain:'body',label:'Requested historical weight and intake day',
    value:null,unit:null,period,
    text:day.scope==='out_of_range'
      ? 'Requested '+day.date+' is outside the selected evidence window or as-of date. No more recent weight or calorie estimate was substituted; select an appropriate history range.'
      :day.scope==='provisional_today'
        ? 'Requested '+day.date+' is the current Health day and cannot be treated as a completed historical day.'
        :'On '+day.date+', saved weight and verified completed-day food intake are checked independently. Missing or unverified observations are UNKNOWN, not zero. A single date cannot establish a trend, energy deficit, fat-loss result or calorie target.',
    coverage:{requestedDate:day.date,requestedDateScope:day.scope,
      savedWeight:day.weightKg!=null?'observed':'unavailable',
      verifiedCompleteCalories:day.verifiedCaloriesKcal!=null?'verified_complete':'unavailable'},
    detailPath:'/progress/body',userEntered:false,substantive:false,priority:0,
  })
  if(day.scope!=='in_range')return
  if(day.weightKg!=null)push({
    id:'weight_energy.historical_day.weight',domain:'body',
    label:'Saved scale-weight observation on requested date',
    value:day.weightKg,unit:'kg',period,
    text:'On '+day.date+', a saved scale-weight observation is '+day.weightKg+
      ' kg. '+(day.weightConditions==='usual'
        ?'Weigh-in conditions were recorded as usual.'
        :day.weightConditions==='different_conditions'
          ?'Weigh-in conditions differed; comparison with other days is limited.'
          :'Weigh-in-condition comparability is unknown.')+
      ' This isolated observation does not establish fat gain, fat loss or a weight plateau.',
    coverage:{weightConditions:day.weightConditions},
    detailPath:'/progress/body',userEntered:false,substantive:true,priority:1,
  })
  if(day.verifiedCaloriesKcal!=null)push({
    id:'weight_energy.historical_day.calories',domain:'nutrition',
    label:'Verified completed-day recorded calories on requested date',
    value:day.verifiedCaloriesKcal,unit:'kcal',period,
    text:'On '+day.date+', the owner-verified, source-reliable completed food log records '+
      day.verifiedCaloriesKcal+' kcal. Recorded intake is NOT measured energy expenditure, '+
      'a proven physiological deficit, fat loss or a reason to lower a calorie target.',
    coverage:{dayCompleteness:'verified_complete'},
    detailPath:'/nutrition',userEntered:false,substantive:true,priority:1,
  })
}

function addFocusedWeightEnergy(
  focus: FocusedWeightEnergyEvidence | null,
  contextMode: AskHealthPacketInput['contextMode'],
  push: (item: PushItem) => void,
  activitySnapshotConsistency?: AskHealthPacketInput['activitySnapshotConsistency'],
): void {
  if (!focus || contextMode === 'general_only') return
  const estimate = focus.estimate
  const period = {start:focus.start,end:focus.end}
  if(focus.nutritionSourceRecheck==='changed_or_unavailable'||
     focus.weightActivitySourceRecheck==='changed_or_unavailable' ||
     activitySnapshotConsistency==='changed_or_unavailable'){
    push({
      id:'weight_energy.source_consistency',
      domain:'intelligence',
      label:'Current weight/energy source consistency boundary',
      value:null,unit:null,period,
      text:'At least one independently rechecked current Nutrition, body-weight, Activity or Training source changed, lacks compatible source identity, disagreed between initially loaded source views, or was unavailable. Current focused weight/intake estimates, nutrient shifts, protein context, step/log comparisons and selected-goal interpretations are WITHHELD. A corrected or missing record is UNKNOWN, not zero. No calorie adjustment or personalized plateau conclusion is authorized.',
      coverage:{
        nutritionSourceRecheck:focus.nutritionSourceRecheck,
        weightActivitySourceRecheck:focus.weightActivitySourceRecheck,
        activitySnapshotConsistency:activitySnapshotConsistency??'not_checked',
        intakeEstimate:'withheld',nutrientShiftContext:'withheld',
        scaleInterpretation:'withheld',intervention:'not_authorized'},
      detailPath:'/nutrition',userEntered:false,substantive:false,priority:0,
    })
    return
  }
  const quality = estimate.quality
  const sufficient = estimate.state === 'available' &&
    estimate.observedMaintenanceKcal != null &&
    estimate.weightSlopeKgPerWeek != null && estimate.period != null
  push({
    id:'weight_energy.quality',
    domain:'body',
    label:'Weight and confirmed-intake evidence readiness',
    value:null,unit:null,period,
    text: sufficient
      ? 'The existing maintenance engine found a recent aligned window with enough owner-confirmed complete food days and comparable weight measurements for a descriptive energy-balance estimate. These records cannot prove that all intake was captured or that a flat scale means fat loss stopped.'
      : 'A weight/intake energy-balance estimate is withheld: '+estimate.explanation+' Missing food or weight observations are UNKNOWN, not zero; a logged calorie average alone is not a verified daily intake or measured energy deficit.',
    coverage:{
      verifiedCompleteCalorieDays:focus.qualifiedWholeDayCalories,
      calendarDays:quality.nutrition.calendarDays,
      comparableWeightMeasurements:quality.body.usedMeasurements,
      weightSpanDays:quality.body.spanDays,
      estimateState:estimate.state,
      estimateConfidence:estimate.confidence,
    },
    detailPath:'/progress/body',userEntered:false,substantive:false,
    priority:0,
  })
  if (sufficient) push({
    id:'weight_energy.observed_balance',
    domain:'body',label:'Observed energy-balance estimate (not measured TDEE)',
    value:estimate.observedMaintenanceKcal,unit:'estimated kcal/day',
    period,
    text:'From '+estimate.period!.start+' through '+estimate.period!.end+
      ', the existing maintenance engine aligned owner-confirmed, source-reliable completed food days with comparable weight measurements. '+
      'Mean recorded calories across eligible dates: '+estimate.averageIntakeKcal+
      ' kcal/day; robust weight trend: '+Math.round(estimate.weightSlopeKgPerWeek!*1000)/1000+
      ' kg/week; approximate energy-balance maintenance estimate: '+estimate.observedMaintenanceKcal+
      ' kcal/day (uncertain range '+estimate.rangeLowKcal+'–'+estimate.rangeHighKcal+
      '). This is NOT a measured TDEE, energy requirement, verified calorie deficit, fat-loss result, or safe new calorie target.',
    coverage:{
      verifiedCompleteCalorieDays:focus.qualifiedWholeDayCalories,
      comparableWeightMeasurements:quality.body.usedMeasurements,
      selectedWindowDays:estimate.period!.days,
      rangeLowKcal:estimate.rangeLowKcal,
      rangeHighKcal:estimate.rangeHighKcal,
      recordedAverageIntakeKcal:estimate.averageIntakeKcal,
      weightSlopeKgPerWeek:estimate.weightSlopeKgPerWeek,
    },
    confidence:estimate.confidence,provenance:'derived_from_owner_confirmed_data',
    detailPath:'/progress/body',userEntered:false,substantive:true,priority:1,
  })
  // PIQ-4.2: a verified nutrient-log shift is context, not a measured
  // explanation of scale mass or evidence supporting a calorie change.
  // Absence of a qualifying comparison MUST NOT imply stable intake.
  const contextual = focus.qualifiedScaleContext
  const scaleCoverage=focus.scaleWindowSignalCoverage
  const shiftTiming=focus.scaleShiftTiming
  const shiftTimingLabels:{kind:'sodium'|'carbohydrate';state:string}[]=[
    {kind:'sodium',state:shiftTiming.sodium},
    {kind:'carbohydrate',state:shiftTiming.carbohydrate},
  ]
  const chronologyDescription=shiftTimingLabels
    .filter(item=>item.state!=='not_checked')
    .map(item=>item.kind+': '+
      (item.state==='later_scale_recorded'
        ?'a usual-condition scale record exists on a later calendar day than the latest qualified food-log day, but this is NOT a verified nutrient effect'
        :item.state==='no_later_scale_record'
          ?'no usual-condition scale record exists on a later calendar day than the latest qualified food-log day; a later scale comparison is unavailable'
          :item.state==='weight_window_insufficient'
            ?'usual-condition weight coverage is insufficient for date-order comparison'
            :'source dates could not be verified for comparison'))
    .join('; ')
  push({
    id:'weight_energy.scale_context',
    domain:'intelligence',
    label:'Recent verified nutrient shifts that might complicate scale interpretation',
    value:null,unit:null,period,
    text:(contextual.length > 0
      ? 'The existing maintenance screening found ' + contextual.length +
        ' recent recorded nutrient shift(s) on owner-confirmed, source-reliable food days: ' +
        contextual.map(item => item.title + '. ' + item.detail).join(' ') +
        ' These are possible short-term scale-weight contexts, NOT demonstrated causes of body-mass changes, proof of fat gain, a personal association or grounds to lower calorie targets. ' +
        'Hydration and bowel trends are not screened as explanatory shifts here because event logs cannot establish whole-day completeness.'+
        (scaleCoverage.weightSampling==='sampled_both_windows'
          ? ' Both comparison windows contain recorded usual-condition weights, but contemporaneous readings do NOT establish any personalized weight/nutrient association.'
          : ' The comparison windows lack sufficient usual-condition weight sampling; this is a food-log observation ONLY, not an observed scale-weight explanation.')
      : 'No recent sodium or carbohydrate shift qualified for this source-verified comparison. ' +
        'That does NOT establish stable sodium/carbohydrate intake, exclude fluid/GI confounding, or prove that body fat has stopped changing. ' +
        'Missing or unverified food days and unrecorded circumstances are unknown, not normal or zero.')+
      ' In these ten completed comparison days, source-identified water logs exist on '+
      scaleCoverage.recordedWaterDays+' day(s) and step logs on '+
      scaleCoverage.recordedStepDays+' day(s). Neither proves whole-day hydration, physical activity, or a cause for scale change; missing logs never imply zero.'+
      (chronologyDescription
        ?' Calendar-day ordering of qualified food logs versus scale readings: '+chronologyDescription+
          '. Same-day food totals cannot be ordered relative to a weigh-in; no chronology here measures weight response or establishes causation.'
        :''),
    coverage:{
      verifiedNutrientShiftCount:contextual.length,
      screenedNutrients:'sodium, carbohydrate',
      status:contextual.length > 0 ? 'qualified_logging_context' : 'no_qualified_comparison',
      recentWindowDays:3,
      baselineWindowDays:7,
      sodiumQualifiedRecentDates:contextual.find(item => item.kind === 'sodium')?.dates.length ?? 0,
      carbohydrateQualifiedRecentDates:contextual.find(item => item.kind === 'carbohydrate')?.dates.length ?? 0,
      weightSampling:scaleCoverage.weightSampling,
      recentUsualWeightDays:scaleCoverage.recentUsualWeightDays,
      baselineUsualWeightDays:scaleCoverage.baselineUsualWeightDays,
      nonUsualWeightDays:scaleCoverage.nonUsualWeightDays,
      recordedWaterDays:scaleCoverage.recordedWaterDays,
      recordedStepDays:scaleCoverage.recordedStepDays,
      sodiumScaleTiming:shiftTiming.sodium,
      carbohydrateScaleTiming:shiftTiming.carbohydrate,
    },
    detailPath:'/nutrition',userEntered:false,substantive:false,priority:1,
  })
  const preservation = focus.proteinTrainingContext
  push({
    id:'weight_energy.protein_training_context',
    domain:'intelligence',
    label:'Verified recorded protein and training participation (NOT muscle preservation)',
    value:null,unit:null,period,
    text:preservation.proteinCoverage === 'descriptive_window'
      ? 'Within this bounded weight/intake window, '+preservation.verifiedProteinDays+
        ' owner-confirmed, source-ID-matched complete food dates recorded protein, averaging '+
        Math.round(preservation.verifiedMeanProteinG!*10)/10+' g per verified date. '+
        'That is not a mean across every calendar date, measured protein needs or proof of sufficient intake.'
      : 'There are '+preservation.verifiedProteinDays+
        ' source-ID-matched verified complete protein dates within this window; this does not meet the '+
        'four-date and seven-day-span threshold for even a descriptive protein average. Missing or '+
        'unverified days are UNKNOWN, not zero or presumed low protein.' +
        (preservation.verifiedCalorieDaysInWindow === 0
          ? ' No reliable completed calorie dates were available for this comparison.' : ''),
    coverage:{
      verifiedWholeDayProteinDates:preservation.verifiedProteinDays,
      verifiedCalorieDates:preservation.verifiedCalorieDaysInWindow,
      proteinContextStatus:preservation.proteinCoverage,
      observedSourceIdentifiedTrainingDates:preservation.sourceIdentifiedTrainingDays,
      unattributedPositiveTrainingSignalDates:preservation.trainingDaysWithoutSourceIdentity,
      strengthOutcome:preservation.strengthOutcome,
      descriptiveMinimumProteinDates:4,
      descriptiveMinimumProteinSpanDays:7,
    },
    detailPath:'/nutrition',userEntered:false,substantive:false,priority:1,
  })
  const exerciseReview = focus.exercisePreservationReview
  const exerciseReviewSummary = exerciseReview.state === 'possible_decline_for_review'
    ? 'A separate canonical exact-exercise screen has '+exerciseReview.possibleDeclineExercises+
      ' preliminary recent performance-decline flag(s) among '+exerciseReview.qualifiedRecentSeries+
      ' qualifying matched-exercise series. Review their training context rather than assuming dieting caused the change. '
    : exerciseReview.state === 'no_qualified_decline_flag'
      ? 'A separate canonical exact-exercise screen found no qualifying decline flags among '+
        exerciseReview.qualifiedRecentSeries+' recent matched-exercise series; this does NOT establish preserved strength or muscle. '
      : exerciseReview.state === 'limited_evidence'
        ? 'The separate exact-exercise screen had too few recent, confidently comparable four-exposure series; strength changes remain UNKNOWN. '
        : 'No reliable current exact-exercise decline screen was available; performance changes remain UNKNOWN. '
  push({
    id:'weight_energy.training_preservation_boundary',
    domain:'intelligence',
    label:'Strength preservation remains unverified despite training participation',
    value:null,unit:null,period,
    text:'In the selected window, '+preservation.sourceIdentifiedTrainingDays+
      ' positive training-session date(s) have a nonduplicate source identity; '+
      preservation.trainingDaysWithoutSourceIdentity+
      ' additional positive training signals lack usable event identity and are excluded. '+
      'Training participation does NOT establish comparable resistance, effort, exercise performance, muscle retention, or appropriate recovery. '+
      exerciseReviewSummary +
      'These are read-only training-record observations without an independently version-checked workout snapshot or a comprehensive recovery assessment. '+
      'Strength preservation, plateau and protein-adequacy conclusions remain unverified. A calorie-cut recommendation remains unauthorized.',
    coverage:{
      sourceIdentifiedTrainingDays:preservation.sourceIdentifiedTrainingDays,
      unattributedPositiveTrainingSignalDays:preservation.trainingDaysWithoutSourceIdentity,
      exerciseReviewState:exerciseReview.state,
      qualifiedRecentExerciseSeries:exerciseReview.qualifiedRecentSeries,
      possibleDeclineExercises:exerciseReview.possibleDeclineExercises,
      strengthPreservation:'not_verified',
    },
    detailPath:'/training',userEntered:false,substantive:false,priority:1,
  })
  const goalObs=focus.weightGoalObservation
  const goalObsSummary=goalObs.state==='all_recorded_above_boundary'
    ? 'Three recent usual-condition recorded weights are all above the current goal boundary. '
    :goalObs.state==='all_recorded_below_boundary'
      ? 'Three recent usual-condition recorded weights are all below the current goal boundary. '
      :goalObs.state==='all_recorded_within_boundary'
        ? 'Three recent usual-condition recorded weights fall within the configured goal boundary. '
        :goalObs.state==='mixed_recorded_sides'
          ? 'Three recent usual-condition recorded weights fall on different sides of the current goal boundary. '
          :goalObs.state==='no_active_goal'
            ? 'No active weight goal was attested during this read. '
            :'A recent comparable recorded-weight-to-goal-boundary check is unavailable or insufficient. '
  push({
    id:'weight_energy.goal_observation',domain:'body',
    label:'Read-only recorded weight versus versioned goal boundary',
    value:null,unit:null,period,
    text:goalObsSummary+
      'This is a comparison of saved measurements, not a determination of Goal Control target status, body-fat progress, plateau, or a safe calorie change. '+
      'The weight rows are not independently revision-attested; a later correction may change this description.',
    coverage:{
      relation:goalObs.state,comparableWeightDays:goalObs.comparableWeightDays,
      sampledSpanDays:goalObs.sampledSpanDays,
    },
    detailPath:'/goals',userEntered:false,substantive:false,priority:1,
  })
  const priority=focus.primaryGoalPriority
  const prioritySummary=priority.state==='selected_active_weight_goal'
    ? 'The owner explicitly selected the attested active weight goal as primary on the current effective date. '
    :priority.state==='selected_goal_not_active_weight'
      ? 'The owner selected a primary goal, but it is not the attested active weight goal; do not assume weight loss is the priority. '
      :priority.state==='explicitly_cleared'
        ? 'The owner explicitly cleared the primary-goal selection; no primary goal is currently declared. '
        :priority.state==='not_set'
          ? 'No owner primary-goal choice was found effective today; its absence is not permission to infer a priority. '
          : 'Current explicit primary-goal priority is UNKNOWN because its attestation was not completed. '
  push({
    id:'weight_energy.primary_goal_priority',domain:'goals',
    label:'Read-only effective-dated owner goal priority',
    value:null,unit:null,period,
    text:prioritySummary+
      'This does NOT verify that any goal is unmet, that a weight trend is a plateau, or that calorie adjustment is safe.',
    coverage:{priorityState:priority.state},
    detailPath:'/goals',userEntered:false,substantive:false,priority:1,
  })
  const timing=focus.experimentTimingReview
  const timingText=timing.state==='none'
    ? 'The attested review found no active or imminently scheduled experiments in this specific window; other unreviewed experiments or plans are not ruled out. '
    :timing.state==='active_now'
      ? 'At least one active Personal Lab experiment has a recorded window overlapping today. '
      :timing.state==='scheduled_soon'
        ? 'One or more Personal Lab experiments are scheduled in the next 14 days or overlap today while still marked scheduled. '
        :timing.state==='active_and_scheduled'
          ? 'A current-window active experiment and at least one scheduled experiment both need review. '
          :timing.state==='active_timing_unclear'
            ? 'At least one experiment marked active has an absent, past, or future-only window; its timing must be reconciled before interpreting a weight response. '
            : 'Experiment window timing is UNKNOWN because a consistent bounded read was not established. '
  push({
    id:'weight_energy.experiment_timing',domain:'experiments',
    label:'Read-only current Personal Lab experiment timing',
    value:null,unit:null,period,
    text:timingText+
      'Experiment status is not a causal result, adherence proof, evidence of an intervention effect, or permission to modify a calorie target.',
    coverage:{timingState:timing.state,activeWithinWindow:timing.activeWithinWindow,
      upcomingScheduled:timing.upcomingScheduled,
      activeOutsideOrUndated:timing.activeOutsideOrUndated},
    detailPath:'/lab',userEntered:false,substantive:false,priority:1,
  })
  const outcome=focus.experimentOutcomeReview
  const outcomeSummary=outcome.state==='none'
    ? 'No experiments in the attested active/near-scheduled cohort were found; this does not rule out other experiments or causes. '
    :outcome.state==='direct_outcome_recorded'
      ? 'At least one experiment protocol explicitly tracks bodyweight or calories as a primary/secondary outcome. '
      :outcome.state==='other_outcomes_only'
        ? 'The attested protocol outcomes do not explicitly include bodyweight or calories; indirect effects remain entirely possible. '
        :outcome.state==='unclassified_protocols'
          ? 'One or more attested experiment protocols do not declare a primary/secondary outcome, so outcome relevance is unclassified. '
          :outcome.state==='mixed_protocols'
            ? 'The cohort includes a mix of direct weight/calorie outcomes and other or unclassified outcomes. '
            : 'Experiment protocol outcome relevance is UNKNOWN because verification was unavailable. '
  push({
    id:'weight_energy.experiment_outcomes',domain:'experiments',
    label:'Attested experiment protocol outcome relevance (not causal efficacy)',
    value:null,unit:null,period,
    text:outcomeSummary+
      'This screen uses frozen typed protocol outcome definitions, NOT free-text title guesses. '+
      'An outcome definition is not measured adherence, clinical validation, an observed effect, or permission to change calories.',
    coverage:{relevanceState:outcome.state,
      directOutcomeExperiments:outcome.directOutcomeExperiments,
      directOutcomesActiveNow:outcome.directOutcomesActiveNow,
      directOutcomesScheduledSoon:outcome.directOutcomesScheduledSoon,
      noDirectOutcomeExperiments:outcome.noDirectOutcomeExperiments,
      noDeclaredOutcomeExperiments:outcome.noDeclaredOutcomeExperiments},
    detailPath:'/lab',userEntered:false,substantive:false,priority:1,
  })
  const finalized=focus.recentExperimentResultReview
  const finalizedText=finalized.state==='none_recent'
    ? 'No finalized Personal Lab results with end dates in the previous 28 Health-local days were found; earlier and unfinalized experiments are outside this scope. '
    :finalized.state==='recent_direct_observation'
      ? 'A recent valid, protocol-followed and interpretable Personal Lab result recorded an available declared weight/calorie outcome. '
      :finalized.state==='recent_non_direct_or_limited'
        ? 'Recent finalized results were limited, inconclusive, invalidated or did not record an interpretable direct weight/calorie outcome. '
        :finalized.state==='mixed_recent_results'
          ? 'Recent finalized results include a mix of direct observations and limited, non-direct or invalidated results. '
          : 'Recent Personal Lab result integrity is UNKNOWN because a consistent bounded source read was not verified. '
  push({
    id:'weight_energy.recent_experiment_results',domain:'experiments',
    label:'Recent finalized Personal Lab result integrity (not efficacy)',
    value:null,unit:null,period,
    text:finalizedText+
      'A result classification does not establish weight direction, effect size, causality, strength retention or a safe calorie change.',
    coverage:{resultReviewState:finalized.state,recentFinalizations:finalized.recentFinalizations,
      interpretableDirectMetricResults:finalized.interpretableDirectMetricResults,
      interpretableOtherResults:finalized.interpretableOtherResults,
      limitedOrInconclusiveResults:finalized.limitedOrInconclusiveResults,
      invalidatedResults:finalized.invalidatedResults},
    detailPath:'/lab',userEntered:false,substantive:false,priority:1,
  })
  const canonical=focus.canonicalGoalStatus
  const canonicalText=canonical.state==='canonical_reported'
    ? 'Goal Control reports '+canonical.targetReport+' for the exact current selected goal version; its measurements are not independently revision-locked. '
    :canonical.state==='measurement_disagreement'
      ? 'Recent comparable weigh-ins and Goal Control’s reported current target state disagree; review measurement timing and sources. '
      :canonical.state==='version_mismatch'
        ? 'Goal Control and the selected active goal do not have a matching current identity/version; the reported status is WITHHELD. '
        :canonical.state==='canonical_target_unknown'
          ? 'Goal Control does not have a usable current target observation, so satisfaction and missed deadlines are NOT verified. '
          :canonical.state==='measurement_source_changed'
            ? 'The latest Goal Control weight point changed or no longer matches its private source fingerprint; target and deadline reports are WITHHELD. '
            :canonical.state==='measurement_source_unavailable'
              ? 'The latest Goal Control weight-point recheck is unavailable; target and deadline reports are WITHHELD. '
              :canonical.state==='measurement_conditions_unverified'
                ? 'The latest Goal Control weight observation was recorded under unknown or different measurement conditions; the current selected-goal target and deadline review is WITHHELD. '
              :canonical.state==='projection_source_changed'
                ? 'The weight history used to calculate Goal Control projections changed during retrieval; canonical target and deadline reports are WITHHELD. '
                :canonical.state==='projection_source_unavailable'
                  ? 'The weight history source recheck could not be verified; canonical target and deadline reports are WITHHELD. '
                  :canonical.state==='projection_quality_limited'
                    ? 'Goal Control produced a projection, but its verified history lacks sufficiently recent and distributed weight dates to support forecast interpretation; the target and deadline review is WITHHELD. '
                  :canonical.state==='projection_conditions_unverified'
                    ? 'Goal Control produced a projection that includes weight measurements with unknown or different recorded conditions. The target and deadline review is WITHHELD; weigh-ins are not assumed comparable. '
          :canonical.state==='primary_not_weight'
            ? 'No active weight goal was selected as primary; this screen withholds weight-goal achievement and urgency. '
            : 'Exact selected-goal status or source versions could not be reconciled. '
  push({
    id:'weight_energy.canonical_goal_status',domain:'goals',
    label:'Goal Control current-version report and deadline evidence boundary',
    value:null,unit:null,period,
    text:canonicalText+
      'Deadline attention is descriptive; a past or due deadline with missing observation is NOT proof the goal is unmet. '+
      'The latest-point and projection-series fingerprints are optimistic read-time checks, NOT transaction locks; historical measurements are not atomically versioned with this decision. No plateau, efficacy, clinical urgency or calorie intervention follows.',
    coverage:{
      canonicalGoalReview:canonical.state,
      reportedTargetState:canonical.targetReport,
      deadlineAttention:canonical.deadlineAttention,
      measurementRevision:canonical.measurementRevision,
      projectionRevision:canonical.projectionRevision,
      intervention:canonical.intervention,
    },
    detailPath:'/goals',userEntered:false,substantive:false,priority:0,
  })
  const combined=focus.reconciliation
  const summary=combined.state==='goal_source_conflict'
    ? 'The selected primary weight goal disagrees with the attested active-goal identity or recorded goal evidence. Review Goal Control before interpreting direction. '
    :combined.state==='primary_not_weight'
      ? 'The owner has not selected the active weight goal as primary; weight loss must not be presumed to outrank the declared priority. '
      :combined.state==='performance_attention'
        ? 'At least one qualified matched-exercise series has a possible decline needing review before interpreting energy balance. '
        :combined.state==='experiment_review'
          ? 'Active/upcoming experiments or recent direct-outcome observations require context review; an outcome is not proof that the experiment caused a change. '
          :combined.state==='descriptive_only'
            ? 'Some current source descriptions agree, but this is descriptive alignment ONLY, not proof of goal achievement or intervention safety. '
            : 'Cross-domain goal, experiment and performance reconciliation is not sufficiently verified. '
  push({
    id:'weight_energy.cross_signal_reconciliation',domain:'intelligence',
    label:'Read-only goal, experiment and strength evidence reconciliation',
    value:null,unit:null,period,
    text:summary+
      'The calorie target is a configured plan, not verified energy expenditure. '+
      'Neither a clean strength screen nor an interpretable experiment result proves muscle retention, causality, or calorie adequacy. '+
      'Owner-specific plateau classification and calorie adjustments remain NOT AUTHORIZED.',
    coverage:{reconciliationState:combined.state,
      calorieAdjustment:combined.calorieAdjustment,
      plateauClassification:combined.plateauClassification,
      strengthPreservation:combined.strengthPreservation,
      reviewReasons:combined.reasons.join(', ')},
    detailPath:'/goals',userEntered:false,substantive:false,priority:0,
  })
  const settings = focus.currentSettings
  const settingsExplanation = settings.state === 'consistent_read'
    ? 'A read-time current-settings revision was consistent across two checks. At that moment the owner ' +
      (settings.calorieTargetState === 'configured'
        ? 'had a configured calorie target' : 'had no configured calorie target') +
      ' and ' + settings.relevantExperimentCount +
      ' active or soon-scheduled experiment(s) in the maintenance review window. ' +
      'A configured target is NOT measured energy expenditure, a clinically safe level, or permission to change it. ' +
      'A matched revision fingerprints active goal versions but does not establish weight-goal direction. '
    : settings.state === 'changed_during_read'
      ? 'Current settings changed during the read. Target and experiment state are UNKNOWN until refreshed; do not assume no experiments. '
      : 'The current calorie target, goal revisions and active or soon-scheduled experiment state were not verified by this screen; missing values are UNKNOWN, not absent. '
  const goalMode=settings.weightGoalMode??'not_checked'
  const goalSummary=goalMode==='at_most'
    ? 'One active weight goal has a current-version at-most target; whether that target is unmet is UNKNOWN. '
    :goalMode==='at_least'
      ? 'One active weight goal has a current-version at-least target; whether that target is unmet is UNKNOWN. '
      :goalMode==='range'
        ? 'One active weight goal has a current-version range target; current direction and unmet status are UNKNOWN. '
        :goalMode==='none'
          ? 'The attested read found no active weight goal; no weight-loss objective is presumed. '
          :goalMode==='ambiguous'
            ? 'Multiple or invalid active weight-goal versions prevent a single-goal interpretation. '
            : 'Current weight-goal mode remains UNKNOWN because verification is incomplete. '
  push({
    id:'weight_energy.decision_boundary',
    domain:'intelligence',label:'Plateau, calorie-change and strength-preservation decision boundary',
    value:null,unit:null,period,
    text:'This Ask Health screen has NOT established whether a weight goal is truly met, target suitability, or preserved strength-performance outcomes. '+
      settingsExplanation + goalSummary + prioritySummary + timingText + outcomeSummary + finalizedText + canonicalText + summary +
      'Therefore it CANNOT classify an owner-specific weight-loss plateau, certify that strength is preserved, or recommend any calorie cut. '+
      'Logged training session dates are activity records, not evidence of stable lifting performance. Recorded hunger/energy/soreness ratings are context, not proof of adequate recovery. '+
      'Carbohydrate/sodium shifts, fluid balance, bowel changes, weigh-in conditions and supplements may confound short-term scale readings; none is established as this owner’s cause here. '+
      'A decision requires the separate current-versions Goal Control/maintenance safety review or an owner-approved Personal Lab calibration.',
    coverage:{
      recordedTrainingSessionDays:focus.trainingSessionDays,
      recordedWellnessCheckinDays:focus.wellnessCheckinDays,
      goalVerification:focus.goalVerification,
      decisionVerification:focus.decisionVerification,
      currentSettingsCheck:settings.state,
      currentWeightGoalMode:goalMode,
      recordedWeightBoundaryRelation:goalObs.state,
      ownerPrimaryWeightGoalPriority:priority.state,
      calorieTargetState:settings.calorieTargetState,
      relevantExperimentCount:settings.relevantExperimentCount,
      experimentTimingState:timing.state,
      experimentOutcomeRelevance:outcome.state,
      recentFinalizedResultReview:finalized.state,
      crossSignalReconciliation:combined.state,
      currentSelectedCanonicalGoal:canonical.state,
      currentCanonicalDeadline:canonical.deadlineAttention,
      calorieChangeAuthorization:combined.calorieAdjustment,
      strengthPreservation:focus.strengthPreservation,
    },
    detailPath:'/goals',userEntered:false,substantive:false,priority:0,
  })
}

function matchedBodyKeys(question: string): string[] {
  return BODY_TERMS.filter((item) => item.pattern.test(question)).map((item) => item.key)
}

function matchedMetric(key: string, keys: ReadonlySet<string>): boolean {
  if (keys.has(key)) {
    return true
  }
  return key.includes('waist') && keys.has('waist')
}

function bodyMetricLabel(key: string): string {
  if (key === 'body_fat_percentage') {
    return 'Body fat percentage'
  }
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function addNutrition(input: AskHealthPacketInput, push: (item: PushItem) => void, limitations: AskLimitation[]) {
  const nutrition = input.overview?.nutrition
  if (!nutrition) return
  const integrity = input.nutritionIntegrity
  const verified = integrity?.status === 'available' ? integrity.verifiedCompleteDays : null
  const verificationText = verified == null
    ? 'Whole-day completeness verification is unavailable; logged meals cannot establish full-day intake.'
    : `${verified} logged day(s) match current owner confirmation and source/revision evidence for full-day analysis. Other logged days are not known to be complete.`
  push({
    id: 'nutrition.coverage',
    domain: 'nutrition',
    label: 'Nutrition logging and completeness',
    value: nutrition.coveragePct,
    unit: 'percent',
    text: `Nutrition was logged on ${nutrition.loggedDays} of ${nutrition.calendarDays} days. Averages are amounts recorded on logged days, not necessarily all intake. ${verificationText}`,
    coverage: {
      loggedDays: nutrition.loggedDays,
      calendarDays: nutrition.calendarDays,
      coveragePct: nutrition.coveragePct,
      ...(verified == null ? { completenessCheck: 'unavailable' } : { verifiedCompleteDays: verified, completenessCheck: 'available' }),
    },
    detailPath: '/nutrition',
    userEntered: false,
    substantive: nutrition.loggedDays > 0,
    priority: 1,
  })
  if (nutrition.status === 'insufficient_data') {
    limitations.push({
      code: 'nutrition_low_coverage',
      text: 'No nutrition days were logged in this range.',
      evidenceId: 'nutrition.coverage',
    })
  }
  addNutrient(push, 'nutrition.calories', 'Average recorded calories on logged days', nutrition.calories.averageOnLoggedDays, 'kcal', nutrition.calories.observedDays)
  const target = nutrition.calories.targetContext
  if (target) {
    const verifiedTargetDays = integrity?.status === 'available' ? integrity.verifiedTargetDays : 0
    const verifiedDifference = integrity?.verifiedAverageTargetDifference
    const eligible = verifiedTargetDays >= MIN_VERIFIED_NUTRITION_TARGET_DAYS && verifiedDifference != null
    if (eligible) {
      const difference = verifiedDifference
      const roundedDifference = Math.round(Math.abs(difference))
      const relation = difference < 0 ? `${roundedDifference} kcal/day below` : difference > 0 ? `${roundedDifference} kcal/day above` : 'at'
      push({
        id: 'nutrition.calories_vs_target',
        domain: 'nutrition',
        label: 'Owner-confirmed complete-day logged calories vs configured target',
        value: difference,
        unit: 'kcal/day',
        text: `Across ${verifiedTargetDays} owner-confirmed complete, source-reliable days with configured targets, recorded calories averaged ${relation} the configured calorie targets. No missing or unconfirmed days contribute. A target is not measured expenditure and this difference does not prove a physiological energy deficit or justify a calorie adjustment.`,
        coverage: { verifiedTargetDays, minimumVerifiedTargetDays: MIN_VERIFIED_NUTRITION_TARGET_DAYS },
        detailPath: '/nutrition',
        userEntered: false,
        substantive: true,
        priority: 1,
      })
    } else {
      const reason = integrity?.status !== 'available'
        ? 'Whole-day confirmation cannot currently be verified.'
        : `Only ${verifiedTargetDays} of the ${MIN_VERIFIED_NUTRITION_TARGET_DAYS} minimum owner-confirmed, source-reliable days have both logged calories and configured targets.`
      push({
        id: 'nutrition.calories_target_ineligible',
        domain: 'nutrition',
        label: 'Calorie-target comparison withheld',
        value: null,
        unit: null,
        text: `${target.daysWithTarget} logged day(s) had configured calorie targets, but that does not prove complete intake. ${reason} Do not calculate an energy deficit, trend or calorie-adjustment recommendation from these records.`,
        coverage: {
          loggedDaysWithTarget: target.daysWithTarget,
          ...(integrity?.status === 'available' ? { verifiedTargetDays } : { completenessCheck: 'unavailable' }),
          minimumVerifiedTargetDays: MIN_VERIFIED_NUTRITION_TARGET_DAYS,
        },
        detailPath: '/nutrition',
        userEntered: false,
        substantive: false,
        priority: 1,
      })
      limitations.push({
        code: 'nutrition_target_unverified',
        text: `Calorie-target inference withheld: ${reason} Accurate logged meals do not establish total daily intake.`,
        evidenceId: 'nutrition.calories_target_ineligible',
      })
    }
  }
  addNutrient(push, 'nutrition.protein', 'Average recorded protein on logged days', nutrition.protein.averageOnObservedDays, 'g', nutrition.protein.observedDays)
  addNutrient(push, 'nutrition.carbs', 'Average recorded carbs on logged days', nutrition.carbs.averageOnObservedDays, 'g', nutrition.carbs.observedDays)
  addNutrient(push, 'nutrition.fat', 'Average recorded fat on logged days', nutrition.fat.averageOnObservedDays, 'g', nutrition.fat.observedDays)
}

function addNutrient(
  push: (item: PushItem) => void,
  id: string,
  label: string,
  value: number | null,
  unit: string,
  observedDays: number,
) {
  if (value == null) {
    return
  }
  push({
    id,
    domain: 'nutrition',
    label,
    value,
    unit,
    text: 'Average amount recorded on logged days, not proven full-day consumption or nutrient adequacy. Missing or unlogged items are not counted as zero intake.',
    coverage: { observedDays },
    detailPath: '/nutrition',
    userEntered: false,
    substantive: true,
    priority: 2,
  })
}

function addActivity(input: AskHealthPacketInput, push: (item: PushItem) => void) {
  const activity = input.activity
  if (!activity) {
    return
  }
  const steps = activity.steps.summary
  push({
    id: 'activity.steps',
    domain: 'activity',
    label: 'Completed-day step average',
    value: steps.status === 'available' ? steps.value : null,
    unit: 'steps',
    text: 'Completed-day average. The current provisional day is separate.',
    coverage: {
      observedDays: steps.observedDays,
      completedCalendarDays: steps.completedCalendarDays,
      calendarDays: steps.calendarDays,
    },
    detailPath: '/progress/activity',
    userEntered: false,
    substantive: steps.observedDays > 0,
    priority: 2,
  })
  const energy = activity.activeEnergy.summary
  if (energy.status === 'available') {
    push({
      id: 'activity.active_energy',
      domain: 'activity',
      label: 'Completed-day active energy average',
      value: energy.value,
      unit: 'kcal',
      text: 'Completed-day average.',
      coverage: { observedDays: energy.observedDays },
      detailPath: '/progress/activity',
      userEntered: false,
      substantive: true,
      priority: 3,
    })
  }
  const exercise = activity.exercise.summary
  if (exercise.status === 'available') {
    push({
      id: 'activity.exercise_minutes',
      domain: 'activity',
      label: 'Completed-day exercise minute average',
      value: exercise.value,
      unit: 'min',
      text: 'Completed-day average.',
      coverage: { observedDays: exercise.observedDays },
      detailPath: '/progress/activity',
      userEntered: false,
      substantive: true,
      priority: 3,
    })
  }
  const resting = activity.restingHeartRate.summary
  if (resting.status === 'available') {
    push({
      id: 'activity.resting_heart_rate',
      domain: 'activity',
      label: 'Resting heart rate median',
      value: resting.value,
      unit: 'bpm',
      text: 'Completed-day resting heart rate. This is not an overnight heart-rate sample.',
      coverage: { observedDays: resting.observedDays },
      detailPath: '/progress/activity',
      userEntered: false,
      substantive: true,
      priority: 3,
    })
  }
  if (activity.provisionalDay && activity.provisionalDay.date <= input.asOf) {
    push({
      id: 'activity.today',
      domain: 'activity',
      label: 'Today so far',
      value: activity.provisionalDay.stepsCount,
      unit: 'steps',
      text: 'Provisional activity for the current day. It is not part of the completed-day average.',
      coverage: { soFar: 1, date: activity.provisionalDay.date },
      detailPath: '/progress/activity',
      userEntered: false,
      substantive: true,
      priority: 3,
    })
  }
}

function addSleep(input: AskHealthPacketInput, push: (item: PushItem) => void, limitations: AskLimitation[]) {
  const sleep = input.sleep
  if (!sleep) {
    return
  }
  const average = sleep.averageTotalSleepMinutes
  push({
    id: 'sleep.duration',
    domain: 'sleep',
    label: 'Average sleep duration',
    value: average.status === 'available' ? average.value : null,
    unit: 'minutes',
    text: 'Average of analysis-eligible nights. Partial nights are excluded.',
    coverage: {
      analysisEligibleNights: sleep.analysisEligibleNights,
      calendarNights: sleep.calendarNights,
    },
    detailPath: '/progress/sleep',
    userEntered: false,
    substantive: sleep.analysisEligibleNights > 0,
    priority: 2,
  })
  if (average.status === 'insufficient_data') {
    limitations.push({
      code: 'sleep_sparse',
      text: 'Not enough complete Sleep nights are available for an average.',
      evidenceId: 'sleep.duration',
    })
  }
  const baseline = sleep.personalBaseline
  if (baseline && baseline.metricKey === 'sleep_duration') {
    push({
      id: 'sleep.baseline',
      domain: 'sleep',
      label: 'Personal sleep baseline',
      value: baseline.deviation,
      unit: 'minutes',
      text: `Baseline state ${baseline.state}. Median ${baseline.baselineMedian ?? 'unavailable'} minutes from ${baseline.baselineObservationCount} prior same-source nights.`,
      coverage: {
        state: baseline.state,
        observations: baseline.baselineObservationCount,
        current: baseline.currentValue,
        median: baseline.baselineMedian,
      },
      detailPath: baseline.targetSleepDate ? `/progress/sleep/${baseline.targetSleepDate}` : '/progress/sleep',
      userEntered: false,
      substantive: baseline.state === 'available' || baseline.baselineObservationCount > 0,
      priority: 2,
    })
  }
  const comparison = sleep.stageAnalytics.recentComparison
  const comparable = comparison.state === 'available'
  push({
    id: 'sleep.stages',
    domain: 'sleep',
    label: 'Sleep stage comparison',
    value: comparison.state,
    unit: null,
    text: comparable
      ? 'Recent stage comparison is available from stage-qualified nights.'
      : `Recent stage comparison is ${comparison.state}. Health is not treating the windows as directly comparable.`,
    coverage: {
      state: comparison.state,
      stageEligibleNights: sleep.stageEligibleNights,
      ...(comparable
        ? {
            remPercentagePoints: comparison.remPercentagePoints,
            corePercentagePoints: comparison.corePercentagePoints,
            deepPercentagePoints: comparison.deepPercentagePoints,
          }
        : {}),
    },
    detailPath: '/progress/sleep',
    userEntered: false,
    substantive: sleep.stageEligibleNights > 0,
    priority: 3,
  })
  const source = sleep.sourceAttribution
  push({
    id: 'sleep.source',
    domain: 'sleep',
    label: 'Sleep source continuity',
    value: source.comparability,
    unit: null,
    text: source.continuityLabel,
    coverage: {
      comparability: source.comparability,
      canonicalNights: source.canonicalNights,
      transitions: source.recentTransitions.length,
    },
    detailPath: '/progress/sleep',
    userEntered: false,
    substantive: source.canonicalNights > 0,
    priority: 2,
  })
}


/** PIQ-3.3: bounded exercise-specific canonical working set evidence.
 * No inferred training progression from workout counts and no cross-exercise
 * load comparisons. Each appearance uses the same high-confidence strength
 * estimator as Progress; missing comparable sets are not zero performance.
 */
function addFocusedTraining(input: AskHealthPacketInput, push: (item: PushItem) => void): void {
  const focus = input.focusedTraining
  if (!focus) return
  const detailPath = '/progress/strength/' + focus.exerciseId
  const requested = focus.requestedDate
  const window = focus.requestedWindow
  const scopeNote = focus.dateSelectionIssue
    ? 'The historical date or period in the question is ambiguous or unsupported. No recent working sets were substituted; ask for one YYYY-MM-DD or a supported calendar week/month.'
    : requested && !requested.inSelectedRange
      ? 'Requested day ' + requested.date + ' is outside the selected Health evidence range/as-of; no recent sets were substituted.'
      : window && !window.inSelectedRange
        ? 'Requested ' + window.label + ' (' + window.start + ' through ' + window.end +
          ') extends outside the selected evidence range/as-of; no partial sets were substituted. Select a wider Health range.'
        : requested
          ? 'Only high-confidence comparable working sets dated ' + requested.date +
            ' are eligible. No appearance means no qualifying recorded set, not zero strength.'
          : window
            ? 'Only comparable working sets in ' + window.label + ' (' +
              window.start + ' through ' + window.end + ') are eligible; ' +
              focus.eligibleAppearances + ' qualifying session(s). The latest six selected appearances are samples; missing sessions are unknown.'
            : null
  push({
    id: 'training.focus.coverage.' + focus.exerciseId,
    domain: 'training',
    label: focus.exerciseName + ' comparable strength coverage',
    value: focus.eligibleAppearances,
    unit: 'sessions',
    text: scopeNote ?? (focus.eligibleAppearances === 0
      ? 'No eligible high-confidence loaded working sets for this exercise in the selected range; missing comparable data is not zero performance.'
      : 'High-confidence comparable working-set appearances in the selected range. Up to six most recent appearances are shown. Estimates are from logged sets, not directly measured maximum lifts.'),
    coverage: {
      eligibleAppearances: focus.eligibleAppearances,
      shownAppearances: focus.appearances.length,
      ...(requested ? { requestedDate: requested.date, requestedDateScope: requested.inSelectedRange ? 'in_range' : 'out_of_range' } : {}),
      ...(window ? {
        requestedWindowStart: window.start, requestedWindowEnd: window.end,
        requestedWindowDays: window.calendarDays,
        requestedWindowScope: window.inSelectedRange ? 'in_range' : 'out_of_range',
      } : {}),
    },
    period: requested && requested.inSelectedRange
      ? { start: requested.date, end: requested.date }
      : window && window.inSelectedRange ? { start: window.start, end: window.end } : undefined,
    detailPath,
    userEntered: false,
    substantive: focus.eligibleAppearances > 0,
    priority: 1,
  })
  for (const item of focus.appearances) {
    push({
      id: 'training.focus.set.' + item.setId,
      domain: 'training',
      label: focus.exerciseName + ' working set on ' + item.date,
      value: item.estimated1RmKg,
      unit: 'kg estimated 1RM',
      text: item.date + ': representative high-confidence working set for ' + focus.exerciseName +
        ': ' + item.weightKg + ' kg × ' + item.reps + ' reps, estimated 1RM ' +
        item.estimated1RmKg + ' kg (Epley; not directly tested).',
      coverage: { reps: item.reps, recordedLoadKg: item.weightKg },
      detailPath,
      userEntered: false,
      substantive: true,
      provenance: 'derived_from_owner_logged_working_set',
      evidenceDates: [item.date],
      period: { start: item.date, end: item.date },
      priority: 1,
    })
  }
}

/** Only owner-confirmed reliable fiber can represent a complete day; water
 * is logged events and bowel zero requires an explicit owner report. Missing
 * days are never interpreted as zero, and nothing here infers causation.
 */
function addFocusedDigestive(input: AskHealthPacketInput, push: (item: PushItem) => void, guard: DigestivePacketGuard): void {
  const focus = input.focusedDigestive
  if (!focus) return
  const metrics = [
    { key: 'fiber', metric: focus.fiber, unit: 'g', path: '/nutrition' },
    { key: 'hydration', metric: focus.hydration, unit: 'ml', path: '/today' },
    { key: 'bowel', metric: focus.bowel, unit: 'movements', path: '/today' },
  ] as const

  const topics = digestiveQuestionTopics(input.question)
  if (focus.digestiveConsistencyIssue && (input.contextMode === 'deep' ||
      topics.bowel && (topics.fiber || topics.hydration))) {
    push({
      id: 'digestive.source_consistency.unavailable',
      domain: 'intelligence',
      label: 'Digestive paired-source consistency unverified',
      value: null,unit:null,
      period:{start:focus.bowelWindow?.scope.start ?? focus.start,
        end:focus.bowelWindow?.scope.end ?? focus.end},
      text: 'Verified fiber, logged water or dated context could not be matched across the request reads. ' +
        'Any cross-domain digestive interpretation and logged fiber/water examples are withheld; try a fresh question after records settle. ' +
        'This does not indicate that an unlogged day is zero or establish any personal relationship.',
      coverage:null, detailPath:'/today',userEntered:false,substantive:false,priority:0,
    })
  }
  for (const { key, metric, unit, path } of metrics) {
    // Source aggregates may have changed after the first intelligence query.
    // Bowel totals are separately reconciled, so preserve bowel-only evidence.
    if (guard.crossSourceConflict && key !== 'bowel') continue
    if (guard.bowelIdentityConflict && key === 'bowel') continue
    // Default Personal/Smart is minimum-necessary context; Deep Dive
    // deliberately includes all bounded cross-domain signals on opt-in.
    if (input.contextMode !== 'deep' && !topics[key]) continue
    const isFiber = key === 'fiber'
    const text = isFiber
      ? metric.verificationStatus !== 'available'
        ? 'Whole-day fiber verification unavailable; recorded food does not establish total fiber intake.'
        : metric.recordedDays + ' day(s) with some recorded fiber, of which ' +
          (metric.verifiedDays ?? 0) + ' are owner-confirmed reliable complete days. Unverified days are unknown, not zero.'
      : key === 'hydration'
        ? metric.recordedDays + ' day(s) with logged water. Event totals are not proof of total daily fluid intake; missing days are unknown.'
        : metric.recordedDays + ' day(s) with explicit bowel observations. Only an explicit no-bowel entry means zero; absent logs mean unknown.'

    const requested = focus.requestedDate
    const window = focus.requestedWindow
    const summary = metric.windowSummary
    const rounded = (amount: number) => Math.round(amount * 10) / 10
    const windowNote = !window ? '' : !window.inSelectedRange
      ? ' Requested ' + window.label + ' (' + window.start + ' through ' + window.end +
        ') is not entirely within the selected ' + focus.start + '–' + focus.end +
        ' evidence window and as-of date. No partial totals or recent substitutes were used; select a wider history range.'
      : summary == null ? ' Window aggregation unavailable.'
      : ' For ' + window.label + ' (' + window.start + ' through ' + window.end + '), ' +
        (key === 'fiber'
          ? summary.daysWithObservations + ' of ' + summary.calendarDays +
            ' dates have owner-verified complete and source-reliable fiber logs; ' +
            (summary.summedRecordedValue == null ? 'no reliable whole-day fiber total can be calculated.' :
              'the recorded total on those verified dates is ' + rounded(summary.summedRecordedValue) +
              ' g, averaging ' + rounded(summary.meanPerObservedDay!) +
              ' g per verified date (not an average across all calendar days).')
          : key === 'hydration'
            ? summary.daysWithObservations + ' of ' + summary.calendarDays + ' dates contain water events; ' +
              (summary.summedRecordedValue == null ? 'no event sum can be calculated.' :
                'those events sum to ' + rounded(summary.summedRecordedValue) + ' ml, averaging ' +
                rounded(summary.meanPerObservedDay!) + ' ml of recorded events per logged date, not daily total fluid consumption.')
            : summary.daysWithObservations + ' of ' + summary.calendarDays +
              ' dates have explicit bowel observations (including owner-entered zero days); ' +
              (summary.summedRecordedValue == null ? 'no recorded count can be calculated.' :
                'those days contain ' + rounded(summary.summedRecordedValue) +
                ' recorded movements, averaging ' + rounded(summary.meanPerObservedDay!) +
                ' movements per observed date, not per calendar day.')) +
        ' Unobserved or unverified dates are unknown, not zero.' +
        (summary.provisionalObservedDays > 0 ? ' Today includes provisional events and is not a completed day.' : '') +
        ' At most three dated examples follow; the aggregate uses all qualifying dates in this window.'
    const requestedDayNote = focus.dateSelectionIssue
      ? ' The question names a calendar date or period that cannot safely be resolved. No recent-day observations were substituted. Ask using a single YYYY-MM-DD or a supported calendar window.'
      : windowNote || (!requested ? '' : !requested.inSelectedRange
        ? ' Requested ' + requested.date + ' is outside the selected ' + focus.start +
          '–' + focus.end + ' evidence window or after the as-of date; Health did not retrieve that day.'
        : metric.observations.length === 0
          ? ' No eligible ' + key + ' observation for requested ' + requested.date +
            ' was found. An absent or unverified observation is unknown, not zero.'
          : ' Showing only the requested day ' + requested.date +
            ', not substituting the latest three days.')
    push({
      id: 'digestive.focus.coverage.' + key,
      domain: isFiber ? 'nutrition' : key,
      label: key + ' source coverage',
      value: metric.recordedDays,
      unit: 'logged days',
      text: text + requestedDayNote,
      coverage: {
        recordedDays: metric.recordedDays,
        ...(requested ? {
          requestedDate: requested.date,
          requestedDateScope: requested.inSelectedRange ? 'in_range' : 'out_of_range',
        } : {}),
        ...(window ? {
          requestedWindowStart: window.start,
          requestedWindowEnd: window.end,
          requestedWindowDays: window.calendarDays,
          requestedWindowScope: window.inSelectedRange ? 'in_range' : 'out_of_range',
          ...(summary ? {
            observedDaysInWindow: summary.daysWithObservations,
            unknownOrUnverifiedDaysInWindow: summary.calendarDays - summary.daysWithObservations,
            recordedWindowSum: summary.summedRecordedValue,
            meanPerObservedDay: summary.meanPerObservedDay,
            provisionalObservedDays: summary.provisionalObservedDays,
          } : {}),
        } : {}),
        ...(isFiber ? {
          verifiedDays: metric.verifiedDays ?? 0,
          unverifiedDays: metric.recordedDays - (metric.verifiedDays ?? 0),
          verificationStatus: metric.verificationStatus ?? 'unavailable',
        } : {}),
        selectedDays: metric.observations.length,
      },
      detailPath: path,
      userEntered: false,
      substantive: summary ? summary.daysWithObservations > 0 : metric.recordedDays > 0,
      priority: 1,
    })

    for (const day of metric.observations) {
      const line = isFiber
        ? day.date + ': ' + day.value + ' g recorded fiber on an owner-confirmed complete day with reliable source entries (estimated intake).'
        : key === 'hydration'
          ? day.date + ': ' + day.value + ' ml water explicitly logged' +
            (day.provisional ? ' (today provisional)' : '') + '; actual total fluids may be higher.'
          : day.date + ': ' + day.value + (day.value === 0 ? ' explicitly reported no bowel movement' : ' bowel movement(s) recorded') +
            (day.provisional ? ' (today provisional)' : '') +
            (day.value > 0 && day.bristolTypes !== undefined
              ? '; owner-recorded Bristol stool types: ' +
                (day.bristolTypes.length > 0 ? day.bristolTypes.join(', ') : 'unavailable') +
                ' (' + day.bristolTypes.length + ' of ' + day.sourceIds.length +
                ' selected event records; unlisted types are unknown)'
              : '') +
            '; frequency and stool type alone do not establish a cause or diagnosis.'
      push({
        id: 'digestive.focus.' + key + '.' + day.date,
        domain: isFiber ? 'nutrition' : key,
        label: key + ' on ' + day.date,
        value: day.value,
        unit,
        text: line,
        coverage: { sourceCount: day.sourceIds.length },
        detailPath: path,
        userEntered: true,
        substantive: true,
        evidenceDates: [day.date],
        provenance: isFiber ? 'owner_confirmed_reliable' : 'owner_logged',
        priority: 1,
      })
    }
  }

  // PIQ-4.1: precise, sample-scoped derived observation only for questions
  // explicitly connecting bowel symptoms with nutrition/water. Never imply
  // a whole-window association from independently truncated 3-day examples.
  if (!guard.crossSourceConflict && !guard.bowelIdentityConflict &&
      focus.bowelWindow?.status !== 'unavailable' &&
      input.contextMode !== 'general_only' && topics.bowel && (topics.fiber || topics.hydration)) {
    const screen = deriveDigestiveSampleScreen(focus)
    if (screen) {
      const hardText = screen.hardTypedEvents > 0
        ? screen.hardTypedEvents + ' of ' + screen.typedEvents +
          ' selected event records with saved Bristol type are type 1–2 (hard-stool range).'
        : 'None of the ' + screen.typedEvents +
          ' selected event records with saved Bristol type are type 1–2; this does not exclude other unobserved hard stools.'
      push({
        id: 'digestive.screen.sampled_bristol',
        domain: 'bowel',
        label: 'Bristol-type sample screen (not a diagnosis)',
        value: screen.hardTypedEvents,
        unit: 'typed events in hard-stool range',
        text: 'On at most three selected dated bowel-observation days, ' + hardText +
          ' Other selected event records without a type: ' + screen.untypedEventRecords +
          '; explicit no-movement day records: ' + screen.explicitZeroDays + '.' +
          ' In the independently capped displayed examples, same-date logged water appears on ' +
          screen.daysAlsoShowingLoggedWater + ' bowel day(s) and verified whole-day fiber on ' +
          screen.daysAlsoShowingVerifiedFiber + ' bowel day(s).' +
          (screen.provisionalBowelDays > 0 ? ' One or more selected bowel days are still provisional.' : '') +
          ' These examples are not a complete stool history or enough to prove a personal water/fiber relationship;' +
          ' missing logs are unknown, and logged water is not total fluid consumption.' +
          ' A hard-stool report is an observation, not proof of dehydration, a nutrition deficiency,' +
          ' a medication effect, or a clinical diagnosis.',
        coverage: {
          sampledBowelDays: screen.sampledBowelDays,
          typedEvents: screen.typedEvents,
          hardTypedEvents: screen.hardTypedEvents,
          untypedEventRecords: screen.untypedEventRecords,
          explicitZeroDays: screen.explicitZeroDays,
          coincidentWaterExampleDays: screen.daysAlsoShowingLoggedWater,
          coincidentVerifiedFiberExampleDays: screen.daysAlsoShowingVerifiedFiber,
          provisionalBowelDays: screen.provisionalBowelDays,
        },
        detailPath: '/today',
        evidenceDates: screen.typedEvidenceDates,
        provenance: 'derived_from_selected_owner_logged_events',
        userEntered: false,
        substantive: true,
        priority: 1,
      })
    }
  }
  // Whole-window stool-type summary is independently reconciled to the saved
  // bowel-event count for every recorded day. It never represents full-day
  // stool completeness or a bowel/fiber/hydration correlation.
  if ((topics.bowel || input.contextMode === 'deep') && input.contextMode !== 'general_only' &&
      focus.bowelWindow) {
    const full = focus.bowelWindow
    if (full.status === 'available') {
      push({
        id: 'digestive.window.bristol',
        domain: 'bowel',
        label: 'Recorded Bristol pattern in bounded date window',
        // A window with NO saved status has no observed outcome at all.
        // Explicit owner-entered zero days remain distinct and may report zero.
        value: full.observedDays > 0 ? full.hardTypedEvents : null,
        unit: full.observedDays > 0 ? 'recorded hard Bristol 1–2 events' : null,
        period: { start: full.scope.start, end: full.scope.end },
        text: 'For ' + full.scope.start + ' through ' + full.scope.end + ' (' +
          full.scope.calendarDays + ' calendar days): bowel activity explicitly logged on ' +
          full.observedDays + ' day(s); ' + full.movementEvents + ' saved bowel movement event(s),' +
          ' including ' + full.typedEvents + ' with a valid Bristol stool type.' +
          ' Of those typed events, ' + full.hardTypedEvents + ' were Bristol 1–2 (hard-stool range); ' +
          full.untypedEvents + ' movement event(s) lacked an eligible type.' +
          ' There were ' + full.explicitNoMovementDays + ' separately recorded no-movement day(s); ' +
          full.unobservedDays + ' calendar day(s) had no bowel observation and are UNKNOWN, not zero.' +
          (full.observedDays === 0 ? ' NO bowel status is saved in this interval: neither a movement count nor a hard-stool outcome is known.' : '') +
          (full.provisionalDays ? ' Today is provisional; it is not a complete observation day.' : '') +
          ' This describes only recorded events, not all bowel movements; no diagnosis or personal water/fiber correlation can be inferred.' +
          ' Logged water does not establish total fluid consumption.',
        coverage: {
          observedDaysInWindow: full.observedDays,
          calendarDays: full.scope.calendarDays,
          recordedMovements: full.movementEvents,
          typedEvents: full.typedEvents,
          hardTypedEvents: full.hardTypedEvents,
          untypedEvents: full.untypedEvents,
          explicitNoMovementDays: full.explicitNoMovementDays,
          unobservedDays: full.unobservedDays,
          provisionalDays: full.provisionalDays,
          ...(focus.requestedDate ? {
            requestedDate: focus.requestedDate.date,
            requestedDateScope: 'in_range',
            selectedDays: full.observedDays,
          } : {}),
          ...(focus.requestedWindow ? {
            requestedWindowStart: full.scope.start,
            requestedWindowEnd: full.scope.end,
            requestedWindowScope: 'in_range',
          } : {}),
        },
        detailPath: '/today',
        evidenceDates: full.observedDates,
        provenance: 'canonical_bowel_events_reconciled',
        userEntered: false,
        substantive: full.observedDays > 0,
        priority: 1,
      })
    } else {
      push({
        id: 'digestive.window.unavailable',
        domain: 'bowel',
        label: 'Bristol window verification unavailable',
        value: null, unit: null,
        period: { start: full.scope.start, end: full.scope.end },
        text: full.reason === 'range_too_large'
          ? 'Requested stool-history window spans ' + full.scope.calendarDays +
            ' days, exceeding the maximum 90-day audited window. Select a shorter range; no silently clipped totals were calculated.'
          : 'Full-window Bristol summary withheld: the saved event counts could not be reconciled or safely read. Partial values must not be used as complete history.',
        coverage: { calendarDays: full.scope.calendarDays },
        detailPath: '/today', userEntered: false, substantive: false, priority: 1,
      })
    }
  }

  // PIQ-4.1: coverage only, not a personal correlation. Typed bowel events
  // align to same-day, 1-day or 2-day *earlier* exposure observations. The
  // prompts and AI are forbidden from turning paired counts into causality.
  const pairing = focus.digestivePairing
  if (pairing && !guard.crossSourceConflict && !guard.bowelIdentityConflict &&
      input.contextMode !== 'general_only' &&
      (input.contextMode === 'deep' || topics.bowel && (topics.fiber || topics.hydration))) {
    const showFiber = input.contextMode === 'deep' || topics.fiber
    const showWater = input.contextMode === 'deep' || topics.hydration
    const rows = [
      ...(showFiber ? [{ key: 'fiber', label: 'verified whole-day fiber',
        entries: pairing.fiber, status: pairing.fiberVerification }] : []),
      ...(showWater ? [{ key: 'water', label: 'logged water events',
        entries: pairing.loggedWater, status: 'logged-only' }] : []),
    ]
    for (const row of rows) {
      const line = row.entries.map(lag => lag.lagDays + '-day lag: ' +
        lag.pairedDays + ' aligned date pair(s) in ' + lag.pairedCalendarWeeks +
        ' calendar week(s)').join('; ')
      const candidates = row.entries.filter(lag => lag.maturity === 'candidate_for_review')
      const contextual = row.entries.filter(lag => lag.contextFlaggedPairDays > 0 ||
        lag.coLoggedWaterVaries && row.key === 'fiber')
      const missingContinuity = row.entries.some(lag => lag.maturity === 'incomplete_bowel_diary')
      const insufficientSeparatedWindows = row.entries.some(lag =>
        lag.maturity === 'insufficient_separated_windows')
      const lackingVariation = row.entries.filter(lag =>
        lag.pairedDays > 0 && (!lag.stoolHardnessVaries || !lag.exposureVaries))
      push({
        id: 'digestive.pairing.coverage.' + row.key,
        domain: row.key === 'fiber' ? 'nutrition' : 'hydration',
        label: row.label + ' and typed Bristol matching-date coverage',
        value: null,
        unit: null,
        period: { start: pairing.scope.start, end: pairing.scope.end },
        text: 'Pre-registered comparisons: ' + line + '. Starting from ' +
          pairing.recordedBowelDays + ' recorded movement day(s), ' +
          pairing.fullyTypedBowelDays + ' past day(s) have complete saved Bristol types; ' +
          pairing.partiallyTypedBowelDays + ' past day(s) have incomplete types and ' +
          pairing.provisionalBowelDaysExcluded + ' current-day bowel entries are provisional and excluded.' +
          ' Exposure date precedes or matches each bowel-observation date (0, 1 or 2 days).' +
          (row.key === 'water'
            ? ' Water event logs are NOT total daily fluid intake, so these pairs cannot qualify for a personal hydration/stool correlation.'
            : row.status === 'unavailable'
              ? ' Fiber whole-day verification is unavailable: no personal fiber relationship may be claimed.'
              : candidates.length
                ? ' A bounded, varying, quality-qualified date series merits a LATER controlled review, NOT for a claim of association.'
                : ' No lag satisfies all the initial variation, coverage and context checks; NOT for a claim of association.') +
          (contextual.length ? ' Owner-entered daily context tags or co-changing logged-water values require alternative-explanation review; neither establishes a cause.' : '') +
          (lackingVariation.length ? ' At least one lag lacks variation across dates in stool hardness or the recorded exposure; a fixed series cannot support a change relationship.' : '') +
          (missingContinuity ? ' A stretch of more than 7 days without any saved bowel status interrupts recording continuity; unknown dates are NOT confirmed no-movement days.' : '') +
          (insufficientSeparatedWindows ? ' There are too few separated, non-overlapping 14-day bins with at least 4 qualified pairs each for a later review candidate.' : '') +
          ' This coverage screen does NOT verify complete daily bowel tracking; absence of a saved event cannot be interpreted as no movement.' +
          ' Absence of owner-entered context tags does NOT prove there were no illness, medication, travel, diet or routine changes.' +
          ' The same logged day can appear in more than one lag; those lags are NOT independent replications.' +
          ' Neither matching dates nor any displayed pair count is a correlation, cause, diagnosis or rationale to change calorie intake.' +
          ' Missing records are unknown, not zero.',
        coverage: {
          qualifiedBowelDays: pairing.fullyTypedBowelDays,
          selectedRangeCalendarDays: pairing.selectedRangeCalendarDays,
          savedBowelStatusDays: pairing.selectedRangeObservedStatusDays,
          unknownBowelStatusDays: pairing.selectedRangeUnknownStatusDays,
          longestUnknownActiveStreakDays: row.entries[0]?.longestUnknownBowelStreakDays ?? 0,
          minimumSeparatedReviewWindows: 2,
          minimumPairsPerSeparatedWindow: 4,
          minimumCalendarDaysPerSeparatedWindow: 14,
          sameDayQualifiedReviewWindows: row.entries[0]?.qualifiedReviewWindows ?? 0,
          nextDayQualifiedReviewWindows: row.entries[1]?.qualifiedReviewWindows ?? 0,
          twoDayQualifiedReviewWindows: row.entries[2]?.qualifiedReviewWindows ?? 0,
          provisionalBowelDaysExcluded: pairing.provisionalBowelDaysExcluded,
          minimumPairsForReview: 12,
          minimumWeeksForReview: 4,
          sameDayPairs: row.entries[0]?.pairedDays ?? 0,
          nextDayPairs: row.entries[1]?.pairedDays ?? 0,
          twoDayPairs: row.entries[2]?.pairedDays ?? 0,
          contextFlaggedSameDayPairs: row.entries[0]?.contextFlaggedPairDays ?? 0,
          contextFlaggedNextDayPairs: row.entries[1]?.contextFlaggedPairDays ?? 0,
          contextFlaggedTwoDayPairs: row.entries[2]?.contextFlaggedPairDays ?? 0,
          readyForFurtherReviewLagCount: candidates.length,
          ...(focus.requestedWindow ? {
            requestedWindowStart: pairing.scope.start,
            requestedWindowEnd: pairing.scope.end,
            requestedWindowScope: 'in_range',
          } : {}),
          ...(focus.requestedDate ? {
            requestedDate: focus.requestedDate.date,
            requestedDateScope: 'in_range',
            selectedDays: pairing.fullyTypedBowelDays,
          } : {}),
        },
        detailPath: row.key === 'fiber' ? '/nutrition' : '/today',
        userEntered: false,
        substantive: false,
        provenance: 'quality_screen_only_no_association',
        priority: 1,
      })
    }
  }

}

function addTraining(input: AskHealthPacketInput, push: (item: PushItem) => void, detail: boolean) {
  // Range-wide workout counts and exercise trends do not describe a precise
  // historical day/week. Do not supply them as substitute support for a
  // specifically named exercise question with an explicit temporal scope.
  const focused = input.focusedTraining
  if (focused && (focused.requestedDate || focused.requestedWindow || focused.dateSelectionIssue)) return
  const training = input.overview?.training
  const exercises = input.overview?.exercises ?? []
  if (training) {
    const count = training.workouts.status === 'available' ? training.workouts.value.count : training.sessions.length
    push({
      id: 'training.sessions',
      domain: 'training',
      label: 'Training sessions',
      value: count,
      unit: 'sessions',
      text: 'Canonical Training sessions in this range. Apple Activity workouts are not included.',
      coverage: { sessions: count },
      detailPath: '/progress/strength',
      userEntered: false,
      substantive: count > 0,
      priority: 2,
    })
    if (training.consistency.status === 'available') {
      push({
        id: 'training.frequency',
        domain: 'training',
        label: 'Training frequency',
        value: training.consistency.value.workoutsPerWeek,
        unit: 'sessions/week',
        text: 'Canonical Training frequency calculated across the selected range.',
        coverage: {
          workouts: training.consistency.value.workoutCount,
          uniqueDates: training.consistency.value.uniqueDates,
          medianGapDays: training.consistency.value.medianGapDays,
        },
        detailPath: '/progress/strength',
        userEntered: false,
        substantive: training.consistency.value.workoutCount > 0,
        priority: 2,
      })
    }
  }
  if (!detail) {
    return
  }
  const matches = matchingExercises(input.question, exercises)
  const selected = matches.length > 0 ? matches : exercises.slice().sort((left, right) => right.appearanceCount - left.appearanceCount).slice(0, 4)
  const show = matches.length > 0 || input.lens === 'training'
  if (!show) {
    return
  }
  for (const exercise of selected.slice(0, 4)) {
    const trend = exercise.trend
    push({
      id: `training.exercise.${slug(exercise.name)}`,
      domain: 'training',
      label: exercise.name,
      value: trend.status === 'available' ? trend.value.changePercent : null,
      unit: trend.status === 'available' ? 'percent' : null,
      text:
        trend.status === 'available'
          ? `${exercise.name} estimated-strength trend is ${trend.value.direction}. Change ${trend.value.changePercent} percent. Recent median ${trend.value.recentMedian}. Previous median ${trend.value.previousMedian}.`
          : `${exercise.name} estimated-strength trend is ${trend.status}. Appearances ${exercise.appearanceCount}.`,
      coverage: {
        appearances: exercise.appearanceCount,
        trend: trend.status,
        latestDate: exercise.latestPerformance?.date ?? null,
      },
      detailPath: `/progress/strength/${exercise.exerciseId}`,
      userEntered: false,
      substantive: exercise.appearanceCount > 0,
      priority: 2,
    })
  }
}

/** Match the exact saved label or an unambiguous primary ingredient word.
 * A generic qualifier (e.g. "vitamin", "complex", "powder") cannot identify a
 * specific owner's supplement. Token equality prevents creatine/creatinine,
 * or fish/fishing, substring false positives. Multiple matched formulations
 * remain separate rather than silently guessing which one was meant.
 */
function matchedSavedSupplements(input: AskHealthPacketInput): AskHealthPacketInput['supplements'] {
  const tokens = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const question = tokens(input.question)
  const phrase = ` ${question.join(' ')} `
  const questionWords = new Set(question)
  const generic = new Set([
    'vitamin', 'vitamins', 'supplement', 'supplements', 'mineral', 'minerals',
    'complex', 'blend', 'formula', 'daily', 'powder', 'capsule', 'capsules',
    'tablet', 'tablets', 'softgel', 'softgels', 'gummies', 'extract',
  ])
  return input.supplements.filter((item) => {
    const name = tokens(item.name)
    if (name.length === 0) return false
    if (phrase.includes(` ${name.join(' ')} `)) return true
    // Conservatively permit a principal ingredient alias, not every word in
    // a product label. Multiword vitamins must be named specifically.
    const main = name[0]!
    return name.length > 1 && main.length >= 6 &&
      !generic.has(main) && questionWords.has(main)
  })
}

/** A saved named-supplement question needs itemized owner evidence even when
 * the selected interface lens is Training rather than Supplements.
 */
function questionMentionsSavedSupplement(input: AskHealthPacketInput): boolean {
  return matchedSavedSupplements(input).length > 0
}

function addSupplements(input: AskHealthPacketInput, push: (item: PushItem) => void) {
  if (input.supplements.length === 0) return
  // A caller's range must never make a future entry appear as observed.
  const end = input.period.end < input.asOf ? input.period.end : input.asOf
  if (end < input.period.start) return
  const totals = { taken: 0, skipped: 0, unknown: 0, paused: 0, notScheduled: 0 }
  const names = matchedSavedSupplements(input)
  const asksInventory = /\b(?:my|recorded|saved)\b[\s\S]{0,36}\b(?:supplements?|vitamins?|doses?|regimen)\b|\b(?:supplements?|vitamins?)\b[\s\S]{0,36}\b(?:taking|take|scheduled|use|recorded|saved)\b/i.test(input.question)
  const selected = (names.length > 0 ? names : asksInventory ? input.supplements : []).slice(0, 4)
  for (const supplement of input.supplements) {
    const states = resolveScheduleRange({
      schedules: supplement.schedules,
      events: supplement.events,
      adherence: supplement.adherence,
      start: input.period.start,
      end,
    })
    tally(states, totals)
    if (!selected.includes(supplement)) continue

    const counts = { taken: 0, skipped: 0, unknown: 0, paused: 0, notScheduled: 0 }
    tally(states, counts)
    const currentStatus = lifecycleStatusOnDate(supplement.events, end)
    const schedules = supplement.schedules
      .filter((schedule) => schedule.effectiveFrom <= end &&
        (schedule.effectiveThrough == null || schedule.effectiveThrough >= end))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
    const regimen = schedules.length === 0
      ? 'No saved schedule is effective on this date.'
      : schedules.slice(0, 4).map((schedule) =>
        `${schedule.doseAmount} ${schedule.doseUnit} (${formatWeekdayMask(schedule.weekdayMask)}), effective from ${schedule.effectiveFrom}${schedule.effectiveThrough ? ` through ${schedule.effectiveThrough}` : ''}`
      ).join('; ') + (schedules.length > 4 ? `; ${schedules.length - 4} additional schedule slots` : '')
    const scheduled = counts.taken + counts.skipped + counts.unknown
    push({
      id: `supplements.recorded.${supplement.id}`,
      domain: 'supplements',
      label: supplement.name,
      value: currentStatus ?? 'unknown',
      unit: null,
      text: `Saved supplement lifecycle on ${end}: ${currentStatus ?? 'not recorded'}. Planned regimen: ${regimen} Within ${input.period.start} through ${end}: ${counts.taken} self-reported taken, ${counts.skipped} skipped, ${counts.unknown} unknown scheduled occurrences; ${counts.paused} paused. Scheduled or unknown does not mean taken. This is recorded usage, not proof of ingestion or efficacy.`,
      coverage: { scheduled, taken: counts.taken, skipped: counts.skipped, unknown: counts.unknown, paused: counts.paused },
      detailPath: '/supplements',
      userEntered: true,
      substantive: schedules.length > 0 || counts.taken > 0,
      provenance: 'owner_saved_supplement_schedule_and_adherence',
      priority: 1,
    })
  }
  const scheduled = totals.taken + totals.skipped + totals.unknown
  if (scheduled === 0 && totals.paused === 0) return
  push({
    id: 'supplements.adherence',
    domain: 'supplements',
    label: 'Supplement adherence',
    value: scheduled === 0 ? null : totals.taken / scheduled,
    unit: 'taken_over_taken_plus_skipped_plus_unknown',
    text: 'Unknown stays unknown. It is not counted as skipped. Paused occurrences are separate.',
    coverage: {
      scheduled,
      taken: totals.taken,
      skipped: totals.skipped,
      unknown: totals.unknown,
      paused: totals.paused,
    },
    detailPath: '/supplements',
    userEntered: false,
    substantive: scheduled > 0,
    priority: 2,
  })
}

function tally(states: readonly OccurrenceState[], totals: { taken: number; skipped: number; unknown: number; paused: number; notScheduled: number }) {
  for (const state of states) {
    if (state === 'taken') totals.taken += 1
    else if (state === 'skipped') totals.skipped += 1
    else if (state === 'unknown') totals.unknown += 1
    else if (state === 'paused') totals.paused += 1
    else totals.notScheduled += 1
  }
}

function addGoals(
  input: AskHealthPacketInput,
  push: (item: PushItem) => void,
  limitations: AskLimitation[],
) {
  if (requiresHistoricalGoalBoundary({
    asOf:input.asOf,today:input.healthToday,question:input.question,
  })) {
    // A calorie/sleep-only historical question has no Goal status to screen.
    const mentionsGoal=/\b(?:goals?|targets?|objectives?)\b/i.test(input.question)
    if (!mentionsGoal && input.goals.length===0) return
    const message = 'Historical goal versions and lifecycle as of the requested date are NOT verified. ' +
      'Current goal targets, active status, deadlines, and projections are withheld, even if a dated body or training measurement exists. ' +
      'No historical goal achievement, unmet-goal direction, plateau or calorie change may be inferred from current goal records.'
    push({
      id:'goals.historical_attestation_boundary',domain:'goals',
      label:'Historical Goal Control version and lifecycle boundary',
      value:null,unit:null,period:input.period,
      text:message,coverage:{historicalGoalStatus:'unverified'},
      detailPath:'/goals',userEntered:false,substantive:false,priority:0,
    })
    limitations.push({
      code:'historical_goal_attestation_unverified',text:message,
      evidenceId:'goals.historical_attestation_boundary',
    })
    return
  }
  const active = input.goals.filter((goal) => goal.lifecycle === 'active')
  const numbers = input.question.match(/\d+(?:\.\d+)?/g) ?? []
  const matched = numbers.length
    ? active.filter((goal) => numbers.some((number) => goal.targetText.includes(number) || goal.label.includes(number)))
    : active
  const focus=input.focusedWeightEnergy
  const screenedGoals=(matched.length > 0 ? matched : active).filter(goal=>{
    if(!focus||focus.canonicalGoalStatus.state==='canonical_reported'||
       goal.kind!=='body_metric')return true
    // A selected weight goal that was WITHHELD by canonical reconciliation
    // must not re-enter the same packet via the generic Goals section.
    // If its private identity could not be established, fail closed for body
    // metrics rather than accidentally emit the selected goal's raw status.
    return focus.selectedWeightGoalId!==null&&
      goal.id!==focus.selectedWeightGoalId
  })
  const goals = screenedGoals.filter((goal) => goalKindForLens(goal, input.lens)).slice(0, 8)
  for (const goal of goals) {
    push({
      id: `goals.${goal.id}`,
      domain: 'goals',
      label: goal.label,
      value: goal.targetState,
      unit: null,
      text: `${goal.targetText} Target state ${goal.targetState}. Deadline state ${goal.deadlineState}. Projection ${goal.projectionState ?? 'not_included'}${goal.projectionReason ? `: ${goal.projectionReason}` : ''}.`,
      coverage: {
        kind: goal.kind,
        targetState: goal.targetState,
        deadlineState: goal.deadlineState,
        projectionState: goal.projectionState,
      },
      detailPath: `/goals/${goal.id}`,
      userEntered: false,
      substantive: true,
      priority: 1,
    })
  }
}

function goalKindForLens(goal: AskGoalInput, lens: AskLens): boolean {
  if (lens === 'general' || lens === 'experiments') {
    return true
  }
  if (lens === 'training') {
    return goal.kind === 'strength_e1rm' || goal.kind === 'training_frequency' || goal.kind === 'benchmark_result'
  }
  if (lens === 'nutrition') {
    return goal.kind === 'nutrition_protein' || goal.kind === 'body_metric'
  }
  if (lens === 'recovery') {
    return goal.kind === 'sleep_duration' || goal.kind === 'activity_steps'
  }
  return true
}

function addLab(input: AskHealthPacketInput, push: (item: PushItem) => void) {
  for (const experiment of input.experiments.slice(0, 6)) {
    push({
      id: `experiments.${experiment.id}`,
      domain: 'experiments',
      label: experiment.title,
      value: experiment.classification,
      unit: null,
      text: `Status ${experiment.status}. Classification ${experiment.classification ?? 'none'}. Question: ${clip(experiment.question)}`,
      coverage: {
        status: experiment.status,
        classification: experiment.classification,
        protocolVersion: experiment.protocolVersion,
        requirementPass: experiment.requirementPass,
        requirementFail: experiment.requirementFail,
        requirementMissing: experiment.requirementMissing,
      },
      detailPath: `/lab/experiments/${experiment.id}`,
      userEntered: true,
      substantive: true,
      priority: input.lens === 'experiments' ? 1 : 4,
    })
  }
  for (const benchmark of input.benchmarks.slice(0, 6)) {
    push({
      id: `benchmarks.${benchmark.id}`,
      domain: 'benchmarks',
      label: benchmark.title,
      value: benchmark.value,
      unit: benchmark.unit,
      text: `Valid ${benchmark.label} on ${benchmark.resultDate}. Protocol version ${benchmark.protocolVersion}. Invalidated results are excluded.`,
      coverage: { protocolVersion: benchmark.protocolVersion, resultDate: benchmark.resultDate },
      detailPath: '/lab',
      userEntered: false,
      substantive: true,
      priority: input.lens === 'experiments' ? 1 : 4,
    })
  }
}

function addContext(context: AskContextInput | null, push: (item: PushItem) => void) {
  if (!context) {
    return
  }
  const tags = Object.entries(context.tagCounts).filter((entry) => entry[1] > 0)
  if (tags.length === 0 && context.notedDays === 0) {
    return
  }
  push({
    id: 'context.tags',
    domain: 'context',
    label: 'Daily context',
    value: tags.length,
    unit: 'tags',
    text: tags.map(([key, count]) => `${key} ${count}`).join(', ') || 'Context notes were recorded.',
    coverage: { ...context.tagCounts, notedDays: context.notedDays },
    detailPath: '/context',
    userEntered: false,
    substantive: true,
    priority: 4,
  })
  for (const note of context.notes.slice(0, 3)) {
    push({
      id: `context.note.${note.date}`,
      domain: 'context',
      label: `Context note ${note.date}`,
      value: null,
      unit: null,
      text: clip(note.text),
      coverage: null,
      detailPath: '/context',
      userEntered: true,
      substantive: true,
      priority: 5,
    })
  }
}

/** Only transmit dates/measurements when the question needs them. Their
 * provenance is not interchangeable with clinical history or inferred sex.
 */
function addStableProfile(
  profile: AskStableProfileInput | null,
  question: string,
  asOf: string,
  push: (item: PushItem) => void,
  deep = false,
) {
  if (!profile) return
  const demographicRelevant = /\b(?:age|aged|old|birthday|birth|born|height|tall|bmi|bmr|tdee|metabolism|metabolic|calories|calorie|energy expenditure|physiology|physiological|reference ranges?|profile)\b|about me/i.test(question)
  if (!deep && !demographicRelevant) return

  if (profile.dateOfBirth != null && profile.ageYears != null) {
    push({
      id: 'profile.date_of_birth',
      domain: 'profile',
      label: 'Owner-entered date of birth',
      value: profile.dateOfBirth,
      unit: null,
      text: profile.historical
        ? 'Current Health Profile birth date, used only to calculate age for the selected historical date. This is not proof the profile was saved during that period.'
        : 'Birth date currently recorded in the owner Health Profile.',
      coverage: { source: 'current_owner_profile' },
      provenance: 'owner_profile_current',
      detailPath: '/settings#health-profile',
      userEntered: true,
      substantive: true,
      priority: 1,
    })
    push({
      id: 'profile.age_years_as_of',
      domain: 'profile',
      label: 'Age on selected date',
      value: profile.ageYears,
      unit: 'years',
      text: `Age calculated from the owner-entered birth date for ${asOf}; this is a derived calendar value, not an independently recorded health observation.`,
      coverage: { asOf },
      provenance: 'derived_from_current_owner_profile',
      detailPath: '/settings#health-profile',
      userEntered: false,
      substantive: true,
      priority: 1,
    })
  }

  if (!profile.historical && profile.heightCm != null) {
    push({
      id: 'profile.height_cm',
      domain: 'profile',
      label: 'Current owner-entered height',
      value: profile.heightCm,
      unit: 'cm',
      text: 'Height currently recorded in Health Profile, not a dated historical measurement.',
      coverage: { source: 'current_owner_profile' },
      provenance: 'owner_profile_current',
      detailPath: '/settings#health-profile',
      userEntered: true,
      substantive: true,
      priority: 1,
    })
  }
}

/** Select only owner-saved medications relevant to the question.
 * Profile medication status describes a record, not verified ingestion.
 */
export function selectAskHealthMedications(
  profile: AskClinicalProfileInput,
  question: string,
): Array<{ index: number; medication: AskClinicalProfileInput['medications'][number] }> {
  const q = ' ' + (question.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(' ') + ' '
  const names = profile.medications.map((medication, index) => ({ medication, index }))
  const explicit = /\b(?:medications?|meds?|medicines?|prescriptions?|prescribed|drugs?|drug interactions?|side effects?|adverse effects?)\b/i.test(question)
  const personal = /\b(?:my|mine|i|me|im|taking|take|recorded|saved|currently|prescribed)\b/i.test(question)
  const symptom = /\b(?:constipat\w*|diarrh\w*|bowel\w*|stools?|nausea|nauseous|bloat\w*|dizz\w*|fatigue|tiredness|insomnia)\b/i.test(question)
  const explicitPersonal = explicit && personal
  const symptomPersonal = symptom && personal
  const named = names.filter(({ medication }) => {
    const tokens = medication.name.toLowerCase().match(/[a-z0-9]+/g) ?? []
    if (tokens.length === 0) return false
    if (q.includes(' ' + tokens.join(' ') + ' ')) return true
    const first = tokens[0]!
    return tokens.length > 1 && first.length >= 6 && q.includes(' ' + first + ' ')
  })
  if (named.length > 0 && !explicitPersonal) return named.slice(0, 8)
  if (explicitPersonal) return names.slice(0, 16)
  if (symptomPersonal) return names.filter(({ medication }) => medication.status === 'active').slice(0, 8)
  return []
}

/** Minimize disclosure of owner-saved allergies in Ask Health evidence.
 * An allergy is clinically relevant for owner-specific food/drug decisions,
 * an explicit personal allergy inventory, or a named substance, not a
 * general explanation. Stable original indices preserve source identity.
 */
export function selectAskHealthAllergies(
  profile: AskClinicalProfileInput,
  question: string,
): Array<{ index: number; allergy: AskClinicalProfileInput['allergies'][number] }> {
  const records = profile.allergies.map((allergy, index) => ({ allergy, index }))
  const personal = /\b(?:my|mine|me|i|myself)\b/i.test(question)
  if (!personal) return []
  const inventory = /\b(?:allerg(?:y|ies|ic|ens?)|intoleran\w*|reactions?)\b/i.test(question)
  const words = ' ' + (question.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(' ') + ' '
  const named = records.filter(({ allergy }) => {
    const substance = allergy.substance.toLowerCase().match(/[a-z0-9]+/g) ?? []
    return substance.length > 0 && words.includes(' ' + substance.join(' ') + ' ')
  })
  if (named.length > 0) return named.slice(0, 12)
  if (inventory) return records.slice(0, 12)
  // Food, medicine and supplement recommendations could expose the owner to
  // a saved allergen even when they did not mention "allergy" explicitly.
  const isDecision = /\b(?:can|should|could|may|safe|safely|recommend|plan|cook|eat|try|take|start|use|have|make|choose)\b/i.test(question)
  const isExposure = /\b(?:foods?|meals?|dinner|breakfast|lunch|recipes?|ingredients?|diet|eating|cook|snacks?|supplements?|medications?|medicines?|drugs?|prescriptions?|doses?|take|eat)\b/i.test(question)
  return isDecision && isExposure ? records.slice(0, 12) : []
}


/** Minimum necessary, current owner-entered conditions. Named records and
 * explicit saved-history requests are not evidence of a clinical diagnosis.
 */
export function selectAskHealthConditions(
  profile: AskClinicalProfileInput,
  question: string,
): Array<{ index: number; condition: AskClinicalProfileInput['conditions'][number] }> {
  if (!/\b(?:i|me|my|mine|myself)\b/i.test(question)) return []
  const records = profile.conditions.map((condition, index) => ({ condition, index }))
  const words = ' ' + (question.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(' ') + ' '
  const named = records.filter(({ condition }) => {
    const tokens = condition.name.toLowerCase().match(/[a-z0-9]+/g) ?? []
    return tokens.length > 0 && words.includes(' ' + tokens.join(' ') + ' ')
  })
  if (named.length > 0) return named.slice(0, 12)
  const ownerInventory =
    /\bmy\s+(?:(?:recorded|saved|current)\s+)?(?:(?:medical|health)\s+)?(?:conditions?|diagnos(?:is|es)|history|profile|background)\b/i.test(question)
    || /\b(?:conditions?|diagnos(?:is|es))\b/i.test(question)
      && /\b(?:saved|recorded|listed|do i have|have i)\b/i.test(question)
  return ownerInventory ? records.slice(0, 12) : []
}

/** Unstructured profile notes may contain unrelated sensitive details. */
export function selectAskHealthProfileTextFields(
  question: string,
): Array<'persistentHealthContext' | 'trainingLimitations' | 'dietaryContext'> {
  if (!/\b(?:i|me|my|mine|myself)\b/i.test(question)) return []
  const profileRequest = /\bmy\s+(?:medical history|health history|health profile|health context|health background|profile)\b/i.test(question)
    || /\b(?:what|which|show|list)\b.{0,70}\b(?:health|medical)\s+(?:facts?|background|history|profile|context)\b.{0,70}\b(?:about me|recorded|saved)\b/i.test(question)
  if (profileRequest) return ['persistentHealthContext', 'trainingLimitations', 'dietaryContext']
  const training = /\b(?:training|workouts?|exercises?|lifting|lifts?|squats?|bench|running|jogging|hiking|injur(?:y|ies)|rehab|recovery|joint pain|back pain)\b/i.test(question)
  const diet = /\b(?:nutrition|diet(?:ary)?|foods?|meals?|eating|eat|cook|protein|fiber|fibre|calories|macros?|hydration|water|constipat\w*|diarrh\w*|stools?|bowel\w*|bloat\w*)\b/i.test(question)
  const relevant: Array<'trainingLimitations' | 'dietaryContext'> = []
  if (training) relevant.push('trainingLimitations')
  if (diet) relevant.push('dietaryContext')
  return relevant
}

function addClinicalProfile(profile: AskClinicalProfileInput | null, question: string, push: (item: PushItem) => void, mode?: AskHealthPacketInput['contextMode']) {
  if (!profile) return
  // Explicit owner context only. Never invent a binary range when unset or
  // the individual's physiology is not represented by the given formula.
  if (profile.sexForPhysiology != null) {
    push({
      id: 'clinical.sex_for_physiology',
      domain: 'clinical_context',
      label: 'Sex for physiological reference ranges',
      value: profile.sexForPhysiology,
      unit: null,
      text: profile.sexForPhysiology === 'other'
        ? 'Owner selected individual review for sex-dependent clinical ranges. Do not infer a binary category.'
        : 'Owner-entered physiological reference sex: ' + profile.sexForPhysiology + '. This does not state gender identity.',
      coverage: { source: 'owner_entered' },
      detailPath: '/settings#health-profile',
      userEntered: true,
      substantive: true,
      priority: 1,
    })
  }
  const addText = (id: string, label: string, text: string | null, priority: number) => {
    if (!text?.trim()) return
    push({
      id,
      domain: 'clinical_context',
      label,
      value: null,
      unit: null,
      text: 'Current owner-entered ' + label.toLowerCase() +
        ' (not a verified clinical finding or dated history): ' + clip(text),
      coverage: { source: 'current_owner_profile' },
      provenance: 'owner_profile_current',
      detailPath: '/settings#health-profile',
      userEntered: true,
      substantive: true,
      priority,
    })
  }

  const selectedText = mode === 'deep'
    ? ['persistentHealthContext', 'trainingLimitations', 'dietaryContext']
    : mode === 'personalized'
      ? ['persistentHealthContext', ...selectAskHealthProfileTextFields(question)]
      : selectAskHealthProfileTextFields(question)
  if (selectedText.includes('persistentHealthContext'))
    addText('clinical.persistent_context', 'Persistent health context', profile.persistentHealthContext, 1)
  if (selectedText.includes('trainingLimitations'))
    addText('clinical.training_limitations', 'Training limitations', profile.trainingLimitations, 2)
  if (selectedText.includes('dietaryContext'))
    addText('clinical.dietary_context', 'Dietary context', profile.dietaryContext, 2)

  const conditions = mode === 'deep'
    ? profile.conditions.map((condition, index) => ({ condition, index })).slice(0, 12)
    : mode === 'personalized'
      ? profile.conditions.map((condition, index) => ({ condition, index })).filter(({ condition }) => condition.status === 'active').slice(0, 8)
      : selectAskHealthConditions(profile, question)
  conditions.forEach(({ condition: item, index }) => {
    push({
      id: 'clinical.condition.' + index,
      domain: 'clinical_context',
      label: item.name,
      value: item.status,
      unit: null,
      text: 'Current owner-entered condition record: ' + item.name +
        '. Saved status: ' + item.status +
        '. This is not an independently verified diagnosis, proof of current symptoms, or evidence of causation.',
      coverage: { status: item.status, source: 'current_owner_profile' },
      provenance: 'owner_profile_current',
      detailPath: '/settings#health-profile',
      userEntered: true,
      substantive: true,
      priority: item.status === 'active' ? 1 : 4,
    })
  })

  const allergies = mode === 'deep' || mode === 'personalized'
    ? profile.allergies.map((allergy, index) => ({ allergy, index })).slice(0, 12)
    : selectAskHealthAllergies(profile, question)
  allergies.forEach(({ allergy: item, index }) => {
    push({
      id: `clinical.allergy.${index}`,
      domain: 'clinical_context',
      label: `Allergy · ${item.substance}`,
      value: item.severity,
      unit: null,
      text: `Current owner-entered allergy record: ${item.substance}. Saved severity: ${item.severity}.${item.reaction ? ` Saved reaction: ${clip(item.reaction)}.` : ''} This is not an independently verified diagnosis or proof of an exposure.`,
      coverage: { severity: item.severity, source: 'current_owner_profile' },
      provenance: 'owner_profile_current',
      detailPath: '/settings#health-profile',
      userEntered: true,
      substantive: true,
      priority: 1,
    })
  })

  const medications = mode === 'deep'
    ? profile.medications.map((medication, index) => ({ medication, index })).slice(0, 12)
    : mode === 'personalized'
      ? profile.medications.map((medication, index) => ({ medication, index })).filter(({ medication }) => medication.status === 'active').slice(0, 8)
      : selectAskHealthMedications(profile, question)
  medications.forEach(({ medication: item, index }) => {
    push({
      id: `clinical.medication.${index}`,
      domain: 'clinical_context',
      label: `Medication · ${item.name}`,
      value: item.status,
      unit: null,
      text: `Current owner-entered medication record: ${item.name}. Saved status: ${item.status}.${item.dose ? ` Recorded dose: ${item.dose}.` : ''}${item.frequency ? ` Recorded frequency: ${item.frequency}.` : ''} A saved status or schedule is not proof the medication was taken, and cannot establish it caused a symptom.`,
      coverage: { status: item.status, source: 'current_owner_profile' },
      provenance: 'owner_profile_current',
      detailPath: '/settings#health-profile',
      userEntered: true,
      substantive: true,
      priority: item.status === 'active' ? 1 : 4,
    })
  })
}

function addPatterns(patterns: readonly AskPatternInput[], push: (item: PushItem) => void) {
  for (const pattern of patterns.slice(0, 5)) {
    push({
      id: `patterns.${pattern.id}`,
      domain: 'patterns',
      label: 'Deterministic pattern',
      value: pattern.id,
      unit: null,
      text: pattern.text,
      coverage: null,
      detailPath: '/progress',
      userEntered: false,
      substantive: true,
      priority: 3,
    })
  }
}


function addSharedIntelligence(
  intelligence: NonNullable<AskHealthPacketInput['intelligence']>,
  period: AskHealthPacketInput['period'],
  push: (item: PushItem) => void,
  limitations: AskLimitation[],
) {
  const selectedCalendarDays = Math.floor((
    Date.parse(period.end + 'T00:00:00Z') - Date.parse(period.start + 'T00:00:00Z')
  ) / 86_400_000) + 1
  for (const item of intelligence.coverage) {
    push({
      id: `intelligence.coverage.${item.key}`,
      domain: 'intelligence',
      label: `${item.label} coverage`,
      value: item.coveragePct,
      unit: 'percent',
      text: item.loggedDays == null
        ? `${item.observedDays} observed day${item.observedDays === 1 ? '' : 's'} of ${item.eligibleDays} eligible days. ${item.excludedObservations > 0 ? `${item.excludedObservations} reviewed observation${item.excludedObservations === 1 ? '' : 's'} excluded from intelligence. ` : ''}Confidence: ${item.confidence}.`
        : `${item.loggedDays} logged day(s) of ${item.eligibleDays} eligible calendar days; ${item.completenessCheck === 'unavailable' ? 'completeness verification is currently unavailable, so full-day trends are withheld' : `${item.observedDays} owner-confirmed, current-revision, source-reliable complete day(s) qualify for full-day trends`}. Unverified logs are not zeros or proof of total intake. Confidence for verified trend evidence: ${item.confidence}.`,
      coverage: {
        observedDays: item.observedDays,
        ...(item.loggedDays == null ? {} : { loggedDays: item.loggedDays, completenessCheck: item.completenessCheck ?? 'available' }),
        eligibleDays: item.eligibleDays,
        coveragePct: item.coveragePct,
        excludedObservations: item.excludedObservations,
      },
      detailPath: item.detailPath,
      userEntered: false,
      substantive: (item.loggedDays ?? item.observedDays) > 0,
      confidence: item.confidence,
      provenance: Object.entries(item.provenance).map(([kind, count]) => `${kind}:${count}`).join(', '),
      priority: 2,
    })
  }

  for (const baseline of intelligence.baselines) {
    if (baseline.state !== 'available' || baseline.mean == null) continue
    push({
      id: `intelligence.baseline.${baseline.key}`,
      domain: 'intelligence',
      label: `${baseline.label} personal baseline`,
      value: baseline.mean,
      unit: baseline.unit,
      text: `Recent personal baseline from ${baseline.observations} observations (${baseline.start} through ${baseline.end}). Mean ${roundEvidence(baseline.mean)} ${baseline.unit}; median ${baseline.median == null ? 'unknown' : roundEvidence(baseline.median)} ${baseline.unit}.`,
      coverage: { observations: baseline.observations, startDate: baseline.start, endDate: baseline.end },
      detailPath: intelligence.coverage.find((item) => item.key === baseline.key)?.detailPath ?? null,
      userEntered: false,
      substantive: true,
      confidence: baseline.confidence,
      priority: 2,
    })
  }

  for (const relationship of intelligence.relationships) {
    const id = `intelligence.relationship.${relationship.id}`
    if (relationship.state === 'available' && relationship.rho != null) {
      push({
        id,
        domain: 'intelligence',
        label: 'Personal relationship',
        value: relationship.rho,
        unit: 'Spearman rho',
        text: relationship.summary,
        coverage: {
          pairedObservations: relationship.sampleSize,
          requiredObservations: relationship.requiredSampleSize,
          pairedDateCount: relationship.evidenceDates.length,
          selectedCalendarDays,
          xKey: relationship.xKey,
          yKey: relationship.yKey,
          lagDays: relationship.lagDays,
        },
        detailPath: relationship.detailPaths[0] ?? '/progress',
        userEntered: false,
        substantive: true,
        confidence: relationship.confidence,
        evidenceDates: [...new Set(relationship.evidenceDates.flatMap((pair) => [pair.xDate, pair.yDate]))],
        priority: 1,
      })
    } else if (relationship.state === 'insufficient_data') {
      push({
        id,
        domain: 'intelligence',
        label: 'Relationship evidence',
        value: relationship.sampleSize,
        unit: 'paired observations',
        text: relationship.summary,
        coverage: {
          pairedObservations: relationship.sampleSize,
          requiredObservations: relationship.requiredSampleSize,
          pairedDateCount: relationship.evidenceDates.length,
          selectedCalendarDays,
          xKey: relationship.xKey,
          yKey: relationship.yKey,
          lagDays: relationship.lagDays,
        },
        detailPath: relationship.detailPaths[0] ?? '/progress',
        userEntered: false,
        substantive: false,
        confidence: relationship.confidence,
        priority: 1,
      })
      limitations.push({
        code: `relationship_${relationship.id}_insufficient`,
        text: relationship.summary,
        evidenceId: id,
      })
    }
  }

  for (const comparison of intelligence.interventions.slice(0, 5)) {
    push({
      id: `intelligence.change.${comparison.id}`,
      domain: 'intelligence',
      label: `Before/after · ${comparison.signalLabel}`,
      value: comparison.delta,
      unit: comparison.unit,
      text: comparison.summary,
      coverage: {
        beforeObservations: comparison.beforeN,
        afterObservations: comparison.afterN,
        changeDate: comparison.changeDate,
      },
      detailPath: '/progress/timeline',
      userEntered: false,
      substantive: true,
      confidence: comparison.confidence,
      evidenceDates: [...comparison.evidenceDates.before, ...comparison.evidenceDates.after],
      priority: 2,
    })
  }

  for (const missing of intelligence.missing) {
    const id = `intelligence.missing.${missing.key}`
    push({
      id,
      domain: 'intelligence',
      label: `${missing.label} context missing`,
      value: null,
      unit: null,
      text: missing.detail,
      coverage: null,
      detailPath: missing.detailPath,
      userEntered: false,
      substantive: false,
      confidence: 'unknown',
      priority: 1,
    })
    limitations.push({
      code: `missing_${missing.key}`,
      text: `${missing.label}: ${missing.detail}`,
      evidenceId: id,
    })
  }
}

function roundEvidence(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function matchingExercises(
  question: string,
  exercises: NonNullable<AskHealthPacketInput['overview']>['exercises'],
) {
  const normalized = question.toLowerCase()
  const words = normalized.split(/[^a-z0-9]+/).filter((word) => word.length >= 4)
  return exercises.filter((exercise) => {
    const name = exercise.name.toLowerCase()
    if (normalized.includes(name)) {
      return true
    }
    const nameWords = name.split(/[^a-z0-9]+/).filter((word) => word.length >= 4)
    return words.some((word) => nameWords.some((nameWord) => nameWord.startsWith(word) || word.startsWith(nameWord)))
  })
}

function exerciseClarification(input: AskHealthPacketInput): string | null {
  const exercises = input.overview?.exercises ?? []
  const matches = matchingExercises(input.question, exercises)
  if (matches.length < 2) {
    return null
  }
  return `More than one exercise matches this question: ${matches.map((item) => item.name).join(', ')}. Health is showing each match rather than choosing one.`
}

function trimEvidence(drafts: readonly Draft[], maxChars: number): AskEvidence[] {
  const ordered = drafts.slice().sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
  const kept = ordered.slice()
  while (JSON.stringify(kept.map(strip)).length > maxChars && kept.some((item) => item.priority > 0)) {
    let index = -1
    for (let cursor = kept.length - 1; cursor >= 0; cursor -= 1) {
      if (kept[cursor]!.priority > 0) {
        index = cursor
        break
      }
    }
    if (index < 0) {
      break
    }
    kept.splice(index, 1)
  }
  return kept.map(strip)
}

function strip(item: Draft): AskEvidence {
  return {
    id: item.id,
    domain: item.domain,
    label: item.label,
    value: item.value,
    unit: item.unit,
    text: item.text,
    period: item.period,
    coverage: item.coverage,
    detailPath: item.detailPath,
    userEntered: item.userEntered,
    substantive: item.substantive,
    confidence: item.confidence,
    provenance: item.provenance,
    evidenceDates: item.evidenceDates,
  }
}

function slug(name: string): string {
  const value = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return value.slice(0, 40) || 'exercise'
}

function clip(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed
}
