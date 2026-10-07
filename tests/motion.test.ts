import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  dangerButtonClass,
  interactiveCardClass,
  interactiveRowClass,
  primaryButtonClass,
  quietButtonClass,
  secondaryButtonClass,
  selectedTabClass,
  tabClass,
  themeChoiceClass,
  themeChoiceSelectedClass,
} from '../src/lib/interactive.ts'

const css = readFileSync('src/index.css', 'utf8')
const layout = readFileSync('src/components/Layout.tsx', 'utf8')
const pending = readFileSync('src/lib/PendingLoad.tsx', 'utf8')
const placeholders = readFileSync('src/lib/PagePlaceholder.tsx', 'utf8')
const sheet = readFileSync('src/features/nutrition/Sheet.tsx', 'utf8')
const notice = readFileSync('src/lib/LoadErrorNotice.tsx', 'utf8')
const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
const pkg = readFileSync('package.json', 'utf8')

describe('shared motion', () => {
  it('gives buttons, cards, tabs, and theme choices one short interaction vocabulary', () => {
    expect(primaryButtonClass).toContain('motion-pressable')
    expect(primaryButtonClass).toContain('min-h-11')
    expect(secondaryButtonClass).toContain('motion-pressable')
    expect(dangerButtonClass).toContain('motion-pressable')
    expect(dangerButtonClass).toContain('bg-danger')
    expect(quietButtonClass).toContain('motion-interactive')
    expect(quietButtonClass).not.toContain('motion-pressable')
    expect(quietButtonClass).not.toContain('scale')
    expect(interactiveCardClass).toContain('motion-card')
    expect(interactiveCardClass).not.toMatch(/\bmt-|\btop-/)
    expect(interactiveRowClass).toContain('motion-interactive')
    expect(tabClass).toContain('motion-interactive')
    expect(selectedTabClass).toContain('motion-interactive')
    expect(layout).not.toContain('indicator')
    expect(themeChoiceClass).toContain('motion-pressable')
    expect(themeChoiceSelectedClass).toContain('motion-pressable')
    expect(css).toContain('scale(0.985)')
    expect(css).toContain('translateY(-1px)')
    expect(css).toContain('@media (hover: hover) and (pointer: fine)')
    const hoverLift = css.slice(css.indexOf('.motion-card:hover'))
    expect(hoverLift.indexOf('translateY(-1px)')).toBeLessThan(hoverLift.indexOf('@media (prefers-reduced-motion'))
    expect(css.indexOf('@media (hover: hover) and (pointer: fine)')).toBeLessThan(css.lastIndexOf('.motion-card:hover'))
  })

  it('keeps entry, pending, panel, and meter motion short and still under reduced motion', () => {
    expect(css).toContain('--motion-enter: 180ms')
    expect(css).toContain('--motion-panel: 200ms')
    expect(css).toContain('opacity: 0.88')
    expect(css).not.toContain('opacity: 0.55')
    expect(css).toContain('translateY(3px)')
    expect(css).not.toContain('translateY(40')
    expect(reduced).toContain('.page-enter')
    expect(reduced).toContain('.animate-pulse')
    expect(reduced).toContain('.pending-load')
    expect(reduced).toContain('.motion-pressable:active')
    expect(reduced).toContain('.motion-card:hover')
    expect(reduced).toContain('.motion-panel-enter')
    expect(reduced).toContain('.motion-notice-enter')
    expect(reduced).toContain('.motion-meter')
    expect(reduced).toContain('.wallet-xp-pulse')
    expect(reduced).toContain('.xp-celebration')
    expect(reduced).toContain('.level-celebration')
    expect(reduced).toContain('.reward-celebration')
    expect(reduced).toContain('.theme-unlock-glow::before')
    expect(reduced).toContain('.theme-changing')
    expect(reduced).toContain('animation: none')
    expect(reduced).toContain('transition: none')
    expect(reduced).toContain('transform: none')
    expect(css).not.toContain('shake')
    expect(css).not.toContain('infinite')
    expect(css).toContain('@keyframes level-celebration')
    expect(css).toContain('@keyframes theme-unlock-glow')
    expect(notice).toContain('motion-notice-enter')
    expect(notice).toContain('text-red-800')
    expect(notice).toContain('role="alert"')
  })

  it('keeps loading, navigation, sheets, and charts from inventing Health motion', () => {
    expect(placeholders).toContain('aria-busy="true"')
    expect(placeholders).toContain('aria-label={label}')
    expect(placeholders).toContain('aria-label="Loading nutrition"')
    expect(pending).toContain('aria-busy={pending || undefined}')
    expect(pending).toContain('role="progressbar"')
    expect(pending).toContain('pending-load')
    expect(pending).toContain('{children}')
    expect(pending).not.toContain('setTimeout')
    expect(placeholders).not.toContain('setTimeout')
    expect(layout).not.toContain('<Outlet key')
    expect(layout).toContain("label: 'Today'")
    expect(layout).toContain("label: 'Nutrition'")
    expect(layout).toContain("label: 'Training'")
    expect(layout).toContain("label: 'Body'")
    expect(layout).toContain("label: 'Progress'")
    expect(layout).toContain('fixed inset-x-0 bottom-0')
    expect(layout).toContain('env(safe-area-inset-bottom)')
    expect(css).toContain('--shell-nav-offset')
    expect(css).toContain('--shell-action-bar')
    expect(sheet).toContain("event.key === 'Escape'")
    expect(sheet).toContain('onClose()')
    expect(sheet).toContain('motion-panel-enter')
    expect(sheet).not.toContain('setTimeout')
    expect(readFileSync('src/lib/reduced-motion.ts', 'utf8')).toContain('prefers-reduced-motion: reduce')
    for (const file of [
      'src/features/progress/ProgressCharts.tsx',
      'src/features/progress/ActivitySleepCharts.tsx',
      'src/features/progress/SleepStageSection.tsx',
    ]) {
      const source = readFileSync(file, 'utf8')
      expect(source).toContain('isAnimationActive={chartMotion}')
      expect(source).toContain('usePrefersReducedMotion')
    }
    expect(readFileSync('src/features/progress/ProgressCharts.tsx', 'utf8')).toContain('var(--chart-ink)')
    expect(readFileSync('src/features/progress/ActivitySleepCharts.tsx', 'utf8')).toContain('var(--chart-ink)')
    expect(pkg).not.toMatch(/framer-motion|gsap|"motion"/)
    expect(readFileSync('server/backup/inventory.ts', 'utf8')).toContain("LATEST_SCHEMA_MIGRATION = '0049_passive_recovery_clinical_context.sql'")
    expect(readFileSync('index.html', 'utf8')).toContain("setAttribute('data-health-palette', palette)")
    expect(readFileSync('src/demo/dataset.ts', 'utf8')).not.toContain('healthFetch')
    expect(readFileSync('src/index.css', 'utf8')).not.toContain('requestAnimationFrame')
    expect(layout).toContain('motion-interactive')
    expect(layout).not.toContain('overflow-x-auto md:hidden')
  })
})
