/**
 * tests/unit/render-compliance-template.test.ts — L12-S2 tenant template
 * wiring in the compliance PDF renderer. Pure HTML assertions, no Chromium.
 */
import { describe, expect, it } from 'vitest'
import { renderComplianceDocHtml } from '../../server/jobs/render-compliance-doc'
import type { ComplianceDoc } from '../../server/db/schema/compliance_docs'
import type { Property } from '../../server/db/schema/properties'
import type { Organization } from '../../server/db/schema/organizations'

const doc = {
  id: 'doc-1',
  organizationId: 'org-1',
  propertyId: 'prop-1',
  workOrderIds: ['wo-1'],
  includedSlotIds: ['slot-1'],
  signature: {
    signedByName: 'Drew Owens',
    dataUrl: 'data:image/png;base64,AAAA',
    signedAt: new Date('2026-07-01T00:00:00Z').toISOString(),
  },
  status: 'generating',
} as unknown as ComplianceDoc

const property = {
  addressLine1: '42 Ember Lane',
  city: 'Burns',
  state: 'OR',
  postalCode: '97720',
} as unknown as Property

const organization = { id: 'org-1', name: 'Bulwark Demo Co.' } as unknown as Organization

describe('renderComplianceDocHtml template inputs (L12-S2)', () => {
  it('renders identical defaults when no template is supplied', () => {
    const html = renderComplianceDocHtml({ doc, property, organization })
    expect(html).toContain('per applicable Oregon wildfire-retrofit standards')
    expect(html).toContain('#0f172a') // default heading color
    expect(html).not.toContain('CCB#')
  })

  it('applies declaration, footer, license label, contact, and color', () => {
    const html = renderComplianceDocHtml({
      doc,
      property,
      organization,
      template: {
        declarationText: 'Custom attestation sentence for this tenant.',
        footerText: 'Questions? Contact our office.',
        licenseLabel: 'OR CCB# 242198',
        primaryColor: '#1E3A8A',
        supportEmail: 'help@example.com',
        supportPhone: '541-555-0100',
      },
    })
    expect(html).toContain('Custom attestation sentence for this tenant.')
    expect(html).not.toContain('per applicable Oregon wildfire-retrofit standards')
    expect(html).toContain('Questions? Contact our office.')
    expect(html).toContain('OR CCB# 242198')
    expect(html).toContain('#1E3A8A')
    expect(html).toContain('help@example.com')
  })

  it('escapes HTML in tenant-supplied template strings (stored-XSS guard)', () => {
    const html = renderComplianceDocHtml({
      doc,
      property,
      organization,
      template: { declarationText: '<script>alert(1)</script>' },
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('rejects a malformed color (falls back to default heading color)', () => {
    const html = renderComplianceDocHtml({
      doc,
      property,
      organization,
      template: { primaryColor: 'red; } body { display:none' },
    })
    expect(html).toContain('#0f172a')
    expect(html).not.toContain('display:none')
  })
})
