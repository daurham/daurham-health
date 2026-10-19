import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  new URL('../.github/workflows/piq1-postgres.yml', import.meta.url), 'utf8',
)

describe('PIQ-7 isolated PostgreSQL CI source coverage', () => {
  it('only auto-runs for the PIQ integration branch, not feature branches or production', () => {
    expect(workflow).toMatch(/on:\s*\n\s*push:\s*\n\s*branches:\s*\n\s*- piq\/00-baseline-20261014/)
    expect(workflow).not.toContain('pull_request:')
    expect(workflow).not.toContain('branches:\n      - main')
  })

  it('runs PG16/18 for every source, migration, API, test and dependency change', () => {
    // A narrow file-by-file list silently skipped new PIQ Auth modules and
    // Pantry safety code; the real SQL workflow must cover those changes.
    for (const glob of [
      'api/**', 'server/**', 'src/**', 'tests/**', 'migrations/**',
      'scripts/**', 'package.json', 'package-lock.json',
      '.github/workflows/piq1-postgres.yml',
      '.github/workflows/validation.yml',
    ]) {
      expect(workflow, glob).toContain("      - '" + glob + "'")
    }
    expect(workflow).toContain("postgres-version: ['16', '18']")
    expect(workflow).toContain('tests/piq7-full-recovery-postgres.integration.test.ts')
    expect(workflow).not.toContain('paths-ignore:')
  })

  it('keeps the runner isolated from Neon/owner and avoids repeat PG jobs for docs alone', () => {
    expect(workflow).toContain('PIQ_POSTGRES_URL: postgres://piq:')
    expect(workflow).toContain('ports:')
    expect(workflow).toContain('5432:5432')
    expect(workflow).not.toContain('DATABASE_URL:')
    expect(workflow).not.toContain('NEON_AUTH_BASE_URL:')
    expect(workflow).not.toContain("'docs/**'")
    expect(workflow).toContain('cancel-in-progress: true')
  })
})
