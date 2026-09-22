import { CANONICAL_UNITS, type ActivityMetricKey } from './config.js'

export type CanonicalUnit = (typeof CANONICAL_UNITS)[ActivityMetricKey]

export type UnitConversion = {
  value: number
  canonicalUnit: CanonicalUnit
  sourceUnit: string
}

function lowerUnit(unit: string): string {
  return unit.trim().toLowerCase()
}

export function convertQuantityUnit(metric: ActivityMetricKey, value: number, sourceUnit: string): UnitConversion {
  const unit = lowerUnit(sourceUnit)
  if (!Number.isFinite(value)) {
    throw new Error('Quantity value is not finite')
  }
  if (metric === 'steps') {
    if (unit === 'count' || unit === 'steps' || unit === '') {
      return { value, canonicalUnit: 'count', sourceUnit }
    }
    throw new Error(`Unsupported steps unit: ${sourceUnit}`)
  }
  if (metric === 'active_energy') {
    if (unit === 'kcal' || unit === 'cal' || unit === 'calorie' || unit === 'calories') {
      return { value, canonicalUnit: 'kcal', sourceUnit }
    }
    if (unit === 'kj' || unit === 'kilojoule' || unit === 'kilojoules') {
      return { value: value / 4.184, canonicalUnit: 'kcal', sourceUnit }
    }
    throw new Error(`Unsupported energy unit: ${sourceUnit}`)
  }
  if (metric === 'exercise_time') {
    if (unit === 'min' || unit === 'mins' || unit === 'minute' || unit === 'minutes') {
      return { value, canonicalUnit: 'min', sourceUnit }
    }
    if (unit === 's' || unit === 'sec' || unit === 'secs' || unit === 'second' || unit === 'seconds') {
      return { value: value / 60, canonicalUnit: 'min', sourceUnit }
    }
    if (unit === 'hr' || unit === 'hour' || unit === 'hours' || unit === 'h') {
      return { value: value * 60, canonicalUnit: 'min', sourceUnit }
    }
    throw new Error(`Unsupported duration unit: ${sourceUnit}`)
  }
  if (metric === 'walking_running_distance') {
    if (unit === 'm' || unit === 'meter' || unit === 'meters') {
      return { value, canonicalUnit: 'm', sourceUnit }
    }
    if (unit === 'km' || unit === 'kilometer' || unit === 'kilometers') {
      return { value: value * 1000, canonicalUnit: 'm', sourceUnit }
    }
    if (unit === 'mi' || unit === 'mile' || unit === 'miles') {
      return { value: value * 1609.344, canonicalUnit: 'm', sourceUnit }
    }
    if (unit === 'ft' || unit === 'feet') {
      return { value: value * 0.3048, canonicalUnit: 'm', sourceUnit }
    }
    if (unit === 'yd' || unit === 'yard' || unit === 'yards') {
      return { value: value * 0.9144, canonicalUnit: 'm', sourceUnit }
    }
    throw new Error(`Unsupported distance unit: ${sourceUnit}`)
  }
  if (unit === 'count/min' || unit === 'bpm' || unit === 'beats/min') {
    return { value, canonicalUnit: 'bpm', sourceUnit }
  }
  throw new Error(`Unsupported heart-rate unit: ${sourceUnit}`)
}

export function convertDurationToMinutes(value: number, unit: string): number {
  const converted = convertQuantityUnit('exercise_time', value, unit)
  return converted.value
}

export function convertEnergyToKcal(value: number, unit: string): number {
  return convertQuantityUnit('active_energy', value, unit).value
}

export function convertDistanceToMeters(value: number, unit: string): number {
  return convertQuantityUnit('walking_running_distance', value, unit).value
}
