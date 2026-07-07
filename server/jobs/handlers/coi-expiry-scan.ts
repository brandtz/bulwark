/**
 * server/jobs/handlers/coi-expiry-scan.ts — nightly COI expiry sweep handler
 * (L05-S1 / ADR-0005 / ADR-0031).
 *
 * # What this file does
 *   - Worker-side handler for the `coi_expiry_scan` JobKind. Walks EVERY live
 *     organization and runs `subcontractorService.scanCoiExpiry` (30-day
 *     window), which emits `subCoiExpiringSoon` per flagged COI for the
 *     notification pipeline. Closes gap §3.3.2 — the sub portal's "expiring"
 *     bucket was fed by a scan that never ran.
 *
 * # Decisions
 *   - All-orgs iteration lives HERE (the cron path), not in the W3-4 wrapper
 *     (`server/jobs/coi-expiry-check.ts`), which stays org-list-parameterized
 *     for the manual admin endpoint. One sweep = one job row, per-org counts
 *     in the summary.
 *   - Per-org service construction with a matching resolver keeps
 *     `assertSameTenant` satisfied without weakening the firewall.
 *   - An org whose scan throws doesn't abort the sweep — remaining orgs still
 *     scan; the error lands in the summary and the job still succeeds unless
 *     EVERY org failed (then it throws so pg-boss retries).
 */
import { isNull } from 'drizzle-orm'
import type { JobEnvelope, JobHandlerResult } from './index'
import { getDb } from '../../db/client'
import { organizations } from '../../db/schema/organizations'
import { RealSubcontractorService } from '../../services/subcontractor.real'
import { SYSTEM_USER_ID } from '../../services/_tenant'

export async function coiExpiryScanHandler(env: JobEnvelope): Promise<JobHandlerResult> {
  const withinDays =
    typeof (env.payload as { withinDays?: unknown }).withinDays === 'number'
      ? ((env.payload as { withinDays: number }).withinDays)
      : 30

  const db = getDb()
  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(isNull(organizations.deletedAt))

  const byOrg: Array<{ organizationId: string; flagged: number; error?: string }> = []
  let flagged = 0
  let failures = 0
  for (const org of orgs) {
    try {
      const service = new RealSubcontractorService(() => ({
        organizationId: org.id,
        userId: SYSTEM_USER_ID,
      }))
      const rows = await service.scanCoiExpiry({ organizationId: org.id, withinDays })
      byOrg.push({ organizationId: org.id, flagged: rows.length })
      flagged += rows.length
    } catch (err) {
      failures += 1
      byOrg.push({
        organizationId: org.id,
        flagged: 0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (orgs.length > 0 && failures === orgs.length) {
    throw new Error(`COI expiry scan failed for all ${orgs.length} organizations`)
  }

  return {
    summary: { scannedOrgs: orgs.length, flagged, failures, byOrg },
  }
}
