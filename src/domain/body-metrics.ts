import { kilogramsToPounds, poundsToKilograms } from './units.js'

export const FIT_PROFILE_SOURCE_KEY = 'fit_profile_xlsx' as const
export const BODY_MEASUREMENT_SESSION_ENTITY = 'body_measurement_session' as const

export const BODY_VALUE_KINDS = [
  'measured',
  'device_estimated',
  'vendor_derived',
  'manual',
] as const

export type BodyValueKind = (typeof BODY_VALUE_KINDS)[number]

export const CANONICAL_UNITS = [
  'kg',
  'percent',
  'ratio',
  'index',
  'kcal_per_day',
  'years',
] as const

export type CanonicalUnit = (typeof CANONICAL_UNITS)[number]

export type FitProfileConversion = 'none' | 'lb_to_kg'

export type FitProfileMetricMapping = {
  header: string
  key: string
  unit: CanonicalUnit
  valueKind: BodyValueKind
  conversion: FitProfileConversion
}

export const FIT_PROFILE_METRIC_MAPPINGS: readonly FitProfileMetricMapping[] = [
  { header: 'Weight(lb)', key: 'weight', unit: 'kg', valueKind: 'measured', conversion: 'lb_to_kg' },
  { header: 'Body Fat(%)', key: 'body_fat_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'BMI', key: 'bmi', unit: 'ratio', valueKind: 'vendor_derived', conversion: 'none' },
  { header: 'Skeletal Muscle(%)', key: 'skeletal_muscle_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Muscle Mass(lb)', key: 'muscle_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Protein(%)', key: 'protein_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'BMR(kcal)', key: 'bmr', unit: 'kcal_per_day', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Fat-free Body Weight(lb)', key: 'fat_free_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Subcutaneous Fat Percentage(%)', key: 'subcutaneous_fat_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Visceral Fat', key: 'visceral_fat', unit: 'index', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Body Water(%)', key: 'body_water_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Bone Mass(lb)', key: 'bone_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Metabolic Age', key: 'metabolic_age', unit: 'years', valueKind: 'vendor_derived', conversion: 'none' },
  { header: 'Subcutaneous Fat(lb)', key: 'subcutaneous_fat_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Skeleton Muscle Mass(lb)', key: 'skeletal_muscle_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Waist-Hip Ratio', key: 'waist_hip_ratio', unit: 'ratio', valueKind: 'vendor_derived', conversion: 'none' },
  { header: 'SMI', key: 'skeletal_muscle_index', unit: 'index', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Muscle Mass Percentage(%)', key: 'muscle_mass_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Bone Mass Percentage(%)', key: 'bone_mass_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Body Water Mass(lb)', key: 'body_water_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Protein Mass(lb)', key: 'protein_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Body Fat Mass(lb)', key: 'body_fat_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Sinew trunk ratio(%)', key: 'trunk_muscle_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Trunk body fat mass(lb)', key: 'trunk_fat_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Left arm muscle ratio(%)', key: 'left_arm_muscle_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Right Arm Muscle Rate(%)', key: 'right_arm_muscle_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'left arm body fat mass(lb)', key: 'left_arm_fat_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Body fat mass in right arm(lb)', key: 'right_arm_fat_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Left leg muscle ratio(%)', key: 'left_leg_muscle_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Right lower limb muscle ratio(%)', key: 'right_leg_muscle_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Left leg body fat mass(lb)', key: 'left_leg_fat_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'body fat mass in right leg(lb)', key: 'right_leg_fat_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Sinew trunk mass(lb)', key: 'trunk_muscle_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Trunk fat ratio(%)', key: 'trunk_fat_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Left arm muscle mass(lb)', key: 'left_arm_muscle_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Right arm muscle mass(lb)', key: 'right_arm_muscle_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Fat ratio of left upper limb(%)', key: 'left_arm_fat_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Body fat rate of right upper limb(%)', key: 'right_arm_fat_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'left leg muscle mass(lb)', key: 'left_leg_muscle_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Right leg muscle mass(lb)', key: 'right_leg_muscle_mass', unit: 'kg', valueKind: 'device_estimated', conversion: 'lb_to_kg' },
  { header: 'Body fat rate of left lower limb(%)', key: 'left_leg_fat_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
  { header: 'Body fat rate of right lower limb(%)', key: 'right_leg_fat_percentage', unit: 'percent', valueKind: 'device_estimated', conversion: 'none' },
]

export const FIT_PROFILE_VENDOR_HEADERS = [
  'Obesity Level',
  'Obesity(%)',
  'Muscle Control(lb)',
  'Fat Control(lb)',
  'Weight Control(lb)',
  'Target Weight(lb)',
  'Body Type',
  'Health Score',
] as const

export const FIT_PROFILE_CONTEXT_HEADERS = [
  'Measure Time',
  'Device MAC Address',
  'Device Name',
] as const

export const FIT_PROFILE_REQUIRED_HEADERS: readonly string[] = [
  'Measure Time',
  'Weight(lb)',
  'Body Fat(%)',
  'BMI',
  'Skeletal Muscle(%)',
  'Muscle Mass(lb)',
  'Protein(%)',
  'BMR(kcal)',
  'Fat-free Body Weight(lb)',
  'Subcutaneous Fat Percentage(%)',
  'Visceral Fat',
  'Body Water(%)',
  'Bone Mass(lb)',
  'Metabolic Age',
  'Subcutaneous Fat(lb)',
  'Skeleton Muscle Mass(lb)',
  'Obesity Level',
  'Waist-Hip Ratio',
  'Obesity(%)',
  'SMI',
  'Muscle Mass Percentage(%)',
  'Bone Mass Percentage(%)',
  'Body Water Mass(lb)',
  'Protein Mass(lb)',
  'Body Fat Mass(lb)',
  'Muscle Control(lb)',
  'Fat Control(lb)',
  'Weight Control(lb)',
  'Target Weight(lb)',
  'Body Type',
  'Health Score',
  'Sinew trunk ratio(%)',
  'Trunk body fat mass(lb)',
  'Left arm muscle ratio(%)',
  'Right Arm Muscle Rate(%)',
  'left arm body fat mass(lb)',
  'Body fat mass in right arm(lb)',
  'Left leg muscle ratio(%)',
  'Right lower limb muscle ratio(%)',
  'Left leg body fat mass(lb)',
  'body fat mass in right leg(lb)',
  'Sinew trunk mass(lb)',
  'Trunk fat ratio(%)',
  'Left arm muscle mass(lb)',
  'Right arm muscle mass(lb)',
  'Fat ratio of left upper limb(%)',
  'Body fat rate of right upper limb(%)',
  'left leg muscle mass(lb)',
  'Right leg muscle mass(lb)',
  'Body fat rate of left lower limb(%)',
  'Body fat rate of right lower limb(%)',
  'Device MAC Address',
  'Device Name',
]

export const PRIMARY_BODY_METRIC_KEYS = [
  'weight',
  'body_fat_percentage',
  'muscle_mass',
  'body_water_percentage',
] as const

export function mappingByHeader(
  header: string,
): FitProfileMetricMapping | undefined {
  return FIT_PROFILE_METRIC_MAPPINGS.find((item) => item.header === header)
}

export function normalizeFitProfileMetric(
  mapping: FitProfileMetricMapping,
  sourceValue: number,
): { key: string; value: number; unit: CanonicalUnit; valueKind: BodyValueKind } {
  const value =
    mapping.conversion === 'lb_to_kg'
      ? poundsToKilograms(sourceValue)
      : sourceValue
  return {
    key: mapping.key,
    value,
    unit: mapping.unit,
    valueKind: mapping.valueKind,
  }
}

export function displayValueForMetric(
  unit: CanonicalUnit,
  canonicalValue: number,
): { value: number; unit: string } {
  if (unit === 'kg') {
    return { value: kilogramsToPounds(canonicalValue), unit: 'lb' }
  }
  if (unit === 'kcal_per_day') {
    return { value: canonicalValue, unit: 'kcal/day' }
  }
  if (unit === 'percent') {
    return { value: canonicalValue, unit: '%' }
  }
  if (unit === 'years') {
    return { value: canonicalValue, unit: 'years' }
  }
  return { value: canonicalValue, unit }
}

export const FIT_PROFILE_XLSX_ACCEPT =
  '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const MISSING_NUMERIC_SENTINELS = new Set([
  '',
  '-',
  '--',
  '- -',
  '–',
  '—',
  'n/a',
  'na',
])

export type OptionalNumericCell =
  | { kind: 'missing' }
  | { kind: 'number'; value: number }
  | { kind: 'invalid' }

/** Normalize Fit Profile optional numeric cells. Does not treat signed numbers as missing. */
export function parseOptionalNumericCell(value: unknown): OptionalNumericCell {
  if (value == null) {
    return { kind: 'missing' }
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'invalid' }
  }
  if (typeof value === 'boolean') {
    return { kind: 'invalid' }
  }
  const text = String(value).trim()
  if (text.length === 0) {
    return { kind: 'missing' }
  }
  const collapsed = text.replace(/\s+/g, ' ')
  if (MISSING_NUMERIC_SENTINELS.has(collapsed.toLowerCase())) {
    return { kind: 'missing' }
  }
  if (/^[\s\-–—]+$/.test(text)) {
    return { kind: 'missing' }
  }
  const parsed = Number(text)
  if (!Number.isFinite(parsed)) {
    return { kind: 'invalid' }
  }
  return { kind: 'number', value: parsed }
}
