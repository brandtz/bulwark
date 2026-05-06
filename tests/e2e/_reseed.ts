/**
 * tests/e2e/_reseed.ts — helper to reseed the demo DB between specs.
 *
 * # Decisions (E11 hardening)
 *   - In real-backend mode, parallel/sequential specs can leave detritus
 *     (stray invoices, work orders, quotes). We pin `workers: 1` for real
 *     mode so we can rely on serial execution; specs that assert on row
 *     counts or seed-only state call this helper in `test.beforeAll`.
 *   - In mock-backend mode this is a no-op — the mock services rebuild
 *     state on every page load.
 *   - We use spawnSync to keep the helper synchronous; the seed script
 *     takes ~2s on this hardware which is acceptable per-file overhead.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

export function reseedRealBackend(): void {
  if (process.env.BULWARK_BACKEND !== 'real') return
  const here = dirname(fileURLToPath(import.meta.url))
  const script = resolve(here, '..', '..', 'scripts', 'db-seed.mjs')
  const res = spawnSync('node', [script], { stdio: 'pipe', env: process.env, shell: false })
  if (res.status !== 0) {
    const stderr = res.stderr?.toString() ?? ''
    throw new Error(`db-seed.mjs exited with code ${res.status}\n${stderr}`)
  }
}
