import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { withoutResolvedCapture } from '../src/features/nutrition/pending-capture.js'

const jobs = [
  { id: 'new-meal', status: 'completed' },
  { id: 'existing-label', status: 'completed' },
  { id: 'other-pending', status: 'processing' },
]

describe('Nutrition photo pending-card resolution', () => {
  it('removes a fresh capture by the job created during analysis', () => {
    expect(withoutResolvedCapture(jobs, 'new-meal', undefined).map((job) => job.id))
      .toEqual(['existing-label', 'other-pending'])
  })
  it('falls back to the ID used to reopen a pending card', () => {
    expect(withoutResolvedCapture(jobs, null, 'existing-label').map((job) => job.id))
      .toEqual(['new-meal', 'other-pending'])
  })
  it('prefers a new job created by reanalysis rather than the old card', () => {
    expect(withoutResolvedCapture(jobs, 'new-meal', 'existing-label').map((job) => job.id))
      .toEqual(['existing-label', 'other-pending'])
  })
  it('leaves unrelated jobs alone if there was no job ID', () => {
    expect(withoutResolvedCapture(jobs, null, undefined)).toEqual(jobs)
  })
  it('wires the real job ID through meal and label approvals and discards', () => {
    const meal = readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')
    const label = readFileSync('src/features/nutrition/LabelCapture.tsx', 'utf8')
    const page = readFileSync('src/features/nutrition/NutritionPage.tsx', 'utf8')
    expect(meal).toContain('onSavedFood?.(reusable, jobId)')
    expect(meal).toContain('onLogged(saved.entries, jobId)')
    expect(label).toContain('onSavedFood?.(saved.food, jobId)')
    expect(label).toContain('onLogged(saved.entry, saved.food, jobId)')
    for (const file of [meal, label]) expect(file).toContain('onDiscarded?.(activeJobId)')
    expect(page.split('withoutResolvedCapture(current, captureJobId, panel.jobId)').length - 1).toBe(6)
    expect(page).not.toContain('current.filter((job) => job.id !== panel.jobId)')
  })
})
