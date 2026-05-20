/**
 * scripts/add-user-drew-studio37.mjs — one-off: add a real-name login for Drew.
 *
 * Inserts Drew@studio37customdesigns.com / Studio37! as an org_admin of
 * the existing "Bulwark Demo Co." org (same access shape as the seeded
 * drew@bulwark.demo persona). Idempotent — re-running updates the
 * password hash + ensures the membership is active without duplicating.
 *
 * Why a separate script and not a row in db-seed.mjs: db-seed.mjs is a
 * dev fixture script and the demo password is `BulwarkDemo!1` for the
 * whole persona matrix. This user has a different password and is for
 * the operating partner's real-name access, not a fixture — keeping it
 * out of the seed avoids a passwd-divergence footgun in Playwright.
 *
 *   node scripts/add-user-drew-studio37.mjs
 */
import postgres from 'postgres'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'

// Hand-load .env.local (same parser as db-seed.mjs).
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

const EMAIL = 'drew@studio37customdesigns.com'   // stored lowercased
const PASSWORD = 'Studio37!'
const FULL_NAME = 'Drew (Studio 37)'
const ROLE = 'org_admin'

// Deterministic UUIDv4 from a slug (matches db-seed.mjs `mk()` logic) so
// re-runs use the same id even if the row hasn't been inserted yet.
function mk(slug) {
  const h = createHash('sha256').update(slug).digest('hex').slice(0, 32)
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-${variant}${h.slice(17,20)}-${h.slice(20,32)}`
}

const USER_ID = mk('user:drew@studio37customdesigns.com')

const sql = postgres(url, { max: 2 })

try {
  // Resolve the Bulwark Demo Co. org by slug. We don't hard-code the id
  // so this script keeps working if the demo org id ever rotates.
  const [org] = await sql`
    SELECT id, name FROM organizations WHERE slug = 'bulwark-demo' LIMIT 1
  `
  if (!org) {
    console.error('Could not find organization with slug "bulwark-demo". Run db-seed.mjs first.')
    process.exit(2)
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12)

  // Upsert on email (the natural key) — keeps the row stable across re-runs
  // even if a prior run created it with a different uuid.
  const [user] = await sql`
    INSERT INTO users (id, email, full_name, password_hash, is_active)
    VALUES (${USER_ID}, ${EMAIL.toLowerCase()}, ${FULL_NAME}, ${passwordHash}, true)
    ON CONFLICT (email) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          password_hash = EXCLUDED.password_hash,
          is_active = true
    RETURNING id, email
  `

  await sql`
    INSERT INTO memberships (user_id, organization_id, role, is_active)
    VALUES (${user.id}, ${org.id}, ${ROLE}, true)
    ON CONFLICT (user_id, organization_id) DO UPDATE
      SET role = EXCLUDED.role, is_active = true
  `

  console.log('✓ User upserted:')
  console.log(`   id    : ${user.id}`)
  console.log(`   email : ${user.email}`)
  console.log(`   org   : ${org.name}`)
  console.log(`   role  : ${ROLE}`)
  console.log(`   login : ${EMAIL} / ${PASSWORD}`)
} catch (err) {
  console.error('Failed:', err)
  process.exitCode = 1
} finally {
  await sql.end()
}

// Silence the unused-import warning when ESLint runs over scripts/.
void randomUUID
