import type { ReactNode } from 'react'
import type { TodayViewModel } from '@/domain/today'
import { formatWeekdayCalendarDate } from '@/domain/calendar-format'

/** Purely decorative, token-driven artwork. No external image requests or AI calls. */
export function TodayScenicHero({ view }: { view: TodayViewModel }) {
  return (
    <section className="today-scenic-hero" aria-label="Today's health overview">
      <svg className="today-scene-art" viewBox="0 0 1000 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <circle className="today-scene-orb" cx="786" cy="92" r="60" />
        <g className="today-scene-stars">
          <circle cx="660" cy="42" r="3" /><circle cx="906" cy="38" r="2.5" />
          <circle cx="560" cy="91" r="2" /><circle cx="950" cy="133" r="2" />
          <circle cx="716" cy="20" r="1.8" /><circle cx="870" cy="152" r="2.2" />
        </g>
        <g className="today-scene-land">
          <path className="today-scene-ridge-back" d="M0 268 L172 202 L255 227 L399 139 L520 211 L664 114 L780 196 L893 108 L1000 174 L1000 320 L0 320 Z" />
          <path className="today-scene-ridge-front" d="M0 306 L164 268 L340 298 L510 223 L631 280 L793 178 L1000 274 L1000 320 L0 320 Z" />
        </g>
        <g className="today-scene-sea">
          <path className="today-scene-wave-back" d="M0 228 C120 196 210 258 336 226 S560 190 678 228 S880 252 1000 206 L1000 320 L0 320 Z" />
          <path className="today-scene-wave-front" d="M0 285 C150 251 226 311 374 277 S636 252 758 278 S902 291 1000 257 L1000 320 L0 320 Z" />
        </g>
      </svg>
      <div className="today-scenic-content">
        <p className="today-scenic-eyebrow">YOUR HEALTH, IN FOCUS</p>
        <h2 className="today-scenic-heading">Make today count.</h2>
        <p className="today-scenic-subtitle">{formatWeekdayCalendarDate(view.date)}</p>
        <p className="today-scenic-description">Your daily tracking and next steps, all in one place.</p>
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
