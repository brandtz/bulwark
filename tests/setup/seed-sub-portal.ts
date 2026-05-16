/**
 * tests/setup/seed-sub-portal.ts — fixture seeder for the sub portal E2E
 * specs (W4-2).
 *
 * # What this file owns
 *   - Idempotently creates the rows needed to log in as a subcontractor
 *     and see at least one work-order assignment on `/sub/work-orders`:
 *       1. A `users` row for `jeff@bulwark.demo` (already in db-seed.mjs).
 *       2. A `memberships` row with role `sub_contractor` on Bulwark Demo
 *          Co. (already in db-seed.mjs).
 *       3. A `subcontractor_users` row linking that user to the
 *          `Roof King Co.` sub seeded by db-seed.mjs.
 *
 *     The existing seed WO `WO-2026-0001` already assigns `slot-roofing`
 *     to `sub-roof-king`, so `listMyAssignments(jeff)` returns it once
 *     the join row exists.
 *
 * # Decisions (ADR-0008)
 *   - Plain `postgres-js` + raw SQL on purpose. Same reasoning as
 *     `scripts/db-seed.mjs`: the schema barrel uses bare imports that
 *     break under plain Node ESM resolution. Drizzle is overkill for
 *     three INSERT … ON CONFLICT statements.
 *   - Idempotent via natural-key conflict targets. Re-running the
 *     helper across specs is safe.
 *   - When `BULWARK_BACKEND !== 'real'` the helper is a no-op — mock
 *     fixtures own their own sub_user wiring and don't need DB seeding.
 *
 * # Decision cast down
 *   - Rejected: calling `IsubcontractorService.inviteUser` from a test
 *     harness. The invite flow generates a `pending_invites` token and
 *     leaves the user unaccepted; tests need a fully-accepted state.
 *     Direct insert short-circuits the invite dance.
 */
import postgres from 'postgres'
import { createHash } from 'node:crypto'

function mk(slug: string): string {
  const h = createHash('sha256').update(slug).digest('hex').slice(0, 32)
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

export const SUB_PORTAL_FIXTURE = {
  orgId: mk('org-bulwark-demo'),
  subUserId: mk('user-jeff-sub'),
  subUserEmail: 'jeff@bulwark.demo',
  subcontractorId: mk('sub-roof-king'),
  workOrderId: mk('wo-seed-1'),
} as const

let seeded = false

export async function seedSubPortal(): Promise<void> {
  if (process.env.BULWARK_BACKEND !== 'real') return
  if (seeded) return
  if (!process.env.DATABASE_URL) {
    throw new Error('BULWARK_BACKEND=real but DATABASE_URL is unset')
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 2 })
  try {
    // The user, membership, sub row, and assigned WO are all created by
    // db-seed.mjs in global-setup. We only need to add the join row that
    // db-seed.mjs intentionally leaves out (W3-4 ADR-0031).
    await sql`
      INSERT INTO subcontractor_users (organization_id, subcontractor_id, user_id, accepted_at)
      VALUES (
        ${SUB_PORTAL_FIXTURE.orgId},
        ${SUB_PORTAL_FIXTURE.subcontractorId},
        ${SUB_PORTAL_FIXTURE.subUserId},
        NOW()
      )
      ON CONFLICT (organization_id, subcontractor_id, user_id) DO UPDATE
        SET accepted_at = EXCLUDED.accepted_at
    `
    seeded = true
  } finally {
    await sql.end({ timeout: 1 })
  }
}
