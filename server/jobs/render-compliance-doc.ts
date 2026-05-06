/**
 * server/jobs/render-compliance-doc.ts — HTML composition for compliance PDFs (E11-S10).
 *
 * Pure function: takes the doc row + ancillary records, returns an HTML
 * string ready for Puppeteer. Kept separate from the handler so it can
 * be unit-tested without booting Chromium.
 */
import type { ComplianceDoc } from '../db/schema/compliance_docs'
import type { Property } from '../db/schema/properties'
import type { Organization } from '../db/schema/organizations'

export interface RenderInput {
  doc: ComplianceDoc
  property: Property
  organization: Organization
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderComplianceDocHtml({ doc, property, organization }: RenderInput): string {
  const sig = doc.signature
  const generatedAt = new Date().toLocaleString('en-US')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Compliance Document — ${escapeHtml(property.addressLine1 ?? '')}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; padding: 48px; }
      h1 { font-size: 22px; margin: 0 0 4px; color: #0f172a; }
      h2 { font-size: 14px; margin: 24px 0 8px; color: #334155; text-transform: uppercase; letter-spacing: 0.04em; }
      .meta { font-size: 12px; color: #64748b; }
      .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 12px 0; }
      .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
      .row + .row { border-top: 1px solid #f1f5f9; }
      .label { color: #64748b; }
      .value { color: #0f172a; font-weight: 500; }
      .sig { display: flex; align-items: flex-end; gap: 24px; margin-top: 32px; }
      .sig img { max-height: 80px; border-bottom: 1px solid #0f172a; padding-bottom: 4px; }
      .footer { margin-top: 48px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; }
      ul { margin: 0; padding-left: 18px; font-size: 13px; }
      li + li { margin-top: 4px; }
    </style>
  </head>
  <body>
    <h1>Wildfire Retrofit Compliance Document</h1>
    <div class="meta">${escapeHtml(organization.name)} &middot; Generated ${escapeHtml(generatedAt)}</div>

    <h2>Property</h2>
    <div class="card">
      <div class="row"><span class="label">Address</span><span class="value">${escapeHtml(property.addressLine1 ?? '')}${property.addressLine2 ? ', ' + escapeHtml(property.addressLine2) : ''}</span></div>
      <div class="row"><span class="label">City / State</span><span class="value">${escapeHtml(property.city ?? '')}, ${escapeHtml(property.state ?? '')} ${escapeHtml(property.postalCode ?? '')}</span></div>
    </div>

    <h2>Scope</h2>
    <div class="card">
      <div class="row"><span class="label">Work Orders</span><span class="value">${doc.workOrderIds.length}</span></div>
      <div class="row"><span class="label">Trade Slots Included</span><span class="value">${doc.includedSlotIds.length}</span></div>
    </div>

    <h2>Authorized Signature</h2>
    <div class="card">
      <div class="sig">
        <img src="${escapeHtml(sig.dataUrl)}" alt="signature" />
        <div>
          <div class="value">${escapeHtml(sig.signedByName)}</div>
          <div class="meta">${escapeHtml(new Date(sig.signedAt).toLocaleString('en-US'))}</div>
        </div>
      </div>
    </div>

    <div class="footer">
      Document ID: ${escapeHtml(doc.id)} &middot; Organization: ${escapeHtml(organization.id)}<br />
      This document attests that the listed retrofit scope was completed by ${escapeHtml(organization.name)} per applicable Oregon wildfire-retrofit standards.
    </div>
  </body>
</html>`
}
