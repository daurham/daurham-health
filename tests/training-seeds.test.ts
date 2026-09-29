import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TRAINING_EXERCISE_SEEDS, TRAINING_TEMPLATE_SEEDS } from '../src/domain/training-library.ts'

const sql = readFileSync(path.join('migrations', '0003_training.sql'), 'utf8')
const h2d = readFileSync(path.join('migrations', '0038_training_measurements_goals_routines.sql'), 'utf8')

describe('training seeds', () => {
  it('keeps EX01–EX17 in 0003 and adds Running/Hiking in H2D', () => {
    expect(TRAINING_EXERCISE_SEEDS).toHaveLength(19)
    for (const exercise of TRAINING_EXERCISE_SEEDS.slice(0, 17)) {
      expect(sql).toContain(`'${exercise.externalId}'`)
      expect(sql).toContain(`'${exercise.name}'`)
      expect(sql).toContain(`'${exercise.measurementKind}'`)
      expect(sql).toContain(`'${exercise.loadType}'`)
    }
    for (const exercise of TRAINING_EXERCISE_SEEDS.slice(17)) {
      expect(h2d).toContain(`'${exercise.externalId}'`)
      expect(h2d).toContain(`'${exercise.name}'`)
      expect(h2d).toContain(`'${exercise.measurementKind}'`)
      expect(h2d).toContain(`'${exercise.loadType}'`)
    }
    expect(sql).toContain("unilateral BOOLEAN NOT NULL DEFAULT false")
    expect(sql).toContain("'EX11'")
    expect(sql).toMatch(/'EX11'[\s\S]*true/)
    expect(sql).toContain('one_dumbbell')
    expect(sql).toContain('cable_stack_setting_no_ratio')
    expect(sql).toContain('barbell_total_including_bar')
  })

  it('maps A/B/C 1.3.1 slots without seeding warm-up volume', () => {
    expect(TRAINING_TEMPLATE_SEEDS.map((template) => template.routineCode)).toEqual(['A', 'B', 'C'])
    for (const template of TRAINING_TEMPLATE_SEEDS) {
      expect(sql).toContain(`'${template.routineCode}'`)
      expect(sql).toContain(`'${template.version}'`)
      expect(sql).toContain(`'${template.name}'`)
      expect(sql).toContain(template.paperForm)
      for (const slot of template.slots) {
        expect(sql).toContain(`'${slot.slotId}'`)
        expect(sql).toContain(`'${slot.externalId}'`)
      }
    }
    expect(sql).not.toContain('WARMUP-01')
    expect(sql).not.toContain('record_in_workout')
  })
})
