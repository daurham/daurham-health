import type { ReactNode } from 'react'
import type { TodayViewModel } from '@/domain/today'
import { useRewardSummary } from '@/features/rewards/useRewardSummary'
import { useDemoReadOnly } from '@/lib/app-prefix'
import { progressionState } from '@/domain/progression'
import { themePack } from '@/theme'
import { IllustratedWorld, useSelectedWorldPalette, useWorldMood, worldStageAtLevel } from './IllustratedWorld'

/** Purely decorative, token-driven artwork. No external image requests or AI calls. */
export function TodayScenicHero({ view }: { view: TodayViewModel }) {
  const palette = useSelectedWorldPalette()
  const mood = useWorldMood()
  const demo = useDemoReadOnly()
  const { summary } = useRewardSummary(!demo)
  const level = progressionState(summary?.lifetimeXp ?? 0).level
  const stage = summary ? worldStageAtLevel(themePack(palette).unlockLevel, level) : 'base'
  const trained = view.training.logged || view.activity.workouts.length > 0
  return (
    <section className="today-scenic-hero" aria-label="Today's health overview">
      <IllustratedWorld palette={palette} stage={stage} mood={mood} trained={trained} />
      <div className="today-scenic-content">
        <p className="today-scenic-eyebrow">YOUR HEALTH, IN FOCUS</p>
        <h2 className="today-scenic-heading">Make today count.</h2>
        <p className="today-scenic-description">Your daily tracking and next steps, all in one place.</p>
        <p className="today-world-motto" aria-hidden="true">
          <span className="today-world-motto-onepiece">Set your course.</span>
          <span className="today-world-motto-bonfire">Keep the ember alive.</span>
          <span className="today-world-motto-dragon">Rise beyond your limits.</span>
          <span className="today-world-motto-leaf">Grow stronger, one day at a time.</span>
          <span className="today-world-motto-gunships">Stay on mission.</span>
          <span className="today-world-motto-fleet">Across the stars.</span>
          <span className="today-world-motto-ringworld">Finish the fight.</span>
          <span className="today-world-motto-wasteland">Keep moving forward.</span>
          <span className="today-world-motto-prestige">The next horizon is yours.</span>
        </p>
      </div>
    </section>
  )
}

/** Domain icons inherit the selected palette; meaning is also conveyed by text. */
export function TodayDomainIcon({ domain }: { domain: 'nutrition' | 'training' | 'hydration' | 'activity' | 'sleep' | 'body' | 'wellness' | 'supplements' }) {
  const paths: Record<typeof domain, ReactNode> = {
    nutrition: <><path d="M5 3v7a3 3 0 0 0 6 0V3M8 3v18M17 3v18M17 3c-4 4-4 9 0 11h3V3" /></>,
    training: <><path d="m6 7 11 11M4 10 10 4M14 20l6-6M2 13l5-5M16 22l6-6" /></>,
    hydration: <path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z" />,
    activity: <><path d="M3 17h4l3-10 4 13 3-8 2 5h2" /></>,
    sleep: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />,
    body: <><circle cx="12" cy="6" r="3" /><path d="M5 21v-4c0-4 3-7 7-7s7 3 7 7v4M9 16v5M15 16v5" /></>,
    wellness: <><path d="M12 21s-8-4.4-8-10a4.5 4.5 0 0 1 8-2.7A4.5 4.5 0 0 1 20 11c0 5.6-8 10-8 10Z" /><path d="M8 13h2l1-2 2 4 1-2h2" /></>,
    supplements: <><path d="m9 4 11 11a5 5 0 0 1-7 7L4 13a5 5 0 0 1 5-9ZM8 17l9-9" /></>,
  }
  return <span className={`today-domain-icon today-domain-icon--${domain}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[domain]}
    </svg>
  </span>
}
