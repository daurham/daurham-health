import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TRAINING_EXERCISE_SEEDS, TRAINING_TEMPLATE_SEEDS } from '../src/domain/training-library.ts'

const sql = readFileSync(path.join('migrations', '0003_training.sql'), 'utf8')

describe('training seeds', () => {
  it('maps EX01–EX17 into 0003', () => {
    expect(TRAINING_EXERCISE_SEEDS).toHaveLength(17)
    for (const exercise of TRAINING_EXERCISE_SEEDS) {
      expect(sql).toContain(`'${exercise.externalId}'`)
      expect(sql).toContain(`'${exercise.name}'`)
      expect(sql).toContain(`'${exercise.measurementKind}'`)
      expect(sql).toContain(`'${exercise.loadType}'`)
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
