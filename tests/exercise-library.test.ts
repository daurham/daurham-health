import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('H5 Exercise Library source contract', () => {
  const migration = readFileSync('migrations/0041_exercise_library_calisthenics.sql', 'utf8')
  const page = readFileSync('src/features/training/ExerciseLibraryPage.tsx', 'utf8')
  const owner = readFileSync('server/training/owner-exercises.ts', 'utf8')
  const handler = readFileSync('server/handlers/training-exercises.ts', 'utf8')
  const guide = readFileSync('src/features/training/ExerciseGuideSheet.tsx', 'utf8')

  it('adds durable exercise presentation fields and seeded form guidance', () => {
    expect(migration).toContain('ADD COLUMN gif_url')
    expect(migration).toContain('ADD COLUMN youtube_url')
    expect(migration).toContain('ADD COLUMN form_instructions')
    expect(migration).toContain("WHEN 'EX01'")
    expect(migration).toContain("WHEN 'EX19'")
    expect(migration).toContain("(form_instructions IS NULL OR btrim(form_instructions) = '')")
  })

  it('seeds a pulling-inclusive beginner calisthenics routine', () => {
    expect(migration).toContain("'CAL-BEG'")
    expect(migration).toContain("'Inverted Row'")
    expect(migration).toContain("'Forearm Plank'")
    expect(migration).toContain('secure support')
  })

  it('keeps archive dependency-aware and provides restore', () => {
    expect(owner).toContain('activeRoutineDependencies')
    expect(owner).toContain('Remove this exercise from active routines first')
    expect(handler).toContain("kind: 'restore'")
    expect(page).toContain('activeRoutines')
  })

  it('separates form guidance, owner notes, and link-only video', () => {
    expect(guide).toContain('Form')
    expect(guide).toContain('My notes')
    expect(guide).toContain('Watch video')
    expect(guide).toContain('target="_blank"')
    expect(guide).not.toContain('autoplay')
    expect(guide).toContain("hasGif ? 'GIF' : 'Form'")
  })

  it('supports the full H5 Library filter surface', () => {
    expect(page).toContain('All equipment')
    expect(page).toContain('All patterns')
    expect(page).toContain('All muscles')
    expect(page).toContain('Recently used')
    expect(page).toContain('Most used')
    expect(page).toContain('unilateral')
  })
})
