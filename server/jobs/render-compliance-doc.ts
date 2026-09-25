/**
 * server/jobs/render-compliance-doc.ts — HTML composition for generated deliverables.
 *
 * Pure function: takes the doc row + ancillary records, returns an HTML
 * string ready for Puppeteer. Kept separate from the handler so it can
 * be unit-tested without booting Chromium.
 */
import type { Deliverable } from '../db/schema/deliverables'
import type { Property } from '../db/schema/properties'
import type { Organization } from '../db/schema/organizations'

/**
 * Tenant template inputs (L12-S2 / templates page). All optional — the
 * renderer falls back to the code-resident PDF_DEFAULTS wording so a tenant
 * with no overrides gets the same document as before. Populated by the
 * handler from the org_branding row + `pdf.*` label overrides.
 */
export interface RenderTemplate {
  /** pdf.footer.default label — closing footer line. */
  footerText?: string | null
  /** pdf.declaration.default label — the attestation sentence. */
  declarationText?: string | null
  /** branding.licenseLabel — e.g. "OR CCB# 242198"; rendered under the org name. */
  licenseLabel?: string | null
  /** branding.primaryColor — heading accent. */
  primaryColor?: string | null
  /** branding.supportEmail/Phone — contact line in the footer. */
  supportEmail?: string | null
  supportPhone?: string | null
}

export interface RenderInput {
  doc: Deliverable
  property: Property
  organization: Organization
  template?: RenderTemplate
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const DELIVERABLE_TITLES = {
  compliance_package: 'Compliance Package',
  completion_report: 'Completion Report',
  warranty_certificate: 'Warranty Certificate',
  custom: 'Project Deliverable',
} as const

export function renderDeliverableHtml({
  doc,
  property,
  organization,
  template,
}: RenderInput): string {
  const sig = doc.signature
  const generatedAt = new Date().toLocaleString('en-US')
  const headingColor = /^#[0-9a-fA-F]{6}$/.test(template?.primaryColor ?? '')
    ? template!.primaryColor!
    : '#0f172a'
  const declaration =
    template?.declarationText?.trim() ||
    `This document records the completed scope of work performed by ${organization.name}.`
  const footerLine = template?.footerText?.trim() || ''
  const contactBits = [template?.supportEmail, template?.supportPhone]
    .filter((x): x is string => !!x && x.trim().length > 0)
    .map((x) => escapeHtml(x))
    .join(' &middot; ')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${DELIVERABLE_TITLES[doc.kind]} — ${escapeHtml(property.addressLine1 ?? '')}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; padding: 48px; }
      h1 { font-size: 22px; margin: 0 0 4px; color: ${headingColor}; }
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
    <h1>${DELIVERABLE_TITLES[doc.kind]}</h1>
    <div class="meta">${escapeHtml(organization.name)}${
      template?.licenseLabel ? ' &middot; ' + escapeHtml(template.licenseLabel) : ''
    } &middot; Generated ${escapeHtml(generatedAt)}</div>

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
      ${escapeHtml(declaration)}${footerLine ? '<br />' + escapeHtml(footerLine) : ''}${
        contactBits ? '<br />' + contactBits : ''
      }
    </div>
  </body>
</html>`
}

/** @deprecated Use renderDeliverableHtml; retained for the compatibility job handler. */
export const renderComplianceDocHtml = renderDeliverableHtml
