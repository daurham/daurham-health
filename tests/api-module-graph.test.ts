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

  it('exposes a single Hobby-safe Serverless Function entrypoint', () => {
    const apiRoot = path.join(ROOT, 'api')
    const apiFiles = listFiles(apiRoot).map((file) => path.relative(ROOT, file))
    expect(apiFiles).toEqual(['api/index.ts'])
    const leftoverDirs = readdirSync(apiRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    expect(leftoverDirs).toEqual([])
  })

  it('reaches every api handler and its server/domain dependencies', () => {
    const files = graph.map((entry) => entry.file)
    expect(files).toEqual(
      expect.arrayContaining([
        'api/index.ts',
        'server/dispatch.ts',
        'server/handlers/health.ts',
        'server/handlers/session.ts',
        'server/handlers/auth.ts',
        'server/auth/config.ts',
        'server/auth/owner.ts',
        'server/auth/with-owner.ts',
        'server/auth/proxy.ts',
        'server/auth/node-request.ts',
        'server/handlers/body-measurements.ts',
        'server/handlers/fit-profile-preview.ts',
        'server/handlers/fit-profile-commit.ts',
        'server/handlers/training-exercises.ts',
        'server/handlers/training-templates.ts',
        'server/handlers/training-sessions.ts',
        'server/handlers/training-session-detail.ts',
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
        'server/training/transcription.ts',
        'server/training/job-store.ts',
        'src/domain/paper-load.ts',
        'server/training/commit-sql.ts',
        'server/integrations/home-ai/client.ts',
        'server/integrations/home-ai/config.ts',
        'src/domain/training-transcription.ts',
        'server/handlers/transcription-jobs.ts',
        'server/handlers/transcription-job-detail.ts',
        'server/handlers/transcription-commit.ts',
        'server/handlers/progress-overview.ts',
        'server/handlers/progress-timeline.ts',
        'server/handlers/progress-compare.ts',
        'server/handlers/progress-checkpoints.ts',
        'server/handlers/progress-checkpoint-detail.ts',
        'server/progress/service.ts',
        'server/progress/queries.ts',
        'src/domain/progress/index.ts',
        'src/domain/progress/overview.ts',
        'src/domain/progress/timeline.ts',
        'src/domain/progress/compare.ts',
        'src/domain/progress/checkpoints.ts',
        'server/handlers/nutrition-day.ts',
        'server/handlers/nutrition-entries.ts',
        'server/handlers/nutrition-entry-detail.ts',
        'server/handlers/nutrition-foods.ts',
        'server/handlers/nutrition-food-detail.ts',
        'server/handlers/nutrition-legacy-import.ts',
        'server/handlers/nutrition-targets.ts',
        'server/handlers/nutrition-barcode.ts',
        'server/handlers/nutrition-label-jobs.ts',
        'server/handlers/nutrition-label-job-detail.ts',
        'server/handlers/nutrition-label-commit.ts',
        'server/handlers/nutrition-meal-jobs.ts',
        'server/handlers/nutrition-meal-job-detail.ts',
        'server/handlers/nutrition-meal-commit.ts',
        'server/nutrition/label.ts',
        'server/nutrition/label-jobs.ts',
        'server/nutrition/meal.ts',
        'server/nutrition/service.ts',
        'server/nutrition/queries.ts',
        'server/nutrition/migrate.ts',
        'server/nutrition/providers/open-food-facts.ts',
        'src/domain/nutrition/index.ts',
      ]),
    )
    expect(files).not.toContain('server/dev-api-plugin.ts')
    expect(files).not.toContain('server/migrate.ts')
    expect(files).not.toContain('server/progress/inspect.ts')
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
