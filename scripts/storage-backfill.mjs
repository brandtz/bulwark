#!/usr/bin/env node
/**
 * scripts/storage-backfill.mjs — re-home legacy data:/local:///blob: asset rows
 * onto the storage service (WP-L02-S5). Logic lives in
 * server/services/storage/backfill.ts; this is the CLI shell.
 *
 *   node scripts/storage-backfill.mjs                  # dry-run, all orgs
 *   node scripts/storage-backfill.mjs --org <uuid>     # dry-run, one org
 *   node scripts/storage-backfill.mjs --apply          # write (local DB only)
 *   node scripts/storage-backfill.mjs --apply --confirm-remote   # non-local DB
 *
 * Guards:
 *   - Dry-run by default; --apply is required to write.
 *   - A non-localhost DATABASE_URL needs --confirm-remote to apply, AND the r2
 *     driver (NODE_ENV=production or BULWARK_STORAGE_DRIVER=r2) — otherwise the
 *     bytes would land on this machine's disk while the remote DB points at them.
 */
import { readFileSync } from 'node:fs'
import { register } from 'tsx/esm/api'

// Hand-load .env.local (same parser as scripts/db-seed.mjs).
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

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const confirmRemote = args.includes('--confirm-remote')
const orgIdx = args.indexOf('--org')
const organizationId = orgIdx >= 0 ? args[orgIdx + 1] : undefined

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}
const isLocal = /localhost|127\.0\.0\.1/u.test(url)

register()
const { selectStorageDriverName } = await import('../server/services/storage/index.ts')
const driver = selectStorageDriverName()

if (apply && !isLocal) {
  if (!confirmRemote) {
    console.error('Refusing --apply against a non-local DATABASE_URL without --confirm-remote.')
    process.exit(1)
  }
  if (driver !== 'r2') {
    console.error('Refusing --apply against a remote DB with the fs storage driver (set BULWARK_STORAGE_DRIVER=r2).')
    process.exit(1)
  }
}

const { runAssetBackfill } = await import('../server/services/storage/backfill.ts')
const { closeDb } = await import('../server/db/client.ts')

console.log(`storage-backfill: ${apply ? 'APPLY' : 'dry-run'} · driver=${driver} · db=${isLocal ? 'local' : 'remote'}${organizationId ? ` · org=${organizationId}` : ''}`)
const reports = await runAssetBackfill({ apply, organizationId, log: (line) => console.log(`  ${line}`) })
const total = reports.reduce((n, r) => n + r.found, 0)
console.log(`storage-backfill: ${total} legacy row(s)${apply ? ' processed' : ' found'}.`)
await closeDb()
process.exit(0)
