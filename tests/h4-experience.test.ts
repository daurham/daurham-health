import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('H4 experience-system source contract', () => {
  const today = readFileSync('src/features/today/TodayPage.tsx', 'utf8')
  const coach = readFileSync('src/features/coach/CoachCard.tsx', 'utf8')
  const layout = readFileSync('src/components/Layout.tsx', 'utf8')
  const settings = readFileSync('src/features/settings/SettingsPage.tsx', 'utf8')
  const rewards = readFileSync('src/features/rewards/RewardsPage.tsx', 'utf8')
  const overview = readFileSync('src/features/progress/OverviewSection.tsx', 'utf8')
  const nutrition = readFileSync('src/features/nutrition/NutritionPage.tsx', 'utf8')
  const css = readFileSync('src/index.css', 'utf8')
  const inventory = readFileSync('server/backup/inventory.ts', 'utf8')

  it('puts Nutrition before Coach and Training in the Today first-load hierarchy', () => {
    const board = today.slice(today.indexOf('export function TodayBoard'), today.indexOf('function LabCard'))
    expect(board.indexOf('<NutritionCard')).toBeGreaterThan(-1)
    expect(board.indexOf('<NutritionCard')).toBeLessThan(board.indexOf('<CoachCard'))
    expect(board.indexOf('<CoachCard')).toBeLessThan(board.indexOf('<TrainingCard'))
    expect(board).toContain('md:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]')
    expect(today).toContain('<Card title="Nutrition" hero>')
    expect(today).not.toContain('<div className="flex justify-end">\n        <AskHealthLink')
  })

  it('keeps Daily, Stretch, and Weekly as compact mission rows instead of one primary prose winner', () => {
    expect(coach).toContain('const missions = [daily, visibleStretch, weekly]')
    expect(coach).toContain('data-coach-mission={task.taskKind}')
    expect(coach).toContain('truncate text-sm font-semibold')
    expect(coach).toContain('setDetailTask(task)')
    expect(coach).not.toContain('data-coach-primary')
    expect(coach).toContain('min-h-56')
    expect(coach).toContain('aria-label="Loading Coach"')
    const inbox = coach.slice(coach.indexOf('export function CoachInbox'))
    expect(inbox.indexOf('aria-label="Today"')).toBeLessThan(inbox.indexOf('aria-label="Stretch"'))
    expect(inbox.indexOf('aria-label="Stretch"')).toBeLessThan(inbox.indexOf('aria-label="This week"'))
  })

  it('makes Spendable XP a global owner affordance and Lifetime XP the progression authority', () => {
    expect(layout).toContain('to="/rewards"')
    expect(layout).toContain('spendable XP')
    expect(layout).toContain('wallet-xp-pulse')
    expect(layout).toContain('progressionState(next.lifetimeXp)')
    expect(rewards).toContain('Lifetime progression')
    expect(rewards).toContain('progressionState(lifetimeXp)')
    expect(rewards).toContain('Open Theme Studio')
  })

  it('ships a full theme studio and presentation-only trend questionnaire', () => {
    expect(settings).toContain('Theme Studio')
    expect(settings).toContain('Theme packs')
    expect(settings).toContain('Personalize trend colors')
    expect(settings).toContain('An active formal Goal always takes priority')
    expect(settings).toContain("writeTrendPreferences(localStorage")
    expect(css).toContain('--health-canvas:')
    expect(css).toContain('--health-surface:')
    expect(css).toContain('--health-reward:')
    expect(css).toContain('--health-hero-gradient:')
    expect(css).toContain("data-health-palette='silver-instinct'")
    expect(css).toContain('.app-shell')
    expect(css).toContain('.signal-positive-surface')
    expect(css).toContain('.signal-negative-surface')
  })

  it('keeps motivating signals attached to the specific change and bounds the mobile Nutrition action', () => {
    expect(overview).toContain('findingDetailLabel')
    expect(overview).toContain("return 'Estimated strength improved'")
    expect(overview).toContain('label={findingDetailLabel(finding) ?? undefined}')
    expect(nutrition).toContain('fixed left-4 right-4')
    expect(nutrition).toContain('!w-auto')
  })

  it('keeps H4 presentation-only and event-driven', () => {
    expect(inventory).toContain('LATEST_SCHEMA_MIGRATION')
    expect(layout).not.toContain('setInterval')
    expect(coach).not.toContain('setInterval')
    expect(rewards).not.toContain('setInterval')
    expect(css).not.toContain('infinite')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
