import { useMemo, useState } from 'react'
import {
  FULL_CIRCUMFERENCE_KEYS,
  MANUAL_BODY_METRICS,
  metricDefinition,
  parseManualCreate,
} from '@/domain/body-manual'
import { primaryButtonClass, quietButtonClass, secondaryButtonClass } from '@/lib'
import type { MeasurePreset } from './measure-preset'

const fieldClass =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900'

export function MeasureForm({
  preset,
  focusKey,
  initialValues,
  initialCustomKeys,
  editing,
  busy,
  onCancel,
  onSubmit,
}: {
  preset: MeasurePreset
  focusKey: string | null
  initialValues: Record<string, string>
  initialCustomKeys: string[]
  editing: boolean
  busy: boolean
  onCancel: () => void
  onSubmit: (body: { notes: string | null; comparability: 'usual' | 'different_conditions' | 'unknown'; metrics: Array<{ key: string; value: string; unit: string }> }) => Promise<void>
}) {
  const [mode, setMode] = useState<MeasurePreset>(preset)
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [customKeys, setCustomKeys] = useState<string[]>(initialCustomKeys)
  const [notes, setNotes] = useState(initialValues.notes ?? '')
  const [comparability, setComparability] = useState<'usual' | 'different_conditions' | 'unknown'>(
    initialValues.comparability === 'usual' || initialValues.comparability === 'different_conditions' ? initialValues.comparability : 'unknown',
  )
  const [error, setError] = useState<string | null>(null)

  const fields = useMemo(() => fieldsFor(mode, customKeys), [mode, customKeys])

  async function save() {
    const metrics = fields.map((key) => {
      const definition = metricDefinition(key)
      return {
        key,
        value: values[key] ?? '',
        unit: definition?.manualInputUnits[0] ?? '',
      }
    })
    try {
      parseManualCreate({ notes, comparability, metrics }, new Date())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Check the measurements')
      return
    }
    setError(null)
    try {
      await onSubmit({ notes: notes.trim() === '' ? null : notes.trim(), comparability, metrics } as Parameters<typeof onSubmit>[0])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the measurement')
    }
  }

  return (
    <form
      className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="flex flex-wrap gap-2">
        {(['weight', 'waist', 'full', 'custom'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={mode === item ? secondaryButtonClass : quietButtonClass}
            onClick={() => setMode(item)}
          >
            {item === 'weight' ? 'Weight' : item === 'waist' ? 'Waist' : item === 'full' ? 'Full measurements' : 'Custom'}
          </button>
        ))}
      </div>
      {mode === 'custom' ? (
        <div className="flex flex-wrap gap-2">
          {MANUAL_BODY_METRICS.map((definition) => {
            const selected = customKeys.includes(definition.key)
            return (
              <button
                key={definition.key}
                type="button"
                className={selected ? secondaryButtonClass : quietButtonClass}
                onClick={() => {
                  setCustomKeys((current) =>
                    current.includes(definition.key)
                      ? current.filter((key) => key !== definition.key)
                      : [...current, definition.key],
                  )
                }}
              >
                {definition.label}
              </button>
            )
          })}
        </div>
      ) : null}
      <FieldGroups
        fields={fields}
        values={values}
        focusKey={focusKey}
        onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
      />
      <label className="block text-sm">
        <span className="text-zinc-600">Measurement conditions</span>
        <select
          className={`${fieldClass} mt-1`}
          value={comparability}
          onChange={(event) => setComparability(event.target.value as 'usual' | 'different_conditions' | 'unknown')}
        >
          <option value="usual">Usual conditions</option>
          <option value="different_conditions">Different conditions</option>
          <option value="unknown">Not sure / not recorded</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-zinc-600">Notes</span>
        <input
          className={`${fieldClass} mt-1`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      <div className="sticky bottom-0 flex gap-3 bg-white py-2">
        <button type="submit" className={`${primaryButtonClass} flex-1`} disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save correction' : 'Save measurement'}
        </button>
        <button type="button" className={quietButtonClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function fieldsFor(mode: MeasurePreset, customKeys: readonly string[]): string[] {
  if (mode === 'weight') {
    return ['weight', 'body_fat_percentage']
  }
  if (mode === 'waist') {
    return ['waist_circumference']
  }
  if (mode === 'full') {
    return [...FULL_CIRCUMFERENCE_KEYS]
  }
  return MANUAL_BODY_METRICS.map((item) => item.key).filter((key) => customKeys.includes(key))
}

function FieldGroups({
  fields,
  values,
  focusKey,
  onChange,
}: {
  fields: readonly string[]
  values: Record<string, string>
  focusKey: string | null
  onChange: (key: string, value: string) => void
}) {
  const remaining = new Set(fields)
  const blocks: Array<{ label: string; keys: Array<{ key: string; side: string }> }> = []
  const pairs = ['Upper arm', 'Forearm', 'Thigh', 'Calf']
  for (const pair of pairs) {
    const left = MANUAL_BODY_METRICS.find((item) => item.pair === pair && item.side === 'left')
    const right = MANUAL_BODY_METRICS.find((item) => item.pair === pair && item.side === 'right')
    const keys = [left, right].flatMap((item) => (item && remaining.has(item.key) ? [item] : []))
    if (keys.length === 0) {
      continue
    }
    for (const item of keys) {
      remaining.delete(item.key)
    }
    blocks.push({
      label: pair,
      keys: keys.map((item) => ({ key: item.key, side: item.side === 'left' ? 'Left' : 'Right' })),
    })
  }
  const singles = [...remaining]
  return (
    <div className="space-y-4">
      {singles.map((key) => {
        const definition = metricDefinition(key)
        if (!definition) {
          return null
        }
        return (
          <NumberField
            key={key}
            label={definition.label}
            unit={definition.ownerDisplayUnit}
            value={values[key] ?? ''}
            autoFocus={focusKey === key}
            onChange={(value) => onChange(key, value)}
          />
        )
      })}
      {blocks.map((block) => (
        <fieldset key={block.label}>
          <legend className="text-sm font-medium text-zinc-800">{block.label}</legend>
          <div className="mt-1 grid grid-cols-2 gap-3">
            {block.keys.map((item) => {
              const definition = metricDefinition(item.key)
              return (
                <NumberField
                  key={item.key}
                  label={item.side}
                  unit={definition?.ownerDisplayUnit ?? 'in'}
                  value={values[item.key] ?? ''}
                  autoFocus={focusKey === item.key}
                  onChange={(value) => onChange(item.key, value)}
                />
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

function NumberField({
  label,
  unit,
  value,
  autoFocus,
  onChange,
}: {
  label: string
  unit: string
  value: string
  autoFocus: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-600">
        {label} <span className="text-zinc-400">{unit}</span>
      </span>
      <input
        className={`${fieldClass} mt-1`}
        inputMode="decimal"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
