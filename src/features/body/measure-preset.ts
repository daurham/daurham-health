export type MeasurePreset = 'weight' | 'waist' | 'full' | 'custom'

export function presetForMetric(metricKey: string | null): MeasurePreset {
  if (metricKey === 'weight' || metricKey === 'body_fat_percentage') {
    return 'weight'
  }
  if (metricKey === 'waist_circumference') {
    return 'waist'
  }
  if (metricKey) {
    return 'custom'
  }
  return 'weight'
}

export function customKeysFor(metricKey: string | null): string[] {
  if (!metricKey || metricKey === 'weight' || metricKey === 'body_fat_percentage' || metricKey === 'waist_circumference') {
    return []
  }
  return [metricKey]
}
