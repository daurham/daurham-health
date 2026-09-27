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
