import { FULL_CIRCUMFERENCE_KEYS } from '@/domain/body-manual'

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

export function reviewMeasurePreset(keys: readonly string[]): { preset: MeasurePreset; customKeys: string[] } {
  if (keys.length > 0 && keys.every((key) => key === 'weight' || key === 'body_fat_percentage')) {
    return { preset: 'weight', customKeys: [] }
  }
  if (keys.length === 1 && keys[0] === 'waist_circumference') {
    return { preset: 'waist', customKeys: [] }
  }
  if (keys.length === FULL_CIRCUMFERENCE_KEYS.length && FULL_CIRCUMFERENCE_KEYS.every((key) => keys.includes(key))) {
    return { preset: 'full', customKeys: [] }
  }
  return { preset: 'custom', customKeys: [...keys] }
}

export function customKeysFor(metricKey: string | null): string[] {
  if (!metricKey || metricKey === 'weight' || metricKey === 'body_fat_percentage' || metricKey === 'waist_circumference') {
    return []
  }
  return [metricKey]
}
