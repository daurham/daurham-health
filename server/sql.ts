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
