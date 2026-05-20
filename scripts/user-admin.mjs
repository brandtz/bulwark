/**
 * scripts/user-admin.mjs — targeted user admin ops (safe for prod when explicit).
 *
 * Use cases:
 * 1) Upsert target user with a chosen password.
 * 2) Clone memberships from a source user so permissions match exactly.
 * 3) Optionally reset source user's password.
 *
 * Examples:
 *   node scripts/user-admin.mjs \
 *     --allow-nonlocal \
 *     --source-email thebrandt@gmail.com \
 *     --target-email drew@studio37customdesigns.com \
 *     --target-name "Drew (Studio 37)" \
 *     --target-password "Studio37!" \
 *     --reset-source-password "Bulwark1!"
 */
import postgres from 'postgres'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

function parseArgs(argv) {
  const out = {}
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith('--')) continue
    const key = k.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      out[key] = '1'
      continue
    }
    out[key] = next
    i++
  }
  return out
}

function loadEnvLocal() {
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
  } catch {
    // Optional file.
  }
}

function mk(slug) {
  const h = createHash('sha256').update(slug).digest('hex').slice(0, 32)
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const args = parseArgs(process.argv)
loadEnvLocal()

const sourceEmail = (args['source-email'] ?? '').toLowerCase()
const targetEmail = (args['target-email'] ?? '').toLowerCase()
const targetNameArg = args['target-name']
const targetPassword = args['target-password']
const resetSourcePassword = args['reset-source-password']
const allowNonLocal = args['allow-nonlocal'] === '1'

if (!sourceEmail || !targetEmail) {
  console.error('Required: --source-email and --target-email')
  process.exit(2)
}

if (!targetPassword) {
  console.error('Required: --target-password (cannot create/update login without a known credential)')
  process.exit(2)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(2)
}

const isLocalHost = /(@|\/\/)(localhost|127\.0\.0\.1|::1)(:\d+)?\//.test(url)
if (!isLocalHost && !allowNonLocal) {
  console.error('Refusing non-local DATABASE_URL without --allow-nonlocal')
  process.exit(2)
}

const sql = postgres(url, { max: 2 })

try {
  const [source] = await sql`
    SELECT id, email, full_name FROM users WHERE email = ${sourceEmail} LIMIT 1
  `
  if (!source) {
    console.error(`Source user not found: ${sourceEmail}`)
    process.exit(3)
  }

  const sourceMemberships = await sql`
    SELECT organization_id, role
    FROM memberships
    WHERE user_id = ${source.id} AND is_active = true
  `
  if (sourceMemberships.length === 0) {
    console.error(`Source user has no active memberships: ${sourceEmail}`)
    process.exit(3)
  }

  const targetId = mk(`user:${targetEmail}`)
  const targetName = targetNameArg || source.full_name || targetEmail
  const targetPasswordHash = await bcrypt.hash(targetPassword, 12)

  const [target] = await sql`
    INSERT INTO users (id, email, full_name, password_hash, is_active)
    VALUES (${targetId}, ${targetEmail}, ${targetName}, ${targetPasswordHash}, true)
    ON CONFLICT (email) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          password_hash = EXCLUDED.password_hash,
          is_active = true
    RETURNING id, email
  `

  const sourceOrgIds = []
  for (const m of sourceMemberships) {
    sourceOrgIds.push(m.organization_id)
    await sql`
      INSERT INTO memberships (user_id, organization_id, role, is_active)
      VALUES (${target.id}, ${m.organization_id}, ${m.role}, true)
      ON CONFLICT (user_id, organization_id) DO UPDATE
        SET role = EXCLUDED.role,
            is_active = true
    `
  }

  // Make target match source exactly: deactivate memberships not held by source.
  if (sourceOrgIds.length > 0) {
    await sql`
      UPDATE memberships
      SET is_active = false
      WHERE user_id = ${target.id}
        AND organization_id <> ALL(${sourceOrgIds})
    `
  }

  if (resetSourcePassword) {
    const sourcePasswordHash = await bcrypt.hash(resetSourcePassword, 12)
    await sql`
      UPDATE users
      SET password_hash = ${sourcePasswordHash}, is_active = true
      WHERE id = ${source.id}
    `
  }

  console.log('✓ User admin operation complete')
  console.log(`  source: ${source.email}`)
  console.log(`  target: ${target.email}`)
  console.log(`  memberships cloned: ${sourceMemberships.length}`)
  console.log(`  source password reset: ${resetSourcePassword ? 'yes' : 'no'}`)
} catch (err) {
  console.error('Failed:', err)
  process.exitCode = 1
} finally {
  await sql.end()
}
