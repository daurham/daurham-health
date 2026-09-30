/**
 * Split a migration file into statements for Neon's HTTP driver, which
 * executes one statement per query.
 *
 * This is intentionally a small PostgreSQL-aware splitter, not a full parser.
 * It preserves semicolons inside quoted strings, identifiers, line comments,
 * and dollar-quoted bodies such as PL/pgSQL functions.
 */
export function splitSqlStatements(sqlText: string): string[] {
  const withoutBlockComments = sqlText.replace(/\/\*[\s\S]*?\*\//g, '')
  const statements: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false
  let dollarQuoteTag: string | null = null

  for (let i = 0; i < withoutBlockComments.length; i += 1) {
    const char = withoutBlockComments[i]
    const next = withoutBlockComments[i + 1]

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
      }
      continue
    }

    if (dollarQuoteTag) {
      if (withoutBlockComments.startsWith(dollarQuoteTag, i)) {
        current += dollarQuoteTag
        i += dollarQuoteTag.length - 1
        dollarQuoteTag = null
      } else {
        current += char
      }
      continue
    }

    if (!inSingleQuote && !inDoubleQuote && char === '-' && next === '-') {
      inLineComment = true
      i += 1
      continue
    }

    if (!inSingleQuote && !inDoubleQuote && char === '$') {
      const match = withoutBlockComments.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
      if (match) {
        dollarQuoteTag = match[0]
        current += dollarQuoteTag
        i += dollarQuoteTag.length - 1
        continue
      }
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
