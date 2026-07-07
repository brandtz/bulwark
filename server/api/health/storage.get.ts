/**
 * server/api/health/storage.get.ts — admin-only storage health + legacy census
 * (L01-S4 / ADR-0001).
 *
 * # What this endpoint answers
 *   1. Which driver is active (`fs` dev/test, `r2` prod) and is it reachable
 *      AND writable right now (put→head→delete probe, with latency)?
 *   2. How many live rows per asset column still hold legacy placeholder
 *      values (`data:` / `local://` / `blob:`)? This is the read-only census
 *      the L02 migration is sized and verified against.
 *
 * # Decisions (ADR-0008 rationale)
 *   - **Admin-only** (`org_admin`/`super_admin`), same gate as `/api/metrics`:
 *     the census leaks nothing cross-tenant (org-scoped), but probe errors can
 *     embed infrastructure detail that doesn't belong to field users.
 *   - **Org-scoped census.** Counts run against the caller's active org only —
 *     a global sweep is an L02 backfill-script concern, not a request path.
 *   - **Never 500s on storage failure.** An unreachable bucket is a *finding*
 *     (`probe.ok=false`), not an exception — health endpoints that throw when
 *     things are unhealthy are useless to the monitor calling them.
 */
import { createRealServices } from '../../utils/services-factory'
import { getStorage } from '../../services/storage'
import { probeStorageDriver } from '../../services/storage/health'
import { countLegacyAssetRows } from '../../services/storage/legacy-report'
import { StorageHealthOutputSchema } from '../../../shared/contracts/storage'

export default defineEventHandler(async (event) => {
  const services = await createRealServices(event)
  const session = await services.auth.currentUser()
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const role = session.memberships.find(
    (m) => m.organizationId === session.activeOrganizationId,
  )?.role
  if (role !== 'org_admin' && role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  const organizationId = session.activeOrganizationId
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'No active organization' })
  }

  const driver = getStorage()
  const [probe, legacyAssets] = await Promise.all([
    probeStorageDriver(driver, organizationId),
    countLegacyAssetRows(organizationId),
  ])

  return StorageHealthOutputSchema.parse({
    ts: new Date().toISOString(),
    driver: driver.name,
    probe,
    legacyAssets,
    organizationId,
  })
})
