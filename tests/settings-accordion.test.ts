import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  SettingsAccordion, matchesSettingsSectionHash,
} from '../src/features/settings/SettingsAccordion.js'

const example = (props: Partial<Parameters<typeof SettingsAccordion>[0]> = {}) =>
  createElement(SettingsAccordion, {
    id: 'profile-settings',
    title: 'Health Profile',
    summary: 'Owner-controlled health context.',
    hash: '',
    ...props,
    children: createElement('span', null, 'Personal information should not mount until opened'),
  })

describe('Settings native disclosure and deep-link safety', () => {
  it('collapses by default, retains a keyboard-native summary, and lazily omits private contents', () => {
    const html = renderToStaticMarkup(example())
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).toContain('Health Profile')
    expect(html).toContain('Owner-controlled health context')
    expect(html).not.toContain('Personal information should not mount')
    expect(html).not.toContain('open=""')
  })
  it('opens a direct link or a nested owner-note target without opening unrelated groups', () => {
    const targets = ['health-profile', 'owner-note-review', 'profile-physiology-sex']
    expect(matchesSettingsSectionHash('#owner-note-review', 'profile-settings', targets)).toBe(true)
    expect(matchesSettingsSectionHash('#profile-settings', 'profile-settings', targets)).toBe(true)
    expect(matchesSettingsSectionHash('#theme-studio', 'profile-settings', targets)).toBe(false)
    expect(matchesSettingsSectionHash('', 'profile-settings', targets)).toBe(false)
    const linked = renderToStaticMarkup(example({ hash: '#owner-note-review', hashTargets: targets }))
    expect(linked).toContain('open=""')
    expect(linked).toContain('Personal information should not mount until opened')
    const unrelated = renderToStaticMarkup(example({ hash: '#theme-studio', hashTargets: targets }))
    expect(unrelated).not.toContain('open=""')
  })
  it('opens Health Profile for a requested owner-note correction handoff', () => {
    const html = renderToStaticMarkup(example({ forceOpen: true }))
    expect(html).toContain('open=""')
    expect(html).toContain('Personal information should not mount until opened')
  })
})
