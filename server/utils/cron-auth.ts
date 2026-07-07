/**
 * server/utils/cron-auth.ts — auth guard for scheduled-job trigger endpoints
 * (L05-S2 / ADR-0005).
 *
 * # What this file does
 *   - Authorizes POSTs to `server/api/admin/jobs/*`: either the platform
 *     scheduler presenting `Authorization: Bearer $BULWARK_CRON_SECRET`, or
 *     a signed-in `super_admin` (the manual "Run now" path).
 *
 * # Decisions
 *   - **Constant-time compare** (timingSafeEqual over sha256 digests) so the
 *     secret can't be probed byte-by-byte; hashing first sidesteps the
 *     equal-length requirement without leaking length.
 *   - **Unset secret ≠ open door.** If BULWARK_CRON_SECRET is not configured,
 *     the bearer path is DISABLED (always 401) rather than matching empty
 *     string — fail closed, same doctrine as the storage/backend guards.
 *   - **Session via `services.auth.currentUser()`** — the same path
 *     /api/metrics uses. NOT `event.context.session`: nothing populates that
 *     key (the W3-4 coi-expiry-check endpoint reads it and therefore always
 *     403s — logged as a gap-register finding, fixed alongside L05-S2).
 *   - Returns a discriminated result instead of throwing so the route
 *     decides between 401 (bad/no credential) and 403 (valid session, wrong
 *     role) — the distinction the e2e spec asserts.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
// H3Event is a global type via Nitro's auto-import; no import needed (see
// server/jobs/coi-expiry-check.ts). Importing from 'h3' directly fails
// whole-project typecheck because the app tier has no direct 'h3' dependency.
import { createRealServices } from './services-factory'

export type CronAuthResult =
  | { ok: true; via: 'cron_secret' | 'super_admin'; actorUserId: string | null }
  | { ok: false; status: 401 | 403; message: string }

function secretsMatch(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/** Authorize a scheduled-job trigger. See file header for the rules. */
export async function authorizeCronTrigger(event: Parameters<typeof createRealServices>[0]): Promise<CronAuthResult> {
  const header = getHeader(event, 'authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
  const expected = process.env.BULWARK_CRON_SECRET

  if (bearer !== null) {
    if (expected && expected.length > 0 && secretsMatch(bearer, expected)) {
      return { ok: true, via: 'cron_secret', actorUserId: null }
    }
    return { ok: false, status: 401, message: 'Invalid cron credential' }
  }

  const services = await createRealServices(event)
  const session = await services.auth.currentUser()
  if (!session) {
    return { ok: false, status: 401, message: 'Not authenticated' }
  }
  if (session.activeRole !== 'super_admin') {
    return { ok: false, status: 403, message: 'Forbidden' }
  }
  return { ok: true, via: 'super_admin', actorUserId: session.userId }
}
