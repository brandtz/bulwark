/**
 * server/jobs/handlers/compliance-doc.ts — stub handler (E11-S9 → S10).
 *
 * # Decisions (ADR-0008)
 *   - S9 ships a stub that just resolves with a placeholder URL so the
 *     end-to-end pipeline (publish → consume → write terminal status)
 *     can be smoke-tested before Puppeteer + R2 land in S10.
 *   - S10 replaces the body with: render HTML → Puppeteer PDF → upload
 *     to R2 → return signed URL.
 */
import type { JobEnvelope, JobHandlerResult } from './index'

export async function complianceDocHandler(_env: JobEnvelope): Promise<JobHandlerResult> {
  // E11-S10 will replace this with real PDF generation.
  return {
    resultUrl: 'https://placeholder.r2/compliance/stub.pdf',
  }
}
