import { z } from 'zod'
import { healthProfileInputSchema, healthProfileSchema, ageYearsOnDate } from '../../src/domain/health-profile.js'
import { getSql, type Sql } from '../db.js'
import { currentHealthDate } from '../health-time.js'
import { HttpError } from '../http.js'

type ProfileRow = {
  sex_for_physiology: 'male' | 'female' | 'other' | null
  date_of_birth: string | Date | null
  height_cm: string | number | null
  persistent_health_context: string | null
  training_limitations: string | null
  dietary_context: string | null
  body_measurement_protocol: string | null
  clinical_conditions: unknown
  clinical_allergies: unknown
  clinical_medications: unknown
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
    sexForPhysiology: null,
    dateOfBirth: null,
    heightCm: null,
    persistentHealthContext: null,
    trainingLimitations: null,
    dietaryContext: null,
    bodyMeasurementProtocol: null,
    clinicalConditions: [],
    clinicalAllergies: [],
    clinicalMedications: [],
    updatedAt: null,
  })
}

export async function getHealthProfile(sqlOverride?: Sql) {
  const sql = sqlOverride ?? await getSql()
  const rows = (await sql.query(
    `SELECT sex_for_physiology,
            date_of_birth::text AS date_of_birth,
            height_cm::text AS height_cm,
            persistent_health_context,
            training_limitations,
            dietary_context,
            body_measurement_protocol,
            clinical_conditions,
            clinical_allergies,
            clinical_medications,
            updated_at
       FROM health_profile
      WHERE singleton_id = 1
      LIMIT 1`,
  )) as ProfileRow[]
  const row = rows[0]
  if (!row) return emptyProfile()
  return healthProfileSchema.parse({
    sexForPhysiology: row.sex_for_physiology,
    dateOfBirth: isoDate(row.date_of_birth),
    heightCm: row.height_cm == null ? null : Number(row.height_cm),
    persistentHealthContext: row.persistent_health_context,
    trainingLimitations: row.training_limitations,
    dietaryContext: row.dietary_context,
    bodyMeasurementProtocol: row.body_measurement_protocol,
    clinicalConditions: row.clinical_conditions ?? [],
    clinicalAllergies: row.clinical_allergies ?? [],
    clinicalMedications: row.clinical_medications ?? [],
    updatedAt: isoInstant(row.updated_at),
  })
}

// All writers supply the last GET version, or null for an empty singleton.
const profileWriteSchema = healthProfileInputSchema.extend({
  expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
})

export async function putHealthProfile(body: unknown, sqlOverride?: Sql) {
  const parsed = profileWriteSchema.safeParse(body)
  if (!parsed.success) {
    if (body && typeof body === 'object' && !Object.prototype.hasOwnProperty.call(body, 'expectedUpdatedAt')) {
      throw new HttpError(428, 'Reload Health Profile before saving: a version is required.', undefined, 'PROFILE_VERSION_REQUIRED')
    }
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid Health Profile')
  }
  const input = parsed.data
  if (input.dateOfBirth) {
    const today = await currentHealthDate()
    if (input.dateOfBirth > today) throw new HttpError(400, 'Date of birth cannot be in the future')
    let age: number
    try { age = ageYearsOnDate(input.dateOfBirth, today) }
    catch { throw new HttpError(400, 'Date of birth is invalid') }
    if (age > 130) throw new HttpError(400, 'Date of birth is outside the supported range')
  }

  const names = [
    'sexForPhysiology', 'dateOfBirth', 'heightCm', 'persistentHealthContext',
    'trainingLimitations', 'dietaryContext', 'bodyMeasurementProtocol',
    'clinicalConditions', 'clinicalAllergies', 'clinicalMedications',
  ] as const
  const supplied = names.map((name) => Object.prototype.hasOwnProperty.call(body, name))
  const values = [
    input.sexForPhysiology ?? null, input.dateOfBirth, input.heightCm,
    input.persistentHealthContext, input.trainingLimitations, input.dietaryContext,
    input.bodyMeasurementProtocol,
    JSON.stringify(input.clinicalConditions ?? []),
    JSON.stringify(input.clinicalAllergies ?? []),
    JSON.stringify(input.clinicalMedications ?? []),
  ]
  const sql = sqlOverride ?? await getSql()
  let rows: Array<{ singleton_id: number }>
  if (input.expectedUpdatedAt === null) {
    rows = await sql.query(
      `INSERT INTO health_profile (
        singleton_id, sex_for_physiology, date_of_birth, height_cm,
        persistent_health_context, training_limitations, dietary_context,
        body_measurement_protocol, clinical_conditions, clinical_allergies,
        clinical_medications, created_at, updated_at
      ) VALUES (1, $1::text, $2::date, $3::numeric, $4, $5, $6, $7,
        $8::jsonb, $9::jsonb, $10::jsonb, clock_timestamp(), clock_timestamp())
      ON CONFLICT (singleton_id) DO NOTHING RETURNING singleton_id`,
      values,
    ) as Array<{ singleton_id: number }>
  } else {
    rows = await sql.query(
      `UPDATE health_profile SET
        sex_for_physiology = CASE WHEN $12::boolean THEN $1::text ELSE sex_for_physiology END,
        date_of_birth = CASE WHEN $13::boolean THEN $2::date ELSE date_of_birth END,
        height_cm = CASE WHEN $14::boolean THEN $3::numeric ELSE height_cm END,
        persistent_health_context = CASE WHEN $15::boolean THEN $4::text ELSE persistent_health_context END,
        training_limitations = CASE WHEN $16::boolean THEN $5::text ELSE training_limitations END,
        dietary_context = CASE WHEN $17::boolean THEN $6::text ELSE dietary_context END,
        body_measurement_protocol = CASE WHEN $18::boolean THEN $7::text ELSE body_measurement_protocol END,
        clinical_conditions = CASE WHEN $19::boolean THEN $8::jsonb ELSE clinical_conditions END,
        clinical_allergies = CASE WHEN $20::boolean THEN $9::jsonb ELSE clinical_allergies END,
        clinical_medications = CASE WHEN $21::boolean THEN $10::jsonb ELSE clinical_medications END,
        updated_at = GREATEST(clock_timestamp(), date_trunc('milliseconds', updated_at) + interval '1 millisecond')
      WHERE singleton_id = 1 AND date_trunc('milliseconds', updated_at) = $11::timestamptz
      RETURNING singleton_id`,
      [...values, input.expectedUpdatedAt, ...supplied],
    ) as Array<{ singleton_id: number }>
  }
  if (rows.length !== 1) {
    throw new HttpError(409,
      'Health Profile changed elsewhere. Your draft was not saved. Reload and review before saving.',
      undefined, 'PROFILE_STALE_WRITE')
  }
  return getHealthProfile(sqlOverride)
}
