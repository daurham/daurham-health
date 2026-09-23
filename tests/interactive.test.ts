import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  dangerButtonClass,
  interactiveCardClass,
  interactiveRowClass,
  primaryButtonClass,
  quietButtonClass,
  secondaryButtonClass,
  selectedCardClass,
  selectedTabClass,
} from '../src/lib/interactive.ts'

describe('interactive primitives', () => {
  it('gives pointer, hover/focus, and disabled states on shared controls', () => {
    for (const className of [
      primaryButtonClass,
      secondaryButtonClass,
      dangerButtonClass,
      quietButtonClass,
      interactiveCardClass,
      selectedCardClass,
      interactiveRowClass,
      selectedTabClass,
    ]) {
      expect(className).toContain('cursor-pointer')
      expect(className).toMatch(/focus-visible:outline/)
    }
    expect(primaryButtonClass).toContain('disabled:cursor-not-allowed')
    expect(secondaryButtonClass).toContain('hover:bg-zinc-50')
    expect(interactiveCardClass).toContain('hover:bg-zinc-50')
    expect(selectedCardClass).toContain('border-accent')
    expect(dangerButtonClass).toContain('bg-danger')
    const css = readFileSync('src/index.css', 'utf8')
    expect(css).toContain('cursor: pointer')
    expect(css).toContain('cursor: not-allowed')
    expect(css).toContain('--health-accent')
    expect(css).toContain('html.dark')
    expect(css).toContain('prefers-reduced-motion')
    expect(readFileSync('src/features/training/StartWorkoutPage.tsx', 'utf8')).toContain('interactiveCardClass')
    expect(readFileSync('src/features/training/TrainingPage.tsx', 'utf8')).toContain('ListPlaceholder')
    expect(readFileSync('src/features/body/BodyPage.tsx', 'utf8')).toContain('ListPlaceholder')
  })
})
