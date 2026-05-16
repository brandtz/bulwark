/**
 * scripts/db-reset.mjs — drop + remigrate + reseed the local Bulwark DB.
 *
 * # Decisions (ADR-0015 / EH-C)
 *   - DEV ONLY. Refuses to run unless DATABASE_URL targets localhost
 *     (mirrors the guard in db-seed.mjs). Override with
 *     BULWARK_ALLOW_PROD_SEED=1 if you genuinely know what you're doing.
 *   - Drops the public schema rather than DELETE-ing rows. The seed
 *     script is idempotent per-org but the schema itself may drift
 *     between migration generations; a fresh DROP/CREATE keeps the dev
 *     loop honest.
 *   - Calls drizzle-kit + db-seed.mjs as subprocesses instead of
 *     importing Drizzle directly (same Node-ESM-bare-import gotcha
 *     that forced db-seed.mjs to use raw postgres-js).
 *
 * # Decision cast down
 *   - `DROP DATABASE` + `CREATE DATABASE`. Rejected — requires the
 *     superuser role and a non-`bulwark_app`/`bulwark_dev` connection
 *     to issue, which means a second connection string. `DROP SCHEMA
 *     public CASCADE` on the existing connection is equivalent for our
 *     purposes (no extensions outside `public`).
 */
import postgres from 'postgres'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

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
  console.error('DATABASE_URL not set; refusing to reset.')
  process.exit(1)
}

const ALLOW_PROD = process.env.BULWARK_ALLOW_PROD_SEED === '1'
const isLocalHost = /(@|\/\/)(localhost|127\.0\.0\.1|::1)(:\d+)?\//.test(url)
if (!isLocalHost && !ALLOW_PROD) {
  console.error(
    'Refusing to db:reset against a non-localhost DATABASE_URL.\n' +
      `  host parsed from URL: ${(url.match(/@([^/:]+)/) ?? [])[1] ?? '<unknown>'}\n` +
      '  Set BULWARK_ALLOW_PROD_SEED=1 to override (don\'t).',
  )
  process.exit(1)
}

console.log('[db:reset] Dropping public schema…')
const sql = postgres(url, { max: 1 })
try {
  await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE')
  await sql.unsafe('CREATE SCHEMA public')
} finally {
  await sql.end()
}

console.log('[db:reset] Running migrations…')
const mig = spawnSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
})
if (mig.status !== 0) {
  console.error(`drizzle-kit migrate exited with code ${mig.status}`)
  process.exit(mig.status ?? 1)
}

console.log('[db:reset] Seeding demo data…')
const seed = spawnSync('node', ['scripts/db-seed.mjs'], {
  stdio: 'inherit',
  env: process.env,
  shell: false,
})
if (seed.status !== 0) {
  console.error(`db-seed.mjs exited with code ${seed.status}`)
  process.exit(seed.status ?? 1)
}

console.log('[db:reset] Done.')
