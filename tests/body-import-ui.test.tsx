import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { FIT_PROFILE_XLSX_ACCEPT } from '../src/domain/body-metrics.ts'
import { ImportPanel, PreviewRow } from '../src/features/body/BodyPage.tsx'
import { parseFitProfileWorkbook } from '../server/integrations/fit-profile/parse.ts'
import { fitProfileWorkbookBytes, sanitizedFitProfileRow } from './helpers/fit-profile-workbook.ts'

describe('Body import mobile workflow', () => {
  it('describes the Files-based Fit Profile XLSX flow without implying email', () => {
    const file = new File([new Uint8Array([80, 75])], 'Fit-Profile.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ImportPanel
          timezone="America/Los_Angeles"
          file={file}
          busy={null}
          preview={null}
          selected={{}}
          onSelectFile={() => undefined}
          onToggle={() => undefined}
          onCommit={() => undefined}
          canCommit={false}
        />
      </MemoryRouter>,
    )
    expect(html).toContain('Import Fit Profile XLSX')
    expect(html).toContain('Share')
    expect(html).toContain('Save to Files')
    expect(html).toContain('Fit-Profile.xlsx')
    expect(html).toContain(FIT_PROFILE_XLSX_ACCEPT)
    expect(html.toLowerCase()).not.toContain('email')
  })

  it('previews a partial Body row and marks unavailable composition metrics as —', () => {
    const bytes = fitProfileWorkbookBytes([
      sanitizedFitProfileRow({
        'Weight(lb)': 191,
        'Body Fat(%)': '- -',
        BMI: 27.3,
        'Muscle Mass(lb)': '- -',
      }),
    ])
    const [candidate] = parseFitProfileWorkbook(bytes, 'America/Phoenix')
    expect(candidate).toBeDefined()
    const html = renderToStaticMarkup(
      <PreviewRow
        candidate={{
          fingerprint: candidate.fingerprint,
          duplicate: false,
          measuredAt: candidate.measuredAt.toISOString(),
          timezone: candidate.timezone,
          deviceName: candidate.deviceName,
          sourceMeasuredAt: candidate.sourceMeasuredAt,
          selectedByDefault: true,
          metrics: candidate.metrics.map((metric) => ({
            key: metric.key,
            value: metric.value,
            unit: metric.unit,
            valueKind: metric.valueKind,
            displayValue: metric.displayValue,
            displayUnit: metric.displayUnit,
            sourceHeader: metric.sourceHeader,
            sourceValue: metric.sourceValue,
          })),
        }}
        checked
        onToggle={() => undefined}
      />,
    )
    expect(html).toContain('191 lb')
    expect(html).toContain('27.3')
    expect(html).toContain('Body Fat')
    expect(html).toContain('Muscle Mass')
    expect(html).toContain('—')
    expect(html).toContain('unavailable')
    expect(html).not.toContain('0 %')
    expect(html).not.toContain('0 lb')
  })
})
