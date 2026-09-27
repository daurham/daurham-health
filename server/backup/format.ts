import { createHash } from 'node:crypto'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { bodyGoalDisplayName, goalKindDefinition } from '../../src/domain/goals.js'
import { NUTRITION_FOOD_ENTITY, USDA_FOODDATA_SOURCE_KEY } from '../../src/domain/nutrition/config.js'
import { HEALTH_CALENDAR_TIME_ZONE } from '../../src/domain/time.js'
import {
  AUTH_TABLES_EXCLUDED,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLES,
  LATEST_SCHEMA_MIGRATION,
  backupTable,
  tablesForProfile,
  type BackupTable,
} from './inventory.js'

export type BackupProfile = 'full' | 'portable'
export type BackupCell = string | boolean | null
export type BackupRow = Record<string, BackupCell>

export type BackupTableFile = {
  rows: number
  file: string
  sha256: string
}

export type BackupManifest = {
  format: typeof BACKUP_FORMAT
  formatVersion: number
  profile: BackupProfile
  createdAt: string
  calendarTimezone: typeof HEALTH_CALENDAR_TIME_ZONE
  schemaMigration: string
  appVersionOrCommit: string
  tables: Record<string, BackupTableFile>
  csv: Record<string, { file: string; sha256: string }>
  contentSha256: string
}

export type VerifiedBackup = {
  manifest: BackupManifest
  tables: Record<string, BackupRow[]>
  errors: string[]
}

const README_NAME = 'README.txt'
const MANIFEST_NAME = 'manifest.json'

export function tableFileName(table: string): string {
  return `tables/${table}.ndjson`
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function contentChecksum(tables: Record<string, BackupTableFile>): string {
  const lines = Object.keys(tables)
    .sort()
    .map((name) => `${name}\n${tables[name]?.sha256 ?? ''}\n`)
  return sha256(strToU8(lines.join('')))
}

export function encodeNdjson(rows: readonly BackupRow[]): Uint8Array {
  if (rows.length === 0) {
    return new Uint8Array()
  }
  return strToU8(`${rows.map((row) => JSON.stringify(row)).join('\n')}\n`)
}

export function decodeNdjson(bytes: Uint8Array, table: string): { rows: BackupRow[]; errors: string[] } {
  const errors: string[] = []
  const text = strFromU8(bytes)
  if (text.length === 0) {
    return { rows: [], errors }
  }
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n')
  const rows: BackupRow[] = []
  lines.forEach((line, index) => {
    if (line.length === 0) {
      errors.push(`${table}: blank line ${index + 1}`)
      return
    }
    try {
      const parsed = JSON.parse(line) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        errors.push(`${table}: line ${index + 1} is not an object`)
        return
      }
      const row: BackupRow = {}
      for (const [key, value] of Object.entries(parsed)) {
        if (value == null) {
          row[key] = null
          continue
        }
        if (typeof value === 'string' || typeof value === 'boolean') {
          row[key] = value
          continue
        }
        errors.push(`${table}: line ${index + 1} column ${key} is not text, boolean, or null`)
      }
      rows.push(row)
    } catch {
      errors.push(`${table}: line ${index + 1} is not valid NDJSON`)
    }
  })
  return { rows, errors }
}

function csvEscape(value: BackupCell): string {
  if (value == null) {
    return ''
  }
  const text = typeof value === 'boolean' ? (value ? 'true' : 'false') : value
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

export function encodeCsv(header: readonly string[], rows: readonly BackupRow[]): Uint8Array {
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push(header.map((key) => csvEscape(row[key] ?? null)).join(','))
  }
  return strToU8(`${lines.join('\n')}\n`)
}

