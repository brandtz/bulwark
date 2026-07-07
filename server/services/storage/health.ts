/**
 * server/services/storage/health.ts — storage reachability probe (L01-S4).
 *
 * # What this file does
 *   - Proves the active storage driver can actually accept, see, and remove
 *     bytes: put a tiny probe object → head it → delete it. One round trip
 *     answers "is the bucket/filesystem reachable AND writable with the
 *     credentials this process holds" — the two failure modes (bad creds,
 *     read-only mount) a bare `headBucket` misses.
 *
 * # Decisions (ADR-0001, L01-S4)
 *   - **Write probe, not headBucket.** R2 `headBucket` succeeds with read-only
 *     creds; the app needs writes. A 30-byte put/delete is negligible cost and
 *     tests the permission that matters.
 *   - **Tenant-prefixed probe key** under the caller's org + `document` entity,
 *     so the probe passes `StorageObjectKeySchema` and any future per-tenant
 *     bucket policy without a carve-out.
 *   - **Best-effort cleanup.** Delete failures degrade the result (`ok:false`)
 *     rather than throw — the endpoint must always answer.
 *   - Probe timings surface as `latencyMs` so ops can watch storage latency
 *     drift from the same endpoint.
 */
import { randomUUID } from 'node:crypto'
import type { StorageDriver } from './types'

export interface StorageProbeResult {
  ok: boolean
  latencyMs: number
  error?: string
}

const PROBE_BODY = Buffer.from('bulwark-storage-health-probe')

/** Put → head → delete a tiny probe object. Never throws. */
export async function probeStorageDriver(
  driver: StorageDriver,
  tenantId: string,
): Promise<StorageProbeResult> {
  const key = `${tenantId}/document/${randomUUID()}/${randomUUID()}.pdf`
  const started = Date.now()
  try {
    await driver.putObject({ key, body: PROBE_BODY, contentType: 'application/pdf' })
    const head = await driver.headObject(key)
    if (!head.exists) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: 'Probe object not visible after put',
      }
    }
    await driver.deleteObject(key)
    return { ok: true, latencyMs: Date.now() - started }
  } catch (err) {
    // Cleanup attempt in case put landed but a later step failed.
    try {
      await driver.deleteObject(key)
    } catch {
      // Best-effort — the probe result already reports the primary failure.
    }
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
