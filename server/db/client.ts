/**
 * server/db/client.ts — postgres-js + Drizzle singleton (E11-S1).
 *
 * # Decisions (ADR-0008, ADR-0012)
 *   - One client per process. Reused across all real services.
 *   - `postgres()` defaults to a 10-connection pool; fine for v1.
 *     We'll tune in E11-S9/S10 once pg-boss + Puppeteer are in flight.
 *   - The Drizzle wrapper carries the schema barrel so generated SQL
 *     and TypeScript inference stay in lockstep.
 *   - Module is server-only by virtue of living under `server/`. Nuxt
 *     auto-imports server modules into the Nitro context only — UI
 *     code physically cannot import this file.
 *
 * # Decision cast down
 *   - Rejected: a per-request connection. Adds latency and complicates
 *     transaction reuse. We rely on postgres-js's pool instead.
 *   - Rejected: drizzle-orm/postgres-js client wired through Nuxt
 *     plugin. Plugins run before Nitro is ready in some lifecycles;
 *     a plain singleton import is friendlier to tests.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _sql: ReturnType<typeof postgres> | null = null

function buildClient() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Real services require a Postgres connection string. ' +
        'Set BULWARK_BACKEND=mock to use the in-memory mocks instead (ADR-0004).',
    )
  }
  _sql = postgres(url, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
  })
  _db = drizzle(_sql, { schema })
}

/**
 * Return the shared Drizzle client. Lazy: first call builds the pool.
 * Throws if `DATABASE_URL` is not set.
 */
export function getDb() {
  if (!_db) buildClient()
  return _db!
}

/** Test/teardown helper. Closes the pool. Re-import builds a fresh one. */
export async function closeDb() {
  if (_sql) await _sql.end()
  _db = null
  _sql = null
}

export { schema }
