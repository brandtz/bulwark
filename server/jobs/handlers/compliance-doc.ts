/**
 * server/jobs/handlers/compliance-doc.ts — render PDF + upload to R2 (E11-S10).
 *
 * # Decisions (ADR-0008, ADR-0012)
 *   - Pipeline: read doc + property + org → render HTML →
 *     Puppeteer Chromium → PDF buffer → R2 upload → 7-day signed URL.
 *   - The `BULWARK_PDF_STUB=1` env opts into a no-op fast path that
 *     returns a placeholder URL. Used by integration tests and by any
 *     environment without R2 credentials. The real worker on Render
 *     leaves it unset and runs the full pipeline.
 *   - Errors thrown here surface as `jobs.error` (truncated to 500 ch
 *     by the worker). Puppeteer launch failures are the most common
 *     production gotcha — Render Starter (512 MB) tends to OOM under
 *     Chromium; bump to Standard if we see EAGAIN/SIGABRT.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { JobEnvelope, JobHandlerResult } from './index'
import { getDb } from '../../db/client'
import { complianceDocs } from '../../db/schema/compliance_docs'
import { properties } from '../../db/schema/properties'
import { organizations } from '../../db/schema/organizations'
import { orgBranding } from '../../db/schema/org_branding'
import { labels } from '../../db/schema/labels'
import { renderComplianceDocHtml, type RenderTemplate } from '../render-compliance-doc'
import { signR2GetUrl, uploadToR2 } from '../r2'

interface CompliancePayload {
  docId?: string
}

export async function complianceDocHandler(env: JobEnvelope): Promise<JobHandlerResult> {
  const payload = env.payload as CompliancePayload
  const docId = payload.docId
  if (!docId) {
    // Smoke-test path (E11-S9 left this off). Without a docId we have
    // nothing to render; return a placeholder so the worker pipeline
    // can still be exercised end-to-end.
    return { resultUrl: 'https://placeholder.r2/compliance/stub.pdf' }
  }

  const db = getDb()
  const [doc] = await db.select().from(complianceDocs).where(eq(complianceDocs.id, docId)).limit(1)
  if (!doc) throw new Error(`Compliance doc not found: ${docId}`)

  const [property] = await db.select().from(properties).where(eq(properties.id, doc.propertyId)).limit(1)
  if (!property) throw new Error(`Property not found: ${doc.propertyId}`)

  const [organization] = await db.select().from(organizations).where(eq(organizations.id, doc.organizationId)).limit(1)
  if (!organization) throw new Error(`Org not found: ${doc.organizationId}`)

  // L12-S2: tenant template inputs — branding singleton + pdf.* label
  // overrides. Both reads are best-effort: a missing row means "use the
  // code-resident defaults", never a failed render.
  const [branding] = await db
    .select()
    .from(orgBranding)
    .where(eq(orgBranding.organizationId, doc.organizationId))
    .limit(1)
  const labelRows = await db
    .select({ namespace: labels.namespace, value: labels.value })
    .from(labels)
    .where(
      and(
        eq(labels.organizationId, doc.organizationId),
        inArray(labels.namespace, ['pdf.footer', 'pdf.declaration']),
        eq(labels.key, 'default'),
        isNull(labels.deletedAt),
      ),
    )
  const template: RenderTemplate = {
    footerText:
      labelRows.find((l) => l.namespace === 'pdf.footer')?.value ?? branding?.footerText ?? null,
    declarationText: labelRows.find((l) => l.namespace === 'pdf.declaration')?.value ?? null,
    licenseLabel: branding?.licenseLabel ?? null,
    primaryColor: branding?.primaryColor ?? null,
    supportEmail: branding?.supportEmail ?? null,
    supportPhone: branding?.supportPhone ?? null,
  }

  const html = renderComplianceDocHtml({ doc, property, organization, template })

  // Stub fast-path for tests + envs without R2/Chromium.
  if (process.env.BULWARK_PDF_STUB === '1') {
    return {
      resultUrl: `https://placeholder.r2/compliance/${doc.id}.pdf?stub=1&len=${html.length}`,
    }
  }

  // Lazy-load Puppeteer so envs without Chromium can still import this
  // module (e.g. unit tests that exercise other handlers).
  //
  // L04-S3 OOM/hang resilience:
  //   - `protocolTimeout` bounds every CDP call — a wedged Chromium (the
  //     512MB-Render OOM signature) throws instead of hanging the worker
  //     until pg-boss expires the whole attempt.
  //   - `setContent`/`pdf` carry explicit timeouts for the same reason.
  //   - Any throw lands in the worker's catch → jobs row `failed` → re-throw
  //     → pg-boss retries per policy (3x exponential). Three straight
  //     terminal failures trip the L05-S4 consecutive-failure alert. The
  //     browser is closed (or kill-attempted) in `finally` so no zombie
  //     Chromium accumulates across retries.
  const RENDER_TIMEOUT_MS = 120_000
  const puppeteerMod = await import('puppeteer')
  const puppeteer = (puppeteerMod as unknown as { default?: typeof puppeteerMod }).default ?? puppeteerMod
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    protocolTimeout: RENDER_TIMEOUT_MS,
  })
  let pdf: Uint8Array
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: RENDER_TIMEOUT_MS })
    pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' },
      timeout: RENDER_TIMEOUT_MS,
    })
  } finally {
    await browser.close().catch(() => {
      // A close() that itself hangs/throws means Chromium is already dying;
      // the process-level kill is Puppeteer's cleanup responsibility.
    })
  }

  const key = `compliance/${doc.organizationId}/${doc.id}.pdf`
  await uploadToR2({ key, body: Buffer.from(pdf), contentType: 'application/pdf' })
  const url = await signR2GetUrl(key)
  return { resultUrl: url }
}
