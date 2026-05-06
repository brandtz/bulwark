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
import { eq } from 'drizzle-orm'
import type { JobEnvelope, JobHandlerResult } from './index'
import { getDb } from '../../db/client'
import { complianceDocs } from '../../db/schema/compliance_docs'
import { properties } from '../../db/schema/properties'
import { organizations } from '../../db/schema/organizations'
import { renderComplianceDocHtml } from '../render-compliance-doc'
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

  const html = renderComplianceDocHtml({ doc, property, organization })

  // Stub fast-path for tests + envs without R2/Chromium.
  if (process.env.BULWARK_PDF_STUB === '1') {
    return {
      resultUrl: `https://placeholder.r2/compliance/${doc.id}.pdf?stub=1&len=${html.length}`,
    }
  }

  // Lazy-load Puppeteer so envs without Chromium can still import this
  // module (e.g. unit tests that exercise other handlers).
  const puppeteerMod = await import('puppeteer')
  const puppeteer = (puppeteerMod as { default?: typeof puppeteerMod }).default ?? puppeteerMod
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  let pdf: Uint8Array
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' },
    })
  } finally {
    await browser.close().catch(() => {})
  }

  const key = `compliance/${doc.organizationId}/${doc.id}.pdf`
  await uploadToR2({ key, body: Buffer.from(pdf), contentType: 'application/pdf' })
  const url = await signR2GetUrl(key)
  return { resultUrl: url }
}
