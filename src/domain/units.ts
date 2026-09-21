/** International avoirdupois pound in kilograms (exact). */
export const POUNDS_TO_KILOGRAMS = 0.45359237

export function poundsToKilograms(pounds: number): number {
  return pounds * POUNDS_TO_KILOGRAMS
}

export function kilogramsToPounds(kilograms: number): number {
  return kilograms / POUNDS_TO_KILOGRAMS
}