function csvBundle(tables: Record<string, BackupRow[]>): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  const entries = tables.nutrition_entries ?? []
  files['csv/nutrition_entries.csv'] = encodeCsv(
    ['id', 'log_date', 'meal', 'food_name', 'brand', 'serving_quantity', 'serving_unit', 'grams', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'notes'],
    entries,
  )
  const sessions = new Map((tables.body_measurement_sessions ?? []).map((row) => [row.id, row]))
  const metrics = (tables.body_metrics ?? []).map((metric) => {
    const session = typeof metric.measurement_session_id === 'string' ? sessions.get(metric.measurement_session_id) : undefined
    return {
      id: metric.id ?? null,
      measured_at: session?.measured_at ?? null,
      timezone: session?.timezone ?? null,
      metric_key: metric.metric_key ?? null,
      value: metric.value ?? null,
      unit: metric.unit ?? null,
      value_kind: metric.value_kind ?? null,
    }
  })
  files['csv/body_measurements.csv'] = encodeCsv(
    ['id', 'measured_at', 'timezone', 'metric_key', 'value', 'unit', 'value_kind'],
    metrics,
  )
  files['csv/training_sessions.csv'] = encodeCsv(
    ['id', 'workout_date', 'routine_code', 'template_name', 'duration_min', 'effort', 'pain_level', 'notes'],
    tables.workout_sessions ?? [],
  )
  files['csv/activity_daily.csv'] = encodeCsv(
    ['id', 'summary_date', 'timezone', 'steps_count', 'active_energy_kcal', 'exercise_minutes', 'walking_running_distance_m', 'resting_heart_rate_bpm'],
    tables.activity_daily_summaries ?? [],
  )
  files['csv/sleep_nights.csv'] = encodeCsv(
    ['id', 'sleep_date', 'timezone', 'logical_source_key', 'source_name', 'total_sleep_minutes', 'observation_status', 'analysis_eligible'],
    tables.sleep_nightly_summaries ?? [],
  )
  files['csv/sleep_vital_samples.csv'] = encodeCsv(
    ['id', 'metric_key', 'value_numeric', 'unit', 'observed_at', 'start_at', 'end_at', 'source_family'],
    tables.sleep_vital_samples ?? [],
  )
  return files
}

function readme(manifest: Pick<BackupManifest, 'createdAt' | 'profile' | 'schemaMigration'>): string {
  return [
    'Daurham Health backup',
    '',
    `Created: ${manifest.createdAt}`,
    `Calendar timezone: ${HEALTH_CALENDAR_TIME_ZONE}`,
    `Schema migration: ${manifest.schemaMigration}`,
    `Profile: ${manifest.profile}`,
    '',
    'This file contains private health information.',
    'Owner passwords, sessions, API keys, and database credentials are not included.',
    'Authentication is recovered separately through the existing owner sign-in.',
    'Photos that live only on Home-AI disk are not included.',
    manifest.profile === 'full'
      ? 'Gemini capture images stored in nutrition_capture_jobs are included as base64.'
      : 'This portable export omits raw activity samples, raw sleep intervals, capture jobs, and database source-link ids. A USDA food includes its provider key, FoodData Central id, and serving fingerprint. Use the backup CLI for full recovery.',
    '',
    'tables/*.ndjson is the machine-readable copy used for restore.',
    'csv/*.csv is for reading. Empty CSV fields mean unknown, not zero. CSV is not used to restore.',
    'Nulls in NDJSON are JSON null. They are not zero or an empty string.',
    '',
  ].join('\n')
}

