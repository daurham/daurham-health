import { ACTIVITY_METRICS } from '@/domain/activity/config'
import { MANUAL_BODY_METRICS } from '@/domain/body-manual'
import { DAILY_CONTEXT_TAG_CATALOG, dailyContextTagLabel, type DailyContextTagKey } from '@/domain/context'
import { LAB_NUTRITION_METRICS } from '@/domain/lab'
import { quietButtonClass, secondaryButtonClass } from '@/lib'
import {
  ACTIVITY_LABELS,
  DOMAIN_LABELS,
  MEASURE_LABELS,
  NUTRITION_LABELS,
  ROLE_LABELS,
  fieldClass,
  newRequirementDraft,
  requirementDomains,
  requirementRoles,
  trainingMeasures,
  type CatalogOption,
  type RequirementCatalogs,
  type RequirementDraft,
} from './protocol-form'

export function ProtocolFields({
  instructions,
  onInstructions,
  requirements,
  onRequirements,
  contextTags,
  onContextTags,
  catalogs,
  minimumRetestDays,
  suggestedRetestDays,
  onMinimumRetestDays,
  onSuggestedRetestDays,
  showRetest,
}: {
  instructions: string
  onInstructions: (value: string) => void
  requirements: RequirementDraft[]
  onRequirements: (value: RequirementDraft[]) => void
  contextTags: string[]
  onContextTags: (value: string[]) => void
  catalogs: RequirementCatalogs
  minimumRetestDays?: string
  suggestedRetestDays?: string
  onMinimumRetestDays?: (value: string) => void
  onSuggestedRetestDays?: (value: string) => void
  showRetest?: boolean
}) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-zinc-800">
        Protocol instructions
        <textarea className={`${fieldClass} min-h-28 py-2`} value={instructions} onChange={(event) => onInstructions(event.target.value)} />
      </label>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-900">Required measurements</h3>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => onRequirements([...requirements, newRequirementDraft(requirements.length === 0 ? 'primary_outcome' : 'secondary_outcome')])}
          >
            Add measurement
          </button>
        </div>
        {requirements.map((draft, index) => (
          <RequirementRow
            key={draft.key}
            draft={draft}
            catalogs={catalogs}
            onChange={(next) => onRequirements(requirements.map((item, itemIndex) => (itemIndex === index ? next : item)))}
            onRemove={() => onRequirements(requirements.filter((_, itemIndex) => itemIndex !== index))}
          />
        ))}
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-zinc-900">Context to watch</legend>
        <p className="mt-1 text-sm text-zinc-600">Later interpretation can inspect whether these tags were recorded. This does not add them to any day.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {DAILY_CONTEXT_TAG_CATALOG.map((tag) => (
            <label key={tag.key} className="flex min-h-11 items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={contextTags.includes(tag.key)}
                onChange={(event) => {
                  onContextTags(
                    event.target.checked ? [...contextTags, tag.key] : contextTags.filter((key) => key !== tag.key),
                  )
                }}
              />
              {tag.label}
            </label>
          ))}
        </div>
      </fieldset>
      {showRetest ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-zinc-800">
            Minimum retest interval (days)
            <input
              className={fieldClass}
              inputMode="numeric"
              value={minimumRetestDays ?? ''}
              onChange={(event) => onMinimumRetestDays?.(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-zinc-800">
            Suggested retest interval (days)
            <input
              className={fieldClass}
              inputMode="numeric"
              value={suggestedRetestDays ?? ''}
              onChange={(event) => onSuggestedRetestDays?.(event.target.value)}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}

function RequirementRow({
  draft,
  catalogs,
  onChange,
  onRemove,
}: {
  draft: RequirementDraft
  catalogs: RequirementCatalogs
  onChange: (draft: RequirementDraft) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-zinc-700">
          Role
          <select className={fieldClass} value={draft.role} onChange={(event) => onChange({ ...draft, role: event.target.value as RequirementDraft['role'] })}>
            {requirementRoles().map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-zinc-700">
          Domain
          <select
            className={fieldClass}
            value={draft.domain}
            onChange={(event) => onChange({ ...draft, domain: event.target.value as RequirementDraft['domain'], label: '' })}
          >
            {requirementDomains().map((domain) => (
              <option key={domain} value={domain}>
                {DOMAIN_LABELS[domain]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <SelectorFields draft={draft} catalogs={catalogs} onChange={onChange} />
      <CriteriaFields draft={draft} onChange={onChange} />
      <label className="mt-3 block text-sm text-zinc-700">
        Label
        <input className={fieldClass} value={draft.label} onChange={(event) => onChange({ ...draft, label: event.target.value })} />
      </label>
      <button type="button" className={`${quietButtonClass} mt-3`} onClick={onRemove}>
        Remove
      </button>
    </div>
  )
}

function SelectorFields({
  draft,
  catalogs,
  onChange,
}: {
  draft: RequirementDraft
  catalogs: RequirementCatalogs
  onChange: (draft: RequirementDraft) => void
}) {
  if (draft.domain === 'body') {
    return (
      <SelectField
        label="Body metric"
        value={draft.metricKey}
        options={MANUAL_BODY_METRICS.map((item) => ({ id: item.key, label: item.label }))}
        onChange={(metricKey) => onChange({ ...draft, metricKey })}
      />
    )
  }
  if (draft.domain === 'nutrition') {
    return (
      <SelectField
        label="Nutrition metric"
        value={draft.metricKey}
        options={LAB_NUTRITION_METRICS.map((key) => ({ id: key, label: NUTRITION_LABELS[key] }))}
        onChange={(metricKey) => onChange({ ...draft, metricKey })}
      />
    )
  }
  if (draft.domain === 'activity') {
    return (
      <SelectField
        label="Activity metric"
        value={draft.metricKey}
        options={ACTIVITY_METRICS.map((key) => ({ id: key, label: ACTIVITY_LABELS[key] }))}
        onChange={(metricKey) => onChange({ ...draft, metricKey })}
      />
    )
  }
  if (draft.domain === 'sleep') {
    return <p className="mt-3 text-sm text-zinc-600">Sleep metric: total sleep minutes</p>
  }
  if (draft.domain === 'training') {
    return (
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <SelectField label="Exercise" value={draft.exerciseDefinitionId} options={catalogs.exercises} onChange={(exerciseDefinitionId) => onChange({ ...draft, exerciseDefinitionId })} />
        <SelectField
          label="Measure"
          value={draft.measure}
          options={trainingMeasures().map((measure) => ({ id: measure, label: MEASURE_LABELS[measure] }))}
          onChange={(measure) => onChange({ ...draft, measure: measure as RequirementDraft['measure'] })}
        />
      </div>
    )
  }
  if (draft.domain === 'supplements') {
    return <SelectField label="Supplement" value={draft.supplementId} options={catalogs.supplements} onChange={(supplementId) => onChange({ ...draft, supplementId })} />
  }
  if (draft.domain === 'context') {
    return (
      <SelectField
        label="Context tag"
        value={draft.tagKey}
        options={DAILY_CONTEXT_TAG_CATALOG.map((tag) => ({ id: tag.key, label: dailyContextTagLabel(tag.key as DailyContextTagKey) }))}
        onChange={(tagKey) => onChange({ ...draft, tagKey })}
      />
    )
  }
  return (
    <SelectField
      label="Benchmark"
      value={draft.benchmarkDefinitionId}
      options={catalogs.benchmarks}
      onChange={(benchmarkDefinitionId) =>
        onChange({
          ...draft,
          benchmarkDefinitionId,
          benchmarkProtocolVersionId: catalogs.benchmarks.find((item) => item.id === benchmarkDefinitionId)?.protocolVersionId ?? '',
        })
      }
    />
  )
}

function CriteriaFields({ draft, onChange }: { draft: RequirementDraft; onChange: (draft: RequirementDraft) => void }) {
  if (draft.domain === 'context') return null
  const coverage = draft.domain === 'nutrition' || draft.domain === 'activity' || draft.domain === 'sleep' || draft.domain === 'supplements'
  const observations = draft.domain !== 'supplements'
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {observations ? (
        <label className="block text-sm text-zinc-700">
          Minimum observations
          <input className={fieldClass} inputMode="numeric" value={draft.minimumObservations} onChange={(event) => onChange({ ...draft, minimumObservations: event.target.value })} />
        </label>
      ) : null}
      {coverage ? (
        <label className="block text-sm text-zinc-700">
          Minimum coverage %
          <input className={fieldClass} inputMode="numeric" value={draft.minimumCoveragePercent} onChange={(event) => onChange({ ...draft, minimumCoveragePercent: event.target.value })} />
        </label>
      ) : null}
      {draft.domain === 'supplements' ? (
        <label className="block text-sm text-zinc-700">
          Minimum adherence %
          <input className={fieldClass} inputMode="numeric" value={draft.minimumAdherencePercent} onChange={(event) => onChange({ ...draft, minimumAdherencePercent: event.target.value })} />
        </label>
      ) : null}
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: CatalogOption[]
  onChange: (value: string) => void
}) {
  return (
    <label className="mt-3 block text-sm text-zinc-700">
      {label}
      <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
