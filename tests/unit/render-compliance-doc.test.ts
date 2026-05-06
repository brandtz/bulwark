/**
 * tests/unit/render-compliance-doc.test.ts — HTML renderer (E11-S10).
 */
import { describe, expect, it } from 'vitest'
import { renderComplianceDocHtml } from '../../server/jobs/render-compliance-doc'

describe('renderComplianceDocHtml', () => {
  const baseInput = {
    doc: {
      id: 'doc-1',
      organizationId: 'org-1',
      propertyId: 'prop-1',
      workOrderIds: ['wo-1'],
      includedSlotIds: ['slot-1', 'slot-2'],
      signature: {
        signedByName: 'Jane <Smith>',
        dataUrl: 'data:image/png;base64,AAAA',
        signedAt: '2026-05-01T10:00:00.000Z',
      },
      jobId: null,
      status: 'generating' as const,
      resultUrl: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
    property: {
      id: 'prop-1',
      organizationId: 'org-1',
      addressLine1: '123 Pine "St"',
      addressLine2: null,
      city: 'Bend',
      state: 'OR',
      postalCode: '97701',
      clientId: null,
      status: 'lead' as const,
      notes: null,
      latitude: null,
      longitude: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
    organization: {
      id: 'org-1',
      name: 'Acme & Co',
      slug: 'acme',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
  } as Parameters<typeof renderComplianceDocHtml>[0]

  it('produces well-formed HTML with the property + scope + signature', () => {
    const html = renderComplianceDocHtml(baseInput)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('123 Pine &quot;St&quot;')
    expect(html).toContain('Bend')
    expect(html).toContain('OR')
    expect(html).toContain('97701')
    expect(html).toContain('Acme &amp; Co')
    // Scope counts
    expect(html).toContain('>1<') // workOrderIds.length
    expect(html).toContain('>2<') // includedSlotIds.length
    // Signature image + name (escaped)
    expect(html).toContain('data:image/png;base64,AAAA')
    expect(html).toContain('Jane &lt;Smith&gt;')
  })

  it('escapes HTML-unsafe characters in user content', () => {
    const html = renderComplianceDocHtml(baseInput)
    expect(html).not.toContain('<Smith>')
    expect(html).not.toContain('Acme & Co')
  })
})
