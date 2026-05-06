/**
 * scripts/db-seed.mjs — seed demo orgs + users for the real backend.
 *
 * # Decisions (ADR-0008, ADR-0012)
 *   - Idempotent: re-running the script must not duplicate rows.
 *     Uses INSERT ... ON CONFLICT DO UPDATE on `email` and on the
 *     (user_id, organization_id) membership PK.
 *   - Mirrors `shared/mocks/fixtures.ts` so persona-matrix specs work
 *     identically against `BULWARK_BACKEND=real` once E11-S4 wires the
 *     plugin layer over.
 *   - Plain postgres-js + raw SQL on purpose. The schema barrel uses
 *     bare imports that break Node ESM resolution outside Nuxt — same
 *     reason `db-smoke.mjs` and `db-roundtrip.mjs` skipped Drizzle.
 *
 * # Decisions cast down
 *   - Random passwords. Rejected — fixtures must be deterministic for
 *     Playwright. Demo password is `BulwarkDemo!1` (also documented in
 *     /docs/dev-credentials.md TODO).
 */
import postgres from 'postgres'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'node:fs'

// Mirror FIXTURE_ORG_ID / FIXTURE_ORG_ID_2 derived UUIDs.
// NOTE: The shared/mocks `mk()` produces non-hex chars (fine for in-memory
// mocks). Postgres `uuid` columns reject those, so we hash the slug to hex
// here. This breaks identity with the mock fixtures' UUIDs — that's
// acceptable because the real backend doesn't share identity with mock
// runs anyway. What matters is that re-running the seed yields the SAME
// UUIDs (idempotent) and that personas have stable IDs across runs.
import { createHash } from 'node:crypto'

// Hand-load .env.local (no dotenv dep needed; same parser as tests/setup/env.ts).
try {
  const text = readFileSync('.env.local', 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const k = trimmed.slice(0, eq).trim()
    const v = trimmed.slice(eq + 1).trim()
    if (!(k in process.env)) process.env[k] = v
  }
} catch { /* file optional */ }

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { max: 4 })

const DEMO_PASSWORD = 'BulwarkDemo!1'
const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)
const mk = (slug) => {
  const h = createHash('sha256').update(slug).digest('hex').slice(0, 32)
  // v4 layout: 8-4-4-4-12, where char 12 = '4', char 16 ∈ {8,9,a,b}.
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-${variant}${h.slice(17,20)}-${h.slice(20,32)}`
}

const ORG_BULWARK = { id: mk('org-bulwark-demo'), name: 'Bulwark Demo Co.', slug: 'bulwark-demo' }
const ORG_ACME = { id: mk('org-acme-restoration'), name: 'Acme Restoration LLC', slug: 'acme-restoration' }

const PERSONAS = [
  { id: mk('user-drew-admin'),    email: 'drew@bulwark.demo',     fullName: 'Drew Owens',    memberships: [{ orgId: ORG_BULWARK.id, role: 'org_admin' }] },
  { id: mk('user-matthew-field'), email: 'matthew@bulwark.demo',  fullName: 'Matthew Reyes', memberships: [{ orgId: ORG_BULWARK.id, role: 'field' }] },
  { id: mk('user-jeff-sub'),      email: 'jeff@bulwark.demo',     fullName: 'Jeff Park',     memberships: [{ orgId: ORG_BULWARK.id, role: 'sub_contractor' }] },
  { id: mk('user-sasha-super'),   email: 'sasha@bulwark.platform', fullName: 'Sasha Liu',
    memberships: [{ orgId: ORG_BULWARK.id, role: 'super_admin' }, { orgId: ORG_ACME.id, role: 'super_admin' }] },
]

try {
  for (const org of [ORG_BULWARK, ORG_ACME]) {
    await sql`
      INSERT INTO organizations (id, name, slug)
      VALUES (${org.id}, ${org.name}, ${org.slug})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug
    `
  }

  for (const p of PERSONAS) {
    await sql`
      INSERT INTO users (id, email, full_name, password_hash, is_active)
      VALUES (${p.id}, ${p.email}, ${p.fullName}, ${passwordHash}, true)
      ON CONFLICT (email) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            password_hash = EXCLUDED.password_hash,
            is_active = true
    `
    for (const m of p.memberships) {
      await sql`
        INSERT INTO memberships (user_id, organization_id, role, is_active)
        VALUES (${p.id}, ${m.orgId}, ${m.role}, true)
        ON CONFLICT (user_id, organization_id) DO UPDATE
          SET role = EXCLUDED.role, is_active = true
      `
    }
  }

  console.log(`Seeded ${PERSONAS.length} users across 2 orgs.`)
  console.log(`Demo password (all personas): ${DEMO_PASSWORD}`)
} finally {
  await sql.end()
}
