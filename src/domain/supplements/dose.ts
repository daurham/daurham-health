import { SupplementInputError } from './errors.js'

const CANONICAL_UNITS = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  mcg: 'mcg',
  ug: 'mcg',
  µg: 'mcg',
  microgram: 'mcg',
  micrograms: 'mcg',
  iu: 'IU',
  'i.u.': 'IU',
  'i.u': 'IU',
  ml: 'mL',
  milliliter: 'mL',
  milliliters: 'mL',
  millilitre: 'mL',
  millilitres: 'mL',
  tablet: 'tablet',
  tablets: 'tablet',
  capsule: 'capsule',
  capsules: 'capsule',
  softgel: 'softgel',
  softgels: 'softgel',
  gummy: 'gummy',
  gummies: 'gummy',
  serving: 'serving',
  servings: 'serving',
  scoop: 'scoop',
  scoops: 'scoop',
  drop: 'drop',
  drops: 'drop',
  packet: 'packet',
  packets: 'packet',
} as const

export function normalizeDoseUnit(input: string): string {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new SupplementInputError('Dose unit is required')
  }
  if (trimmed.length > 40) {
    throw new SupplementInputError('Dose unit is too long')
  }
  const canonical = CANONICAL_UNITS[trimmed.toLowerCase() as keyof typeof CANONICAL_UNITS]
  return canonical ?? trimmed
}

export function formatDoseAmount(amount: number): string {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

export function formatPlannedDose(amount: number, unit: string): string {
  return `${formatDoseAmount(amount)} ${unit}`
}
