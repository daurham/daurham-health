import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { healthProfileSchema } from '../src/domain/health-profile.js'
import { knownProfileRows, KnownProfilePanel } from '../src/features/ask-health/KnownProfilePanel.js'

describe('PIQ-2.2 on-demand Known Health Profile panel', () => {
  const profile = healthProfileSchema.parse({
    sexForPhysiology: 'other',
    dateOfBirth: '1995-06-10', heightCm: 178,
    persistentHealthContext: null,
    trainingLimitations: 'Avoid movement X',
    dietaryContext: null,
    bodyMeasurementProtocol: null,
    clinicalConditions: [{ name: 'Synthetic condition', status: 'active' }],
    clinicalAllergies: [], clinicalMedications: [],
    updatedAt: '2026-10-15T12:15:16.000Z',
  })

  it('defaults collapsed, showing no loaded personal profile or historical claim', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><KnownProfilePanel today="2026-10-15" /></MemoryRouter>,
    )
    expect(html).toContain('What Health knows about me')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('Synthetic condition')
    expect(html).not.toContain('Avoid movement X')
    expect(html).not.toContain('Loading saved profile')
  })

  it('lists saved facts without inferring missing entries or a binary sex selection', () => {
    const rows = knownProfileRows(profile, '2026-10-15')
    expect(rows.find((item) => item.label === 'Birth date')?.value).toBe('1995-06-10')
    expect(rows.find((item) => item.label === 'Age today')?.value).toBe('31 years (derived)')
    expect(rows.find((item) => item.label === 'Current height')?.value).toBe('178 cm')
    expect(rows.find((item) => item.label === 'Physiological reference selection')?.value).toBe('Individual review')
    expect(rows.find((item) => item.label === 'Training limitations')?.value).toBe('Avoid movement X')
    expect(rows.find((item) => item.label === 'Medications')?.value).toBe('Not recorded')
    expect(rows.find((item) => item.label === 'Conditions')?.value).toBe('1 recorded')
  })

  it('does not invent age or height for an unset owner profile', () => {
    const rows = knownProfileRows({ ...profile, dateOfBirth: null, heightCm: null, sexForPhysiology: null }, '2026-10-15')
    expect(rows.filter((item) => ['Age today', 'Birth date', 'Current height', 'Physiological reference selection'].includes(item.label))
      .every((item) => item.value === 'Not set')).toBe(true)
  })
})
