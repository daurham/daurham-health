/** International avoirdupois pound in kilograms (exact). */
export const POUNDS_TO_KILOGRAMS = 0.45359237

export function poundsToKilograms(pounds: number): number {
  return pounds * POUNDS_TO_KILOGRAMS
}

export function kilogramsToPounds(kilograms: number): number {
  return kilograms / POUNDS_TO_KILOGRAMS
}

/** Exact international inch in centimeters. */
export const INCHES_TO_CENTIMETERS = 2.54

export function inchesToCentimeters(inches: number): number {
  return inches * INCHES_TO_CENTIMETERS
}

export function centimetersToInches(centimeters: number): number {
  return centimeters / INCHES_TO_CENTIMETERS
}


/** Exact international mile in meters. */
export const METERS_PER_MILE = 1609.344

export function milesToMeters(miles: number): number {
  return miles * METERS_PER_MILE
}

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE
}

export function kilometersToMeters(kilometers: number): number {
  return kilometers * 1000
}

export function metersToKilometers(meters: number): number {
  return meters / 1000
}

export function distanceToMeters(value: number, unit: 'mi' | 'km'): number {
  return unit === 'mi' ? milesToMeters(value) : kilometersToMeters(value)
}

export function secondsPerMile(distanceMeters: number, durationSec: number): number | null {
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSec) || distanceMeters <= 0 || durationSec <= 0) {
    return null
  }
  return durationSec / metersToMiles(distanceMeters)
}

export function formatPaceSecondsPerMile(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  const rounded = Math.round(value)
  const minutes = Math.floor(rounded / 60)
  const seconds = String(rounded % 60).padStart(2, '0')
  return `${minutes}:${seconds}/mi`
}
