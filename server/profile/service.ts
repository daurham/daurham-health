import { healthProfileInputSchema, healthProfileSchema, ageYearsOnDate } from '../../src/domain/health-profile.js'
import { getSql } from '../db.js'
import { currentHealthDate } from '../health-time.js'
import { HttpError } from '../http.js'

type ProfileRow = {
  date_of_birth: string | Date | null
  height_cm: string | number | null
  persistent_health_context: string | null
  training_limitations: string | null
  dietary_context: string | null
  updated_at: string | Date | null
}

function isoDate(value: string | Date | null): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value.slice(0, 10)
}

function isoInstant(value: string | Date | null): string | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function emptyProfile() {
  return healthProfileSchema.parse({
    dateOfBirth: null,
    heightCm: null,
    persistentHealthContext: null,
    trainingLimitations: null,
    dietaryContext: null,
    updatedAt: null,
  })
}

export async function getHealthProfile() {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT date_of_birth::text AS date_of_birth,
            height_cm::text AS height_cm,
            persistent_health_context,
            training_limitations,
            dietary_context,
            updated_at
       FROM health_profile
      WHERE singleton_id = 1
      LIMIT 1`,
  )) as ProfileRow[]
  const row = rows[0]
  if (!row) return emptyProfile()
  return healthProfileSchema.parse({
    dateOfBirth: isoDate(row.date_of_birth),
    heightCm: row.height_cm == null ? null : Number(row.height_cm),
    persistentHealthContext: row.persistent_health_context,
    trainingLimitations: row.training_limitations,
    dietaryContext: row.dietary_context,
    updatedAt: isoInstant(row.updated_at),
  })
}

export async function putHealthProfile(body: unknown) {
  const parsed = healthProfileInputSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid Health Profile')
  }
  const input = parsed.data
  if (input.dateOfBirth) {
    const today = await currentHealthDate()
    if (input.dateOfBirth > today) {
      throw new HttpError(400, 'Date of birth cannot be in the future')
    }
    let age: number
    try {
      age = ageYearsOnDate(input.dateOfBirth, today)
    } catch {
      throw new HttpError(400, 'Date of birth is invalid')
    }
    if (age > 130) {
      throw new HttpError(400, 'Date of birth is outside the supported range')
    }
  }

  const sql = await getSql()
  await sql.query(
    `INSERT INTO health_profile (
       singleton_id,
       date_of_birth,
       height_cm,
       persistent_health_context,
       training_limitations,
       dietary_context,
       created_at,
       updated_at
     ) VALUES (
       1, $1::date, $2::numeric, $3, $4, $5, now(), now()
     )
     ON CONFLICT (singleton_id) DO UPDATE SET
       date_of_birth = EXCLUDED.date_of_birth,
       height_cm = EXCLUDED.height_cm,
       persistent_health_context = EXCLUDED.persistent_health_context,
       training_limitations = EXCLUDED.training_limitations,
       dietary_context = EXCLUDED.dietary_context,
       updated_at = now()`,
    [
      input.dateOfBirth,
      input.heightCm,
      input.persistentHealthContext,
      input.trainingLimitations,
      input.dietaryContext,
    ],
  )
  return getHealthProfile()
}
