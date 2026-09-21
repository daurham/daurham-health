import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const IMPORT_SPECIFIER = /(?:from|import)\s+['"]([^'"]+)['"]/g

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return listFiles(fullPath)
    }
    return entry.name.endsWith('.ts') ? [fullPath] : []
  })
}

function specifiersIn(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf8')
  return [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] ?? '')
}

function resolveRelative(fromFile: string, specifier: string): string {
  const withoutJs = specifier.replace(/\.js$/, '.ts')
  return path.resolve(path.dirname(fromFile), withoutJs)
}

function walkApiGraph(): { file: string; specifiers: string[] }[] {
  const queue = listFiles(path.join(ROOT, 'api'))
  const seen = new Set<string>()
  const visited: { file: string; specifiers: string[] }[] = []

  while (queue.length > 0) {
    const file = queue.pop()
    if (!file || seen.has(file)) {
      continue
    }
    seen.add(file)
    const specifiers = specifiersIn(file)
    visited.push({ file: path.relative(ROOT, file), specifiers })
    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) {
        continue
      }
      queue.push(resolveRelative(file, specifier))
    }
  }

  return visited.sort((a, b) => a.file.localeCompare(b.file))
}

describe('Vercel function module specifiers', () => {
  const graph = walkApiGraph()

  it('reaches every api handler and its server/domain dependencies', () => {
    const files = graph.map((entry) => entry.file)
    expect(files).toEqual(
      expect.arrayContaining([
        'api/health.ts',
        'api/body/measurements.ts',
        'api/body/import/fit-profile/preview.ts',
        'api/body/import/fit-profile/commit.ts',
        'api/training/exercises.ts',
        'api/training/templates.ts',
        'api/training/sessions.ts',
        'api/training/sessions/[id].ts',
        'server/body/fit-profile-import.ts',
        'server/body/upload.ts',
        'server/body/commit-sql.ts',
        'server/http.ts',
        'server/db.ts',
        'server/env.ts',
        'server/integrations/fit-profile/parse.ts',
        'server/integrations/fit-profile/fingerprint.ts',
        'src/domain/body.ts',
        'src/domain/body-metrics.ts',
        'src/domain/duplicates.ts',
        'src/domain/time.ts',
        'src/domain/units.ts',
        'src/domain/training.ts',
        'server/training/service.ts',
      ]),
    )
    expect(files).not.toContain('server/dev-api-plugin.ts')
    expect(files).not.toContain('server/migrate.ts')
  })

  it('uses Node ESM .js specifiers so compiled functions do not import .ts paths', () => {
    const relativeSpecifiers = graph.flatMap((entry) =>
      entry.specifiers
        .filter((specifier) => specifier.startsWith('.'))
        .map((specifier) => ({ file: entry.file, specifier })),
    )
    expect(relativeSpecifiers.length).toBeGreaterThan(0)
    expect(relativeSpecifiers.filter((entry) => entry.specifier.endsWith('.ts'))).toEqual([])
    expect(
      relativeSpecifiers.filter((entry) => !entry.specifier.endsWith('.js')),
    ).toEqual([])
  })
})
