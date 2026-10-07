import { z } from 'zod'
import { isoDateSchema } from './training.js'

const boundedOptionalText = (max: number) =>
  z
    .union([z.string().max(max), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null) return null
      const trimmed = value.trim()
      return trimmed === '' ? null : trimmed
    })

export const healthProfileSchema = z.object({
  dateOfBirth: isoDateSchema.nullable(),
  heightCm: z.number().min(50).max(250).nullable(),
  persistentHealthContext: z.string().nullable(),
  trainingLimitations: z.string().nullable(),
  dietaryContext: z.string().nullable(),
  bodyMeasurementProtocol: z.string().nullable(),
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
