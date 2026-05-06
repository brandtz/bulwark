/**
 * tests/e2e/global-setup.ts — Playwright global setup.
 *
 * # Decisions (E11)
 *   - In real-backend mode (BULWARK_BACKEND=real), reseed the database
 *     before the suite runs so prior test mutations (password resets,
 *     status transitions, etc.) don't poison fixtures.
 *   - In mock mode, this is a no-op — the mock backend is in-memory
 *     per-worker and resets automatically.
 *
 * # Decision cast down
 *   - beforeEach reseed. Rejected — too slow (bcrypt 12 rounds × 4 users
 *     per spec). Suite-level reseed + entity-by-name lookups in specs
 *     keep the DB authoritative without per-test churn.
 */
import { spawnSync } from 'node:child_process'

export default async function globalSetup(): Promise<void> {
  if (process.env.BULWARK_BACKEND !== 'real') return
  if (!process.env.DATABASE_URL) {
    throw new Error('BULWARK_BACKEND=real but DATABASE_URL is unset')
  }
  const res = spawnSync('node', ['scripts/db-seed.mjs'], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  })
  if (res.status !== 0) {
    throw new Error(`db-seed.mjs exited with code ${res.status}`)
  }
}
