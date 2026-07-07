/**
 * server/jobs/handlers/account-purge.ts — GDPR hard-delete sweep handler
 * (L05-S1 / ADR-0005 / ADR-0038).
 *
 * # What this file does
 *   - Worker-side handler for the `account_purge` JobKind: hard-deletes users
 *     whose soft-delete passed the 30-day grace window, via
 *     `RealAccountService.purgeExpiredDeletions()`. This is the run path that
 *     closes gap §3.3.1 (the launch BLOCKER — the wrapper existed but nothing
 *     ever ran it).
 *
 * # Decisions
 *   - The service is constructed WITHOUT a tenant resolver: purge is a
 *     global, per-user sweep (users span orgs); the account service's export
 *     header documents why tenancy doesn't apply. The trigger endpoint is the
 *     auth gate (cron secret or super_admin).
 *   - Idempotent by construction — a second run finds zero candidates past
 *     the cutoff and deletes nothing.
 *   - Counts are stamped into the run's audit trail by the worker's
 *     success path (metadata on the job row) so L05-S3 can show "purged N".
 */
import type { JobEnvelope, JobHandlerResult } from './index'
import { RealAccountService } from '../../services/account.real'

export async function accountPurgeHandler(_env: JobEnvelope): Promise<JobHandlerResult> {
  const service = new RealAccountService()
  const result = await service.purgeExpiredDeletions()
  return {
    // No document URL for a sweep; surface counts via the summary channel.
    summary: {
      scannedAt: result.scannedAt,
      candidateCount: result.candidateCount,
      purgedCount: result.purgedCount,
    },
  }
}