export function buildBackupArchive(input: {
  profile: BackupProfile
  createdAt: string
  schemaMigration: string
  appVersionOrCommit: string
  rowsByTable: Record<string, readonly BackupRow[]>
}): Uint8Array {
  const selected = tablesForProfile(input.profile)
  const files: Record<string, Uint8Array> = {}
  const tableMeta: Record<string, BackupTableFile> = {}
  const rowsForCsv: Record<string, BackupRow[]> = {}
  for (const definition of selected) {
    const rows = input.rowsByTable[definition.name] ?? []
    const normalized = rows.map((row) => normalizeRow(definition, row))
    const projected = projectPortableRows(input.profile, definition.name, normalized, input.rowsByTable)
    rowsForCsv[definition.name] = projected
    const bytes = encodeNdjson(projected)
    const file = tableFileName(definition.name)
    files[file] = bytes
    tableMeta[definition.name] = { rows: projected.length, file, sha256: sha256(bytes) }
  }
  const csvFiles = csvBundle(rowsForCsv)
  const csvMeta: BackupManifest['csv'] = {}
  for (const [file, bytes] of Object.entries(csvFiles)) {
    files[file] = bytes
    csvMeta[file] = { file, sha256: sha256(bytes) }
  }
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    profile: input.profile,
    createdAt: input.createdAt,
    calendarTimezone: HEALTH_CALENDAR_TIME_ZONE,
    schemaMigration: input.schemaMigration,
    appVersionOrCommit: input.appVersionOrCommit,
    tables: tableMeta,
    csv: csvMeta,
    contentSha256: contentChecksum(tableMeta),
  }
  files[MANIFEST_NAME] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`)
  files[README_NAME] = strToU8(readme(manifest))
  return zipSync(files)
}

function projectPortableRows(
  profile: BackupProfile,
  table: string,
  rows: BackupRow[],
  rowsByTable: Record<string, readonly BackupRow[]>,
): BackupRow[] {
  if (profile !== 'portable') {
    return rows
  }
  if (table === 'nutrition_foods') {
    return withPortableUsdaProvenance(rows, rowsByTable)
  }
  if (table === 'goals') {
    return withPortableGoalContext(rows, rowsByTable)
  }
  if (table === 'experiments') {
    return withPortableExperimentOrigin(rows)
  }
  if (table === 'goal_versions') {
    return withPortableSourceKey(rows, rowsByTable)
  }
  if (table === 'sleep_vital_samples') {
    return withPortableTransportKey(rows, rowsByTable)
  }
  return rows
}

function sourceKeyById(rowsByTable: Record<string, readonly BackupRow[]>): Map<string, string> {
  const keys = new Map<string, string>()
  for (const source of rowsByTable.data_sources ?? []) {
    if (typeof source.id === 'string' && typeof source.key === 'string') {
      keys.set(source.id, source.key)
    }
  }
  return keys
}

function textById(rows: readonly BackupRow[] | undefined, idColumn: string, labelColumn: string): Map<string, string> {
  const labels = new Map<string, string>()
  for (const row of rows ?? []) {
    if (typeof row[idColumn] === 'string' && typeof row[labelColumn] === 'string') {
      labels.set(row[idColumn], row[labelColumn])
    }
  }
  return labels
}

const ORIGIN_KIND_LABELS: Record<string, string> = {
  owner_created: 'Owner-created Experiment',
  deterministic_candidate: 'Deterministic Experiment',
  ai_assisted: 'AI-assisted Experiment',
  external_research: 'External-research Experiment',
}

const ORIGIN_TRIGGER_LABELS: Record<string, string> = {
  benchmark_missing_baseline: 'benchmark missing baseline',
  benchmark_retest_due: 'benchmark retest due',
  goal_observation: 'goal observation',
}

/** Portable-only semantic labels. Not database columns and not part of the full archive. */
export function withPortableExperimentOrigin(rows: readonly BackupRow[]): BackupRow[] {
  return rows.map((row) => {
    const kind = typeof row.origin_kind === 'string' ? row.origin_kind : ''
    const trigger = typeof row.origin_trigger === 'string' ? row.origin_trigger : ''
    return {
      ...row,
      origin_label: ORIGIN_KIND_LABELS[kind] ?? kind,
      origin_trigger_label: trigger ? (ORIGIN_TRIGGER_LABELS[trigger] ?? trigger) : null,
    }
  })
}

/** Portable-only semantic labels. Not database columns and not part of the full archive. */
export function withPortableGoalContext(
  goals: readonly BackupRow[],
  rowsByTable: Record<string, readonly BackupRow[]>,
): BackupRow[] {
  const sources = sourceKeyById(rowsByTable)
  const exercises = textById(rowsByTable.exercise_definitions, 'id', 'name')
  const supplements = textById(rowsByTable.supplements, 'id', 'name')
  const protocols = textById(rowsByTable.lab_protocols, 'id', 'title')
  const benchmarks = new Map<string, string>()
  for (const benchmark of rowsByTable.benchmark_definitions ?? []) {
    if (typeof benchmark.id === 'string' && typeof benchmark.protocol_id === 'string') {
      const title = protocols.get(benchmark.protocol_id)
      if (title) {
        benchmarks.set(benchmark.id, title)
      }
    }
  }
  const requirements = textById(rowsByTable.lab_protocol_requirements, 'id', 'label')
  return goals.map((goal) => {
    const kind = typeof goal.goal_kind === 'string' ? goal.goal_kind : ''
    let selectorLabel = goalKindDefinition(kind)?.displayName ?? kind
    if (kind === 'body_metric' && typeof goal.body_metric_key === 'string') {
      selectorLabel = bodyGoalDisplayName(goal.body_metric_key)
    } else if (kind === 'strength_e1rm' && typeof goal.exercise_definition_id === 'string') {
      selectorLabel = `${exercises.get(goal.exercise_definition_id) ?? 'Exercise'} e1RM`
    } else if (kind === 'benchmark_result' && typeof goal.benchmark_requirement_id === 'string') {
      selectorLabel = requirements.get(goal.benchmark_requirement_id) ?? benchmarks.get(String(goal.benchmark_definition_id)) ?? selectorLabel
    } else if (kind === 'supplement_adherence' && typeof goal.supplement_id === 'string') {
      selectorLabel = `${supplements.get(goal.supplement_id) ?? 'Supplement'} adherence`
    }
    const sourceKey = typeof goal.source_id === 'string' ? sources.get(goal.source_id) ?? null : null
    return {
      ...goal,
      selector_label: selectorLabel,
      source_key: sourceKey,
    }
  })
}

export function withPortableTransportKey(
  rows: readonly BackupRow[],
  rowsByTable: Record<string, readonly BackupRow[]>,
): BackupRow[] {
  const sources = sourceKeyById(rowsByTable)
  return rows.map((row) => ({
    ...row,
    source_key: typeof row.transport_source_id === 'string' ? sources.get(row.transport_source_id) ?? null : null,
  }))
}

export function withPortableSourceKey(
  rows: readonly BackupRow[],
  rowsByTable: Record<string, readonly BackupRow[]>,
): BackupRow[] {
  const sources = sourceKeyById(rowsByTable)
  return rows.map((row) => ({
    ...row,
    source_key: typeof row.source_id === 'string' ? sources.get(row.source_id) ?? null : null,
  }))
}

/** Portable-only semantic USDA identity. Not a database column and not part of the full archive. */
export function withPortableUsdaProvenance(
  foods: readonly BackupRow[],
  rowsByTable: Record<string, readonly BackupRow[]>,
): BackupRow[] {
  const sourceKeyById = new Map<string, string>()
  for (const source of rowsByTable.data_sources ?? []) {
    if (typeof source.id === 'string' && typeof source.key === 'string') {
      sourceKeyById.set(source.id, source.key)
    }
  }
  const linkByFood = new Map<string, { externalId: string; fingerprint: string }>()
  for (const link of rowsByTable.source_record_links ?? []) {
    if (link.entity_type !== NUTRITION_FOOD_ENTITY || typeof link.entity_id !== 'string') {
      continue
    }
    if (typeof link.source_id !== 'string' || sourceKeyById.get(link.source_id) !== USDA_FOODDATA_SOURCE_KEY) {
      continue
    }
    if (typeof link.external_id !== 'string' || typeof link.external_fingerprint !== 'string') {
      continue
    }
    linkByFood.set(link.entity_id, {
      externalId: link.external_id,
      fingerprint: link.external_fingerprint,
    })
  }
  return foods.map((food) => {
    if (food.source_kind !== 'usda' || typeof food.id !== 'string') {
      return food
    }
    const link = linkByFood.get(food.id)
    if (!link) {
      return food
    }
    return {
      ...food,
      external_provenance: JSON.stringify({
        source: {
          kind: 'usda',
          provider: USDA_FOODDATA_SOURCE_KEY,
          external_id: link.externalId,
          external_fingerprint: link.fingerprint,
        },
      }),
    }
  })
}

function normalizeRow(definition: BackupTable, row: BackupRow): BackupRow {
  const next: BackupRow = {}
  for (const column of definition.columns) {
    const value = row[column.name]
    next[column.name] = value === undefined ? null : value
  }
  return next
}

function unzipArchive(bytes: Uint8Array): { files: Record<string, Uint8Array>; errors: string[] } {
  try {
    return { files: unzipSync(bytes), errors: [] }
  } catch {
    return { files: {}, errors: ['Backup archive could not be opened'] }
  }
}

export function verifyBackupArchive(bytes: Uint8Array): VerifiedBackup {
  const errors: string[] = []
  const opened = unzipArchive(bytes)
  errors.push(...opened.errors)
  const manifestBytes = opened.files[MANIFEST_NAME]
  if (!manifestBytes) {
    errors.push('manifest.json is missing')
    return { manifest: emptyManifest(), tables: {}, errors }
  }
  let manifest: BackupManifest
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as BackupManifest
  } catch {
    errors.push('manifest.json is not valid JSON')
    return { manifest: emptyManifest(), tables: {}, errors }
  }
  if (manifest.format !== BACKUP_FORMAT) {
    errors.push('manifest format is not a Health backup')
  }
  if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    errors.push(`unsupported backup format version ${String(manifest.formatVersion)}`)
  }
  if (manifest.profile !== 'full' && manifest.profile !== 'portable') {
    errors.push('manifest profile is missing')
  }
  if (manifest.schemaMigration !== LATEST_SCHEMA_MIGRATION) {
    errors.push(`backup schema ${manifest.schemaMigration || 'unknown'} is not supported by this app`)
  }
  const expected = tablesForProfile(manifest.profile === 'portable' ? 'portable' : 'full')
  const tables: Record<string, BackupRow[]> = {}
  for (const definition of expected) {
    const meta = manifest.tables?.[definition.name]
    if (!meta) {
      errors.push(`missing table ${definition.name}`)
      continue
    }
    const fileBytes = opened.files[meta.file]
    if (!fileBytes) {
      errors.push(`missing file ${meta.file}`)
      continue
    }
    const actualHash = sha256(fileBytes)
    if (actualHash !== meta.sha256) {
      errors.push(`${definition.name} checksum does not match`)
    }
    const decoded = decodeNdjson(fileBytes, definition.name)
    errors.push(...decoded.errors)
    if (decoded.rows.length !== meta.rows) {
      errors.push(`${definition.name} row count is ${decoded.rows.length}, manifest says ${meta.rows}`)
    }
    const seen = new Set<string>()
    for (const row of decoded.rows) {
      const key = definition.primaryKey.map((column) => row[column] ?? '').join('\0')
      if (seen.has(key)) {
        errors.push(`${definition.name} has a duplicate primary key`)
        break
      }
      seen.add(key)
      for (const column of definition.columns) {
        if (!Object.prototype.hasOwnProperty.call(row, column.name)) {
          errors.push(`${definition.name} is missing column ${column.name}`)
          break
        }
      }
    }
    tables[definition.name] = decoded.rows
  }
  if (manifest.profile === 'full') {
    errors.push(...foreignKeyErrors(tables))
  }
  const checksum = contentChecksum(manifest.tables ?? {})
  if (manifest.contentSha256 !== checksum) {
    errors.push('backup content checksum does not match')
  }
  for (const [file, meta] of Object.entries(manifest.csv ?? {})) {
    const csvBytes = opened.files[file]
    if (!csvBytes || sha256(csvBytes) !== meta.sha256) {
      errors.push(`${file} checksum does not match`)
    }
  }
  return { manifest, tables, errors }
}

function foreignKeyErrors(tables: Record<string, BackupRow[]>): string[] {
  const errors: string[] = []
  const ids = new Map<string, Set<string>>()
  for (const definition of BACKUP_TABLES) {
    const keys = new Set<string>()
    for (const row of tables[definition.name] ?? []) {
      const id = row[definition.primaryKey[0] ?? '']
      if (typeof id === 'string') {
        keys.add(id)
      }
    }
    ids.set(definition.name, keys)
  }
  for (const definition of BACKUP_TABLES) {
    for (const reference of definition.references) {
      const parent = ids.get(reference.table) ?? new Set<string>()
      for (const row of tables[definition.name] ?? []) {
        const value = row[reference.column]
        if (typeof value === 'string' && !parent.has(value)) {
          errors.push(`${definition.name}.${reference.column} references a missing ${reference.table} id`)
          break
        }
      }
    }
  }
  return errors
}

function emptyManifest(): BackupManifest {
  return {
    format: BACKUP_FORMAT,
    formatVersion: 0,
    profile: 'full',
    createdAt: '',
    calendarTimezone: HEALTH_CALENDAR_TIME_ZONE,
    schemaMigration: '',
    appVersionOrCommit: '',
    tables: {},
    csv: {},
    contentSha256: '',
  }
}

export type RestorePlan = {
  blocked: boolean
  conflicts: string[]
  notes: string[]
  schemaMigration: string
  destinationSchema: string
  rows: Record<string, number>
}

export function planRestore(input: {
  verified: VerifiedBackup
  destinationSchema: string
  destinationCounts: Record<string, number>
}): RestorePlan {
  const conflicts: string[] = []
  const notes: string[] = []
  if (input.verified.errors.length > 0) {
    conflicts.push(...input.verified.errors)
  }
  if (input.verified.manifest.profile !== 'full') {
    conflicts.push('Portable exports cannot be restored. Use a full backup from backup:create.')
  }
  if (input.verified.manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    conflicts.push('This backup format is not supported.')
  }
  if (input.verified.manifest.schemaMigration !== LATEST_SCHEMA_MIGRATION) {
    conflicts.push('This backup schema is newer or older than this app, and no transformer exists.')
  }
  if (input.destinationSchema !== LATEST_SCHEMA_MIGRATION) {
    conflicts.push(`Destination schema is ${input.destinationSchema || 'unknown'}. Restore requires ${LATEST_SCHEMA_MIGRATION}.`)
  }
  const rows: Record<string, number> = {}
  for (const definition of BACKUP_TABLES) {
    rows[definition.name] = input.verified.tables[definition.name]?.length ?? 0
    const destinationCount = input.destinationCounts[definition.name] ?? 0
    if (!definition.seeded && destinationCount > 0) {
      conflicts.push(`${definition.name} already has ${destinationCount} rows. Restore stops instead of merging.`)
    }
    if (definition.seeded && destinationCount > 0) {
      notes.push(`${definition.name}: replace ${destinationCount} migration seed rows with backup ids.`)
    }
  }
  return {
    blocked: conflicts.length > 0,
    conflicts,
    notes,
    schemaMigration: input.verified.manifest.schemaMigration,
    destinationSchema: input.destinationSchema,
    rows,
  }
}

export type SqlStatement = {
  text: string
  params: unknown[]
}

function castFor(kind: BackupTable['columns'][number]['kind'], placeholder: string): string {
  switch (kind) {
    case 'uuid':
      return `${placeholder}::uuid`
    case 'date':
      return `${placeholder}::date`
    case 'timestamptz':
      return `${placeholder}::timestamptz`
    case 'numeric':
      return `${placeholder}::numeric`
    case 'int':
      return `${placeholder}::integer`
    case 'bool':
      return `${placeholder}::boolean`
    case 'json':
      return `${placeholder}::jsonb`
    case 'bytea':
      return `decode(${placeholder}, 'base64')`
    case 'text':
      return placeholder
    default:
      return placeholder
  }
}

export function restoreStatements(tables: Record<string, readonly BackupRow[]>): SqlStatement[] {
  const statements: SqlStatement[] = []
  const seeded = [...BACKUP_TABLES].reverse().filter((item) => item.seeded)
  for (const definition of seeded) {
    statements.push({ text: `DELETE FROM ${definition.name}`, params: [] })
  }
  for (const definition of BACKUP_TABLES) {
    const rows = orderSelfReferences(definition, tables[definition.name] ?? [])
    const width = definition.columns.length
    const batchSize = Math.max(1, Math.min(100, Math.floor(60000 / width)))
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize)
      const params: unknown[] = []
      const tuples = batch.map((row) => {
        const values = definition.columns.map((column) => {
          params.push(row[column.name] ?? null)
          return castFor(column.kind, `$${params.length}`)
        })
        return `(${values.join(', ')})`
      })
      const columns = definition.columns.map((column) => column.name).join(', ')
      statements.push({
        text: `INSERT INTO ${definition.name} (${columns}) VALUES ${tuples.join(', ')}`,
        params,
      })
    }
  }
  return statements
}

function orderSelfReferences(definition: BackupTable, rows: readonly BackupRow[]): BackupRow[] {
  const self = definition.references.find((reference) => reference.table === definition.name)
  const key = definition.primaryKey[0]
  if (!self || !key || rows.length < 2) {
    return [...rows]
  }
  const pending = [...rows]
  const ordered: BackupRow[] = []
  const seen = new Set<string>()
  while (pending.length > 0) {
    const next = pending.findIndex((row) => {
      const parent = row[self.column]
      return typeof parent !== 'string' || parent.length === 0 || seen.has(parent)
    })
    if (next < 0) {
      return [...ordered, ...pending]
    }
    const row = pending.splice(next, 1)[0]
    if (!row) {
      break
    }
    const id = row[key]
    if (typeof id === 'string') {
      seen.add(id)
    }
    ordered.push(row)
  }
  return ordered
}

export function assertNoSecretTables(): readonly string[] {
  return AUTH_TABLES_EXCLUDED
}

export function knownBackupTable(name: string): BackupTable | undefined {
  return backupTable(name)
}
