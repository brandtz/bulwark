/**
 * tests/setup/seed-homeowner-portal.ts — fixture seeder for the
 * homeowner portal E2E specs (W4-2).
 *
 * # What this file owns
 *   - Idempotently creates the rows needed to log in as a homeowner
 *     and see one linked property on `/homeowner`:
 *       1. A `users` row for `homer@bulwark.demo` with the standard
 *          demo password (`BulwarkDemo!1`).
 *       2. A `memberships` row with role `homeowner` on Bulwark Demo
 *          Co. (the role enum was added by W3-4 / ADR-0032).
 *       3. A `homeowner_users` row pointing at the accepted seed
 *          property (which already has a quote + invoice attached by
 *          db-seed.mjs, so list pages render non-empty rows).
 *
 * # Decisions (ADR-0008)
 *   - Plain postgres-js + raw SQL: same reasoning as
 *     `scripts/db-seed.mjs`. Drizzle is overkill for three idempotent
 *     INSERTs and the schema barrel resolution headache isn't worth
 *     fighting.
 *   - Password hash is computed once per process via bcryptjs at the
 *     same cost factor as db-seed.mjs so the demo password matches
 *     `_helpers.ts#REAL_DEMO_PASSWORD`.
 *   - When `BULWARK_BACKEND !== 'real'` the helper is a no-op.
 *
 * # Decision cast down
 *   - Rejected: a brand-new property + new quote + new invoice for
 *     the homeowner. The accepted seed property + its seed quote and
 *     invoices are already wired into db-seed.mjs; linking the
 *     homeowner to the existing graph keeps the fixture surface flat
 *     and avoids tripping cross-fixture audit assertions in other
 *     specs.
 */
import postgres from 'postgres'
import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'

function mk(slug: string): string {
  const h = createHash('sha256').update(slug).digest('hex').slice(0, 32)
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const DEMO_PASSWORD = 'BulwarkDemo!1'

export const HOMEOWNER_PORTAL_FIXTURE = {
  orgId: mk('org-bulwark-demo'),
  userId: mk('user-homer-homeowner'),
  email: 'homer@bulwark.demo',
  fullName: 'Homer Henderson',
  // SEED_PROPERTY in db-seed.mjs is the accepted one (slug `property-5`).
  propertyId: mk('property-5'),
} as const

let seeded = false

export async function seedHomeownerPortal(): Promise<void> {
  if (process.env.BULWARK_BACKEND !== 'real') return
  if (seeded) return
  if (!process.env.DATABASE_URL) {
    throw new Error('BULWARK_BACKEND=real but DATABASE_URL is unset')
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 2 })
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)
  try {
    await sql`
      INSERT INTO users (id, email, full_name, password_hash, is_active)
      VALUES (
        ${HOMEOWNER_PORTAL_FIXTURE.userId},
        ${HOMEOWNER_PORTAL_FIXTURE.email},
        ${HOMEOWNER_PORTAL_FIXTURE.fullName},
        ${passwordHash},
        true
      )
      ON CONFLICT (email) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            password_hash = EXCLUDED.password_hash,
            is_active = true
    `
    await sql`
      INSERT INTO memberships (user_id, organization_id, role, is_active)
      VALUES (
        ${HOMEOWNER_PORTAL_FIXTURE.userId},
        ${HOMEOWNER_PORTAL_FIXTURE.orgId},
        'homeowner',
        true
      )
      ON CONFLICT (user_id, organization_id) DO UPDATE
        SET role = EXCLUDED.role, is_active = true
    `
    await sql`
      INSERT INTO homeowner_users (organization_id, property_id, user_id, kind, accepted_at)
      VALUES (
        ${HOMEOWNER_PORTAL_FIXTURE.orgId},
        ${HOMEOWNER_PORTAL_FIXTURE.propertyId},
        ${HOMEOWNER_PORTAL_FIXTURE.userId},
        'owner',
        NOW()
      )
      ON CONFLICT (organization_id, property_id, user_id) DO UPDATE
        SET kind = EXCLUDED.kind,
            accepted_at = EXCLUDED.accepted_at
    `
    seeded = true
  } finally {
    await sql.end({ timeout: 1 })
  }
}
