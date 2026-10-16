import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AskHealthPage } from '../src/features/ask-health/AskHealthPage.js'
import { AppSurfaceProvider } from '../src/lib/app-prefix.js'
import {
  ASK_CONTEXT_MODES, DEFAULT_ASK_CONTEXT_MODE, ASK_CONTEXT_MODE_LABELS,
} from '../src/domain/ask-health/config.js'

function renderPage(url = '/ask-health') {
  return renderToStaticMarkup(
    React.createElement(MemoryRouter, { initialEntries: [url] },
      React.createElement(AppSurfaceProvider, { prefix: '', readOnly: false },
        React.createElement(AskHealthPage))),
  )
}

describe('PIQ-3 Context Mode actual page and in-flight controls', () => {
  it('renders Personalized as selected default, with four understandable modes', () => {
    const html = renderPage()
    expect(DEFAULT_ASK_CONTEXT_MODE).toBe('personalized')
    expect(html).toContain('id="ask-context-mode"')
    for (const mode of ASK_CONTEXT_MODES) {
      expect(html).toContain('value="' + mode + '"')
      expect(html).toContain(ASK_CONTEXT_MODE_LABELS[mode])
    }
    expect(html).toMatch(/<option[^>]*value="personalized"[^>]*selected/)
    expect(html).toContain('Always consider relevant saved Health evidence')
  })

  it('disables all context-changing controls and draft while an AI request is pending', () => {
    // JSX source contract complements the initial SSR check: SSR cannot enter
    // the asynchronous pending state without a DOM test environment.
    const source = readFileSync('src/features/ask-health/AskHealthPage.tsx', 'utf8')
    expect(source).toMatch(/className=\{quietButtonClass\}\s+disabled=\{pending\}\s+onClick=\{\(\) => \{\s+setTurns\(\[\]\)/)
    expect(source).toMatch(/aria-pressed=\{item === lens\}\s+disabled=\{pending\}/)
    expect(source).toMatch(/<select id="ask-context-mode" value=\{contextMode\} disabled=\{pending\}/)
    expect(source).toContain('<fieldset disabled={pending}>')
    expect(source).toMatch(/id="ask-health-question"\s+disabled=\{pending\}/)
  })

  it('shows Deep Dive as an explicit choice rather than promising unbounded records', () => {
    const html = renderPage('/ask-health?lens=training&range=30d')
    expect(html).toContain('Deep Dive')
    expect(html).toContain('General Only')
    const source = readFileSync('src/features/ask-health/AskHealthPage.tsx', 'utf8')
    expect(source).toContain('Still bounded; omitted evidence is disclosed')
    expect(source).toContain('saved Health records and prior private conversation are not sent')
  })
})
