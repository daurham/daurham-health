import { BACKUP_TABLES, type BackupTable } from './inventory.js'

export type CatalogColumn = { table_name: string; column_name: string }

export type BackupInventoryDrift = {
  unlistedTables: string[]
  unlistedColumns: string[]
  missingTables: string[]
  missingColumns: string[]
}

/**
 * Detect silently omitted owner data when a migration adds a table or column.
 * The catalog query is run against the fully migrated, disposable CI fixture.
 * schema_migrations is intentionally outside an owner backup: a restore must
 * already target the same schema history. Auth lives in a separate schema.
 */
export function auditBackupInventoryColumns(
  catalogColumns: readonly CatalogColumn[],
  inventory: readonly BackupTable[] = BACKUP_TABLES,
): BackupInventoryDrift {
  const expected = new Map(inventory.map(definition =>
    [definition.name, new Set(definition.columns.map(column => column.name))] as const,
  ))
  if (expected.size !== inventory.length ||
      inventory.some(definition =>
        new Set(definition.columns.map(column => column.name)).size !== definition.columns.length)) {
    throw new Error('Backup inventory contains duplicate table or column declarations')
  }

  const actual = new Map<string, Set<string>>()
  for (const row of catalogColumns) {
    if (row.table_name === 'schema_migrations') continue
    let columns = actual.get(row.table_name)
    if (!columns) {
      columns = new Set()
      actual.set(row.table_name, columns)
    }
    columns.add(row.column_name)
  }

  const unlistedTables = [...actual.keys()].filter(name => !expected.has(name)).sort()
  const missingTables = [...expected.keys()].filter(name => !actual.has(name)).sort()
  const unlistedColumns: string[] = []
  const missingColumns: string[] = []
  for (const [name, columns] of actual) {
    const expectedColumns = expected.get(name)
    if (!expectedColumns) continue
    for (const column of columns) {
      if (!expectedColumns.has(column)) unlistedColumns.push(name + '.' + column)
    }
    for (const column of expectedColumns) {
      if (!columns.has(column)) missingColumns.push(name + '.' + column)
    }
  }
  return {
    unlistedTables,
    unlistedColumns: unlistedColumns.sort(),
    missingTables,
    missingColumns: missingColumns.sort(),
  }
}
