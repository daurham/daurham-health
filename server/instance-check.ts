import { pathToFileURL } from 'node:url'
import { getSql, type Sql } from './db.js'
import { loadLocalEnv } from './env.js'
import { listMigrationFiles } from './migrate.js'

export type InstanceBootstrapSnapshot = {
  expectedMigrations: string[]
  appliedMigrations: string[]
  activeLegacyRoutineCodes: string[]
  legacyReferenceCount: number
  beginnerCalisthenicsActive: boolean
  activeExerciseCount: number
  activeOwnerRoutineCount: number
}

export type InstanceDiagnostic = {
  level: 'ok' | 'warning' | 'error'
  key: string
  message: string
}

export function inspectInstanceBootstrap(
  snapshot: InstanceBootstrapSnapshot,
): InstanceDiagnostic[] {
  const diagnostics: InstanceDiagnostic[] = []
  const applied = new Set(snapshot.appliedMigrations)
  const pending = snapshot.expectedMigrations.filter((name) => !applied.has(name))

  diagnostics.push(
    pending.length === 0
      ? { level: 'ok', key: 'SCHEMA', message: 'Database schema is current' }
      : {
          level: 'error',
          key: 'SCHEMA',
          message: `Pending migrations: ${pending.join(', ')}`,
        },
  )

  if (snapshot.legacyReferenceCount === 0) {
    diagnostics.push(
      snapshot.activeLegacyRoutineCodes.length === 0
        ? {
            level: 'ok',
            key: 'LEGACY_ROUTINES',
            message: 'Fresh-instance legacy A/B/C routines are hidden',
          }
        : {
            level: 'error',
            key: 'LEGACY_ROUTINES',
            message:
              'Legacy A/B/C routines are active without historical references; run the current migrations',
          },
    )
  } else {
    diagnostics.push({
      level: snapshot.activeLegacyRoutineCodes.length > 0 ? 'ok' : 'warning',
      key: 'LEGACY_ROUTINES',
      message:
        snapshot.activeLegacyRoutineCodes.length > 0
          ? 'Historical A/B/C routine family is retained for this established instance'
          : 'Historical A/B/C sessions exist but the legacy routine family is inactive',
    })
  }

  diagnostics.push(
    snapshot.beginnerCalisthenicsActive
      ? {
          level: 'ok',
          key: 'PRODUCT_BUILTINS',
          message: 'Beginner Calisthenics product built-in is active',
        }
      : {
          level: 'error',
          key: 'PRODUCT_BUILTINS',
          message: 'Beginner Calisthenics product built-in is missing or inactive',
        },
  )

  diagnostics.push(
    snapshot.activeExerciseCount > 0
      ? {
          level: 'ok',
          key: 'EXERCISE_CATALOG',
          message: `${snapshot.activeExerciseCount} active exercise definitions available`,
        }
      : {
          level: 'error',
          key: 'EXERCISE_CATALOG',
          message: 'No active exercise definitions are available',
        },
  )

  diagnostics.push({
    level: 'ok',
    key: 'OWNER_ROUTINES',
    message: `${snapshot.activeOwnerRoutineCount} active owner-created routine(s)`,
  })

  return diagnostics
}

export async function readInstanceBootstrapSnapshot(
  sql: Sql = await getSql(),
): Promise<InstanceBootstrapSnapshot> {
  const expectedMigrations = await listMigrationFiles()
  const appliedRows = (await sql.query(
    'SELECT filename FROM schema_migrations ORDER BY filename',
  )) as Array<{ filename: string }>

  const legacyRows = (await sql.query(
    `SELECT routine_code
       FROM workout_templates
      WHERE origin_kind = 'seeded'
        AND routine_code IN ('A','B','C')
        AND version = '1.3.1'
        AND is_active = true
      ORDER BY routine_code`,
  )) as Array<{ routine_code: string }>

  const referenceRows = (await sql.query(
    `SELECT COUNT(*)::int AS count
       FROM workout_sessions AS session
      WHERE session.routine_code IN ('A','B','C')
         OR session.workout_template_id IN (
           SELECT id
             FROM workout_templates
            WHERE origin_kind = 'seeded'
              AND routine_code IN ('A','B','C')
              AND version = '1.3.1'
         )`,
  )) as Array<{ count: number | string }>

  const builtinRows = (await sql.query(
    `SELECT EXISTS (
       SELECT 1
         FROM workout_templates
        WHERE origin_kind = 'seeded'
          AND routine_code = 'CAL-BEG'
          AND version = '1.0.0'
          AND is_active = true
     ) AS active`,
  )) as Array<{ active: boolean }>

  const exerciseRows = (await sql.query(
    'SELECT COUNT(*)::int AS count FROM exercise_definitions WHERE is_active = true',
  )) as Array<{ count: number | string }>

  const ownerRoutineRows = (await sql.query(
    `SELECT COUNT(*)::int AS count
       FROM workout_templates
      WHERE origin_kind = 'owner' AND is_active = true`,
  )) as Array<{ count: number | string }>

  return {
    expectedMigrations,
    appliedMigrations: appliedRows.map((row) => row.filename),
    activeLegacyRoutineCodes: legacyRows.map((row) => row.routine_code),
    legacyReferenceCount: Number(referenceRows[0]?.count ?? 0),
    beginnerCalisthenicsActive: builtinRows[0]?.active === true,
    activeExerciseCount: Number(exerciseRows[0]?.count ?? 0),
    activeOwnerRoutineCount: Number(ownerRoutineRows[0]?.count ?? 0),
  }
}

async function main(): Promise<void> {
  await loadLocalEnv()
  try {
    const diagnostics = inspectInstanceBootstrap(await readInstanceBootstrapSnapshot())
    for (const item of diagnostics) {
      const mark = item.level === 'ok' ? '✓' : item.level === 'warning' ? '!' : '✗'
      console.log(`${mark} [${item.key}] ${item.message}`)
    }
    if (diagnostics.some((item) => item.level === 'error')) {
      process.exitCode = 1
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Instance check failed'
    console.error(`✗ [INSTANCE] ${message}`)
    console.error('Run npm run migrate first, then retry npm run instance:check.')
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
