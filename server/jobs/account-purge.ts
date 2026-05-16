/**
 * server/jobs/account-purge.ts — daily hard-delete sweep for accounts
 * past the 30-day soft-delete grace window
 * (W5-4 / Privacy + Compliance / ADR-0038).
 *
 * # What this file does
 *   - Wraps `services.account.purgeExpiredDeletions()` so the cron
 *     dispatcher can invoke it without touching the service-factory
 *     plumbing directly. Idempotent.
 *
 * # Decisions (ADR-0008, ADR-0038)
 *   - **No cron schedule wired here.** Ops decides whether this runs
 *     daily on the platform scheduler, on a pg-boss job, or as a
 *     manual button. The handoff documents the ops action.
 *   - **Returns the standard `AccountPurgeResult`** so a future admin
 *     dashboard can render scanned / purged counts on demand.
 *   - **Single global pass.** Unlike `coi-expiry-check.ts` which loops
 *     orgs, account purge is a per-user sweep keyed off
 *     `users.deleted_at`. Tenancy doesn't apply — the `users` table
 *     is global per the schema header.
 */
import { createRealServices } from '../utils/services-factory'
import type { AccountPurgeResult } from '../../shared/contracts/account'

type H3EventLike = Parameters<typeof createRealServices>[0]

export async function runAccountPurge(
  event: H3EventLike,
  now?: Date,
): Promise<AccountPurgeResult> {
  const services = await createRealServices(event)
  return services.account.purgeExpiredDeletions(now)
}
