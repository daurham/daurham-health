import { z } from 'zod'
import { isoDateSchema } from './training.js'

const boundedOptionalText = (max: number) =>
  z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((value) => {
      if (value == null) return null
      const trimmed = value.trim()
      return trimmed === '' ? null : trimmed
    })

export const clinicalConditionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  status: z.enum(['active', 'resolved', 'unknown']).default('active'),
})
export type ClinicalCondition = z.infer<typeof clinicalConditionSchema>

export const clinicalAllergySchema = z.object({
  substance: z.string().trim().min(1).max(160),
  reaction: boundedOptionalText(240),
  severity: z.enum(['unknown', 'mild', 'moderate', 'severe']).default('unknown'),
})
export type ClinicalAllergy = z.infer<typeof clinicalAllergySchema>

export const clinicalMedicationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  dose: boundedOptionalText(120),
  frequency: boundedOptionalText(120),
  status: z.enum(['active', 'paused', 'discontinued']).default('active'),
})
export type ClinicalMedication = z.infer<typeof clinicalMedicationSchema>

const clinicalConditionsSchema = z.array(clinicalConditionSchema).max(50)
const clinicalAllergiesSchema = z.array(clinicalAllergySchema).max(50)
const clinicalMedicationsSchema = z.array(clinicalMedicationSchema).max(100)

export const healthProfileSchema = z.object({
  dateOfBirth: isoDateSchema.nullable(),
  heightCm: z.number().min(50).max(250).nullable(),
  persistentHealthContext: z.string().nullable(),
  trainingLimitations: z.string().nullable(),
  dietaryContext: z.string().nullable(),
  bodyMeasurementProtocol: z.string().nullable(),
  clinicalConditions: clinicalConditionsSchema.default([]),
  clinicalAllergies: clinicalAllergiesSchema.default([]),
  clinicalMedications: clinicalMedicationsSchema.default([]),
  updatedAt: z.string().nullable(),
})
export type HealthProfile = z.infer<typeof healthProfileSchema>

export const healthProfileInputSchema = z.object({
  dateOfBirth: z.union([isoDateSchema, z.null()]).optional().default(null),
  heightCm: z.union([z.number().min(50).max(250), z.null()]).optional().default(null),
  persistentHealthContext: boundedOptionalText(2000),
  trainingLimitations: boundedOptionalText(2000),
  dietaryContext: boundedOptionalText(2000),
  bodyMeasurementProtocol: boundedOptionalText(1000),
  clinicalConditions: clinicalConditionsSchema.optional(),
  clinicalAllergies: clinicalAllergiesSchema.optional(),
  clinicalMedications: clinicalMedicationsSchema.optional(),
})
export type HealthProfileInput = z.infer<typeof healthProfileInputSchema>

export function ageYearsOnDate(dateOfBirth: string, asOf: string): number {
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split('-').map(Number)
  const [year, month, day] = asOf.split('-').map(Number)
  if (![birthYear, birthMonth, birthDay, year, month, day].every(Number.isInteger)) {
    throw new Error('Invalid calendar date')
  }
  if (asOf < dateOfBirth) {
    throw new Error('Date of birth cannot be after the as-of date')
  }
  let age = year - birthYear
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1
  return age
}

export function inchesToCentimeters(inches: number): number {
  return inches * 2.54
}

export function centimetersToInches(centimeters: number): number {
  return centimeters / 2.54
}
