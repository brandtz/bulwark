/**
 * server/jobs/coi-expiry-check.ts — periodic scan that flags
 * subcontractor COIs nearing or past expiry (W3-4 / EH-N / ADR-0031).
 *
 * # Decisions
 *   - The actual logic lives on `subcontractorService.scanCoiExpiry`
 *     so it can also be triggered from the RPC dispatcher (admin can
 *     run it manually via POST /api/services/subcontractor/scanCoiExpiry).
 *   - This file is the host-side wrapper that loops orgs the worker
 *     has been told to scan. We do NOT walk the org table from here
 *     — orchestration / cron decides which org id(s) to pass in.
 *   - Default window is 30 days, matching `subCoiExpiringSoon` event
 *     consumers and the UI's "expiring" bucket on /sub/cois.
 *
 * # Decision cast down
 *   - Registering this as a pg-boss JobKind. Rejected for W3-4 to
 *     avoid touching the JobKind enum migration; it's idempotent and
 *     can be added in W4 once we have a real cron need.
 */
import { createRealServices } from '../utils/services-factory'
// H3Event is a global type via Nitro's auto-import; we don't redeclare
// it here. The function signature accepts an unknown event so this
// module compiles standalone with vue-tsc.
type H3EventLike = Parameters<typeof createRealServices>[0]

export interface CoiExpiryRunInput {
  organizationIds: string[]
  withinDays?: number
}

export interface CoiExpiryRunResult {
  scanned: number
  flagged: number
  byOrg: Array<{ organizationId: string; flagged: number }>
}

export async function runCoiExpiryCheck(
  event: H3EventLike,
  input: CoiExpiryRunInput,
): Promise<CoiExpiryRunResult> {
  const services = await createRealServices(event)
  const byOrg: Array<{ organizationId: string; flagged: number }> = []
  let flagged = 0
  for (const organizationId of input.organizationIds) {
    const rows = await services.subcontractor.scanCoiExpiry({
      organizationId,
      withinDays: input.withinDays ?? 30,
    })
    byOrg.push({ organizationId, flagged: rows.length })
    flagged += rows.length
  }
  return {
    scanned: input.organizationIds.length,
    flagged,
    byOrg,
  }
}
