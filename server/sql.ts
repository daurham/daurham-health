/**
 * Split a migration file into statements for Neon's HTTP driver, which
 * executes one statement per query.
 *
 * Safe for the current Health migrations: CREATE TABLE/INDEX, INSERT, and
 * CHECKs that do not use dollar-quoting.
 *
 * This is not a PostgreSQL parser. It will mis-split:
 * - semicolons inside dollar-quoted bodies (`$tag$ ... $tag$`)
 * - `/*` comment markers inside quoted strings (stripped globally first)
 * - E'' strings that escape quotes with backslashes
 *
 * Prefer one statement per migration file, or a dedicated sentinel line such as
 * `--> statement`, before teaching this function more SQL syntax. Do not
 * introduce an ORM.
 */
export function splitSqlStatements(sqlText: string): string[] {
  const withoutBlockComments = sqlText.replace(/\/\*[\s\S]*?\*\//g, '')
  const statements: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false

  for (let i = 0; i < withoutBlockComments.length; i += 1) {
    const char = withoutBlockComments[i]
    const next = withoutBlockComments[i + 1]

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
      }
      continue
    }

    if (!inSingleQuote && !inDoubleQuote && char === '-' && next === '-') {
      inLineComment = true
      i += 1
      continue
    }

    if (!inDoubleQuote && char === "'") {
      if (inSingleQuote && next === "'") {
        current += "''"
        i += 1
        continue
      }
      inSingleQuote = !inSingleQuote
      current += char
      continue
    }

    if (!inSingleQuote && char === '"') {
      inDoubleQuote = !inDoubleQuote
      current += char
      continue
    }

    if (!inSingleQuote && !inDoubleQuote && char === ';') {
      const trimmed = current.trim()
      if (trimmed.length > 0) {
        statements.push(trimmed)
      }
      current = ''
      continue
    }

    current += char
  }

  const trimmed = current.trim()
  if (trimmed.length > 0) {
    statements.push(trimmed)
  }

  return statements
}
